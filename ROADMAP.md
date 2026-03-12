# Neuron HQ — Roadmap

> Editera direkt i filen — kryssa av med `✅` eller `- [x]` när något är klart.
> Uppdateras i slutet av varje session (eller när en brief körs klart).
>
> **Senast uppdaterad:** 2026-03-12 · Session 79

---

## Status just nu

| Mått | Värde |
|------|-------|
| Tester | 1674 ✅ |
| Körningar | 117 |
| MCP-tools | 36 |
| Sessioner | 79 |
| Senaste commit | C4 lokal vision (`9c2344d`, körning 117) |

### Spår-översikt

| Spår | Namn | Status | Sessioner |
|------|------|--------|-----------|
| **N** | Neuron HQ Features | ✅ 13/14 klara (N6 kvar) | 51–60 |
| **G** | GraphRAG | ✅ 3/3 KOMPLETT | 48–50 |
| **S** | Smartare agenter | ✅ 9/9 KOMPLETT | 52–59 |
| **D** | Databas & MCP | ✅ 3/3 KOMPLETT | 60–63 |
| **A** | Aurora Core | ✅ 7/7 KOMPLETT | 67–69 |
| **B** | Aurora Intelligence | ✅ 6/6 KOMPLETT | 70–73 |
| **C** | Multimedia & Röster | ✅ 6/6 KOMPLETT | 74–78 |
| **F** | Bayesiskt medvetande | 🟡 F0 klar, F1–F3 planerade | 78– |
| **E** | Autonom kunskapscykel | ⬜ Planerad | — |

---

## Spår A — Aurora Core ✅ KOMPLETT

Aurora absorberades i Neuron HQ v2 (session 66). Delad Postgres-databas, separata minnestabeller.

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| A1 | Skelett + delad infrastruktur | `e1552d8` | +66 | 67 |
| A1.1 | Härdning (search MCP, batch embed, decay) | `d06c676` | +27 | 67 |
| A2 | Intake-pipeline (Python workers, chunker, CLI+MCP) | `0cdc36a` | +85 | 67 |
| A3 | Search + Ask-pipeline | `aed7487` | +35 | 68 |
| A4 | Memory (preferenser, fakta) | `f5e23ce` | +44 | 68 |
| A5 | YouTube + voice ingestion | `d81b261` | +33 | 68 |
| A6 | Smart minne (auto-lärande, motsägelser, timeline, gaps) | `df28eff` | +54 | 69 |
| A7 | Cross-reference (unified search, Historian-koppling) | `0ce6e0d` | +38 | 69 |

**Totalt:** +382 tester. 17 MCP-tools.

---

## Spår B — Aurora Intelligence ✅ KOMPLETT

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| B1 | Briefing — samlad kunskapsrapport | körning 104 | +23 | 70 |
| B2 | Auto cross-ref vid ingest | `d6952f1` | +12 | 71 |
| B3 | Source freshness scoring | `6554b10` | +25 | 71 |
| B4 | Cross-ref-integritet | `087a9fe` | +34 | 72 |
| B5 | Conversation learning | `a556fbd` | +15 | 73 |
| B6 | Gap → Brief pipeline | `430f622` | +16 | 73 |

**Totalt:** +125 tester.

---

## Spår C — Multimedia & Röster ✅ KOMPLETT

| # | Vad | Commit | Tester | Session |
|---|-----|--------|--------|---------|
| C1 | Video-pipeline (YouTube, SVT, alla yt-dlp-sajter) | `1a69b24` | +17 | 74 |
| STT | Språkdetektering + automatiskt modelval (sv→KBLab) | körning 110 | +8 | 75 |
| C2 | Voiceprint-redigering (rename, merge speakers) | `592360c` | +31 | 76 |
| C2.1 | Voiceprint confidence loop | `2c2d7f2` | +32 | 76 |
| C3 | OCR (PaddleOCR, bild+PDF-fallback) | `8bee851` | +25 | 76 |
| C3.1 | Batch OCR (mapp → markdown) | körning 115 | +15 | 77 |
| C4 | Lokal vision via Ollama (qwen3-vl:8b) | `9c2344d` | +22 | 78 |

**Totalt:** +150 tester. Python workers: faster-whisper, pyannote, yt-dlp, pypdfium2, PaddleOCR.

**Idéer:** C4.1 batch vision · C4.2 URL-bilder · C4.3 vision+OCR fusion

---

## Spår F — Bayesiskt medvetande 🟡

Ge Neuron probabilistisk självkännedom — systemet bygger beliefs om sin egen förmåga.

| # | Vad | Status | Commit | Tester |
|---|-----|--------|--------|--------|
| F0 | Bayesisk confidence i Aurora (kunskap) | ✅ | `29e5d22` | +23 |
| F1 | Neuron körningsstatistik (per agent/modul/brief-typ) | 📝 Brief klar | — | — |
| F2 | Adaptiv Manager (använder F1 för att anpassa planer) | ⬜ | — | — |
| F3 | Självreflektion (periodisk self-assessment) | ⬜ | — | — |

**F0 detaljer:** Logistisk Bayesian update, source-vikter (academic 0.25 → anecdotal 0.03), `confidence_audit`-tabell, CLI+MCP.

