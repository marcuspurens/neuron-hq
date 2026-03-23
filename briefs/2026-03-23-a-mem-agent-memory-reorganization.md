# Brief: 3.2 A-MEM — agentdriven minnesreorganisering

**Target:** neuron-hq
**Effort:** 2-3 körningar
**Roadmap:** Fas 3 — Agent-mognad, punkt 3.2
**Förutsättning:** HippoRAG (2.1) ✅

## Bakgrund

Consolidator-agenten deduplicerar kunskapsgrafen — mergar liknande noder (Jaccard ≥0.6), hittar saknade kanter, arkiverar gamla noder. Men den har tre begränsningar:

1. **Ingen abstraktion.** Den kan merga "timeout i API-anrop" och "timeout vid databas-query" men kan inte skapa en meta-nod "resilience-mönster för timeout-hantering" som generaliserar båda.

2. **Bara Jaccard för kandidathittning.** `findDuplicateCandidates()` jämför titlar med Jaccard-similarity. Noder med helt olika titlar men samma underliggande koncept hittas inte. PPR (HippoRAG) finns men används inte av Consolidator.

3. **Valfri körning.** Consolidator delegeras av Manager — som kan glömma (samma problem som Historian i S132). Den körs inte automatiskt.

**Nuvarande flöde:**
```
run.ts → Manager → [Implementer ↔ Reviewer ↔ Tester] → Manager delegerar kanske till Consolidator
→ Historian (orchestrator, automatisk)
→ Observer-retro (orchestrator, automatisk)
```

**A-MEM-konceptet** (inspirerat av NeurIPS 2025 Zettelkasten-papper): Varje minnesnod har nyckelord, kontext, explicita kopplingar. Systemet reorganiserar sig självt — mergar, abstraherar, kopplar. 85-93% färre tokens jämfört med full-kontext-approach.

## Designbeslut

### 1. Evolva Consolidator, skapa inte en ny agent

A-MEM bygger på Consolidator — samma kodfil, utökade verktyg, uppdaterad prompt. Motivering:
- Consolidator har redan merge-logik, graph-tools, audit-loggning
- Ett nytt agentnamn ökar bara komplexiteten utan vinst
- Prompten kan utökas med abstraktions-instruktioner

**Konsekvens:** `consolidator.ts` och `prompts/consolidator.md` uppdateras. Ingen ny agent-fil.

### 2. Flytta Consolidator till orchestratorn

Samma mönster som Historian (S132). Consolidator körs automatiskt i `run.ts` EFTER Historian (som backfyllt nya noder), FÖRE Observer-retro.

**Nytt flöde:**
```
run.ts → Manager → [Implementer ↔ Reviewer ↔ Tester]
→ Historian (orchestrator, automatisk — backfyller noder)
→ Consolidator/A-MEM (orchestrator, automatisk — reorganiserar)
→ Observer-retro (orchestrator, automatisk — observerar)
```

**Konsekvens:** `delegate_to_consolidator` tas bort från Manager (tool + handler + metod), precis som `delegate_to_historian` i S132.

### 3. Tre nya verktyg: abstract, ppr-candidates, abstraction-candidates

| Verktyg | Input | Output | Vad det gör |
|---------|-------|--------|-------------|
| `graph_abstract_nodes` | `nodeIds[]`, `title`, `description` | Ny meta-nod-ID | Skapar en abstraktionsnod (typ `pattern`) som generaliserar de givna noderna. Sätter `properties.abstraction = true`, `properties.source_nodes = nodeIds`. Skapar `generalizes`-kanter från meta-noden till varje käll-nod. Confidence = medelvärde av käll-nodernas confidence minus 0.1 (avrundning till lägst 0.1). |
| `find_ppr_candidates` | `nodeId`, `limit?` | Array av `{node, score}` | Kör PPR från en given nod och returnerar topp-N kandidater. Filtret: exkluderar noder som redan har direkt kant till seed. Ger Consolidator möjlighet att hitta semantiskt relaterade noder som Jaccard missar. |
| `find_abstraction_candidates` | `minClusterSize?` (default 3) | Array av `{nodeIds[], commonNeighborCount, nodeType}` | Hittar grupper av noder som delar ≥2 grannar OCH har samma NodeType. Returnerar kluster som kandidater för abstraktion. LLM:en beslutar om abstraktionen är meningsfull. |

### 4. Abstraktionsregler i prompten

Consolidator-prompten får en ny sektion "Abstraction Protocol":

