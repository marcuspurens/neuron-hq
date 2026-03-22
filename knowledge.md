# Knowledge — T5 Integration Tests

## Implementation Readiness

1. Vilka filer ska jag ändra?
   → tests/commands/consolidate-ideas.test.ts (NEW)
   → tests/mcp/tools/ideas-consolidate.test.ts (NEW)

2. Vilket mönster följer jag? Baserat på vilka filer?
   → Mock pattern from tests/commands/ideas.test.ts (vi.mock with importOriginal, mockLoadGraph/mockSaveGraph wrappers)
   → Helper pattern from tests/core/idea-clusters.test.ts (makeIdea, buildGraph helpers)
   → MCP test pattern from tests/mcp/ideas.test.ts (direct import of core functions)

3. Vad vet jag INTE ännu?
   → Inget — jag har full bild. Har läst:
     - consolidateIdeasCommand (src/commands/consolidate-ideas.ts)
     - clusterIdeas, createMetaIdeas, identifyArchiveCandidates (src/core/idea-clusters.ts)
     - MCP tool consolidate action (src/mcp/tools/ideas.ts)
     - Existing test patterns (tests/commands/ideas.test.ts, tests/core/idea-clusters.test.ts, tests/mcp/ideas.test.ts)
     - KGNode/KGEdge schemas (src/core/knowledge-graph.ts)

4. Finns det redan en befintlig lösning jag kan bygga på?
   → Ja: tests/core/idea-clusters.test.ts has makeIdea and buildGraph helpers
   → tests/commands/ideas.test.ts has the exact mock pattern for loadGraph/saveGraph
   → tests/mcp/ideas.test.ts has the MCP test pattern (test core functions directly)
