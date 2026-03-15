-- Migration 016: Aurora async job queue
CREATE TABLE IF NOT EXISTS aurora_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'video_ingest',
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT,
  progress REAL DEFAULT 0,
  input JSONB NOT NULL,
  result JSONB,
  error TEXT,
  video_title TEXT,
  video_duration_sec REAL,
  video_url TEXT NOT NULL,
  backend TEXT,
  step_timings JSONB,
  temp_bytes_cleaned BIGINT DEFAULT 0,
  pid INTEGER,
  notified BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aurora_jobs_status ON aurora_jobs(status);
CREATE INDEX IF NOT EXISTS idx_aurora_jobs_created ON aurora_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_aurora_jobs_url ON aurora_jobs(video_url, status);
