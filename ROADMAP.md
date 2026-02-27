# Neuron HQ — Roadmap

> Editera direkt i filen — kryssa av med `✅` eller `- [x]` när något är klart.
> Uppdateras i slutet av varje session (eller när en brief körs klart).
>
> **Senast uppdaterad:** 2026-02-27 · Session 46

---

## Status just nu

| Projekt | Tester | Senaste commit | Session |
|---------|--------|----------------|---------|
| Neuron HQ | 356 ✅ | `session46` (GREEN-fix) | 46 |
| Aurora | 236 ✅ | `b22ee1c` (A3 embedding-konsistens) | — |

---

## Neuron HQ — Nästa körningar

Kör i denna ordning. En brief per körning.

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
```

### 1. memory-compression (Low risk)
- [ ] **Körning klar**
- [ ] **Granskad**
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-memory-compression.md --hours 1
```

### 2. prompt-injection-guard (Medium risk)
Lägger till `validateBrief()` i PolicyValidator — skyddar mot prompt injection i brief-filer.
- [ ] **Körning klar**
- [ ] **Granskad**
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-prompt-injection-guard.md --hours 1
```

### 3. estop (Medium risk)
E-stop via `touch STOP` — avbryter körning rent vid nästa iterationsgräns.
- [ ] **Körning klar**
- [ ] **Granskad**
```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-estop.md --hours 1
```

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
