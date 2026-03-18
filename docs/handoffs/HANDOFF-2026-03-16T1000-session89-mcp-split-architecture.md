# HANDOFF-2026-03-16T1000 — Session 89: TD-2b + MCP Split Architecture

## Sammanfattning

Session 89: 1 körning (140) 🟢 GREEN + arkitekturbeslut för MCP-split. +18 tester (2355 → 2373).
Fokus: Job polish (TD-2b) + djup research och planering av MCP server split + Skills.

## Körningar

| # | Brief | Tester | Nyckel |
|---|-------|--------|--------|
| 140 | TD-2b Job System Polish | +18 | Passiv notis, CLI jobs, onProgress, temp cleanup |

## Vad levererades

### Körning 140 — TD-2b Job System Polish (GREEN, 26/26 AC)

- `wrapToolsWithNotification()` — monkey-patch av McpServer.tool() för passiv "klart!"-notis
- CLI `jobs` och `job-stats` kommandon
- `onProgress` callback i `ingestVideo()` — riktig progress, inte estimat
- Temp-filstädning med byte-tracking (stat → unlink)
- 2373 tester totalt

### MCP Architecture Decision — Tre lager

**Problem:** 45 tools i en server. Branschdata: 10 tools = perfekt, 30+ = kritisk tröskel.

**Beslut:** Splitta till 10 fokuserade MCP-servrar + MCP Prompts + Skills.

**Research sparad:** `docs/research/research-2026-03-16-mcp-split-skills-architecture.md`

**Tre-lagers modell:**

```
┌─────────────────────────────────────────────────┐
│  Lager 3: Skills (SKILL.md-filer)               │
│  Orkestrering MELLAN servrar (8 skills)          │
├─────────────────────────────────────────────────┤
│  Lager 2: MCP Prompts (server.prompt())          │
│  Snabbgenvägar INOM servrar (~20 prompts)        │
├─────────────────────────────────────────────────┤
│  Lager 1: 10 MCP Servrar (3-7 tools/st)         │
│  45 → 32 tools via 5 konsolideringar             │
└─────────────────────────────────────────────────┘
```

**10 servrar:**

| Server | Tools | Domän |
|--------|-------|-------|
| aurora-search | 3 | Sökning & frågor |
| aurora-insights | 3 | Överblick & briefing |
| aurora-memory | 3 | Minne & luckor |
| aurora-ingest-text | 2 | Textingest |
| aurora-ingest-media | 4 | Mediaingest |
| aurora-media | 3 | Röster & video-jobb |
| aurora-library | 3 | Kunskapsbibliotek |
| aurora-quality | 4 | Kvalitet & freshness |
| neuron-runs | 3 | Körningar & kostnader |
| neuron-analytics | 4 | Dashboard & statistik |

**5 konsolideringar:**
- speakers 8→1, jobs 4→1, memory 3→1, freshness 2→1, cross-ref 2→1

**Implementation:** `--scope`-flagga i CLI, samma binary, olika tool-registreringar.

**Branschkällor:**
- Speakeasy benchmark: 10 tools = 100% precision, 30+ = överlapp
- Claude Desktop: hård gräns 100 tools
- Anthropic: Skills = expertis, MCP = koppling (kompletterande)
- 5 design patterns: Sequential, Multi-MCP, Iterative, Routing, Domain-specific

## Vad som INTE blev klart

- TD-3a/b/c briefsen skrivna men ej körda
- YouTube-test
- Voice print-test
- Claude Desktop omstart

## Filer skapade/ändrade

- `docs/research/research-2026-03-16-mcp-split-skills-architecture.md` — MCP research
- `docs/roadmap-neuron-v2-unified-platform.md` — ny sektion: Spår TD-3
- `briefs/2026-03-16-td3a-mcp-server-split.md` — brief för server split
- `briefs/2026-03-16-td3b-mcp-prompts.md` — brief för MCP Prompts
- `briefs/2026-03-16-td3c-skills.md` — brief för Skills

## Nästa steg (session 90)

1. **Kör TD-3a** — MCP server split (konsolideringar + 10 scopes + --scope flagga)
2. **Kör TD-3b** — MCP Prompts (snabbgenvägar inom servrar)
3. **Kör TD-3c** — Skills (SKILL.md cross-server orkestrering)
4. **Uppdatera Claude Desktop config** — 10 server-entries
5. **Testa YouTube-video** + voice print

## Kommando för nästa session

Kör TD-3a (MCP Server Split):
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-16-td3a-mcp-server-split.md --hours 1
```
