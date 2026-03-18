# E2: Knowledge Manager — faktisk web-research + gap resolution

## Bakgrund

E1 skapade Knowledge Manager-agenten som kan scanna luckor och stale sources. Men den gör inte riktiga web-sökningar — den genererar research-briefs utan att faktiskt hämta information. E2 ger KM-agenten riktiga tänder.

### Vad E1 gör idag

1. **SCAN** — hämtar gaps + stale sources, prioriterar
2. **RESEARCH** — anropar `suggestResearch()` + `remember()` men söker inte själv
3. **REPORT** — sammanfattar

### Vad E2 lägger till

1. **Web-sökning** — KM söker webben för att fylla luckor
2. **URL-ingest** — hämtar och lagrar webbsidor i kunskapsgrafen
3. **Gap resolution** — markerar luckor som "resolved" efter research
4. **Semantisk topic-filtrering** — bättre filtrering med embeddings istället för string match

## Uppgifter

### 1. Web-sökning i KM research-fasen

Utöka `KnowledgeManagerAgent.run()` så att research-fasen:

1. Tar research-briefen från `suggestResearch(gap.question)`
2. Använder `WebSearch` (eller `fetch` + search API) för att hitta relevanta URLs
3. Anropar `ingestUrl(url)` för att lagra innehållet i Aurora-grafen
4. Anropar `remember(summary)` för att extrahera fakta

Implementera en hjälpfunktion `researchGap()`:

```typescript
interface ResearchResult {
  gapId: string;
  question: string;
  urlsIngested: number;
  factsLearned: number;
  resolved: boolean;
}

async function researchGap(
  gap: { id: string; question: string },
  ctx: RunContext,
): Promise<ResearchResult> {
  // 1. suggestResearch() för kontext
  // 2. Sök webben med gap.question
  // 3. Filtrera och ingest topp 2-3 URLs
  // 4. remember() för att extrahera fakta
  // 5. Returnera resultat
}
```

**Web-sökning:** Använd befintlig `fetchUrl()` från `src/aurora/intake.ts` för att hämta sidor. Skapa en enkel `webSearch()` funktion som använder DuckDuckGo HTML-sökning (ingen API-nyckel behövs):

```typescript
export async function webSearch(query: string, maxResults?: number): Promise<string[]> {
  // Fetch DuckDuckGo HTML results
  // Parse URLs from results
  // Return top N URLs
}
```

Placera i `src/aurora/web-search.ts`.

### 2. Gap resolution tracking

Lägg till möjlighet att markera gaps som resolved:

```typescript
// I knowledge-gaps.ts
export async function resolveGap(gapId: string, evidence: {
  researchedBy: string;  // 'knowledge-manager'
  urlsIngested: string[];
  factsLearned: number;
}): Promise<void> {
  // Uppdatera aurora_nodes: properties.gapType = 'resolved'
  // Uppdatera properties.resolvedAt, resolvedBy, evidence
}
```

Uppdatera `getGaps()` så att den **exkluderar resolved gaps** som default (med opt-in `includeResolved`).

### 3. Semantisk topic-filtrering

Ersätt `focusTopic` string matching i KM med semantisk likhet:

```typescript
// Istället för: gap.question.toLowerCase().includes(topic)
// Använd: embedding-baserad similarity mellan topic och gap.question
```

Använd befintlig `generateEmbedding()` + cosine similarity. Fallback till string match om embedding misslyckas.

### 4. Uppdatera KMReport

```typescript
interface KMReport {
  gapsFound: number;
  gapsResearched: number;
  gapsResolved: number;      // nytt
  urlsIngested: number;       // nytt
  sourcesRefreshed: number;
  newNodesCreated: number;
  factsLearned: number;       // nytt
  summary: string;
  details: ResearchResult[];  // nytt — per-gap detaljer
}
```

### 5. Tester

Skapa `tests/aurora/web-search.test.ts`:
- Parsning av sökresultat
- Tom query → tom array
- URL-extraktion

Uppdatera `tests/agents/knowledge-manager.test.ts`:
- Research-fasen anropar webSearch + ingestUrl
- Gap resolution — gap markeras som resolved
- Semantisk topic-filtrering (mocka embedding)
- KMReport har nya fält
- Felhantering: web-sökning misslyckas → gap skippad, resten fortsätter

Uppdatera `tests/aurora/knowledge-gaps.test.ts`:
- `resolveGap()` uppdaterar properties
- `getGaps()` exkluderar resolved som default
- `getGaps({ includeResolved: true })` inkluderar dem

Minst **15 nya tester** totalt.

## Avgränsningar

- Använd INTE extern sök-API (Google, Bing) — bara DuckDuckGo HTML-parsning (gratis, ingen nyckel)
- Max 3 URLs per gap (begränsa ingest-volym)
- Max 5 gaps per KM-körning (befintlig `maxActions`-gräns)
- Ändra INTE befintliga agenter eller MCP-tools (utom KM:s egna)
- Ändra INTE `intake.ts` — använd `ingestUrl()` som den är

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `webSearch()` funktion i `web-search.ts` | Tester |
| KM research-fas gör web-sökning + ingest | Tester |
| `resolveGap()` markerar gap som resolved | Tester |
| `getGaps()` exkluderar resolved som default | Tester |
| Semantisk topic-filtrering (med fallback) | Tester |
| KMReport har nya fält (urlsIngested, factsLearned, gapsResolved) | Tester |
| Alla befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥15 nya tester | `pnpm test` |

## Risk

**Medel.** Web-sökning innebär extern nätverksanrop — tester måste mocka detta. DuckDuckGo kan ändra HTML-format, men det påverkar bara runtime, inte befintlig funktionalitet.

**Rollback:** `git revert <commit>`.
