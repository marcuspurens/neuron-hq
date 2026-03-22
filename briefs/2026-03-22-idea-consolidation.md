# Brief: 2.4 Idékonsolidering — 929 idéer → ~80 kluster

**Target:** neuron-hq
**Effort:** 1-2 körningar
**Roadmap:** Fas 2 — Intelligens, punkt 2.4

## Bakgrund

Neuron HQ:s kunskapsgraf har **929 idénoder** ackumulerade över 170+ körningar. Många är dupliceringar, varianter, eller utdaterade. Det finns ingen mekanism för att gruppera relaterade idéer, arkivera obsoleta, eller ge överblick.

**Nuläge:**
- `rankIdeas()` sorterar på `impact × (6-effort) × (6-risk) / 25` — men alla 929 idéer rankas individuellt
- `linkRelatedIdeas()` skapar `related_to`-kanter via PPR + Jaccard (max 3 per nod) — men inga kluster
- `findDuplicateCandidates()` i `graph-merge.ts` hittar dubbletter via Jaccard (≥0.6) — men körs bara av Consolidator vid generell grafstädning
- `semanticSearch()` i `semantic-search.ts` använder pgvector-embeddings (1024-dim) — men inte för idé-gruppering
- Consolidator-agenten (`consolidator.ts`) har `graph_merge_nodes`, `find_duplicate_candidates`, `find_stale_nodes` — men inga idé-specifika klusterverktyg

**Problemet:** 929 individuella idéer ger inget navigerbart landskap. Manager ser top-5 globala idéer men kan inte se att 40 idéer handlar om "agentminne" och 25 om "grafkvalitet". Utan kluster finns ingen strategisk överblick.

## Vad ska byggas

### 1. Idékluster-modul (`src/core/idea-clusters.ts`)

En modul som grupperar idéer baserat på titel- och beskrivningslikhet.

**API:**
```typescript
interface IdeaCluster {
  id: string;                    // 'cluster-001', 'cluster-002', ...
  label: string;                 // klusternamn (max 60 tecken)
  memberIds: string[];           // idé-ID:n i klustret
  avgImpact: number;             // medelvärde av members impact
  avgEffort: number;             // medelvärde av members effort
  avgRisk: number;               // medelvärde av members risk
  topPriority: number;           // högsta priority bland members
  memberCount: number;           // antal idéer i klustret
}

interface ClusterResult {
  clusters: IdeaCluster[];
  unclustered: string[];         // idé-ID:n som inte matchade något kluster
  archived: string[];            // idé-ID:n som arkiverades
  stats: {
    totalIdeas: number;
    clusteredCount: number;
    unclusteredCount: number;
    archivedCount: number;
    clusterCount: number;
  };
}

function clusterIdeas(
  graph: KnowledgeGraph,
  options?: {
    similarityThreshold?: number;  // Jaccard-tröskel, default 0.3
    minClusterSize?: number;       // minimum idéer per kluster, default 3
    maxClusters?: number;          // max antal kluster, default 120
  }
): ClusterResult;
```

**Klusterlogik (Jaccard-baserad, ingen embedding krävs):**

1. **Filtrera:** Hämta alla noder med `type === 'idea'` och `properties.status !== 'rejected'`
2. **Tokenisera:** För varje idé, skapa token-set från `title` + `properties.description` (lowercase, split på whitespace/skiljetecken, filtrera stoppord och ord <3 tecken). Återanvänd stoppordslistan från `brief-context-extractor.ts` om den finns, annars inline en liknande.
3. **Parvisa likheter:** Beräkna Jaccard-likhet mellan alla idépar. Spara par med likhet ≥ `similarityThreshold` (default 0.3).
4. **Greedy clustering:** Iterera par i fallande likhetsordning. Om båda idéer är oklustrade → skapa nytt kluster. Om en idé tillhör ett kluster och den andra är oklustrad → lägg till i klustret OM medellikheten mot befintliga klustermedlemmar ≥ `similarityThreshold * 0.8`. Annars hoppa över.
5. **Filtrera kluster:** Ta bort kluster med färre än `minClusterSize` medlemmar — flytta deras idéer till `unclustered`.
6. **Beräkna klustermetrik:** `avgImpact`, `avgEffort`, `avgRisk`, `topPriority` från members properties. Om en idé saknar `properties.impact` → använd default 3.

