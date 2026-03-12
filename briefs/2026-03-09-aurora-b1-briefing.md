# Brief: B1 — Briefing — samlad kunskapsrapport

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-b1-briefing.md --hours 2
```

## Bakgrund

Aurora har nu alla byggstenar för att samla kunskap:
- `recall(query)` — semantisk sökning i minnet (fakta, preferenser)
- `timeline(options)` — kronologisk vy av alla noder
- `getGaps(limit)` — kunskapsluckor (obesvarade frågor)
- `unifiedSearch(query)` — sökning i båda graferna (Neuron + Aurora)

Men det finns inget sätt att säga **"ge mig allt du vet om X"** och få en
samlad rapport. Användaren måste köra 4 separata kommandon och sätta ihop
bilden själv.

## Problem

1. **Ingen samlad vy** — fakta, tidslinje, luckor och cross-refs visas separat
2. **Ingen sammanfattning** — saknas en syntes som förklarar vad vi vet och inte vet
3. **Inget briefing-format** — varken CLI eller MCP kan producera en kunskapsrapport

## Lösning

En `briefing(topic)` funktion som orkestrerar befintliga funktioner parallellt
och formaterar resultatet som en strukturerad kunskapsrapport.

## Uppgifter

### 1. Core-modul: `src/aurora/briefing.ts`

```typescript
export interface BriefingOptions {
  /** Max antal fakta att inkludera. Default: 10. */
  maxFacts?: number;
  /** Max antal tidslinjeträffar. Default: 10. */
  maxTimeline?: number;
  /** Max antal luckor. Default: 5. */
  maxGaps?: number;
  /** Max antal cross-ref-resultat per graf. Default: 5. */
  maxCrossRefs?: number;
  /** Minimum similarity för sökning. Default: 0.3. */
  minSimilarity?: number;
}

export interface BriefingResult {
  /** Ämnet som söktes. */
  topic: string;
  /** Sammanfattning genererad av Claude. */
  summary: string;
  /** Relevanta fakta från recall(). */
  facts: Array<{
    title: string;
    type: string;
    confidence: number;
    similarity: number;
    text?: string;
  }>;
  /** Kronologisk tidslinje filtrerad på ämnet. */
  timeline: Array<{
    title: string;
    type: string;
    createdAt: string;
    confidence: number;
  }>;
  /** Kunskapsluckor relaterade till ämnet. */
  gaps: Array<{
    question: string;
    frequency: number;
    askedAt: string;
  }>;
  /** Cross-referens-resultat från båda graferna. */
  crossRefs: {
    neuron: Array<{ title: string; type: string; similarity: number }>;
    aurora: Array<{ title: string; type: string; similarity: number }>;
  };
  /** Metadata om rapporten. */
  metadata: {
    generatedAt: string;
    totalSources: number;
    totalGaps: number;
    totalCrossRefs: number;
  };
}

/**
 * Generera en samlad kunskapsrapport om ett ämne.
 *
 * Kör recall(), timeline(), getGaps() och unifiedSearch() parallellt,
 * sedan genererar Claude en sammanfattning baserad på resultaten.
 */
export async function briefing(
  topic: string,
  options?: BriefingOptions,
): Promise<BriefingResult>;
```

**Implementering:**

1. Kör fyra sökningar **parallellt** med `Promise.all()`:
   - `recall(topic, { limit: maxFacts ?? 10 })`
   - `searchAurora(topic, { limit: maxTimeline ?? 10 })` — för att filtrera
     timeline-noder relaterade till ämnet (istället för alla noder)
   - `getGaps(maxGaps ?? 5)`
   - `unifiedSearch(topic, { limit: maxCrossRefs ?? 5, minSimilarity })`

2. **Filtrera gaps:** Endast gaps vars `question` har semantisk eller
   nyckelords-relevans till topic. Enklaste approach: filtrera med
   `question.toLowerCase().includes(topic.toLowerCase())`.
   Om inga gaps matchar, inkludera de mest frekventa ändå (max 3).

3. **Generera sammanfattning** med Claude (Haiku för kostnad):
   - System prompt: "Du sammanfattar en kunskapsrapport. Svara på svenska.
     Var koncis. Nämn antal källor, kunskapsluckor, och kopplingar."
   - User prompt: JSON med fakta + timeline + gaps + cross-refs
   - maxTokens: 512

4. **Bygg BriefingResult** med alla delar.

**Viktigt:**
- Om inga fakta hittas (recall returnerar tomt): rapporten ska fortfarande
  fungera. Sammanfattningen ska säga "Inga fakta hittades om [topic]."
- Om Postgres inte är tillgängligt: låt felet propagera (samma mönster som
  `recall()` och `searchAurora()` redan gör).
- Använd `resolveModelConfig('researcher')` för modellval (faller tillbaka
  till Haiku). Importera från `'../core/agents/model-registry.js'`.

### 2. CLI-kommando: `src/commands/aurora-briefing.ts`

```bash
# Användning:
npx tsx src/cli.ts aurora:briefing "TypeScript patterns"

