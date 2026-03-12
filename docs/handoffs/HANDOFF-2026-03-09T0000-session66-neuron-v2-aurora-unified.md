# HANDOFF-2026-03-09T0000 — Session 66: Neuron HQ v2 — Aurora Unified Platform

## Sammanfattning

Strategisk session som definierade **Neuron HQ v2** — en unified platform där Aurora
absorberas som modul istället för att vara en separat Python-kodbas.

### Beslut

1. **Aurora byggs inte om separat** — Aurora blir en TypeScript-modul i Neuron HQ (`src/aurora/`)
2. **Två separata minnen, en plattform** — `kg_nodes` (Neuron-överjaget) och `aurora_nodes` (användarens hjärna)
3. **Python-arbetare för ljud/video** — ~430 rader Python (whisper, pyannote, yt-dlp, OCR) anropas via subprocess
4. **M1–M6 roadmapen ersatt av A1–A8** — istället för att patcha Auroras Python-minne bygger vi Neuron-native
5. **Neuron bygger Aurora åt sig själv** — varje fas blir en brief som Neurons agent-svärm implementerar

### Dokument skapade

| Fil | Beskrivning |
|-----|-------------|
| `docs/roadmap-neuron-v2-unified-platform.md` | Huvudroadmap A1–A8 |
| `docs/roadmap-memory-alignment.md` | Gammal M1–M6 roadmap (ersatt, sparad som referens) |
| `briefs/2026-03-09-aurora-a1-skeleton.md` | Brief för A1 — redo att köras |

### Aurora MCP-test (innan strategidiskussionen)

Testade Aurora MCP-tools i Claude Desktop:
- `memory_stats` — funkar, visade 1 aktivt minne (utgånget)
- `memory_write` — funkar, sparade testminne (TTL 30 dagar)
- `memory_recall` — funkar, hittade testminnet (score 0.77)
- **Problem upptäckt:** Gammalt minne hade gått ut (TTL-radering) → ledde till hela strategidiskussionen

## Arkitektur: Neuron HQ v2

```
NEURON HQ v2
├── Delad infrastruktur (PostgreSQL, pgvector, Ollama, MCP)
├── Neuron-minne (kg_nodes) — agentmönster, fel, tekniker
├── Aurora-minne (aurora_nodes) — dokument, fakta, preferenser, research
├── Python Workers (subprocess) — whisper, pyannote, yt-dlp, OCR
└── En MCP-server med alla tools
```

## Roadmap A1–A8

| Fas | Namn | Storlek | Status |
|-----|------|---------|--------|
| A1 | Aurora-skelett | Medel | **Brief skriven** — redo att köra |
| A2 | Python workers + intake | Stor | Planerad |
| A3 | Sökning + ask-pipeline | Medel | Planerad |
| A4 | Minne (confidence decay, dedup) | Medel | Planerad |
| A5 | YouTube + röst | Stor | Planerad |
| A6 | Agenter (Intake/Research/Report) | Stor | Planerad |
| A7 | Cross-referens Neuron↔Aurora | Medel | Planerad |
| A8 | Migration + städning | Medel | Planerad |

**MVP:** A1 → A2 → A3 → A4

## Nästa session

### Prioritet 1: Kör A1

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a1-skeleton.md --hours 2
```

### Prioritet 2: Aurora-rester från S65

- Starta om Claude Desktop och testa dashboard + intake med callTool-bridgen
- Committa Aurora-ändringarna (FastMCP-migrering)
- Ta bort QR-testserver från Claude Desktop config

### Prioritet 3: Skriv brief A2

## Siffror

| Mått | Värde |
|------|-------|
| Neuron-tester | 984 ✅ |
| Aurora-tester | 236 ✅ |
| Körningar | 95 |
| Senaste commit | `b2dfcef` (D3 MCP-server) |
| Nya filer | 3 (roadmap, brief, handoff) |
