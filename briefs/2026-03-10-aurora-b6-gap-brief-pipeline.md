# Brief: B6 — Gap → Brief pipeline

## Bakgrund

Aurora spårar kunskapsluckor ("gaps") — frågor som inte kunde besvaras på grund
av saknade källor. Dessa lagras som `research`-noder med `gapType: 'unanswered'`
och en `frequency`-räknare som ökar varje gång samma fråga ställs.

Idag kan man se gaps via `aurora:gaps` (CLI) eller `aurora_gaps` (MCP), men det
finns inget sätt att automatiskt generera ett forskningsförslag utifrån en lucka.

B6 skapar en pipeline som tar en kunskapslucka → samlar relaterade gaps →
genererar ett strukturerat forskningsförslag ("brief") med vad vi redan vet,
vad vi inte vet, och hur vi kan ta reda på det.

## Uppgifter

### 1. Core-modul: gap-brief.ts

Skapa `src/aurora/gap-brief.ts`:

```typescript
export interface ResearchSuggestion {
  /** The primary gap question this suggestion addresses. */
  primaryGap: KnowledgeGap;
  /** Related gaps (semantically similar questions). */
  relatedGaps: KnowledgeGap[];
  /** What we already know about this topic (from recall/briefing). */
  knownFacts: Array<{
    title: string;
    text?: string;
    confidence: number;
    freshnessStatus: string;
  }>;
  /** Structured research suggestion. */
  brief: {
    /** Background — what we know. */
    background: string;
    /** The gap — what we don't know. */
    gap: string;
    /** Suggestions — how to find out. */
    suggestions: string[];
  };
  /** Metadata. */
  metadata: {
    generatedAt: string;
    totalRelatedGaps: number;
    totalKnownFacts: number;
  };
}

export interface SuggestResearchOptions {
  /** Max related gaps to include. Default: 5. */
  maxRelatedGaps?: number;
  /** Max known facts to include. Default: 10. */
  maxFacts?: number;
  /** Min similarity for related gap matching. Default: 0.6. */
  minGapSimilarity?: number;
}
```

### 2. Forskningsförslagsgenerator

Implementera `suggestResearch()` i `src/aurora/gap-brief.ts`:

```typescript
/**
 * Tar en kunskapslucka och genererar ett strukturerat forskningsförslag.
 *
 * Pipeline:
 * 1. Hämta alla gaps via getGaps()
 * 2. Hitta relaterade gaps via semantisk similarity (embedding-jämförelse)
 * 3. Hämta befintlig kunskap via recall(question)
 * 4. Berika fakta med freshness-info
 * 5. Generera brief-text (bakgrund, lucka, förslag) via Claude Haiku
 * 6. Returnera komplett ResearchSuggestion
 */
export async function suggestResearch(
  question: string,
  options?: SuggestResearchOptions,
): Promise<ResearchSuggestion>
```

Steg i detalj:

1. **Hämta gaps** — `getGaps(50)` för att få alla kända luckor
2. **Matcha primär gap** — hitta den gap som bäst matchar `question` (exakt match
   eller semantisk similarity). Om ingen matchar, skapa en temporär KnowledgeGap.
3. **Hitta relaterade gaps** — för varje gap, jämför embeddings med primärgapet.
   Ta de med similarity >= `minGapSimilarity` (default 0.6), max `maxRelatedGaps`.
   Om embeddings saknas, fall tillbaka på keyword-match i frågetexten.
4. **Samla befintlig kunskap** — `recall(question, { limit: maxFacts })`.
   Berika med freshness via `calculateFreshnessScore()`.
5. **Generera brief** — Anropa Claude Haiku med en prompt som sammanfattar:
   - Bakgrund: sammanfatta kända fakta i 2-3 meningar
   - Lucka: formulera vad som saknas baserat på primärgap + relaterade gaps
   - Förslag: 3-5 konkreta forskningsåtgärder (URLs att läsa, frågor att ställa,
     söktermer att prova)
   - Max 512 tokens output
6. **Returnera** — komplett `ResearchSuggestion` med metadata

### 3. Batch: suggestResearchBatch

Implementera `suggestResearchBatch()` i samma fil:

```typescript
/**
 * Genererar forskningsförslag för de N mest frekventa gapsen.
 * Grupperar relaterade gaps för att undvika dubbletter.
 *
 * @param options.topN - Antal top-gaps att generera förslag för. Default: 3.
 */
export async function suggestResearchBatch(
  options?: SuggestResearchOptions & { topN?: number },
): Promise<ResearchSuggestion[]>
```

Steg:
1. `getGaps(topN * 3)` — hämta fler än topN för att ha marginal
2. Sortera efter frequency (redan gjort av getGaps)
3. För varje topp-gap (som inte redan är "relaterad" till en tidigare):
   - `suggestResearch(gap.question, options)`
   - Markera alla relaterade gaps som "täckta"
4. Returnera max `topN` förslag

### 4. CLI: aurora:suggest-research

Skapa `src/commands/aurora-suggest-research.ts`:

```typescript
/**
 * Generera forskningsförslag från kunskapsluckor.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:suggest-research "Vad är X?"
 *   npx tsx src/cli.ts aurora:suggest-research --top 5
 *   npx tsx src/cli.ts aurora:suggest-research --top 3 --max-facts 5
 */
```

Registrera i `src/cli.ts`:
```typescript
program
  .command('aurora:suggest-research [question]')
  .description('Generate research suggestions from knowledge gaps')
  .option('--top <n>', 'Generate for top N gaps (default: 3)', '3')
  .option('--max-facts <n>', 'Max facts to include per suggestion', '10')
  .action(async (question, options) => {
    const { auroraSuggestResearchCommand } = await import('./commands/aurora-suggest-research.js');
    await auroraSuggestResearchCommand(question, options);
  });
```

