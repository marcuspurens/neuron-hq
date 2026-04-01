# Dagbok — Senior Fullstack

**Publik:** Seniora fullstack-utvecklare. Du kan TypeScript, PostgreSQL, MCP, embeddings. Här får du arkitekturbeslut, kodmönster och "varför designades det så".

**Vem skriver?** AI-agent (Sisyphus/Atlas/Claude) under sessioner. Marcus vid manuella commits.

**Tre dagböcker:** DAGBOK-MARCUS.md (projektägare, svensk prosa), **DAGBOK-DEV.md** (denna, seniora fullstack-devs), DAGBOK-LLM.md (AI-agenter, dense/parseable).

**Historik:** S1–S150 + körningar #1–#183 → `docs/DAGBOK.md`. Handoffs → `docs/handoffs/`. ADR → `docs/adr/`.

---

## Kodbasstatistik (baseline 2026-03-26)

| Metrik            | Värde                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tester            | 3949 (Vitest)                                                                                                                                                 |
| Agenter           | 13 (Manager, Implementer, Reviewer, Researcher, Librarian, Historian, Tester, Consolidator, Knowledge Manager, Merger, Observer, Brief Reviewer, Code Anchor) |
| Körningar         | 183 totalt (varav ~120 GREEN)                                                                                                                                 |
| Aurora idénoder   | 924                                                                                                                                                           |
| Roadmap Fas 3     | 26/32 tasks done                                                                                                                                              |
| TypeScript strict | noUncheckedIndexedAccess + strictNullChecks + NodeNext                                                                                                        |

---

## Hur man skriver

- Svenska med engelska tekniska termer (standard dev-kultur)
- Filreferenser med sökväg: `src/core/agents/manager.ts:45`
- Körresultat med AC-count, testräkning, kostnad
- Taggar: SESSION, KÖRNING, BESLUT, BRIEF, FIX, REFACTOR, TEST, BUILD, PROBLEM

---

## 2026-03-26

### Tooling-migration: VS Code + Claude Opus → OpenCode + LiteLLM

**Vad ändrades:**

- Primärt gränssnitt: VS Code (Cursor-fork) → OpenCode
- Model routing: direkt Anthropic API → LiteLLM proxy (multi-model)
- Aktiv modell idag: `claude-opus-4-6` via `svt-litellm/` prefix
- Orkestrator: Claude Opus (informell) → Atlas (OhMyOpenCode Master Orchestrator)

**Vad ändrades INTE:**

- Kodbasen (ingen prod-kod ändrad idag)
- Test suite (3949 tester intakta)
- Policy-filer (`policy/bash_allowlist.txt`, `policy/forbidden_patterns.txt`)
- Aurora-integrationen (MCP server, pgvector, Obsidian)

**Varför bytet?**
LiteLLM ger model-agnostisk routing — samma prompt-infrastruktur kan använda Opus, Sonnet, Haiku, eller open-source-modeller utan att ändra agentkoden. Atlas-orkestratorn ger strukturerad multi-task-planering som Opus-i-VS Code inte hade formellt.

| Tid    | Typ     | Vad hände                                                                        |
| ------ | ------- | -------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | LiteLLM proxy aktiv. Model prefix: `svt-litellm/`                                |
| ~09:15 | SESSION | Första Atlas-sessionen. Plan: skapa tre dagböcker i `docs/dagbocker/`            |
| ~09:30 | FIX     | `docs/dagbocker/` skapad. DAGBOK-MARCUS.md, DAGBOK-DEV.md, DAGBOK-LLM.md skrivna |

### Roadmap-kontext

Vi är på **Fas 2 (Intelligens)** i ROADMAP.md. Fas 1 (Daglig nytta) är komplett sedan 2026-03-19.

Nästa kritiska milstolpe: Aurora-integration. Neuron har aldrig körts mot Aurora som target-repo. Körningarna `A1`–`A6` i ROADMAP-AURORA.md täcker detta.

Prioriterade briefs som väntar:

- `3.6` (KRITISK — identifierad i S144)
- `3.7`, `3.8`
- Aurora-serien `A1`–`A2` (obligatoriska)

### Aktiva risker

- **Code Anchor output-trunkering** (HÖG risk, identifierad S149). Brief finns: `briefs/2026-03-25-code-anchor-hardening.md`. Inte körts ännu.
- **Aurora MCP version mismatch** (MCP 1.25 vs 1.26). Identifierat S145. Åtgärd oklar.
- **Brief 3.2a** räddades manuellt från workspace (S138) — bör verifieras att merge-artefakter är kompletta.

---

## 2026-04-01 (Session 5)

### Ingest-pipeline: regex-tags → LLM-enriched metadata

**Designbeslut:** `extractTags()` (regex-split av titel) ersatt med `generateMetadata()` — ett enda Gemma 3 (Ollama) anrop som producerar tags + language + author + contentType + summary.

**Varför:** Regex gav meningslösa tags ("covid", "pandemic" för en AI-artikel som använde pandemin som metafor). LLM med full textkontext (start+mitt+slut, 3000 chars) ger semantiska tags.

**Arkitektur:**

