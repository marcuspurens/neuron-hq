import { z } from 'zod';

export const AuroraNodeTypeSchema = z.enum([
  'document',
  'transcript',
  'fact',
  'preference',
  'research',
  'voice_print',
]);
export type AuroraNodeType = z.infer<typeof AuroraNodeTypeSchema>;

export const AuroraScopeSchema = z.enum(['personal', 'shared', 'project']);
export type AuroraScope = z.infer<typeof AuroraScopeSchema>;

export const AuroraEdgeTypeSchema = z.enum([
  'related_to',
  'derived_from',
  'references',
  'contradicts',
  'supports',
]);
export type AuroraEdgeType = z.infer<typeof AuroraEdgeTypeSchema>;

export const AuroraNodeSchema = z.object({
  id: z.string().min(1),
  type: AuroraNodeTypeSchema,
  title: z.string().min(1),
  properties: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  scope: AuroraScopeSchema.default('personal'),
  sourceUrl: z.string().nullish(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
});
export type AuroraNode = z.infer<typeof AuroraNodeSchema>;

export const AuroraEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: AuroraEdgeTypeSchema,
  metadata: z.object({
    createdBy: z.string().optional(),
    timestamp: z.string().optional(),
  }).passthrough().default({}),
});
export type AuroraEdge = z.infer<typeof AuroraEdgeSchema>;

export const AuroraGraphSchema = z.object({
  nodes: z.array(AuroraNodeSchema),
  edges: z.array(AuroraEdgeSchema),
  lastUpdated: z.string().datetime(),
});
export type AuroraGraph = z.infer<typeof AuroraGraphSchema>;
