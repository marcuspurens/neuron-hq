# Neuron HQ — Minnesarkitektur (detaljerad)

> Session 50 · 2026-02-27 · Efter GraphRAG G1–G3

---

## 1. Översikt — Vad är "minne" i Neuron?

Neuron HQ:s agenter har **två parallella minnessystem**:

1. **Markdown-filer** (`memory/*.md`) — mänskligt läsbar, append-only text
2. **Kunskapsgraf** (`memory/graph.json`) — maskinläsbar, strukturerad JSON med noder och kanter

Båda lever i `memory/`-katalogen och **delas av alla körningar**. Det betyder att körning #50 kan läsa vad körning #1 lärde sig.

```
neuron-hq/
  memory/
    runs.md          ← Sammanfattning av varje körning
    patterns.md      ← Beprövade mönster som fungerar
    errors.md        ← Kända fel och deras lösningar
    techniques.md    ← Forskningsrön (arxiv, Anthropic-docs)
    invariants.md    ← Strukturregler som alltid gäller
    graph.json       ← Kunskapsgraf (72 noder, 58 kanter)
```

**Varför två system?**
- Markdown-filerna är enkla att läsa för människor och lätta att debugga
- Grafen gör det möjligt för agenter att *söka*, *filtrera* och *följa kopplingar* — saker som är svåra med ren text

---

## 2. Översiktsbild — Alla agenter och deras minnesåtkomst

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PERSISTENT MEMORY LAYER                           │
│                   neuron-hq/memory/ (delas av alla körningar)        │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  runs.md    │  │ patterns.md  │  │ errors.md  │  │techniques. │ │
│  │  (körningar)│  │ (mönster)    │  │ (fel)      │  │  md (rön)  │ │
│  └──────▲──────┘  └──────▲───────┘  └─────▲──────┘  └─────▲──────┘ │
│         │                │                │                │        │
│         │    SKRIVER      │    SKRIVER     │    SKRIVER     │        │
│         │                │                │                │        │
│  ┌──────┴────────────────┴────────────────┴──┐   ┌────────┴──────┐ │
│  │           HISTORIAN                       │   │   LIBRARIAN   │ │
│  │  (skriver runs, patterns, errors)         │   │  (skriver     │ │
│  │                                           │   │   techniques) │ │
│  └──────────────┬────────────────────────────┘   └───────┬───────┘ │
│                 │                                        │         │
│                 ▼           KUNSKAPSGRAF                  ▼         │
│         ┌──────────────────────────────────────────────────┐       │
│         │              graph.json                          │       │
│         │  72 noder (pattern, error, technique, run)       │       │
│         │  58 kanter (solves, discovered_in, related_to)   │       │
│         │  Confidence: 0.0–1.0 per nod                     │       │
│         └──────────▲───────────────────▲───────────────────┘       │
│                    │                   │                            │
│              LÄSER + SKRIVER     LÄSER + SKRIVER                   │
│                    │                   │                            │
│              Historian            Librarian                         │
│                                                                      │
│         ┌──────────▼───────────────────▼───────────────────┐       │
│         │           LÄSER (read-only)                      │       │
│         │  Manager · Implementer · Reviewer · Researcher   │       │
│         └──────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Agenternas minnesåtkomst — matris

| Agent | Läser .md-filer | Skriver .md-filer | Läser graf | Skriver graf |
|-------|:-:|:-:|:-:|:-:|
| **Manager** | `search_memory`, `read_memory_file` | — | `graph_query`, `graph_traverse` | — |
| **Implementer** | — | — | `graph_query`, `graph_traverse` | — |
| **Reviewer** | — | — | `graph_query`, `graph_traverse` | — |
| **Researcher** | — | — | `graph_query`, `graph_traverse` | — |
| **Historian** | `read_memory_file`, `search_memory` | `write_to_memory` (runs, patterns, errors) | `graph_query`, `graph_traverse` | `graph_assert`, `graph_update` |
| **Librarian** | `read_memory_file` | `write_to_techniques` | `graph_query`, `graph_traverse` | `graph_assert`, `graph_update` |
| **Merger** | — | — | — | — |
| **Tester** | — | — | — | — |

**Sammanfattning:**
- **2 skribenter:** Historian och Librarian (läser + skriver allt)
- **4 läsare:** Manager, Implementer, Reviewer, Researcher (bara `graph_query` + `graph_traverse`)
- **2 utan minne:** Merger och Tester (bara git/test-operationer)

---

## 4. Kunskapsgrafen — hur den fungerar

### 4.1 Noder

Varje nod representerar en *sak som systemet lärt sig*:

