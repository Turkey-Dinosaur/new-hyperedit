import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);

const videosPath = process.env.OBSIDIAN_VIDEOS_PATH;
if (!videosPath) {
  console.error('OBSIDIAN_VIDEOS_PATH not set in .dev.vars');
  process.exit(1);
}
if (!existsSync(videosPath)) {
  console.error(`Directory not found: ${videosPath}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

function getDuration(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

const files = readdirSync(videosPath).filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()));
console.log(`Found ${files.length} video file(s) in ${videosPath}`);

let inserted = 0;
let skipped = 0;

for (const file of files) {
  const exists = await pool.query('SELECT id FROM videos WHERE file_name = $1', [file]);
  if (exists.rows.length > 0) {
    skipped++;
    continue;
  }
  const duration = getDuration(join(videosPath, file));
  await pool.query(
    `INSERT INTO videos (file_name, duration, confidence) VALUES ($1, $2, $3)`,
    [file, duration, 0.5]
  );
  console.log(`  + ${file} (${duration.toFixed(1)}s)`);
  inserted++;
}

await pool.end();
console.log(`\nDone — ${inserted} inserted, ${skipped} already in DB`);