**Tre-stegs-test innan abstraktion:**
1. **GEMENSAM ORSAK** — Delar noderna en underliggande rotorsak eller princip?
2. **HANDLINGSBART** — Ger abstraktionen ny insikt som de enskilda noderna inte ger?
3. **STABILT** — Skulle abstraktionen fortfarande gälla om vi tog bort 1 av käll-noderna?

Alla 3 → skapa abstraktion. 1-2 → överväg `related_to`-kant istället. 0 → skip.

**Begränsningar:**
- Max 3 abstraktioner per körning (konservativt — bättre att missa en än att skapa dåliga)
- Abstraktionsnoder får aldrig abstraheras igen (inga meta-meta-noder)
- Varje abstraktion måste ha explicit motivering i rapporten
- Käll-noder behålls — abstraktion ersätter inte, den generaliserar
- **Tom-graf-guard:** Om `findAbstractionCandidates` returnerar tomma resultat, hoppa över abstraktionssteget helt och notera "Inga abstraktionskandidater — grafen är för liten eller saknar kluster" i findings-rapporten

### 5. PPR-integration i duplicate finding

`find_duplicate_candidates` utökas med en hybrid-approach:
1. Jaccard (befintlig, snabb) — hittar textuellt liknande noder
2. PPR-boost — för varje kandidatpar, kör PPR från nod A: om nod B har hög PPR-score, höj similarity-poängen
3. Embeddings (befintlig fallback) — om tillgängliga

**Formel:** `final_score = jaccard * 0.6 + ppr_proximity * 0.4`

Där `ppr_proximity = ppr_score(B | seed=A)` normaliserat till [0, 1].

**Normaliseringsmetod:** För varje seed-nod, kör PPR och samla alla kandidat-scores. Normalisera genom att dela varje score med `max(ppr_scores)` för det seedet (min-max med min=0). Om `max(ppr_scores) < 1e-6` (epsilon-tröskelvärde) sätts `ppr_proximity = 0` för alla — förhindrar att floating-point-brus ger falska positiver. Detta ger relativ ranking inom varje seed, inte absoluta PPR-värden.

**Batch-begränsning:** Kör PPR-boost för max 50 kandidatpar per körning. Om Jaccard producerar fler än 50 kandidater, PPR-boosta de 50 med högst Jaccard-score och behåll resten med enbart Jaccard-score. Detta förhindrar att N×PPR-körningar blir en flaskhals på stora grafer.

### 6. Consolidation findings → memory

Idag skriver Consolidator `memory/consolidation_findings.md` (max 50 rader). A-MEM utökar med:
- **Abstraktioner:** Vilka abstraktioner skapades och varför
- **PPR-upptäckter:** Noder som PPR hittade men Jaccard missade
- **Grafstatistik:** Noder/kanter före/efter, abstraktionsnivå

## Vad ska byggas

### 1. Orchestrator-flytt (`src/commands/run.ts`)

Lägg till Consolidator-anrop EFTER Historian, FÖRE Observer-retro:

```typescript
// --- Post-run agents (orchestrator, alltid) ---
// 1. Historian — backfyller kunskapsgrafen
await runHistorian(ctx, baseDir);

// 2. Consolidator/A-MEM — reorganiserar kunskapsgrafen
await runConsolidator(ctx, baseDir);

// 3. Observer-retro — observerar och reflekterar
await runObserverRetro(ctx, baseDir);
```

**`runConsolidator()`-funktion:** Samma mönster som `runHistorian()` — instansiera `ConsolidatorAgent`, kör `.run()`, logga till audit. Iterationsgräns sätts inline: `maxIterations: 10` direkt i `runConsolidator()` (ingen extern `limits.yaml`-beroende).

### 2. Ta bort `delegate_to_consolidator` från Manager

Samma refactoring som `delegate_to_historian` i S132:
- Ta bort tool-definitionen i `manager.ts`
- Ta bort handler i tool-dispatch
- Ta bort `delegateToConsolidator()`-metoden
- Ta bort all auto-trigger-logik för Consolidator (sök efter 'consolidat' + 'trigger'/'auto')
- Uppdatera `prompts/manager.md` — ta bort Consolidator-delegering

### 3. Abstraktionsverktyg (`src/core/graph-merge.ts`)

Utöka `graph-merge.ts` med:

```typescript
export interface AbstractionProposal {
  sourceNodeIds: string[];
  title: string;
  description: string;
  reason: string;
}

export function abstractNodes(
  graph: KnowledgeGraph,
  proposal: AbstractionProposal
): { abstractionNode: KGNode; edgesCreated: number } {
  // 1. Validera FÖRST: alla sourceNodeIds finns i graph.nodes, ingen har properties.abstraction = true
  //    Om validering misslyckas → kasta Error, mutera inget
  // 2. Skapa ny nod: typ 'pattern', properties.abstraction = true — lägg till i graph.nodes
  // 3. Confidence = mean(sources) - 0.1, min 0.1
  // 4. Skapa 'generalizes'-kanter: abstraktion → varje käll-nod
  // 5. Returnera ny nod + antal kanter
  // OBS: Atomicitet — validera alla preconditions innan första mutation
}

export function findAbstractionCandidates(
  graph: KnowledgeGraph,
  minClusterSize?: number
): Array<{ nodeIds: string[]; commonNeighborCount: number; type: NodeType }> {
  // 1. Gruppera noder per typ
  // 2. Per typ, hitta kluster med ≥2 gemensamma grannar
  // 3. Filtrera: minClusterSize (default 3), exkludera abstraktionsnoder
  // 4. Returnera sorterat efter commonNeighborCount desc
}
```

### 4. PPR-kandidathittning (`src/core/graph-merge.ts`)

Ny funktion:

```typescript
export function findPprCandidates(
  graph: KnowledgeGraph,
  nodeId: string,
  options?: { limit?: number; excludeDirectNeighbors?: boolean }
): Array<{ node: KGNode; score: number }> {
  // 1. Kör pprQuery() med nodeId som seed
  // 2. Exkludera direkta grannar (om flagga satt, default true)
  // 3. Returnera topp-N (default 10)
}
```

### 5. Hybrid duplicate finding

Uppdatera `findDuplicateCandidates()`:

```typescript
// Befintlig signatur, ny parameter:
export function findDuplicateCandidates(
  graph: KnowledgeGraph,
  threshold?: number,
  options?: { usePpr?: boolean }  // NYT
): DuplicateCandidate[] {
  // Befintlig Jaccard-logik...
  // Om usePpr: för varje kandidatpar, beräkna ppr_proximity
  // final_score = jaccard * 0.6 + ppr_proximity * 0.4
  // Filtrera på threshold (default 0.6)
}
```

### 6. Consolidator-prompt (`prompts/consolidator.md`)

Lägg till nya sektioner:

**A. Abstraction Protocol (efter "Merge Protocol"):**
- Tre-stegs-test (gemensam orsak, handlingsbart, stabilt)
- Max 3 per körning
- Inga meta-meta-noder
- Explicit motivering

**B. PPR-driven Discovery (efter "Finding Candidates"):**
- Använd `find_ppr_candidates` för att hitta dolda kopplingar
- PPR hittar noder som Jaccard missar — använd det
- OBS: PPR i hybrid duplicate finding (`findDuplicateCandidates` med `usePpr`) är en *boost* — inte en självständig duplikat-signal. `find_ppr_candidates` är verktyget för ren PPR-discovery
- Consolidator-toolhandlern för `find_duplicate_candidates` anropar alltid `findDuplicateCandidates(graph, threshold, { usePpr: true })` — PPR-boost är default i A-MEM-kontexten

**C. Priority Order-uppdatering:**
1. Identify knowledge gaps (oförändrad)
2. **Abstract recurring patterns** (NY — högre prio än merge)
3. Merge duplicates (oförändrad)
4. Distribute findings (oförändrad)
5. Strengthen connections — nu med PPR (UPPDATERAD)
6. Scope promotion (oförändrad)
7. Quality review (oförändrad)
8. Archive stale (oförändrad)

### 7. Consolidator-verktyg (`src/core/agents/consolidator.ts`)

Lägg till tre nya tools i Consolidator-agentens tool-lista:

```typescript
{
  name: 'graph_abstract_nodes',
  description: 'Create an abstraction node that generalizes multiple source nodes',
  input_schema: {
    type: 'object',
    properties: {
      nodeIds: { type: 'array', items: { type: 'string' } },
      title: { type: 'string' },
      description: { type: 'string' },
      reason: { type: 'string' },  // Sparas INTE i grafnoden — bara i findings-rapporten
    },
    required: ['nodeIds', 'title', 'description', 'reason'],
  },
},
{
  name: 'find_ppr_candidates',
  description: 'Find related nodes using graph-based PPR search (finds connections Jaccard misses)',
  input_schema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['nodeId'],
  },
},
{
  name: 'find_abstraction_candidates',
  description: 'Find clusters of nodes that share neighbors and could be abstracted',
  input_schema: {
    type: 'object',
    properties: {
      minClusterSize: { type: 'number' },
    },
  },
}
```

Plus tool-handlers som anropar funktionerna i `graph-merge.ts`.

