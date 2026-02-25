import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPolicyEnforcer } from '../../src/core/policy.js';
import { PolicyLimitsSchema } from '../../src/core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('Per-agent iteration limits', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;

  beforeAll(async () => {
    const policyDir = path.join(BASE_DIR, 'policy');
    policy = await createPolicyEnforcer(policyDir, BASE_DIR);
  });

  it('loads max_iterations_manager as 70 from real policy', () => {
    expect(policy.getLimits().max_iterations_manager).toBe(70);
  });

  it('loads max_iterations_tester as 30 from real policy', () => {
    expect(policy.getLimits().max_iterations_tester).toBe(30);
  });

  it('still has max_iterations_per_run as 50 (fallback)', () => {
    expect(policy.getLimits().max_iterations_per_run).toBe(50);
  });

  it('loads all per-agent limits from real policy', () => {
    const limits = policy.getLimits();
    expect(limits.max_iterations_implementer).toBe(50);
    expect(limits.max_iterations_reviewer).toBe(50);
    expect(limits.max_iterations_merger).toBe(30);
    expect(limits.max_iterations_historian).toBe(30);
    expect(limits.max_iterations_librarian).toBe(30);
    expect(limits.max_iterations_researcher).toBe(40);
  });

  it('optional fields are undefined when not provided in schema', () => {
    const minimal = PolicyLimitsSchema.parse({
      max_run_hours: 8,
      default_run_hours: 3,
      bash_timeout_seconds: 600,
      verification_timeout_seconds: 1800,
      max_iterations_per_run: 50,
      max_wip_features: 1,
      diff_warn_lines: 150,
      diff_block_lines: 300,
      max_web_searches_per_run: 10,
      max_sources_per_research: 20,
      max_blocker_questions: 3,
      max_ideas: 10,
      max_file_size_bytes: 10485760,
      max_artifact_size_bytes: 5242880,
      audit_log_max_entries: 10000,
      manifest_checksum_algorithm: 'sha256',
      max_command_retries: 2,
      retry_backoff_seconds: 5,
    });
    expect(minimal.max_iterations_manager).toBeUndefined();
    expect(minimal.max_iterations_implementer).toBeUndefined();
    expect(minimal.max_iterations_reviewer).toBeUndefined();
    expect(minimal.max_iterations_tester).toBeUndefined();
    expect(minimal.max_iterations_merger).toBeUndefined();
    expect(minimal.max_iterations_historian).toBeUndefined();
    expect(minimal.max_iterations_librarian).toBeUndefined();
    expect(minimal.max_iterations_researcher).toBeUndefined();
    // Fallback value is still present
    expect(minimal.max_iterations_per_run).toBe(50);
  });

  it('per-agent fields are present when provided in schema', () => {
    const full = PolicyLimitsSchema.parse({
      max_run_hours: 8,
      default_run_hours: 3,
      bash_timeout_seconds: 600,
      verification_timeout_seconds: 1800,
      max_iterations_per_run: 50,
      max_iterations_manager: 70,
      max_iterations_implementer: 50,
      max_iterations_reviewer: 50,
      max_iterations_tester: 30,
      max_iterations_merger: 30,
      max_iterations_historian: 30,
      max_iterations_librarian: 30,
      max_iterations_researcher: 40,
      max_wip_features: 1,
      diff_warn_lines: 150,
      diff_block_lines: 300,
      max_web_searches_per_run: 10,
      max_sources_per_research: 20,
      max_blocker_questions: 3,
      max_ideas: 10,
      max_file_size_bytes: 10485760,
      max_artifact_size_bytes: 5242880,
      audit_log_max_entries: 10000,
      manifest_checksum_algorithm: 'sha256',
      max_command_retries: 2,
      retry_backoff_seconds: 5,
    });
    expect(full.max_iterations_manager).toBe(70);
    expect(full.max_iterations_implementer).toBe(50);
    expect(full.max_iterations_reviewer).toBe(50);
    expect(full.max_iterations_tester).toBe(30);
    expect(full.max_iterations_merger).toBe(30);
    expect(full.max_iterations_historian).toBe(30);
    expect(full.max_iterations_librarian).toBe(30);
    expect(full.max_iterations_researcher).toBe(40);
  });
});
