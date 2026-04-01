# HANDOFF-2026-04-01 — OpenCode Session 5: LLM Metadata, Hermes MCP Fix, Knowledge Architecture Plan

## Gjort (10 commits)

### 1. LLM-baserad metadata-generering (ersätter regex-tags)

`extractTags()` (regex, bara titel) → `generateMetadata()` (Gemma 3, full kontext).

Ett enda Ollama-anrop producerar nu:

- **tags** — 5-10 semantiska tags (inte ordklipp)
- **language** — detekterat språk ("english", "svenska")
- **author** — författarnamn om identifierbart
- **contentType** — "bloggpost", "nyhetsartikel", "dokumentation", etc.
- **summary** — 1-2 meningar TL;DR

Körs efter embeddings + cross-refs — har full kontext (titel, text start+mitt+slut, URL, relaterade noder).

Filer: `src/aurora/intake.ts`, `aurora-workers/extract_url.py`

### 2. Obsidian-export totalöversyn

Före: intern debug-metadata (id, scope, confidence, exported_at), 500 tecken avkapad text, tom "Kopplingar"-rubrik.

Efter:

```yaml
---
typ: bloggpost
författare: 'Matt Shumer'
publicerad: 2026-02-09
språk: english
tags: [shumer.dev, ai, automation, cognitive work, ...]
tldr: 'AI-disruption som är större än covid...'
---
```

- Full text från alla chunks (inte 500 tecken)
- Markdown-formatering bevarad (rubriker, fetstil, stycken) via `output_format='markdown'` i trafilatura
- TL;DR som blockquote + frontmatter-fält
- Tomma sektioner döljs, inga onödiga rubriker

Filer: `src/commands/obsidian-export.ts`, `aurora-workers/extract_url.py`

### 3. Multi-scope MCP-server

`createMcpServer()` stödjer nu kommaseparerade scopes: `--scope aurora-search,aurora-memory,aurora-ingest-text`.

Fil: `src/mcp/server.ts`

### 4. Hermes → Neuron HQ MCP-koppling fixad

Tre problem löstes:

- **MCP-server kraschade**: `npx tsx` resolvade `src/cli.ts` mot Hermes-mappen (fel cwd). Fix: wrapper-skript `~/.hermes/aurora-mcp.sh` som cd:ar till neuron-hq först.
- **Hermes använde aurora-swarm-lab**: Gammalt minne i MEMORY.md. Fix: nollställd session, uppdaterad MEMORY.md + security.md.
- **aurora-swarm-lab i vägen**: Flyttad till `~/Documents/Arkiv/aurora-swarm-lab/`.

E2e verifierat: Telegram → Hermes → `aurora_ingest_url` → Neuron HQ → text + embeddings + tags → DB.

### 5. Kunskapsarkitektur-analys

Jämförde Aurora mot HippoRAG (NeurIPS 2024) och A-MEM (NeurIPS 2025). Aurora har redan ~70% av bådas arkitektur. Saknas:

1. **PPR-retrieval** (HippoRAG) — sprid aktivering genom grafen vid sökning
2. **Memory evolution** (A-MEM) — uppdatera befintliga noder när ny relaterad kunskap läggs till

Viktig insikt: varken HippoRAG eller A-MEM har en proaktiv agent. Hermes ger Aurora en unik fördel.

## Commits

```
6961f3b feat: extract URL content as markdown to preserve formatting in Obsidian
e763718 fix: clean Obsidian layout — remove empty sections, duplicate TL;DR, unnecessary headers
b9afb5a fix: add tldr as frontmatter property for Obsidian properties panel
22ba27e fix: TL;DR label in Obsidian + prompt tuning for direct summaries
c7dc2fa feat: LLM-enriched metadata (author, language, type, summary) + full text in Obsidian
27b848b feat: replace regex tag extraction with LLM-based generation via Gemma 3
be9f0b0 docs: session 3-4 handoffs, hermes-telegram gameplan, dagbok update
be62f10 feat: support comma-separated MCP scopes for multi-scope servers
4bf5142 feat: add auto-tags to aurora ingest, filter chunks from obsidian export, fix decay tests
```

