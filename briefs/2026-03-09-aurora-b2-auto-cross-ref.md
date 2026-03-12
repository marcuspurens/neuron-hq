# Brief: B2 — Auto cross-ref vid ingest

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-b2-auto-cross-ref.md --hours 2
```

## Bakgrund

Neuron HQ har nu cross-referens-funktionalitet (A7) som kopplar ihop Neuron KG
(`kg_nodes`) med Aurora KG (`aurora_nodes`). Men cross-refs skapas bara på två
sätt:
1. Historian använder `graph_cross_ref` tool efter körningar
2. Manuellt via CLI `aurora:cross-ref` eller MCP `neuron_cross_ref`

När Aurora ingestar ett nytt dokument (URL, fil, eller YouTube) skapas inga
kopplingar till Neuron-grafen automatiskt. Användaren måste manuellt köra
`aurora:cross-ref` efteråt.

## Problem

1. **Ingen automatisk koppling** — ingestade dokument kopplas aldrig till Neuron KG
   utan manuellt arbete
2. **Missade kopplingar** — viktig forskning som relaterar till kodmönster
   förblir oupptäckt
3. **Inget feedback vid ingest** — användaren ser inte om det nya dokumentet
   relaterar till befintliga Neuron-mönster

## Lösning

Utöka intake-pipelinen (`intake.ts` och `youtube.ts`) så att den automatiskt
kör cross-ref-matchning efter att embeddings skapats. Logga antal cross-refs
i resultatet.

## Uppgifter

### 1. Utöka IngestResult med cross-ref-info

I `src/aurora/intake.ts`, utöka `IngestResult`-interfacet:

```typescript
export interface IngestResult {
  documentNodeId: string;
  chunkNodeIds: string[];
  title: string;
  wordCount: number;
  chunkCount: number;
  // NYA fält:
  crossRefsCreated: number;
  crossRefMatches: Array<{
    neuronNodeId: string;
    neuronTitle: string;
    similarity: number;
    relationship: string;
  }>;
}
```

### 2. Lägg till auto cross-ref i `processExtractedText()`

I `src/aurora/intake.ts`, i funktionen `processExtractedText()`, efter raden
som kör `autoEmbedAuroraNodes()` (runt rad 222), lägg till:

```typescript
// Auto cross-ref: hitta Neuron-matchningar för det nya dokumentet
let crossRefsCreated = 0;
const crossRefMatches: IngestResult['crossRefMatches'] = [];

try {
  const matches = await findNeuronMatchesForAurora(docId, {
    limit: 5,
    minSimilarity: 0.5,
  });

  for (const match of matches) {
    if (match.similarity >= 0.7) {
      await createCrossRef(
        match.node.id,
        docId,
        'enriches',
        match.similarity,
        { createdBy: 'auto-ingest', source: url ?? filePath },
      );
      crossRefsCreated++;
      crossRefMatches.push({
        neuronNodeId: match.node.id,
        neuronTitle: match.node.title,
        similarity: match.similarity,
        relationship: 'enriches',
      });
    }
  }
} catch {
  // Cross-ref failure should not break ingest
  // Postgres might not be available, or kg_nodes might be empty
}
```

**Importera** `findNeuronMatchesForAurora` och `createCrossRef` från `'./cross-ref.js'`.

**Returnera** de nya fälten i IngestResult:
```typescript
return {
  documentNodeId: docId,
  chunkNodeIds,
  title,
  wordCount,
  chunkCount,
  crossRefsCreated,
  crossRefMatches,
};
```

### 3. Lägg till auto cross-ref i `ingestYouTube()`

I `src/aurora/youtube.ts`, i funktionen `ingestYouTube()`, efter raden som
kör `autoEmbedAuroraNodes()` (runt rad 252), lägg till samma mönster.

Utöka `YouTubeIngestResult`:

```typescript
export interface YouTubeIngestResult {
  transcriptNodeId: string;
  chunksCreated: number;
  voicePrintsCreated: number;
  title: string;
  duration: number;
  videoId: string;
  // NYA fält:
  crossRefsCreated: number;
  crossRefMatches: Array<{
    neuronNodeId: string;
    neuronTitle: string;
    similarity: number;
    relationship: string;
  }>;
}
```

Samma implementering som i intake.ts — sök matchningar för `transcriptNodeId`
med `findNeuronMatchesForAurora()` och skapa cross-refs vid similarity >= 0.7.

### 4. Uppdatera CLI-output

I `src/commands/aurora-ingest.ts` (eller motsvarande CLI-fil), visa cross-ref-info
efter ingest:

```
✅ Ingested "TypeScript Best Practices" (3 chunks, 1500 words)
🔗 2 cross-references created:
   → [0.89] pattern "strict-mode-enforcement"
   → [0.73] technique "type-guard-validation"
