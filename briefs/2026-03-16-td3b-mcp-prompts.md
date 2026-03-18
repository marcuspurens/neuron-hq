# TD-3b: MCP Prompts — Server-Scoped Workflow Templates

## Problem

After TD-3a, we have 10 focused MCP servers with 2-4 tools each. Users must know which tools to call and in what order. MCP Prompts (the third MCP primitive, alongside Tools and Resources) provide user-selectable workflow templates that appear in Claude Desktop's `+` menu.

## Prerequisites

- TD-3a completed (10 scoped servers with consolidated tools)

## Solution

Add 2-3 `server.prompt()` registrations to each of the 10 servers (~20 prompts total). Each prompt is a parameterized template that instructs Claude to chain the server's tools in a logical sequence.

## Acceptance Criteria

### 1. Prompt Registration Infrastructure

1. Each server scope's `registerTools(server)` function also registers prompts
2. Prompts use the TypeScript SDK's `server.prompt(name, schema, handler)` pattern
3. Each prompt returns a `messages` array with role and content
4. Test: each scope registers at least 1 prompt

### 2. aurora-search Prompts (2)

5. `sok-och-svara` (topic: string) — "Search for {topic} in Aurora, then synthesize an answer with citations"
6. `vad-vet-vi` (topic: string) — "Show Aurora status, search for {topic}, and summarize what we know"
7. Test: prompts return valid message arrays

### 3. aurora-insights Prompts (2)

8. `full-briefing` (topic: string) — "Create timeline, generate briefing, and suggest research for {topic}"
9. `forskningsforslag` (topic: string) — "Analyze knowledge gaps and generate research suggestions for {topic}"
10. Test: prompts return valid message arrays

### 4. aurora-memory Prompts (2)

11. `vad-sa-vi` (topic: string) — "Recall relevant memories about {topic} and list any knowledge gaps"
12. `lar-fran-samtal` (conversation: string) — "Extract facts and preferences from this conversation and save to memory"
13. Test: prompts return valid message arrays

### 5. aurora-ingest-text Prompts (1)

14. `indexera-lank` (url: string) — "Ingest {url} into Aurora and show what was extracted"
15. Test: prompt returns valid message array

### 6. aurora-ingest-media Prompts (2)

16. `indexera-video` (url: string) — "Queue {url} for video ingest and explain what will happen"
17. `indexera-bilder` (path: string) — "Ingest image(s) at {path} using OCR and describe results"
18. Test: prompts return valid message arrays

### 7. aurora-media Prompts (2)

19. `speaker-review` — "List all voice prints, suggest speaker matches, and show which need confirmation"
20. `jobb-oversikt` — "Show all recent jobs with status, stats, and any completed notifications"
21. Test: prompts return valid message arrays

### 8. aurora-library Prompts (2)

22. `ny-artikel` (topic: string) — "Synthesize a new article about {topic} from Aurora knowledge base"
23. `kunskapsbibliotek` — "List all articles, show ontology stats, and suggest concept merges"
24. Test: prompts return valid message arrays

### 9. aurora-quality Prompts (2)

25. `kvalitetsrapport` — "Run freshness report, check cross-ref integrity, and show low-confidence nodes"
26. `verifiera-kallor` (topic: string) — "Find sources about {topic} and check their freshness status"
27. Test: prompts return valid message arrays

### 10. neuron-runs Prompts (2)

28. `senaste-korningar` (count: number, default 5) — "Show last {count} runs with status, costs, and test results"
29. `starta-korning` (target: string, brief: string) — "Prepare to start a run for {target} with {brief}, show costs estimate"
30. Test: prompts return valid message arrays

### 11. neuron-analytics Prompts (2)

31. `dashboard` — "Generate the full dashboard with beliefs, run stats, and knowledge overview"
32. `beliefs` (topic: string) — "Show Bayesian beliefs and statistics related to {topic}"
33. Test: prompts return valid message arrays

### 12. No Regressions

34. All existing tests pass
35. Typecheck clean

## Technical Notes

### Prompt Implementation Pattern

```typescript
// In each scope's registerTools function:
export function registerAuroraSearchScope(server: McpServer): void {
  // Tools
  registerAuroraSearchTool(server);
  registerAuroraAskTool(server);
  registerAuroraStatusTool(server);

  // Prompts
  server.prompt(
    'sok-och-svara',
    { topic: z.string().describe('Ämne att söka efter') },
    ({ topic }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Sök i Aurora-kunskapsbasen efter "${topic}" med aurora_search, och ge mig sedan ett syntetiserat svar med aurora_ask. Inkludera källor och confidence.`
        }
      }]
    })
  );
}
```

### Prompt Language

Prompts should be in Swedish (matching user preference) with clear, actionable instructions that reference specific tool names.

### Prompt vs Skill Boundary

Prompts are WITHIN a single server scope — they only reference tools from that scope. Cross-server workflows are handled by Skills (TD-3c).

## Files to Create/Modify

**Modify:**
- `src/mcp/scopes.ts` — add prompt registrations to each scope's registerTools function
- Or alternatively, create separate prompt registration functions per scope

**Create:**
- `tests/mcp/prompts.test.ts` — tests for all prompts

## Out of Scope

- Cross-server prompts (that's what Skills are for in TD-3c)
- Resource definitions (future consideration)
- Prompt caching or dynamic prompt generation