```json
{
  "id": "pattern-001",
  "type": "pattern",
  "title": "Kompakt testutdata förhindrar context overflow",
  "properties": {
    "kontext": "Tester-agenten kraschade pga för lång output",
    "lösning": "Kör tester med -q --cov-report=term",
    "effekt": "Tester-agenten klarar nu hela testsviten",
    "keywords": ["test", "context", "overflow"]
  },
  "confidence": 0.7,
  "created": "2026-02-27T12:13:00Z",
  "updated": "2026-02-27T14:30:00Z"
}
```

**Nodtyper:**

| Typ | Antal | Vad den representerar |
|-----|-------|-----------------------|
| `pattern` | ~27 | Beprövat mönster som fungerar |
| `error` | ~20 | Känt fel med kontext och lösning |
| `technique` | ~15 | Forskningsrön från arxiv/Anthropic |
| `run` | ~10 | En specifik körning med resultat |

**Confidence** (0.0–1.0):
- `0.5` = Nyupptäckt (första gången)
- `0.6–0.7` = Bekräftad i en senare körning
- `0.8+` = Beprövad i flera oberoende körningar

### 4.2 Kanter

Kanter kopplar ihop noder och skapar sammanhang:

```
pattern-005 ──solves──► error-012
  "Retry med exponential backoff löser API timeout"

pattern-005 ──discovered_in──► run-003
  "Upptäcktes i körning #3"

technique-008 ──related_to──► pattern-005
  "Anthropics retry-guide relaterar till retry-mönstret"
```

**Kanttyper:**

| Kanttyp | Betydelse | Exempel |
|---------|-----------|---------|
| `solves` | Mönster → Fel det löser | "Retry-mönster löser timeout-fel" |
| `discovered_in` | Nod → Körning där den hittades | "Pattern-005 hittades i run-003" |
| `related_to` | Nod ↔ Nod som hänger ihop | "Technique-008 relaterar till pattern-005" |
| `causes` | Fel → Annat fel det orsakar | "API-timeout orsakar context overflow" |
| `used_by` | Teknik → Agent som använder den | "Retry-teknik används av Implementer" |

### 4.3 De fyra graf-verktygen