## Baseline

- typecheck: clean
- tests: 3949/3949 (exkl. 1 pre-existing timeout i knowledge.test.ts)
- Aurora nodes: 86 (18 doc-noder, resten chunks)

## Externa konfigändringar (EJ i repo)

- `~/.hermes/config.yaml` — scopes: `aurora-search,aurora-memory,aurora-ingest-text`, command: wrapper-skript
- `~/.hermes/aurora-mcp.sh` — MCP wrapper (cd + env + exec tsx)
- `~/.hermes/memories/MEMORY.md` — uppdaterad: "använd MCP, inte terminal"
- `~/.hermes/context/security.md` — uppdaterad: explicit MCP-instruktioner
- `~/Documents/Arkiv/aurora-swarm-lab/` — flyttad från VS Code-mappen

## Nästa session: PPR + Memory Evolution + Hermes Briefing

Se plan nedan.

---

## PLAN: Lyfta Aurora med HippoRAG + A-MEM + Hermes

### Bakgrund

Aurora har kunskapsgraf, embeddings, memory, gaps, decay, cross-refs. Det som saknas för att gå från "bra RAG" till "levande kunskapssystem" är två saker från akademisk forskning + en unik Hermes-koppling.

### Del 1: PPR-Retrieval (från HippoRAG)

**Vad:** Personalized PageRank-baserad sökning. Istället för "hitta noder med liknande embedding" → "hitta entry-noder → sprid aktivering genom grafen → returnera hela sammanhanget".

**Varför:** Skillnaden mellan att hitta _en_ artikel och att hitta _ett ämne_. "Vad vet jag om AI-kodning?" borde ge shumer.dev + YouTube-klippet om kodautomation + dina egna anteckningar — klustrat.

**Vad som redan finns:**

- `src/core/ppr.ts` — PPR-algoritm (nämns i dagboken)
- Brief 3.2b: `briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md` — detaljerad plan med `jaccard × 0.6 + ppr_proximity × 0.4`
- `src/aurora/search.ts` — nuvarande sökning (semantic + keyword + traversal, INGEN PPR)

**Uppgift:**

1. Läs `src/core/ppr.ts` och brief 3.2b
2. Integrera PPR i `searchAurora()` som tredje retrieval-steg (efter semantic, före keyword fallback)
3. PPR entry-noder = semantiska topresultat → sprid genom edges → returnera utökat kluster
4. Testa: "AI kodning" borde ge relaterade noder som inte matchade embedding direkt

**Effort:** 1 session
**Risk:** Medium — PPR-koden finns men är inte integrerad i search.ts

### Del 2: Memory Evolution (från A-MEM)

**Vad:** När ny kunskap läggs till → uppdatera befintliga relaterade noder automatiskt.

**Varför:** Idag är ingest enkelriktat. Du lägger till shumer.dev-artikeln → den kopplas till befintliga noder via cross-refs, men befintliga noder vet inget om den nya. Memory evolution = nätverket "lär sig" av varje ny nod.

**Konkret:**

- Vid ingest, efter cross-refs: hitta noder med similarity > 0.6
- Uppdatera deras `properties.relatedContext`: "Ny relaterad källa: [titel] — [summary]"
- Stärk edge-confidence mellan noder som nämner liknande koncept
- Merga kunskapsluckor som den nya noden svarar på (partial resolution)

**Vad som redan finns:**

- `updateAuroraNode()` i aurora-graph.ts
- Cross-ref-matching vid ingest (`findNeuronMatchesForAurora()`)
- Knowledge gaps med `markGapResolved()`
- Brief 3.2a: `briefs/2026-03-23-a-mem-3.2a-orchestrator-abstraktion.md` — abstraktionslogik

**Uppgift:**

1. Lägg till `evolveRelatedNodes()` i `src/aurora/intake.ts` — körs efter LLM-metadata, före final save
2. Hämta top-5 semantiskt relaterade noder (exkl. chunks)
3. Uppdatera deras `relatedContext` med titel+summary av den nya noden
4. Kolla om ny nod besvarar öppna kunskapsluckor → `markGapResolved()`
5. Logga i pipeline_report: `{ evolution: { nodesUpdated: N, gapsResolved: N } }`

