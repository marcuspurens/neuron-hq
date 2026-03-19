# Handoff — Session 101 (2026-03-18)

## Vad gjordes

### CR-1d: Logger-förbättringar (körning 163, 🟢)
- `LOG_LEVEL` env var via config.ts — styr loggnivå utan kodändring
- Error-serialisering — Error-objekt loggas med name/message/stack istället för `{}`
- Trace ID per körning — korrelera alla loggar från samma run
- LogWriter-abstraktion — utbytbar destination (test, fil, Langfuse senare)
- Commit: `2d7915d`, +12 tester → 3113 totalt

### E5: Idé-rankning i kunskapsgrafen (körning 164, 🟢)
- `IdeaPropertiesSchema` + `computePriority()` — numerisk rankning (1-5 skala)
- `rankIdeas()` — filtrera + sortera med connection-boost
- `linkRelatedIdeas()` — auto-kopplingar mellan idea-noder via Jaccard/cosine
- CLI `ideas` — `--group`, `--status`, `--limit`, `--link`, `--backfill`
- MCP `neuron_ideas` — rank/link/update actions (38:e MCP-tool)
- Manager-integration — top 5 idéer visas automatiskt vid planering
- Backfill — raderar gamla strängbaserade noder, parsar alla `runs/*/ideas.md` på nytt
- `ideas-parser.ts` uppdaterad — numeriska impact/effort/risk, numrerade listor
- Commit: `0d67c2e`, +61 tester → 3174 totalt

## Status

| Mått | Värde |
|------|-------|
| Tester | 3174 |
| Körningar | 164 |
| MCP-tools | 38 |
| Session | 101 |
| Code Review | ★★★★☆ |

## Att göra i nästa session

### 1. Kör backfill (obligatoriskt!)
Idéerna i grafen är raderade — de måste tankas in på nytt:

```bash
npx tsx src/cli.ts ideas --backfill
```

### 2. Verifiera idéer
```bash
npx tsx src/cli.ts ideas                  # Top 10 rankade idéer
npx tsx src/cli.ts ideas --group logger   # Filtrera på grupp
```

### 3. Nästa steg — förslag
- **Spår E** vidare (E1–E4 är öppna: Knowledge Manager-agent, auto-research, schemalagd re-ingest, Neuron-som-rådgivare)
- **CR Fas 2** mot ★★★★★ (testtäckning, refaktorering, batch DB)
- **OB-1c** (taggar, kommentarer, obsidian-import)
- **F2** (adaptiv Manager som använder körningsstatistik)

## Sparade idéer (session 101)

### CR-1d (5 st)
1. MultiWriter — compose multiple LogWriters
2. Langfuse LogWriter
3. Batched network writer
4. Log rotation
5. AsyncLocalStorage trace ID (parallella körningar)

### E5 (10 st)
1. LLM-assisted ranking
2. Auto-link ideas to brief requirements
3. Idea lifecycle dashboard
4. Decay for low-priority ideas
5. Markdown table format i parser
6. Multi-language extraction (sv/en)
7. Confidence from keyword density
8. Cluster ideas by semantic similarity
9. Cross-run idea tracking
10. Priority trend analysis

## Filer ändrade

### CR-1d
- `src/core/config.ts` — +LOG_LEVEL
- `src/core/logger.ts` — +93 rader (alla 4 features + resetLogger)
- `src/core/run.ts` — +setTraceId(runid)
- `tests/core/logger-enhancements.test.ts` — ny, 12 tester

### E5
- `src/core/knowledge-graph.ts` — +383 rader (schema, rank, link, backfill)
- `src/core/ideas-parser.ts` — numeriska värden, numrerade listor
- `src/commands/ideas.ts` — ny CLI
- `src/mcp/tools/ideas.ts` — ny MCP tool
- `src/core/agents/historian.ts` — risk + priority
- `src/core/agents/manager.ts` — top 5 idéer i prompt
- 5 nya testfiler (+61 tester)
