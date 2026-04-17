import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    summary TEXT,
    content_type TEXT,
    treatment_areas TEXT[],
    influencer_mentions TEXT[],
    gender TEXT,
    location TEXT,
    tone TEXT,
    duration NUMERIC,
    confidence NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    full_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

await client.end();
console.log('Obsidian DB schema ready (videos + transcripts tables)');