**Effort:** 1 session
**Risk:** Låg — additivt, inga befintliga flöden ändras

### Del 3: Morgonbriefing via Hermes (Telegram)

**Vad:** Hermes skickar daglig briefing kl 08:00 via Telegram. Inte bara "nya noder" — intelligent sammanfattning med kopplingar och rekommendationer.

**Varför:** Det som gör systemet levande. Passivt arkiv → proaktiv kunskapsassistent.

**Vad som redan finns:**

- `src/aurora/morning-briefing.ts` — 577 rader, komplett: `collectBriefingData()` + LLM-genererad sammanfattning
- `src/commands/morning-briefing.ts` — CLI-kommando
- MCP-scope `aurora-insights` med `aurora_morning_briefing` tool
- Hermes cron-system funkar (verifierat i session 4)
- Gameplan Fas 3 beskriver exakt konfigändringen

**Uppgift:**

1. Lägg till `aurora-insights` scope i `~/.hermes/config.yaml`: `aurora-search,aurora-memory,aurora-ingest-text,aurora-insights`
2. Lägg till cron i Hermes config:
   ```yaml
   cron:
     morning_briefing:
       schedule: '0 8 * * *'
       prompt: 'Kör aurora_morning_briefing och skicka resultatet till mig i Telegram. Sammanfatta på svenska.'
       channel: telegram:dm:8426706690
   ```
3. Starta om gateway, verifiera att cron triggar
4. Testa manuellt: be Hermes "kör morgonbriefing" i Telegram

**Effort:** 30 min (bara config, ingen kodändring)
**Risk:** Låg — all kod finns redan

### Prioritetsordning

1. **Morgonbriefing via Hermes** (30 min, bara config) — omedelbart värde, Marcus ser briefing varje morgon
2. **PPR-retrieval** (1 session) — förbättrar allt som söker i grafen
3. **Memory evolution** (1 session) — gör grafen levande

### Arkitektur efter alla tre

```
Du skickar URL i Telegram
    ↓
Hermes → aurora_ingest_url → Neuron HQ
    ↓
Text extraction (markdown) → Chunks → Embeddings
    ↓
Cross-refs (semantic matching mot befintliga noder)
    ↓
Memory evolution (uppdatera relaterade noder + lösa kunskapsluckor)
    ↓
LLM metadata (Gemma 3: tags, author, language, type, summary)
    ↓
Spara i PostgreSQL
    ↓
Nästa morgon kl 08:00:
    ↓
Hermes cron → aurora_morning_briefing → Telegram:
"God morgon. Du sparade igår en artikel av Matt Shumer.
 Den kopplar till 3 befintliga ämnen: [AI-kodning], [automation], [kunskapslucka: AI+journalistik].
 Vill du att jag forskar vidare på luckan?"
    ↓
Du svarar "Ja" → Hermes söker webben → indexerar → cykeln fortsätter
```

---

## Filreferenser

| Fil                                                        | Vad den gör                                            |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `src/aurora/intake.ts`                                     | Ingest pipeline (LLM metadata, memory evolution punkt) |
| `src/aurora/search.ts`                                     | Sökning (PPR integration punkt)                        |
| `src/core/ppr.ts`                                          | PPR-algoritm (redan implementerad)                     |
| `src/aurora/morning-briefing.ts`                           | Briefing-generering (redan komplett)                   |
| `src/aurora/knowledge-gaps.ts`                             | Kunskapsluckor (gap resolution punkt)                  |
| `briefs/2026-03-23-a-mem-3.2b-ppr-hybrid.md`               | Detaljerad PPR-brief                                   |
| `briefs/2026-03-23-a-mem-3.2a-orchestrator-abstraktion.md` | Abstraktions-brief                                     |
| `docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md`          | Hermes-Aurora gameplan                                 |
| `~/.hermes/config.yaml`                                    | Hermes konfiguration                                   |
| `~/.hermes/aurora-mcp.sh`                                  | MCP wrapper-skript                                     |