**Kluster-label:** Ta de 3 vanligaste icke-stopporden bland klustermedlemmarna, formatera som `"ord1 / ord2 / ord3"`.

**Krav:**
- Ren funktion, inga sidoeffekter (muterar inte grafen)
- O(n²) i antal idéer — 929² ≈ 860k jämförelser, OK för engångskörning
- Hanterar tom graf och graf utan idéer gracefully

### 2. Meta-idénoder i grafen

Skapa meta-idénoder som representerar varje kluster.

**Plats:** Ny funktion i `src/core/idea-clusters.ts`

```typescript
function createMetaIdeas(
  graph: KnowledgeGraph,
  clusters: IdeaCluster[]
): { newNodes: KGNode[]; newEdges: KGEdge[] };
```

**Logik:**
- För varje `IdeaCluster`, skapa en `KGNode` med:
  - `id`: `'idea-meta-' + cluster.id` (t.ex. `'idea-meta-cluster-001'`)
  - `type`: `'idea'`
  - `title`: `'[Kluster] ' + cluster.label`
  - `confidence`: 0.6 (syntetisk nod — lägre än individuella idéer)
  - `scope`: `'project-specific'`
  - `properties`:
    - `description`: `'Kluster av ${cluster.memberCount} relaterade idéer: ' + cluster.label`
    - `impact`: `Math.round(cluster.avgImpact)`
    - `effort`: `Math.round(cluster.avgEffort)`
    - `risk`: `Math.round(cluster.avgRisk)`
    - `status`: `'proposed'`
    - `group`: `'Kluster'`
    - `provenance`: `'agent'`
    - `is_meta`: `true`
    - `member_count`: `cluster.memberCount`
    - `member_ids`: `cluster.memberIds`
  - `created`: nuvarande ISO-tidsstämpel
  - `updated`: nuvarande ISO-tidsstämpel

- För varje klustermedlem, skapa en `KGEdge`:
  - `from`: meta-idéns ID
  - `to`: medlemmens ID
  - `type`: `'related_to'`
  - `metadata`: `{ agent: 'consolidator', timestamp: ISO-now }`

**Krav:**
- Ren funktion — returnerar noder och kanter, muterar inte grafen
- Kontrollera att meta-idé-ID:n inte redan finns i grafen (skippa om de gör det)

### 3. Arkivering av låg-kvalitets-idéer

**Plats:** Ny funktion i `src/core/idea-clusters.ts`

```typescript
function identifyArchiveCandidates(
  graph: KnowledgeGraph,
): string[];  // idé-ID:n att arkivera
```

**Arkiveringskriterier** (alla måste uppfyllas):
- `confidence` ≤ 0.3
- `properties.mention_count` ≤ 1 (eller saknas)
- `properties.status` === `'proposed'` (aldrig arkivera accepted/in-progress/done)
- Idén har inga utgående kanter av typ `inspired_by` eller `used_by` (den har inte lett till något)

**Arkivering innebär:**
- Sätt `properties.archived = true`
- Sätt `confidence = 0.05`
- Sätt `properties.status = 'rejected'`
- Behåll noden i grafen (radera aldrig)

**Krav:**
- Konservativ — hellre missa en arkiveringskandidat än arkivera något värdefullt
- Logga varje arkiverad nod med anledning

### 4. Konsolideringsrapport (`runs/<runId>/idea-consolidation-report.md`)

En ny artifact som genereras efter konsolidering.

**Plats:** Ny funktion i `src/core/idea-clusters.ts`

```typescript
function generateConsolidationReport(
  result: ClusterResult,
  clusters: IdeaCluster[],
  graph: KnowledgeGraph
): string;  // markdown-sträng
```

