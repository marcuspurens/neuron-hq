# Neuron HQ — Roadmap

> Editera direkt i filen — kryssa av med `✅` eller `- [x]` när något är klart.
> Uppdateras i slutet av varje session (eller när en brief körs klart).
>
> **Senast uppdaterad:** 2026-02-27 · Session 50

---

## Status just nu

| Projekt | Tester | Senaste commit | Session |
|---------|--------|----------------|---------|
| Neuron HQ | 443 ✅ | `b897b26` (GraphRAG G3) | 50 |
| Aurora | 236 ✅ | `b22ee1c` (A3 embedding-konsistens) | — |

---

## Neuron HQ — Nästa körningar

Kör i denna ordning. En brief per körning.

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
```

### GraphRAG (3 steg — alla klara ✅)

| Steg | Vad | Commit | Session |
|------|-----|--------|---------|
| G1 | Core + migration (`knowledge-graph.ts` + `graph.json`) | `0bfa706` | 48–49 |
| G2 | Historian/Librarian skriver (4 verktyg, `graph-tools.ts`) | `a1a1cfb` | 49 |
| G3 | Alla agenter läser (`graph_query` + `graph_traverse` read-only) | `b897b26` | 50 |

**Resultat:** 69 noder, 56 kanter. 6 agenter anslutna (2 läs+skriv, 4 läs). 430 → 443 tester.

---

## Neuron HQ — Planerat (ej briefat än)

Idéer och önskemål som behöver briefs. Kryssa av när brief är skriven.

| # | Förbättring | Vad det innebär | Risk | Brief skriven? |
|---|-------------|-----------------|------|----------------|
| N1 | **Reviewer → Manager handoff** | Reviewer skriver strukturerad handoff (analogt med Implementer) | Low | ❌ |
| N2 | **GREEN regex i Reviewer-prompt** | Reviewer instrueras explicit att skriva `🟢 GREEN` — gjort ✅ (session 46) | — | ✅ |
| N3 | **Resume efter e-stop** | `npx tsx src/cli.ts resume` hanterar STOPPED-state korrekt | Medium | ❌ |
| N4 | **Typed message bus** | Agenter kommunicerar via schema-validerade meddelanden (inte fri text) | High | ❌ |
| N5 | **Aurora som Neuron-target** | Kör Neuron mot aurora-swarm-lab (redan `targets/repos.yaml`) | Low | ❌ |
| N6 | **ZeroClaw som Neuron-target** | Kör Neuron mot zeroclaw-fork | Low | ❌ |

---

## Aurora Brain — Roadmap

Full roadmap: [docs/aurora-brain-roadmap.md](docs/aurora-brain-roadmap.md)

### Fas A — Indexeringskvalitet
| # | Förbättring | Status |
|---|-------------|--------|
| A1 | Chunk-summaries | ✅ Klar (`1fe7f62`) |
| A2 | Entity-extraktion | ✅ Klar (`5c05583`) |
| A3 | Embedding-konsistens | ✅ Klar (`b22ee1c`) |
| A4 | Transcript overlap | ❌ |

### Fas B — Retrieval & Ranking
| # | Förbättring | Status |
|---|-------------|--------|
| B1 | Dynamisk top-k | ❌ |
| **B2** | **Hybrid search (BM25 + embeddings)** | ❌ ← **Nästa** |
| B3 | Cross-encoder re-ranking | ❌ |
| B4 | MMR diversity | ❌ |

### Fas C — Inmatningsflöden
| # | Flöde | Status |
|---|-------|--------|
| C1 | URL-skrapning | ✅ Klar (`0caaf72`) |
| C2 | YouTube | ✅ Klar (`9a7b844`) |
| C3 | PDF | ⚠️ PaddleOCR saknas |
| C4 | Word/PPT | ⚠️ python-docx installerat |
| C5 | Dropbox live-sync | ⚠️ on_deleted finns, on_created saknas |
| C6 | Ljud/möten | ⚠️ Whisper ok, pyannote saknas |

### Fas D — Svarsqualitet
| # | Förbättring | Status |
|---|-------------|--------|
| D1 | Källhänvisningar | ⚠️ Delvis |
| D2 | Minnessammanfattning | ❌ |
| D3 | Tidslinje | ❌ |
| D4 | Konfidensindikator | ❌ |

### Fas E — Infrastruktur
| # | Förbättring | Status |
|---|-------------|--------|
| E1 | Docker | ❌ |
| E2 | PaddleOCR | ❌ |
| E3 | pyannote.audio | ❌ |
| E4 | Batch re-indexering | ❌ |

### Prioritetsordning Aurora
```
B2 (hybrid search) → C3+C4 (PDF+Word) → B1 → B4 → B3 → D1+D2 → E1
```

---

## Infrastruktur — Körning utan laptop

**Mål:** Neuron HQ + Aurora körs när laptopen är stängd.

| Steg | Status |
|------|--------|
| Välj server (kompis-dator eller Hetzner ~3–5€/mån ARM) | ❌ |
| Installera Node.js 20, Python 3.12, Ollama, Git | ❌ |
| Konfigurera SSH + tmux | ❌ |
| Testa körning via SSH | ❌ |

**Krav:** CPU räcker (Claude API = moln, Ollama snowflake-arctic-embed = liten modell).

---

## Klart (historik)

| Brief / Feature | Commit | Session |
|-----------------|--------|---------|
| merger-auto-commit | `db630e7` | 45 körning |
| agent-handoff-context | `fce0d66` | 45 körning |
| per-agent iteration limits | `2b6651e` | 45 körning |
| GREEN-detection regex fix | `session46` | 46 direkt |
| AGENTS.md + alla prompt-filer | `524f612` | 45 direkt |
| Aurora C2 YouTube-intake | `9a7b844` | 42 körning |
| Aurora C1 URL-intake | `0caaf72` | 41 körning |
| Aurora A3 embedding-konsistens | `b22ee1c` | 43 körning |
| Aurora A2 entity-extraktion | `5c05583` | 43 körning |
| Aurora A1 chunk-summaries | `1fe7f62` | 41 körning |
| GraphRAG G1: Core + migration | `0bfa706` | 49 körning |
| GraphRAG G2: Agent-verktyg + skribenter | `a1a1cfb` | 49 körning |
| GraphRAG G3: Alla agenter läser | `b897b26` | 50 körning |
| memory-compression | S47 körning | 47 |
| prompt-injection-guard | S47 körning | 47 |
| estop | `36af36c` | 47 |
| estop-polish | `b914888` | 47 |
| manager-lint fix | `c782e06` | 49 |