```
┌─────────────────────────────────────────────────────────────┐
│                    GRAPH TOOLS                               │
│              src/core/agents/graph-tools.ts                   │
│                                                              │
│  LÄS-VERKTYG (alla 6 agenter):                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  graph_query                                        │    │
│  │  "Sök noder efter typ, fritext eller confidence"    │    │
│  │                                                     │    │
│  │  Input:  { type?, query?, min_confidence? }         │    │
│  │  Output: Max 20 noder, sorterade på confidence      │    │
│  │                                                     │    │
│  │  Exempel: graph_query({ type: "pattern",            │    │
│  │           query: "retry", min_confidence: 0.6 })    │    │
│  │  → Alla retry-patterns med confidence >= 0.6        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  graph_traverse                                     │    │
│  │  "Följ kanter från en nod — hitta grannar"          │    │
│  │                                                     │    │
│  │  Input:  { node_id, edge_type?, depth? }            │    │
│  │  Output: Alla noder nåbara via kanterna             │    │
│  │                                                     │    │
│  │  Exempel: graph_traverse({ node_id: "error-012",    │    │
│  │           edge_type: "solves", depth: 1 })          │    │
│  │  → Alla patterns som löser error-012                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  SKRIV-VERKTYG (bara Historian + Librarian):                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  graph_assert                                       │    │
│  │  "Skapa ny nod + kanter"                            │    │
│  │  Auto-genererar ID (pattern-028, error-021, ...)    │    │
│  │  Lägger till provenance: runId, agent, timestamp    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  graph_update                                       │    │
│  │  "Uppdatera befintlig nod (mergar properties)"      │    │
│  │  Vanligast: bumpa confidence när mönster bekräftas  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Flödet genom en körning — steg för steg

Här är exakt vad som händer med minnet under en typisk Neuron-körning:

```
          Brief.md (användarens uppdrag)
               │
               ▼
   ┌───────────────────────┐
   │  1. MANAGER startar   │
   │                        │
   │  • search_memory()     │◄── Söker i alla .md-filer
   │    "Finns liknande     │    efter relaterat arbete
   │     mönster?"          │
   │                        │
   │  • graph_query()       │◄── Söker i grafen: finns
   │    "Kända fel för      │    det patterns/errors som
   │     denna typ?"        │    matchar briefen?
   │                        │
   │  ► Delegerar uppgift   │
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  2. RESEARCHER         │  (om teknologin är okänd)
   │                        │
   │  • graph_query()       │◄── Kollar om techniques
   │    "Finns forsknings-  │    redan finns
   │     rön om detta?"     │
   │                        │
   │  ► Skriver ideas.md    │
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  3. IMPLEMENTER        │
   │                        │
   │  • graph_query()       │◄── Söker efter beprövade
   │    "Hur löstes detta   │    lösningar
   │     förra gången?"     │
   │                        │
   │  ► Skriver kod +       │
   │    tester              │
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  4. REVIEWER           │
   │                        │
   │  • graph_query()       │◄── Korsrefererar mot
   │    "Kända issues med   │    kända felmönster
   │     denna approach?"   │
   │                        │
   │  ► Verdict: GREEN /    │
   │    YELLOW / RED        │
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  5. MERGER             │  (om GREEN)
   │                        │
   │  ► git commit + merge  │  Inga minnesverktyg
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  6. LIBRARIAN          │  (var 5:e körning)
   │                        │
   │  • read_memory_file()  │◄── Läser techniques.md
   │    "Finns detta redan?"│    för att undvika
   │                        │    dubbletter
   │  • graph_query()       │◄── Söker grafen efter
   │    "Relaterade         │    relaterade noder
   │     patterns?"         │
   │                        │
   │  ► write_to_techniques │──► Skriver till
   │  ► graph_assert()      │──► techniques.md +
   │    type: "technique"   │    graph.json
   └───────┬───────────────┘
           │
   ┌───────▼───────────────┐
   │  7. HISTORIAN          │  (varje körning, alltid sist)
   │                        │
   │  • read_memory_file()  │◄── Läser allt:
   │    runs, patterns,     │    runs + patterns +
   │    errors, techniques  │    errors + techniques
   │                        │
   │  • graph_query()       │◄── Söker grafen efter
   │    "Finns detta        │    existerande noder
   │     mönster redan?"    │    att koppla till
   │                        │
   │  ► write_to_memory     │──► Skriver till
   │    ("runs", summary)   │    runs.md
   │                        │
   │  ► write_to_memory     │──► Skriver till
   │    ("patterns", ...)   │    patterns.md
   │                        │    (om nytt mönster)
   │                        │
   │  ► graph_assert()      │──► Skapar ny nod i
   │    type: "pattern"     │    graph.json med kanter:
   │    edges: [            │    discovered_in → run
   │      discovered_in,    │    related_to → pattern
   │      related_to        │
   │    ]                   │
   │                        │
   │  ► graph_update()      │──► Bumpar confidence
   │    node_id: "pat-005"  │    på bekräftade mönster
   │    confidence: 0.7     │    (0.5 → 0.6 → 0.7...)
   └────────────────────────┘
```

---

## 6. Konkret exempel — hur grafen växer

### Körning #30: Historian upptäcker ett mönster

**Historian analyserar körningens resultat och ser:** "Implementer klarade uppgiften snabbare för att den använde retry med backoff."

**Steg 1 — Skriv till markdown:**
```
write_to_memory("patterns", "## Retry med exponential backoff\n**Kontext:** API-anrop...")
→ Appendas till memory/patterns.md
```

**Steg 2 — Skriv till grafen:**
```
graph_assert({
  node: {
    type: "pattern",
    title: "Retry med exponential backoff",
    properties: {
      kontext: "API-anrop failar ibland pga rate limits",
      lösning: "Retry 3 gånger med 1s, 2s, 4s delay",
      effekt: "100% lyckade API-anrop i körning #30"
    },
    confidence: 0.5
  },
  edges: [
    { target_id: "run-030", type: "discovered_in" }
  ]
})
→ Skapar nod "pattern-028" i graph.json
→ Skapar kant pattern-028 → run-030
```

### Körning #35: Historian ser samma mönster igen

**Steg 1 — graph_query:** "retry backoff" → hittar pattern-028

**Steg 2 — graph_update:**
```
graph_update({
  node_id: "pattern-028",
  confidence: 0.7,
  properties: { bekräftad_i: ["run-030", "run-035"] }
})
→ Confidence: 0.5 → 0.7
→ Properties mergas (inte ersätts)
```

### Körning #40: Implementer letar lösning

**Manager delegerar: "Fixa API-timeout-problemet"**

**Implementer frågar grafen:**
```
graph_query({ type: "pattern", query: "API timeout" })
→ Hittar pattern-028: "Retry med exponential backoff" (confidence: 0.7)
```

**Implementer följer kanter:**
```
graph_traverse({ node_id: "pattern-028", edge_type: "solves" })
→ Hittar error-012: "API rate limit causes 429 errors"
→ Nu vet Implementer: denna lösning har fungerat förut
```

---

## 7. Teknisk arkitektur — kodvägar

### 7.1 Hur sökvägar kopplas

```
CLI-kommando:
  npx tsx src/cli.ts run neuron-hq --brief briefs/xyz.md --hours 1
       │
       ▼
  src/commands/run.ts
       │  BASE_DIR = "/Users/.../neuron-hq"
       │
       ▼
  RunOrchestrator.initRun()
       │  Skapar: workspaces/<runid>/ + runs/<runid>/
       │  Skapar: RunContext { runDir, workspaceDir, audit, ... }
       │
       ▼
  new ManagerAgent(ctx, BASE_DIR)
       │  this.memoryDir = BASE_DIR + "/memory"
       │  this.graphPath  = this.memoryDir + "/graph.json"
       │
       ├──► new ImplementerAgent(ctx, BASE_DIR)
       │         samma memoryDir + graphPath
       │
       ├──► new ReviewerAgent(ctx, BASE_DIR)
       │         samma memoryDir + graphPath
       │
       ├──► new HistorianAgent(ctx, BASE_DIR)
       │         samma memoryDir + graphPath
       │
       └──► new LibrarianAgent(ctx, BASE_DIR)
                 samma memoryDir + graphPath