**Rapportformat:**
```markdown
# Idékonsolidering — Rapport

## Sammanfattning

- **Totalt antal idéer:** 929
- **Klustrade:** 780 (i 85 kluster)
- **Oklustrade:** 120
- **Arkiverade:** 29
- **Meta-idéer skapade:** 85

## Topp-10 kluster (efter topPriority)

| # | Kluster | Medlemmar | Snitt-impact | Snitt-effort | Topp-prio |
|---|---------|-----------|-------------|-------------|-----------|
| 1 | agentminne / persistent / state | 42 | 4.1 | 3.2 | 4.8 |
| 2 | grafkvalitet / integritet / watchman | 28 | 3.8 | 2.5 | 4.5 |

## Alla kluster

### cluster-001: agentminne / persistent / state (42 idéer)
- idea-023: A-MEM för agenter (impact: 5, effort: 4)
- idea-089: Persistent awareness mellan körningar (impact: 4, effort: 3)
- ...

## Arkiverade idéer (29)

| ID | Titel | Anledning |
|----|-------|-----------|
| idea-412 | ... | confidence 0.2, mention_count 1, inga utgående kanter |
```

**Krav:**
- Markdown-format, läsbart utan tooling
- Topp-10 kluster sorterade på `topPriority`
- Max 10 medlemmar listade per kluster (resten som "... och N till")

### 5. CLI-kommando + Consolidator-integration

**Plats:** `src/commands/consolidate-ideas.ts` (NY)

Nytt CLI-kommando:
```bash
npx tsx src/cli.ts consolidate-ideas [--threshold 0.3] [--min-size 3] [--dry-run]
```

**Logik:**
1. Ladda graf via `loadGraph()`
2. Kör `clusterIdeas(graph, options)`
3. Kör `identifyArchiveCandidates(graph)`
4. Om `--dry-run` → skriv bara rapporten, mutera inte grafen
5. Om inte dry-run:
   a. Kör `createMetaIdeas(graph, clusters)` → lägg till noder + kanter i grafen
   b. Arkivera kandidater (uppdatera properties + confidence)
   c. Spara graf via `saveGraph()`
6. Skriv konsolideringsrapport till stdout (eller `runs/<runId>/` om en körning pågår)

**Registrera i CLI:** Lägg till i `src/cli.ts` (importera kommandot, registrera med commander).

**Krav:**
- `--dry-run` som default vid första körning (säkert)
- Visa sammanfattning i terminalen efter körning

### 6. MCP-tool för Consolidator-agenten

**Plats:** `src/mcp/tools/ideas.ts` (befintlig fil — utöka)

Lägg till ny action i befintligt `ideas`-tool:

```typescript
// action: 'consolidate'
// Kör clusterIdeas() + createMetaIdeas() + identifyArchiveCandidates()
// Returnerar ClusterResult som JSON
```