**F0 idéer:** F0.1 retroaktiv backfill · F0.2 motsägelse-detektion · F0.3 multi-source aggregation · F0.4 confidence decay

```
F0 ✅ → F1 (brief klar) → F2 → F3
```

---

## Spår E — Autonom kunskapscykel ⬜

Neuron + Aurora som självförbättrande system.

| # | Vad | Status |
|---|-----|--------|
| E1 | Knowledge Manager-agent (11:e rollen) | ⬜ Planerad |
| E2 | Auto-research (exekvera forskningsförslag från B6) | ⬜ Planerad |
| E3 | Schemalagd re-ingest (freshness-driven) | ⬜ Planerad |
| E4 | Neuron som rådgivare (fråga systemet om sig själv) | ⬜ Planerad |

---

## Spår S — Smartare agenter ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| S1 | Self-reflection & verification gates | `0a4f70e` | 52 |
| S2 | Atomär uppgiftsdelning | `51d287d` | 52 |
| S3 | Parallella Implementers + worktrees | `b195004` | 56 |
| S4 | Process reward scoring | `79b18da` | 54 |
| S5 | Multi-provider (billigare modeller) | `c861b37` | 58 |
| S6 | Konsolideringsagent | `7ed7e67` | 53 |
| S7 | Hierarkisk kontext (ARCHIVE-systemet) | `84dc0fb` | 54 |
| S8 | Kvalitetsmått per körning | `50e8dc1` | 53 |
| S9 | Prompt-overlays per modell | S59 | 59 |

---

## Spår D — Databas & MCP ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| D1 | Postgres-schema + migrering + import | `41bd221` | 60–61 |
| D2 | pgvector embeddings (1024-dim, snowflake-arctic-embed) | `9b0cc1f` | 61 |
| D3 | MCP-server (36 tools: neuron + aurora) | `b2dfcef` | 63 |

---

## Neuron HQ Features — N-serien

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| N1 | Reviewer → Manager handoff | `091b5ec` | 52 |
| N3 | Resume-kontext (e-stop handoff) | `ef27d6c` | 52 |
| N4 | Typed message bus | S60 | 60 |
| N7 | Skeptiker-agent (confidence decay) | `3968316` | 51 |
| N8 | Test-first fallback | `769daaa` | 51 |
| N9 | Greenfield scaffold | `e2535d0` | 51 |
| N10 | Emergent behavior-logg | `096a5e6` | 51 |
| N11 | Manager grafkontext | `bd323fd` | 52 |
| N13 | Security Reviewer | S55 | 55 |
| N14 | Transfer learning via graf | S55 | 55 |

**Öppet:** N6 (ZeroClaw som Neuron-target) — ej prioriterat.

---

## GraphRAG ✅ KOMPLETT

| # | Vad | Commit | Session |
|---|-----|--------|---------|
| G1 | Core + migration (knowledge-graph.ts + graph.json) | `0bfa706` | 48–49 |
| G2 | Historian/Librarian skriver (4 verktyg) | `a1a1cfb` | 49 |
| G3 | Alla agenter läser (graph_query + graph_traverse) | `b897b26` | 50 |

---

## Teknisk skuld

Kartlagd session 79. Se [docs/handoffs/](docs/handoffs/) för detaljer.

| # | Problem | Prio | Status |
|---|---------|------|--------|
| TD-1 | `timeline()`/`search()` laddar hela grafen i minnet | Medium | Känd, väntar på >500 noder |
| TD-2 | ROADMAP.md utdaterad | Medium | ✅ Fixad S79 |
| TD-3 | Redundant `loadAuroraGraph()` i search.ts | Medium | ✅ Fixad S79 |
| TD-4 | N+1 DB writes i `saveAuroraGraphToDb` | Medium | Öppen |
| TD-5 | Dead code `LocalModelEvaluator` | Low | ✅ Borttagen S79 |
| TD-6 | graph.json inte gitignored | Medium | ✅ Fixad S79 |
| TD-7 | `__pycache__/` inte gitignored | Low | ✅ Fixad S79 |
| TD-8 | `catch (error: any)` x29 i agentfiler | Low | Öppen |
| TD-9 | requirements.txt ofullständig | Low | Öppen |
| TD-10 | Anthropic SDK 0.32.1 → 0.78.0 | High | Öppen — behöver egen körning |
| TD-11 | 4 MCP-tools utan tester | Low | Öppen |
| TD-12 | Inga coverage-trösklar i vitest | Low | Öppen |

---

## Infrastruktur — Körning utan laptop

**Mål:** Neuron HQ + Aurora körs när laptopen är stängd.

| Steg | Status |
|------|--------|
| Välj server (kompis-dator eller Hetzner ~3–5€/mån ARM) | ❌ |
| Installera Node.js 20, Python 3.12, Ollama, Git | ❌ |
| Konfigurera SSH + tmux | ❌ |
| Testa körning via SSH | ❌ |

**Krav:** M4 48 GB Mac lokalt (snowflake-arctic-embed 669 MB + qwen3-vl:8b 6.1 GB). Server behöver bara Node+Python (Ollama/Claude = API).

---

## Idébank

263 idéer från 70 körningar: [docs/ideas.md](docs/ideas.md)