Output-format (enskild fråga):
```
Research Suggestion: "Hur fungerar pyannote diarization?"

Related gaps (2):
  - "Vilka röster kan pyannote identifiera?" (asked 3 times)
  - "Hur tränar man pyannote på nya röster?" (asked 1 time)

Known facts (3):
  ✓ "pyannote.audio används för röstidentifiering" (confidence: 0.8, fresh)
  ✓ "Voice prints lagras som embeddings" (confidence: 0.7, aging)
  ⚠ "Diarization kräver GPU" (confidence: 0.5, stale)

Brief:
  Background: Aurora använder pyannote.audio för röstidentifiering i
  YouTube-transkript. Voice prints lagras som embeddings i Postgres.

  Gap: Det saknas dokumentation om hur pyannote hanterar diarization
  av flera talare, träning på nya röster, och GPU-krav.

  Suggestions:
  1. Läs pyannote.audio dokumentationen om speaker diarization
  2. Testa med en YouTube-video med flera talare
  3. Undersök om CPU-mode fungerar tillräckligt bra
  4. Kolla pyannote GitHub issues för "training custom models"
  5. Jämför med Whisper's inbyggda diarization
```

Output-format (batch med --top):
```
Top 3 Research Suggestions
══════════════════════════

1. "Hur fungerar pyannote diarization?" (asked 5 times)
   Related: 2 gaps · Known: 3 facts
   → [brief summary]

2. "Vad kostar Hetzner ARM-servrar?" (asked 3 times)
   Related: 1 gap · Known: 1 fact
   → [brief summary]

3. "Hur exporterar man Claude Desktop-konversationer?" (asked 2 times)
   Related: 0 gaps · Known: 0 facts
   → [brief summary]
```

### 5. MCP-tool: aurora_suggest_research

Skapa `src/mcp/tools/aurora-suggest-research.ts`:

```typescript
server.tool(
  'aurora_suggest_research',
  'Generate research suggestions from knowledge gaps. Provide a question for a specific gap, or omit for top gaps.',
  {
    question: z.string().optional().describe('Specific gap question (omit for top gaps)'),
    top: z.number().min(1).max(10).optional().default(3).describe('Number of top gaps (when no question)'),
    max_facts: z.number().min(0).max(20).optional().default(10),
  },
  async (args) => {
    if (args.question) {
      const result = await suggestResearch(args.question, { maxFacts: args.max_facts });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
    const results = await suggestResearchBatch({ topN: args.top, maxFacts: args.max_facts });
    return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
  },
);
```

Registrera i `src/mcp/server.ts`.

### 6. Uppdatera aurora/index.ts

Exportera:
```typescript
export {
  suggestResearch,
  suggestResearchBatch,
  type ResearchSuggestion,
  type SuggestResearchOptions,
} from './gap-brief.js';
```

### 7. Tester

**`tests/aurora/gap-brief.test.ts`** — ny testfil:

- `suggestResearch()` returnerar ResearchSuggestion med korrekt struktur
- `suggestResearch()` hittar relaterade gaps via embedding-similarity
- `suggestResearch()` samlar known facts via recall()
- `suggestResearch()` genererar brief med bakgrund/gap/förslag-sektioner
- `suggestResearch()` hanterar fråga utan matchande gap (skapar temporär)
- `suggestResearch()` fungerar utan embeddings (keyword-fallback)
- `suggestResearchBatch()` returnerar max topN förslag
- `suggestResearchBatch()` grupperar relaterade gaps (undviker dubbletter)
- `suggestResearchBatch()` hanterar tom gaps-lista

**`tests/commands/aurora-suggest-research.test.ts`** — CLI-tester:
- Enskild fråga visar forskningsförslag
- --top visar batch-resultat
- Hanterar tomt gaps-resultat

**Alla befintliga 1469 tester ska passera oförändrade.**

## Avgränsningar

- **Claude Haiku för brief-generering** — samma mönster som `briefing()`. Inga
  dyra Opus/Sonnet-anrop.
- **Ingen automatisk körning** — föreslår bara forskning, utför den inte.
- **Embedding-baserad gap-matchning** — kräver att gaps har embeddings. Om de
  saknas, faller tillbaka på keyword-match.
- **Max 512 tokens** per genererad brief — håller det koncist.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `suggestResearch()` returnerar korrekt ResearchSuggestion | Enhetstest |
| `suggestResearch()` hittar relaterade gaps | Enhetstest |
| `suggestResearch()` samlar known facts | Enhetstest |
| `suggestResearch()` genererar brief med 3 sektioner | Enhetstest |
| `suggestResearch()` hanterar fråga utan matchande gap | Enhetstest |
| `suggestResearchBatch()` returnerar max topN | Enhetstest |
| `suggestResearchBatch()` grupperar relaterade gaps | Enhetstest |
| CLI `aurora:suggest-research` med fråga fungerar | Enhetstest |
| CLI `aurora:suggest-research --top` batch fungerar | Enhetstest |
| MCP `aurora_suggest_research` fungerar | Enhetstest |
| Befintliga 1469 tester passerar | `pnpm test` |

## Risk

**Låg.** Helt nytt modul utan ändringar i befintlig kod:
1. Ny fil `src/aurora/gap-brief.ts` — bygger på befintliga `getGaps()`, `recall()`, `calculateFreshnessScore()`
2. Befintlig kod anropas bara — inte modifierad
3. CLI och MCP är additivt
4. Claude Haiku-anrop har max 512 tokens — kontrollerad kostnad

**Rollback:** `git revert <commit>`