```

### 7.2 Delad graf-verktygskod

Alla agenter använder samma kodmodul:

```
src/core/agents/graph-tools.ts
  │
  ├── graphToolDefinitions()      ← Returnerar alla 4 verktyg
  ├── graphReadToolDefinitions()  ← Returnerar bara query + traverse
  └── executeGraphTool()          ← Dispatcher: kör rätt verktyg
                                     baserat på namn
```

**Historian/Librarian** importerar `graphToolDefinitions()` (alla 4).
**Manager/Implementer/Reviewer/Researcher** importerar `graphReadToolDefinitions()` (bara 2).

### 7.3 Core-modulen

```
src/core/knowledge-graph.ts
  │
  ├── Zod-schemas (validering)
  │     KGNodeSchema, KGEdgeSchema, KnowledgeGraphSchema
  │
  ├── CRUD-operationer (pure functions)
  │     loadGraph()    ← Läser graph.json
  │     saveGraph()    ← Skriver graph.json (med Zod-validering)
  │     addNode()      ← Lägger till nod (kastar om duplikat-id)
  │     addEdge()      ← Lägger till kant (verifierar att noder finns)
  │     findNodes()    ← Söker noder (typ + fritext)
  │     traverse()     ← BFS genom kanter (depth 1-3)
  │     updateNode()   ← Mergar properties + uppdaterar timestamp
  │     removeNode()   ← Tar bort nod + alla kanter (ej använd av agenter)
  │
  └── Alla returner nya objekt (immutable pattern)
```

---

## 8. Säkerhet och spårbarhet

### Audit trail

Varje graf-operation loggas till `runs/<runid>/audit.jsonl`:

```json
{"ts":"2026-02-27T14:30:00Z","role":"historian","tool":"graph_assert","allowed":true,"note":"Node pattern-028 created with 1 edges"}
{"ts":"2026-02-27T14:30:05Z","role":"historian","tool":"graph_update","allowed":true,"note":"Node pattern-005 updated"}
```

### Provenance

Varje nod bär metadata om *vem* som skapade den och *när*:

```json
"properties": {
  "provenance": {
    "runId": "20260227-1213-neuron-hq",
    "agent": "historian",
    "timestamp": "2026-02-27T12:13:00Z"
  }
}
```

### Skrivskydd

De 4 "läsagenterna" (Manager, Implementer, Reviewer, Researcher) har **fysiskt inte tillgång** till `graph_assert` eller `graph_update` — verktygen registreras inte i deras `defineTools()`. Det är inte bara en prompt-instruktion, det är kod-enforced.

---

## 9. Statistik (session 50)

| Mätning | Värde |
|---------|-------|
| Noder i grafen | 72 |
| Kanter i grafen | 58 |
| Nodtyper | pattern (27), error (20), technique (15), run (10) |
| Kanttyper | discovered_in, related_to, solves, causes, used_by |
| Agenter med läsåtkomst | 6 av 8 |
| Agenter med skrivåtkomst | 2 av 8 |
| Tester som verifierar minne | ~66 (G1: 36, G2: 17, G3: 13) |
| Totalt tester i systemet | 443 |

---

## 10. Sammanfattning i en mening

> Historian och Librarian bygger kunskapen — alla andra agenter konsumerar den — och grafen gör det möjligt att följa kopplingar mellan mönster, fel, tekniker och körningar över tid.
