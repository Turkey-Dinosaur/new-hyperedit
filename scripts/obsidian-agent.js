// Obsidian agent: queries a PostgreSQL video knowledge vault for matches
// and copies selected videos from local storage into a hyperedit session.
//
// Required env vars (in .dev.vars):
//   DATABASE_URL       — PostgreSQL connection string
//   OBSIDIAN_VAULT_PATH — path to Obsidian vault (for pre-rendered thumbnails)
//   OBSIDIAN_VIDEOS_PATH — local directory containing the video files

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const { Pool } = pg;

let pool = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in .dev.vars');
  pool = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}

function getVaultPath() {
  return process.env.OBSIDIAN_VAULT_PATH || '';
}

function getVideosPath() {
  const p = process.env.OBSIDIAN_VIDEOS_PATH;
  if (!p) throw new Error('OBSIDIAN_VIDEOS_PATH not set in .dev.vars');
  return p;
}

// Slug logic mirrors the CPI Content Engine markdown writer so thumbnail
// filenames match the DB summary text.
export function slugFromSummary(summary, fileName) {
  const title = summary || (fileName || '').replace(/\.[^.]+$/, '');
  return title
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 80);
}

export function getThumbnailPath(slug) {
  const vault = getVaultPath();
  if (!vault) return null;
  return join(vault, 'attachments', `${slug}-thumb.jpg`);
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'i', 'me', 'my', 'we', 'you', 'your', 'this', 'these',
  'those', 'some', 'any', 'all', 'find', 'show', 'get', 'give', 'want',
  'need', 'can', 'could', 'would', 'should', 'please', 'video', 'videos',
  'clip', 'clips', 'footage',
]);

function extractKeywords(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Search videos ranked by keyword hits across summary, transcripts,
 * content_type, treatment_areas, influencer_mentions.
 * Weights: summary=3, treatment_areas=3, content_type=2, people=2, transcript=1.
 */
export async function searchVideos(query, limit = 10) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const client = getPool();
  const patterns = keywords.map((k) => `%${k}%`);

  const fileScore      = patterns.map((_, i) => `(CASE WHEN v.file_name ILIKE $${i + 1} THEN 1 ELSE 0 END)`).join(' + ');
  const summaryScore   = patterns.map((_, i) => `(CASE WHEN v.summary ILIKE $${i + 1} THEN 3 ELSE 0 END)`).join(' + ');
  const contentScore   = patterns.map((_, i) => `(CASE WHEN v.content_type ILIKE $${i + 1} THEN 2 ELSE 0 END)`).join(' + ');
  const tagScore       = patterns.map((_, i) => `(CASE WHEN array_to_string(v.treatment_areas, ' ') ILIKE $${i + 1} THEN 3 ELSE 0 END)`).join(' + ');
  const mentionScore   = patterns.map((_, i) => `(CASE WHEN array_to_string(v.influencer_mentions, ' ') ILIKE $${i + 1} THEN 2 ELSE 0 END)`).join(' + ');
  const transcriptScore = patterns.map((_, i) => `(CASE WHEN t.full_text ILIKE $${i + 1} THEN 1 ELSE 0 END)`).join(' + ');

  const sql = `
    SELECT
      v.id, v.file_name, v.content_type, v.treatment_areas,
      v.influencer_mentions, v.gender, v.location, v.tone,
      v.summary, v.duration, v.confidence,
      (${fileScore}) + (${summaryScore}) + (${contentScore}) + (${tagScore}) + (${mentionScore}) + (COALESCE(${transcriptScore}, 0)) AS score
    FROM videos v
    LEFT JOIN transcripts t ON t.video_id = v.id
    WHERE (
      ${patterns.map((_, i) => `v.file_name ILIKE $${i + 1}`).join(' OR ')}
      OR ${patterns.map((_, i) => `v.summary ILIKE $${i + 1}`).join(' OR ')}
      OR ${patterns.map((_, i) => `v.content_type ILIKE $${i + 1}`).join(' OR ')}
      OR ${patterns.map((_, i) => `array_to_string(v.treatment_areas, ' ') ILIKE $${i + 1}`).join(' OR ')}
      OR ${patterns.map((_, i) => `array_to_string(v.influencer_mentions, ' ') ILIKE $${i + 1}`).join(' OR ')}
      OR ${patterns.map((_, i) => `t.full_text ILIKE $${i + 1}`).join(' OR ')}
    )
    ORDER BY score DESC, v.confidence DESC NULLS LAST
    LIMIT ${Math.max(1, Math.min(50, Number(limit) || 10))}
  `;

  const result = await client.query(sql, patterns);

  return result.rows.map((row) => {
    const slug = slugFromSummary(row.summary, row.file_name);
    const thumbPath = getThumbnailPath(slug);
    return {
      videoId: row.id,
      fileName: row.file_name,
      contentType: row.content_type,
      treatmentAreas: row.treatment_areas || [],
      influencerMentions: row.influencer_mentions || [],
      gender: row.gender,
      location: row.location,
      tone: row.tone,
      summary: row.summary,
      duration: row.duration ? Number(row.duration) : 0,
      confidence: row.confidence ? Number(row.confidence) : 0,
      score: Number(row.score) || 0,
      thumbnailSlug: slug,
      hasLocalThumbnail: thumbPath ? existsSync(thumbPath) : false,
    };
  });
}

/**
 * Fetch a single video row by DB id.
 */
export async function getVideoById(videoId) {
  const client = getPool();
  const res = await client.query(
    'SELECT id, file_name, summary FROM videos WHERE id = $1',
    [videoId],
  );
  return res.rows[0] || null;
}

/**
 * Copy a video from the local OBSIDIAN_VIDEOS_PATH to destPath.
 */
export async function copyFromLocalStorage(fileName, destPath) {
  const videosPath = getVideosPath();
  const srcPath = join(videosPath, fileName);
  if (!existsSync(srcPath)) {
    throw new Error(`Video file not found in local storage: ${srcPath}`);
  }
  copyFileSync(srcPath, destPath);
  return destPath;
}