**OBS:** `write_consolidation_report` existerar redan i Consolidator. Uppdatera dess handler så att rapporten inkluderar de nya sektionerna (Abstraktioner skapade, PPR-upptäckter, Grafstatistik). Prompten instruerar vilka sektioner — handleren ansvarar för filskrivningen.

### 8. `generalizes`-kanttyp (`src/core/knowledge-graph.ts`)

Lägg till `'generalizes'` i `EdgeType`:

```typescript
export type EdgeType =
  | 'solves'
  | 'discovered_in'
  | 'related_to'
  | 'causes'
  | 'used_by'
  | 'inspired_by'
  | 'generalizes';  // NY — abstraktion → käll-nod
```

Uppdatera `EdgeTypeSchema` (Zod).

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/commands/run.ts` | Lägg till `runConsolidator()` i orchestrator-flödet |
| `src/core/agents/consolidator.ts` | Nya tools (abstract, ppr-candidates, abstraction-candidates) + handlers. Uppdatera `write_consolidation_report`-handler med stöd för nya sektioner |
| `src/core/agents/manager.ts` | Ta bort `delegate_to_consolidator` (tool + handler + metod + auto-trigger) |
| `src/core/graph-merge.ts` | Nya funktioner: `abstractNodes()`, `findAbstractionCandidates()`, `findPprCandidates()`. Hybrid `findDuplicateCandidates()` |
| `src/core/knowledge-graph.ts` | Lägg till `'generalizes'` i `EdgeType` + `EdgeTypeSchema` |
| `prompts/consolidator.md` | Nya sektioner: Abstraction Protocol, PPR Discovery, uppdaterad Priority Order |
| `prompts/manager.md` | Ta bort Consolidator-delegering |
| `tests/core/agents/consolidator.test.ts` | Tester för nya tools + orchestrator-integration |
| `tests/core/graph-merge.test.ts` | Tester för `abstractNodes()`, `findAbstractionCandidates()`, `findPprCandidates()`, hybrid dedup |
| `tests/core/knowledge-graph.test.ts` | Test att `'generalizes'` är giltig EdgeType |

## Filer att INTE ändra

- `src/core/agents/historian.ts` — Historian backfyller noder, A-MEM reorganiserar dem. Separata ansvar.
- `src/core/agents/observer-retro.ts` — Observer observerar, inte reorganiserar
- `src/core/ppr.ts` — PPR-algoritmen är redan generell. Inga ändringar behövs. `findPprCandidates()` i `graph-merge.ts` importerar `pprQuery` som named import från denna fil.
- `src/core/agents/graph-tools.ts` — Befintliga graph-tools är oförändrade. Nya tools läggs till i consolidator.ts.
- `src/aurora/memory.ts` — Auroras memory-system (facts/preferences) är separat från kunskapsgrafen

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Dåliga abstraktioner — LLM skapar meningslösa meta-noder | Medel | Grafbrus, förvirrade agenter | Max 3 per körning. Tre-stegs-test. Reviewer-agent ser abstraktioner i nästa körning. |
| PPR-hybrid gör duplicate finding långsammare | Låg | Längre körtid | PPR är O(edges × iterations), <1s på 1000 noder. Fallback: `usePpr: false` |
| Consolidator tar för lång tid i orchestratorn | Medel | Fördröjd Observer-retro | Inline `maxIterations: 10` i `runConsolidator()`. |
| `generalizes`-kanter bryter befintlig traversal-logik | Låg | Felaktig grafnavigering | `traverse()` och `pprQuery()` hanterar redan alla kanttyper generellt |
| Manager-refactoring (ta bort delegering) missar något | Låg | Compilation error | Samma mönster som Historian i S132 — bevisat fungerande |

## Acceptanskriterier

### Orchestrator

- **AC1:** Consolidator körs automatiskt i `run.ts` EFTER Historian, FÖRE Observer-retro
- **AC2:** `delegate_to_consolidator` existerar inte längre i Manager (tool, handler, metod)
- **AC3:** All auto-trigger-logik för Consolidator borttagen från Manager (sök i manager.ts efter 'consolidat' + 'trigger'/'auto' — oavsett exakt variabelnamn)

### Abstraktion

- **AC4:** `abstractNodes()` skapar en ny nod med `properties.abstraction = true` och `properties.source_nodes`, och noden finns i `graph.nodes` efter anropet. Alla sourceNodeIds valideras innan mutation — saknad nod, befintlig abstraktion eller tom `nodeIds`-lista, lista med färre än 2 element, eller lista med duplikat-ID:n kastar Error utan att mutera grafen.
- **AC5:** `abstractNodes()` skapar `generalizes`-kanter från abstraktionsnod till varje käll-nod
- **AC6:** Confidence = mean(sources) - 0.1, minimum 0.1
- **AC7:** `abstractNodes()` vägrar abstrahera noder som redan har `properties.abstraction = true`
- **AC8:** `findAbstractionCandidates()` returnerar grupper av ≥`minClusterSize` noder av samma NodeType där varje nod i gruppen delar ≥2 gemensamma grannar med minst en annan nod i samma grupp. Default-tolkning: kedjiga kluster accepteras (A-B delar grannar, B-C delar grannar → ABC är en grupp även om A-C inte delar grannar). `commonNeighborCount` för kedjiga kluster = minimum av parvisa gemensamma grannar i kedjan. Testfall i AC19 ska inkludera ett kedjigt scenario som visar att detta accepteras.
- **AC9:** Consolidator-prompten har "Abstraction Protocol" med tre-stegs-test

### PPR-integration

- **AC10:** `findPprCandidates()` returnerar noder rankade av PPR-score, exkluderar direkta grannar
- **AC11:** `findDuplicateCandidates()` stödjer `usePpr`-option med hybrid-scoring (jaccard × 0.6 + ppr × 0.4)
- **AC11b:** `findDuplicateCandidates()` med `usePpr: true` kör PPR-boost för max 50 kandidatpar; överskjutande kandidater behåller enbart Jaccard-score
- **AC12:** Utan `usePpr` beter sig `findDuplicateCandidates()` exakt som idag — befintliga anropsställen i codebasen kompilerar utan ändringar

### Edge-typ

- **AC13:** `'generalizes'` är giltig `EdgeType` i schema och TypeScript-typ

### Prompt

- **AC15:** Consolidator-prompten har sektioner: Abstraction Protocol, PPR Discovery
- **AC16:** Priority Order uppdaterad med "Abstract recurring patterns" på position 2
- **AC17:** Manager-prompten har inte längre Consolidator-delegering

### Tester

- **AC18:** Test för `abstractNodes()` — skapar nod, kanter, rätt confidence, vägrar meta-meta
- **AC19:** Test för `findAbstractionCandidates()` — hittar kluster, respekterar minClusterSize
- **AC20:** Test för `findPprCandidates()` — returnerar PPR-rankade noder, exkluderar grannar
- **AC21:** Test för hybrid `findDuplicateCandidates()` med PPR — verifierar scoring-formel med `toBeCloseTo(expected, 5)` för floating-point-tolerans. Inkludera ett explicit epsilon-guard-testfall: när alla PPR-scores < 1e-6 ska `ppr_proximity = 0` returneras (inte NaN eller Infinity)
- **AC22:** Test att `runConsolidator()` anropas i `run.ts` efter `runHistorian()` och före `runObserverRetro()`. Verifiera exekveringsordning via anropssekvens-assertion (t.ex. `expect(mockRunHistorian).toHaveBeenCalledBefore(mockRunConsolidator)`) — inte enbart att funktionerna anropas. Se `tests/commands/run.test.ts` (eller likvärdigt) för befintligt mock-mönster. Om filen inte existerar, skapa den.
- **AC23:** Alla befintliga tester passerar utan regression

### Findings-rapport

- **AC24:** `memory/consolidation_findings.md` innehåller sektionerna "Abstraktioner skapade", "PPR-upptäckter" och "Grafstatistik (noder/kanter före/efter)" efter körning. Verifieras manuellt post-körning — inget automatiserat vitest-test krävs. Sektionsrubriker (`## Abstraktioner skapade` etc.) skapas programmatiskt av `write_consolidation_report`-handleren — LLM fyller innehållet under varje rubrik.

## Scope-fasning

Om agenten stöter på motstånd (t.ex. oväntad `pprQuery()`-signatur), prioritera enligt denna ordning:

**Körning 1 (minsta leverans):**
- AC1-AC3: Orchestrator-flytt + Manager-refactoring (bevisat mönster från S132)
- AC13: `generalizes`-kanttyp
- AC4-AC7, AC9: `abstractNodes()` + Abstraction Protocol i prompt
- AC15-AC17: Prompt-uppdateringar
- AC18: Tester för abstraktion

**Körning 2 (PPR + hybrid + tester):**
- AC10-AC12: PPR-kandidater + hybrid duplicate finding
- AC8, AC19-AC22: Abstraktionskandidater + alla kvarvarande tester
- AC23: Regressionskontroll
- AC24: Findings-rapport (manuell verifiering)