**Krav:**
- Consolidator-agenten kan nu anropa `ideas({ action: 'consolidate', threshold: 0.3 })`
- Agenten bestämmer själv om den ska applicera resultatet (via befintliga `graph_merge_nodes` etc.)

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/idea-clusters.ts` | **NY** — klusterlogik, meta-idéer, arkivering, rapport |
| `src/commands/consolidate-ideas.ts` | **NY** — CLI-kommando |
| `src/cli.ts` | Registrera `consolidate-ideas`-kommandot |
| `src/mcp/tools/ideas.ts` | Lägg till `consolidate`-action |
| `prompts/consolidator.md` | Lägg till instruktioner om idékonsolidering |
| `tests/core/idea-clusters.test.ts` | **NY** — tester |
| `tests/commands/consolidate-ideas.test.ts` | **NY** — tester |
| `tests/mcp/tools/ideas-consolidate.test.ts` | **NY** — tester |

## Filer att INTE ändra

- `src/core/knowledge-graph.ts` — Använd befintlig `loadGraph()`, `saveGraph()`, `rankIdeas()` as-is
- `src/core/graph-merge.ts` — Använd `findDuplicateCandidates()` som referens men bygg egen klusterlogik
- `src/core/semantic-search.ts` — Embedding-baserad klustring är framtida scope
- `src/core/ppr.ts` — PPR-algoritmen rörs inte
- `src/core/agents/consolidator.ts` — Agentens kod ändras inte, bara prompten

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| O(n²) tar för lång tid | Låg | 929² ≈ 860k jämförelser, ~sekunder | Profilea om >5000 idéer |
| Jaccard ger dåliga kluster | Medel | Irrelevanta grupperingar | Tunable threshold + dry-run + manuell granskning |
| Arkivering tar bort bra idéer | Låg | Förlorad kunskap | Konservativa kriterier, aldrig delete, bara flag |
| Meta-idéer överlappar med befintliga | Låg | Dubbletter | Kolla att ID inte redan finns |
| Kluster-labels otydliga | Medel | Svårt att navigera | Top-3-ord som provisorisk label, LLM-labels som förbättring |

## Acceptanskriterier

### Klustermodul

- **AC1:** `clusterIdeas(graph)` returnerar `ClusterResult` med clusters, unclustered, archived, stats
- **AC2:** Kluster med färre än `minClusterSize` medlemmar filtreras bort (medlemmar → unclustered)
- **AC3:** Varje idé tillhör max ett kluster
- **AC4:** Kluster-labels genereras från top-3 icke-stoppord bland medlemmar
- **AC5:** Tom graf → `{ clusters: [], unclustered: [], archived: [], stats: { totalIdeas: 0, ... } }`
- **AC6:** Graf med <3 idéer → inga kluster skapas, alla i unclustered

### Meta-idéer

- **AC7:** `createMetaIdeas()` skapar en KGNode per kluster med `type: 'idea'` och `properties.is_meta: true`
- **AC8:** Varje meta-idé har `related_to`-kanter till alla sina medlemmar
- **AC9:** Meta-idé-ID:n som redan finns i grafen skippas (idempotent)

### Arkivering

- **AC10:** `identifyArchiveCandidates()` returnerar ID:n för idéer med confidence ≤0.3, mention_count ≤1, status 'proposed', inga `inspired_by`/`used_by`-kanter
- **AC11:** Arkiverade idéer behåller all data men får `archived: true`, `confidence: 0.05`, `status: 'rejected'`
- **AC12:** Idéer med status `accepted`, `in-progress`, eller `done` arkiveras ALDRIG

### Rapport

- **AC13:** Rapport genereras i markdown med sammanfattning, topp-10 kluster, alla kluster, arkiverade idéer
- **AC14:** Topp-10 sorterat på `topPriority`

### CLI

- **AC15:** `npx tsx src/cli.ts consolidate-ideas --dry-run` kör utan att mutera grafen och skriver rapport till stdout
- **AC16:** Utan `--dry-run` skapas meta-idéer, arkivering utförs, graf sparas
- **AC17:** Kommandot registrerat i `src/cli.ts`

### MCP-tool

- **AC18:** `ideas({ action: 'consolidate' })` returnerar `ClusterResult` som JSON
- **AC19:** Consolidator-agenten kan använda toolet (verifiera i prompt)

### Tester

- **AC20:** `idea-clusters.test.ts` har minst 15 tester (klustring, meta-idéer, arkivering, rapport, edge cases)
- **AC21:** CLI-tester verifierar dry-run och muterande körning
- **AC22:** MCP-tool-tester verifierar consolidate-action
- **AC23:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Jaccard före embedding:** Vi använder token-baserad Jaccard-likhet istället för embedding-likhet. Anledning: fungerar utan Ollama/pgvector, snabbt för 929 idéer, och embedding-baserad klustring kan läggas till som förbättring.

2. **Meta-idéer som vanliga idea-noder:** Vi skapar meta-idéer med `type: 'idea'` och `properties.is_meta: true` istället för en ny nodtyp. Anledning: kräver ingen schemaändring, rankIdeas() fungerar direkt, och meta-idéer syns i befintliga vyer.

3. **Arkivering = soft delete:** Vi sätter `archived: true` + `confidence: 0.05` istället för att radera. Anledning: kunskapsgrafens historia bevaras, och arkiverade idéer kan återaktiveras om de visar sig relevanta.

4. **CLI-kommando + MCP-tool:** Både manuell körning (CLI) och agentstyrd körning (MCP). Anledning: CLI för första dry-run med manuell granskning, MCP för Consolidator att köra autonomt i framtida körningar.

5. **Provisoriska labels (top-3-ord):** Vi genererar inte LLM-baserade klusternamn i denna iteration. Anledning: kräver API-anrop per kluster (~80 anrop), och top-3-ord ger tillräcklig navigerbarhet. LLM-labels kan läggas till i 2.4b.