# Output:
# 📋 Briefing: "TypeScript patterns"
# ═══════════════════════════════════
#
# ## Sammanfattning
# Vi har 5 fakta om TypeScript patterns, varav 3 från Aurora-forskning
# och 2 cross-refererade med Neuron KG. Inga kunskapsluckor identifierade.
#
# ## Fakta (5)
#   [0.92] "TypeScript strict mode prevents type errors" (fact, confidence: 0.8)
#   [0.85] "Use type guards for runtime validation" (fact, confidence: 0.9)
#   ...
#
# ## Tidslinje (3)
#   2026-03-09  document  "TypeScript 5.0 Best Practices"
#   2026-03-08  fact      "Strict mode prevents type errors"
#   ...
#
# ## Kunskapsluckor (1)
#   ❓ "What are the best TypeScript testing patterns?" (asked 2x)
#
# ## Kopplingar (Neuron ↔ Aurora)
#   Neuron: [0.89] pattern "strict-mode-enforcement"
#   Aurora: [0.92] document "TypeScript 5.0 Best Practices"
#
# ── Rapport genererad 2026-03-09T15:00:00Z | 8 källor | 1 lucka | 2 kopplingar
```

**Implementering:**

```typescript
export async function auroraBriefingCommand(
  topic: string,
  cmdOptions: {
    maxFacts?: string;
    maxTimeline?: string;
    maxGaps?: string;
    maxCrossRefs?: string;
  },
): Promise<void>;
```

- Argument: `topic` (required)
- Options: `--max-facts`, `--max-timeline`, `--max-gaps`, `--max-cross-refs`
- Anropa `briefing(topic, options)` och formatera output med `chalk`
- Sektioner: Sammanfattning, Fakta, Tidslinje, Kunskapsluckor, Kopplingar
- Sidfot med metadata (genererad tid, antal källor, luckor, kopplingar)
- Registrera i `src/cli.ts`:
  ```typescript
  .command('aurora:briefing <topic>')
  .description('Generate a knowledge briefing about a topic')
  .option('--max-facts <n>', 'Max facts to include', '10')
  .option('--max-timeline <n>', 'Max timeline entries', '10')
  .option('--max-gaps <n>', 'Max knowledge gaps', '5')
  .option('--max-cross-refs <n>', 'Max cross-refs per graph', '5')
  .action(auroraBriefingCommand)
  ```

### 3. MCP-tool: `src/mcp/tools/aurora-briefing.ts`

```typescript
export function registerAuroraBriefingTool(server: McpServer): void {
  server.tool(
    'aurora_briefing',
    'Generate a comprehensive knowledge briefing about a topic. Combines facts, timeline, knowledge gaps, and cross-references between Neuron and Aurora knowledge graphs into a structured report with an AI-generated summary.',
    {
      topic: z.string().describe('The topic to generate a briefing about'),
      max_facts: z.number().min(1).max(50).optional().default(10)
        .describe('Maximum facts to include'),
      max_timeline: z.number().min(1).max(50).optional().default(10)
        .describe('Maximum timeline entries'),
      max_gaps: z.number().min(1).max(20).optional().default(5)
        .describe('Maximum knowledge gaps'),
      max_cross_refs: z.number().min(1).max(20).optional().default(5)
        .describe('Maximum cross-refs per graph'),
    },
    async (args) => {
      // Call briefing(), return JSON result
      // On error: return { content: [{ type: 'text', text: 'Error: ...' }], isError: true }
    },
  );
}
```

Registrera i `src/mcp/server.ts`.

### 4. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `briefing` från `'./briefing.js'`
- `BriefingOptions`, `BriefingResult` från `'./briefing.js'`

### 5. Tester

**`tests/aurora/briefing.test.ts`** — core-funktionen:
- `briefing()` returnerar BriefingResult med alla fält
- `briefing()` med topic som har fakta, timeline, gaps, och cross-refs
- `briefing()` med topic som inte hittar några fakta → sammanfattning säger "inga fakta"
- `briefing()` med topic som inte hittar några gaps → gaps-array tom
- `briefing()` med topic som inte hittar några cross-refs → crossRefs tom
- `briefing()` med custom options (maxFacts, maxTimeline, etc.) → respekterar begränsningar
- `briefing()` genererar sammanfattning via Claude (mock modell-anrop)
- `briefing()` kör recall + search + gaps + unifiedSearch parallellt (verifica med mock)
- `briefing()` metadata har korrekt totalSources, totalGaps, totalCrossRefs
- **Mock:** Mocka `recall`, `searchAurora`, `getGaps`, `unifiedSearch`, `Anthropic`

**`tests/commands/aurora-briefing.test.ts`** — CLI:
- CLI visar alla sektioner (Sammanfattning, Fakta, Tidslinje, Luckor, Kopplingar)
- CLI med `--max-facts 3` → max 3 fakta
- CLI med tomt resultat → tydligt meddelande
- **Mock:** Mocka `briefing()`

**`tests/mcp/tools/aurora-briefing.test.ts`** — MCP:
- MCP-tool returnerar BriefingResult som JSON
- MCP-tool med parametrar → skickar till briefing()
- MCP-tool hanterar error → isError: true
- **Mock:** Mocka `briefing()`

**Alla befintliga 1356 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen caching** — varje briefing-anrop kör alla sökningar på nytt. Caching
  kan bli en framtida optimering om rapporter tar för lång tid.
- **Ingen PDF/markdown-export** — resultatet returneras som BriefingResult-objekt.
  CLI formaterar till terminal, MCP returnerar JSON. Export-format kan läggas till senare.
- **Gap-filtrering enkel** — nyckelordsbaserad filtrering av gaps (inte semantisk).
  Tillräckligt för v1, kan förbättras i B6.
- **Sammanfattningen på svenska** — system prompt instruerar Claude att svara
  på svenska. Kan parametriseras i framtiden.
- **Haiku för sammanfattning** — använder billigaste modellen. Tillräckligt
  för att sammanfatta strukturerad data.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Kör briefing
npx tsx src/cli.ts aurora:briefing "TypeScript"
# Förväntat: rapport med alla sektioner

npx tsx src/cli.ts aurora:briefing "något som inte finns"
# Förväntat: rapport som säger "inga fakta hittades"

npx tsx src/cli.ts aurora:briefing "TypeScript" --max-facts 3
# Förväntat: max 3 fakta i rapporten
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `briefing()` returnerar BriefingResult med alla fält | Enhetstest |
| `briefing()` kör 4 sökningar parallellt | Enhetstest (mock timing) |
| `briefing()` genererar sammanfattning via Claude | Enhetstest (mock) |
| `briefing()` hanterar tomt resultat (inga fakta) | Enhetstest |
| `briefing()` hanterar tomt resultat (inga gaps) | Enhetstest |
| `briefing()` respekterar maxFacts/maxTimeline/etc. | Enhetstest |
| CLI visar alla sektioner formaterade | Enhetstest |
| CLI med `--max-facts` fungerar | Enhetstest |
| MCP returnerar BriefingResult som JSON | Enhetstest |
| MCP hanterar error med isError | Enhetstest |
| 1356 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Helt additivt:

1. **Ny modul** — `briefing.ts` — inga ändringar i befintlig kod
2. **Nytt CLI-kommando** — registreras i `cli.ts`, påverkar inga befintliga kommandon
3. **Nytt MCP-tool** — registreras i `server.ts`, påverkar inga befintliga tools
4. **Orkestrerar befintliga funktioner** — `recall()`, `searchAurora()`, `getGaps()`,
   `unifiedSearch()` anropas utan modifiering
5. **Claude-anrop** — en Haiku-anrop per briefing (~512 tokens) — minimal kostnad

**Rollback:** `git revert <commit>`