```

Om inga cross-refs: visa inte sektionen (tyst).

Samma uppdatering i YouTube-ingest CLI.

### 5. Uppdatera MCP-tool-output

I MCP-tools `aurora_ingest_url`, `aurora_ingest_doc`, och `aurora_ingest_youtube`:
inkludera `crossRefsCreated` och `crossRefMatches` i JSON-svaret.

Dessa tools returnerar redan `IngestResult`/`YouTubeIngestResult` som JSON,
så de nya fälten bör dyka upp automatiskt om interfacet uppdateras korrekt.

### 6. Tester

**`tests/aurora/auto-cross-ref.test.ts`** — ny testfil:
- `ingestUrl()` skapar cross-refs för matchningar med similarity >= 0.7
- `ingestUrl()` skapar INTE cross-refs för matchningar med similarity < 0.7
- `ingestUrl()` returnerar `crossRefsCreated` och `crossRefMatches` i resultatet
- `ingestUrl()` med tomt Neuron KG (inga noder) → `crossRefsCreated: 0`
- `ingestUrl()` med Postgres-fel i cross-ref → ingest lyckas ändå (graceful)
- `ingestYouTube()` skapar cross-refs för transcript-noden
- `ingestYouTube()` returnerar cross-ref-info i resultatet
- **Mock:** Mocka `findNeuronMatchesForAurora`, `createCrossRef`,
  `autoEmbedAuroraNodes`, Python workers, Postgres

**`tests/commands/aurora-ingest-cross-ref.test.ts`** — CLI-output:
- CLI visar cross-ref-info när matchningar finns
- CLI visar inte cross-ref-sektion när inga matchningar
- **Mock:** Mocka `ingestUrl()`

**Befintliga intake-tester i `tests/aurora/intake.test.ts`:**
- INTE ändra befintliga tester
- De befintliga testerna ska fortfarande passera — de nya fälten har default-värden

**Alla befintliga 1379 tester ska passera oförändrade.**

## Avgränsningar

- **Cross-ref bara för huvudnod** — vi kör cross-ref bara för dokumentnoden
  (`docId`/`transcriptNodeId`), inte för varje chunk. Chunks ärver kopplingen
  via `derived_from`-kanter.
- **Relationship alltid `'enriches'`** — vid auto-ingest antar vi att Aurora-dokument
  berikar Neuron-mönster. Mer sofistikerad klassificering (supports/contradicts)
  kan läggas till i B4.
- **Max 5 matchningar** — begränsar Postgres-last per ingest
- **Failure = tyst** — om cross-ref misslyckas (Postgres nere, inga Neuron-noder),
  ska ingest fortfarande lyckas. Cross-ref är en bonus, inte ett krav.
- **Tröskel 0.7** — samma som Historians `graph_cross_ref`. Kan justeras i framtiden.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Ingesta ett dokument
npx tsx src/cli.ts aurora:ingest https://example.com/article
# Förväntat: ingest lyckas + ev. cross-ref-info visas

# Kolla cross-refs
npx tsx src/cli.ts aurora:cross-ref "article topic"
# Förväntat: cross-refs finns om Neuron KG har relaterade noder
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `ingestUrl()` skapar cross-refs automatiskt | Enhetstest |
| `ingestUrl()` returnerar crossRefsCreated + crossRefMatches | Enhetstest |
| Cross-ref skapas bara vid similarity >= 0.7 | Enhetstest |
| Ingest lyckas även om cross-ref misslyckas | Enhetstest |
| `ingestYouTube()` skapar cross-refs | Enhetstest |
| CLI visar cross-ref-info | Enhetstest |
| MCP-tools inkluderar cross-ref-info i JSON | Enhetstest |
| Befintliga intake-tester passerar | `pnpm test` |
| 1379 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Modifierar befintlig kod men med defensiv approach:

1. **Befintliga tester ändras inte** — nya fält adderas, default-värden
2. **Cross-ref i try/catch** — failure bryter inte ingest-flödet
3. **Samma tröskel som Historian** — 0.7, beprövat
4. **Max 5 matcher** — begränsad Postgres-last
5. **Inga nya tabeller** — använder befintlig `cross_refs`-tabell (A7)

**Rollback:** `git revert <commit>`
