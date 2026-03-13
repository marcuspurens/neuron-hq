-- Track which run number last updated each belief
ALTER TABLE run_beliefs ADD COLUMN IF NOT EXISTS last_run_number INTEGER DEFAULT 0;

-- Global run counter  
CREATE TABLE IF NOT EXISTS run_counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_runs INTEGER NOT NULL DEFAULT 0
);
INSERT INTO run_counter (id, total_runs) VALUES (1, 0) ON CONFLICT DO NOTHING;
