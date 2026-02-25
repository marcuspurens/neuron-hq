import { z } from 'zod';

// Run ID format: YYYYMMDD-HHMM-slug
export const RunIdSchema = z.string().regex(/^\d{8}-\d{4}-.+$/);
export type RunId = z.infer<typeof RunIdSchema>;

// Target repository schema
export const TargetSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  default_branch: z.string().default('main'),
  verify_commands: z.array(z.string()).optional(),
});
export type Target = z.infer<typeof TargetSchema>;

// Targets file schema
export const TargetsFileSchema = z.object({
  targets: z.array(TargetSchema),
});
export type TargetsFile = z.infer<typeof TargetsFileSchema>;

// Policy limits schema
export const PolicyLimitsSchema = z.object({
  max_run_hours: z.number().positive(),
  default_run_hours: z.number().positive(),
  bash_timeout_seconds: z.number().positive(),
  verification_timeout_seconds: z.number().positive(),
  max_iterations_per_run: z.number().positive(),
  max_iterations_manager: z.number().positive().optional(),
  max_iterations_implementer: z.number().positive().optional(),
  max_iterations_reviewer: z.number().positive().optional(),
  max_iterations_tester: z.number().positive().optional(),
  max_iterations_merger: z.number().positive().optional(),
  max_iterations_historian: z.number().positive().optional(),
  max_iterations_librarian: z.number().positive().optional(),
  max_iterations_researcher: z.number().positive().optional(),
  max_wip_features: z.number().positive(),
  diff_warn_lines: z.number().positive(),
  diff_block_lines: z.number().positive(),
  max_web_searches_per_run: z.number().positive(),
  max_sources_per_research: z.number().positive(),
  max_blocker_questions: z.number().positive(),
  max_ideas: z.number().positive(),
  max_file_size_bytes: z.number().positive(),
  max_artifact_size_bytes: z.number().positive(),
  audit_log_max_entries: z.number().positive(),
  manifest_checksum_algorithm: z.string(),
  max_command_retries: z.number().nonnegative(),
  retry_backoff_seconds: z.number().nonnegative(),
});
export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;

// Audit log entry
export const AuditEntrySchema = z.object({
  ts: z.string(), // ISO timestamp
  role: z.enum(['manager', 'implementer', 'reviewer', 'researcher', 'tester', 'merger', 'historian', 'librarian']),
  tool: z.string(),
  allowed: z.boolean(),
  input_hash: z.string().optional(),
  output_hash: z.string().optional(),
  exit_code: z.number().optional(),
  files_touched: z.array(z.string()).optional(),
  diff_stats: z.object({
    additions: z.number(),
    deletions: z.number(),
  }).optional(),
  policy_event: z.string().optional(), // e.g., "BLOCKED: forbidden pattern"
  note: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// Manifest schema
export const ManifestSchema = z.object({
  runid: RunIdSchema,
  target_name: z.string(),
  target_start_sha: z.string(),
  workspace_branch: z.string(),
  started_at: z.string(),
  completed_at: z.string().optional(),
  commands: z.array(z.object({
    ts: z.string(),
    command: z.string(),
    exit_code: z.number(),
  })),
  checksums: z.record(z.string()), // filename -> hash
  signature: z.string().optional(), // GPG signature if enabled
});
export type Manifest = z.infer<typeof ManifestSchema>;

// Usage tracking
export const UsageSchema = z.object({
  runid: RunIdSchema,
  total_input_tokens: z.number().nonnegative(),
  total_output_tokens: z.number().nonnegative(),
  model: z.string(),
  by_agent: z.record(z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
    iterations_used: z.number().nonnegative().optional(),
    iterations_limit: z.number().positive().optional(),
  })),
  tool_counts: z.record(z.number().nonnegative()),
});
export type Usage = z.infer<typeof UsageSchema>;

// Risk level
export const RiskLevel = z.enum(['LOW', 'MED', 'HIGH']);
export type RiskLevel = z.infer<typeof RiskLevel>;

// Stoplight status
export const StoplightStatus = z.object({
  baseline_verify: z.enum(['PASS', 'FAIL', 'SKIP']),
  after_change_verify: z.enum(['PASS', 'FAIL', 'SKIP']),
  diff_size: z.enum(['OK', 'TOO_BIG']),
  risk: RiskLevel,
  artifacts: z.enum(['COMPLETE', 'INCOMPLETE']),
});
export type StoplightStatus = z.infer<typeof StoplightStatus>;

// Run configuration
export const RunConfigSchema = z.object({
  runid: RunIdSchema,
  target: TargetSchema,
  hours: z.number().positive(),
  brief_path: z.string(),
  resume_from: RunIdSchema.optional(),
});
export type RunConfig = z.infer<typeof RunConfigSchema>;
