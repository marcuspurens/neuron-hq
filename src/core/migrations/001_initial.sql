-- Neuron HQ — Initial schema

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge graph nodes
CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pattern', 'error', 'technique', 'run', 'agent')),
  title TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  scope TEXT DEFAULT 'unknown' CHECK (scope IN ('universal', 'project-specific', 'unknown')),
  model TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_scope ON kg_nodes(scope);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_confidence ON kg_nodes(confidence);

-- Knowledge graph edges
CREATE TABLE IF NOT EXISTS kg_edges (
  id SERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('solves', 'discovered_in', 'related_to', 'causes', 'used_by')),
  metadata JSONB DEFAULT '{}',
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON kg_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON kg_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(type);

-- Runs
CREATE TABLE IF NOT EXISTS runs (
  runid TEXT PRIMARY KEY,
  target_name TEXT NOT NULL,
  brief_title TEXT,
  status TEXT CHECK (status IN ('running', 'green', 'yellow', 'red', 'error', 'stopped')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  model TEXT,
  workspace_branch TEXT,
  target_start_sha TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_target ON runs(target_name);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

-- Usage (token tracking per run)
CREATE TABLE IF NOT EXISTS usage (
  runid TEXT PRIMARY KEY REFERENCES runs(runid),
  model TEXT,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  by_agent JSONB DEFAULT '{}',
  tool_counts JSONB DEFAULT '{}'
);

-- Metrics per run
CREATE TABLE IF NOT EXISTS metrics (
  runid TEXT PRIMARY KEY REFERENCES runs(runid),
  duration_seconds REAL,
  tests_baseline_passed INTEGER,
  tests_baseline_failed INTEGER,
  tests_after_passed INTEGER,
  tests_after_failed INTEGER,
  tests_added INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  files_new INTEGER,
  files_modified INTEGER,
  delegations_total INTEGER,
  re_delegations INTEGER,
  commands_run INTEGER,
  commands_blocked INTEGER,
  raw JSONB
);

-- Audit entries (global, all runs)
CREATE TABLE IF NOT EXISTS audit_entries (
  id SERIAL PRIMARY KEY,
  runid TEXT REFERENCES runs(runid),
  ts TIMESTAMPTZ NOT NULL,
  role TEXT NOT NULL,
  tool TEXT NOT NULL,
  allowed BOOLEAN DEFAULT true,
  input_hash TEXT,
  output_hash TEXT,
  exit_code INTEGER,
  files_touched TEXT[],
  diff_additions INTEGER,
  diff_deletions INTEGER,
  policy_event TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_runid ON audit_entries(runid);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_entries(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_role ON audit_entries(role);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_entries(tool);
CREATE INDEX IF NOT EXISTS idx_audit_blocked ON audit_entries(allowed) WHERE NOT allowed;

-- Task scores
CREATE TABLE IF NOT EXISTS task_scores (
  id SERIAL PRIMARY KEY,
  runid TEXT REFERENCES runs(runid),
  task_id TEXT NOT NULL,
  description TEXT,
  iterations_used INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  commands_run INTEGER,
  commands_blocked INTEGER,
  diff_insertions INTEGER,
  diff_deletions INTEGER,
  re_delegations INTEGER,
  score_efficiency REAL,
  score_safety REAL,
  score_first_pass REAL,
  aggregate REAL,
  UNIQUE(runid, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_scores_runid ON task_scores(runid);