```
processExtractedText() pipeline:
  1. Hash + dedup
  2. Create doc node (tags: [] — tom initialt)
  3. Create chunks + edges
  4. saveAuroraGraph()
  5. autoEmbedAuroraNodes()
  6. findNeuronMatchesForAurora()     ← cross-refs
  7. generateMetadata()               ← NY: Gemma 3 via Ollama /api/chat
     → tags, language, author, contentType, summary
     → updateAuroraNode() med alla fält
  8. saveAuroraGraph() med pipeline_report
```

`generateMetadata()` körs medvetet SIST (steg 7) — har tillgång till cross-ref-titlar som extra kontext för tagging.

**Text sampling för långa dokument:**

```typescript
if (text.length > 3000) {
  start(1000) + mid(1000) + end(1000); // representativt urval
}
```

**Filer:** `src/aurora/intake.ts` (generateMetadata), `aurora-workers/extract_url.py` (author extraction)

### Obsidian-export: debug-metadata → user-facing properties

**Designbeslut:** Obsidian frontmatter visar nu det användaren bryr sig om, inte intern debug-data.

Före → Efter:

```yaml
# FÖRE                          # EFTER
id: "doc_09e7a960be31"          typ: bloggpost
type: document                  författare: "Matt Shumer"
scope: personal                 publicerad: 2026-02-09
confidence: 0.5                 källa: "https://shumer.dev/..."
exported_at: "2026-04-01..."    språk: english
                                tags: [ai, automation, ...]
                                tldr: "AI-disruption som..."
```

**Full text från chunks:** Export konkatenerar alla `_chunk_N`-noder istället för att visa doc-nodens 500-tecken snippet. Chunks sorteras på `chunkIndex`.

**Markdown-formatering bevarad:** `trafilatura.extract(output_format='markdown')` — en rad i Python-workern. Ger headings, bold, paragraphs i Obsidian.

**Filer:** `src/commands/obsidian-export.ts`, `aurora-workers/extract_url.py`

### MCP multi-scope

**Designbeslut:** `createMcpServer()` accepterar kommaseparerade scopes: `--scope aurora-search,aurora-memory,aurora-ingest-text`.

**Varför:** Hermes behöver sökning + minne + ingest i samma MCP-server. Alternativet (en server per scope) ger N processer och N tool-prefix i Hermes.

**Implementation:** `scope.split(',')` → iterera, validera varje scope, registrera alla tools på samma `McpServer`-instans. Notification wrapper appliceras om _någon_ scope behöver det.

**Fil:** `src/mcp/server.ts`

### Hermes MCP-koppling: tsx cwd-bugg

**Problem:** Hermes startade MCP-servern med `npx tsx src/cli.ts` men tsx resolvade `src/cli.ts` relativt till Hermes agent-mappen (`~/.hermes/hermes-agent/`), inte Neuron HQ. `ERR_MODULE_NOT_FOUND`.

**Rotorsak:** Hermes gateway sätter `WorkingDirectory` till sin egen mapp i launchd-plist. `cwd` i config.yaml skickas kanske inte vidare som process cwd.

**Fix:** Wrapper-skript `~/.hermes/aurora-mcp.sh`:

```bash
#!/bin/bash
cd "/Users/mpmac/Documents/VS Code/neuron-hq" || exit 1
export DATABASE_URL=postgresql://localhost:5432/neuron
export PATH="..."
exec ./node_modules/.bin/tsx src/cli.ts mcp-server --scope "$1"
```

### Kunskapsarkitektur: Aurora vs HippoRAG vs A-MEM

**Analys:** Aurora har ~70% av HippoRAG och A-MEM redan. Saknas:

1. **PPR-retrieval** (HippoRAG) — `src/core/ppr.ts` finns men är inte integrerad i `searchAurora()`. Brief 3.2b har planen.
2. **Memory evolution** (A-MEM) — befintliga noder uppdateras inte när ny relaterad kunskap läggs till.
3. **Hermes som proaktiv agent** — varken HippoRAG eller A-MEM har detta. Unikt.

Se `docs/handoffs/HANDOFF-2026-04-01-opencode-session5-llm-metadata-hermes-mcp-plan.md` för full plan.

| Tid   | Typ      | Vad                                                                   |
| ----- | -------- | --------------------------------------------------------------------- |
| 18:00 | SESSION  | Session 5 start, baseline 3949/3949                                   |
| 18:10 | FIX      | Committade session 4 ändringar (3 commits)                            |
| 18:20 | REFACTOR | `extractTags()` → `generateMetadata()` med Gemma 3                    |
| 18:30 | FIX      | Hermes MCP: wrapper-skript, MEMORY.md reset, aurora-swarm-lab flyttad |
| 19:00 | BESLUT   | Obsidian frontmatter redesign: user-facing properties                 |
| 19:30 | FIX      | Markdown-formatering i trafilatura (`output_format='markdown'`)       |
| 19:45 | BESLUT   | Behåll "Aurora" som modulnamn inom Neuron HQ                          |
| 20:00 | PLAN     | PPR-retrieval + memory evolution + Hermes briefing plan               |

### Baseline

```
typecheck: clean
tests: 3949/3949 (1 pre-existing timeout: knowledge.test.ts)
commits: 10 denna session
aurora nodes: 86 (18 doc, rest chunks)
```

---
