import { z } from 'zod';

// Manager → Implementer
export const ImplementerTaskSchema = z.object({
  taskId: z.string(),
  description: z.string(),
  files: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()),
});
export type ImplementerTask = z.infer<typeof ImplementerTaskSchema>;

// Implementer → Manager
export const ImplementerResultSchema = z.object({
  taskId: z.string(),
  filesModified: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
    }),
  ),
  decisions: z.array(
    z.object({
      choice: z.string(),
      reason: z.string(),
    }),
  ),
  risks: z.array(z.string()),
  notDone: z.array(z.string()),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  concern: z.string().optional(),
  testsPassing: z.boolean(),
});
export type ImplementerResult = z.infer<typeof ImplementerResultSchema>;

// Manager → Reviewer
export const ReviewerTaskSchema = z.object({
  implementerResult: ImplementerResultSchema,
  focusAreas: z.array(z.string()).optional(),
});
export type ReviewerTask = z.infer<typeof ReviewerTaskSchema>;

// Reviewer → Manager
export const ReviewerResultSchema = z.object({
  verdict: z.enum(['GREEN', 'YELLOW', 'RED']),
  testsRun: z.number(),
  testsPassing: z.number(),
  acceptanceCriteria: z.array(
    z.object({
      criterion: z.string(),
      passed: z.boolean(),
      note: z.string().optional(),
    }),
  ),
  blockers: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type ReviewerResult = z.infer<typeof ReviewerResultSchema>;

// Generic wrapper for all agent messages (for audit logging)
export const AgentMessageSchema = z.object({
  from: z.string(),
  to: z.string(),
  timestamp: z.string().datetime(),
  payload: z.unknown(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
