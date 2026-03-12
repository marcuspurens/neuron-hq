# Brief: A6 — Smart minne + auto-lärande

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a6-smart-memory.md --hours 2
```

## Bakgrund

A1–A5 byggde hela Aurora-infrastrukturen: intake, sökning, ask, minne och YouTube.
Nu ska Aurora bli **smartare** — lära sig automatiskt från konversationer,
upptäcka motsägelser, och ge överblick av sin kunskap.

Alla byggstenar finns:
- `ask()` i `ask.ts` syntetiserar svar med citeringar (A3)
- `remember()` i `memory.ts` sparar fakta/preferenser med dedup (A4)
- `recall()` hämtar relevanta minnen (A4)
- `searchAurora()` söker semantiskt + graftraversering (A3)
- `createAgentClient()` i `agent-client.ts` skapar Claude-klienter
- `resolveModelConfig()` i `model-registry.ts` löser modell per roll

## Problem

1. **Inget auto-lärande** — `ask()` ger svar men sparar inte vad den lärt sig
2. **Ingen motsägelsedetektering** — `remember()` deduplicerar men upptäcker inte motsägelser
3. **Ingen tidslinjevy** — ingen kronologisk överblick av inlärda kunskaper
4. **Ingen kunskapsanalys** — ingen funktion som sammanfattar "vad vet Aurora om X?"
5. **Inga kunskapsluckor** — vet inte vilka frågor som saknar källor

## Lösning

Fyra funktioner som gör Aurora smartare, utan att införa hela agent-ramverket
(det kommer i en framtida brief). Fokus: auto-lärande, motsägelser, överblick.

## Uppgifter

### 1. Auto-lärande i ask (`src/aurora/ask.ts` — utöka)

Lägg till en `learnFromAnswer`-option i `ask()` som automatiskt extraherar
nyckel-fakta från svaret och sparar dem via `remember()`.

```typescript
export interface AskOptions {
  // ... befintliga options ...
  /** Extrahera och spara fakta från svaret. Default: false. */
  learn?: boolean;
}

export interface AskResult {
  // ... befintliga fält ...
  /** Fakta som lärdes (om learn=true). */
  factsLearned?: RememberResult[];
}
```

**Implementering:**

1. Efter att Claude svarat, om `learn=true`:
2. Gör ett andra Claude-anrop (Haiku, billigt) med prompten:

```
Extrahera de viktigaste fakta från detta svar som korta, oberoende påståenden.
Returnera som JSON-array: ["faktum 1", "faktum 2", ...]
Max 5 fakta. Bara fakta som faktiskt finns i svaret, inga spekulationer.
Om svaret inte innehåller tydliga fakta, returnera en tom array.

Svar att extrahera från:
<svar>
```

3. Parsea JSON-arrayen.
4. Kör `remember(fact, { type: 'fact', source: 'auto-extracted' })` för varje faktum.
5. Returnera `factsLearned` i resultatet.

**Felhantering:** Om Claude-anropet eller JSON-parsningen misslyckas,
logga varning men returnera svaret utan `factsLearned`. Auto-lärande ska
aldrig blockera ett svar.

### 2. Motsägelsedetektering i remember (`src/aurora/memory.ts` — utöka)

Utöka `remember()` att detektera motsägelser mot befintliga noder.

```typescript
export interface RememberResult {
  // ... befintliga fält ...
  /** Noder som motsäger det nya faktumet. */
  contradictions?: Contradiction[];
}

export interface Contradiction {
  /** ID på den motsägande noden. */
  nodeId: string;
  /** Titel. */
  title: string;
  /** Similarity score. */
  similarity: number;
  /** Förklaring av motsägelsen. */
  reason: string;
}
```

**Implementering:**

1. I `remember()`, efter dedup-sökningen, kolla om något resultat med
   similarity >= 0.5 men < `dedupThreshold` (0.85) har motsatt innebörd.
2. Gör ett Claude-anrop (Haiku) med prompten:

```
Jämför dessa två påståenden. Motsäger de varandra?

Nytt: "<nytt faktum>"
Befintligt: "<befintlig nod text>"

Svara med JSON: { "contradicts": true/false, "reason": "kort förklaring" }
```

3. Om `contradicts: true`:
   - Skapa en `contradicts`-kant mellan noderna (istället för `related_to`).
   - Lägg till i `RememberResult.contradictions`.

**Begränsning:** Max 3 kandidater kollas (de med högst similarity).
Om Haiku-anropet misslyckas, falla tillbaka till `related_to`-kant.

**OBS:** `remember()` ska INTE anropa Claude om det inte finns kandidater
med similarity >= 0.5. De flesta anrop ska vara snabba (bara lokal sökning).

### 3. Tidslinjevy (`src/aurora/timeline.ts`)

```typescript
export interface TimelineEntry {
  /** Nodens ID. */
  id: string;
  /** Titel. */
  title: string;
  /** Nodtyp. */
  type: string;
  /** Skapad tidpunkt. */
  createdAt: string;
  /** Scope. */
  scope: string;
  /** Confidence. */
  confidence: number;
  /** Källa (sourceUrl om finns). */
  source?: string;
}

export interface TimelineOptions {
  /** Max antal poster. Default: 20. */
  limit?: number;
  /** Filtrera på nodtyp. */
  type?: string;
  /** Filtrera på scope. */
  scope?: string;
  /** Från datum (ISO). */
  since?: string;
  /** Till datum (ISO). */
  until?: string;
}

/**
 * Hämta en kronologisk tidslinje av Aurora-noder.
 * Sorteras med nyaste först.
 */
export async function timeline(
  options?: TimelineOptions,
): Promise<TimelineEntry[]>;
```

**Implementering:** Ladda grafen via `loadAuroraGraph()`, filtrera noder
på typ/scope/datum, sortera på `created` (nyaste först), returnera.

### 4. Kunskapsluckor (`src/aurora/knowledge-gaps.ts`)

Spåra frågor som saknade källor och identifiera kunskapsluckor.

```typescript
export interface KnowledgeGap {
  /** Frågan som ställdes. */
  question: string;
  /** Tidpunkt. */
  askedAt: string;
  /** Antal gånger liknande fråga ställts. */
  frequency: number;
}

export interface GapsResult {
  /** Kunskapsluckor (sorterade efter frekvens). */
  gaps: KnowledgeGap[];
  /** Totalt antal frågor utan källor. */
  totalUnanswered: number;
}

/**
 * Spara en fråga som saknade källor.
 * Deduplicerar mot befintliga luckor (semantiskt).
 */
export async function recordGap(question: string): Promise<void>;

/**
 * Hämta kända kunskapsluckor.
 */
export async function getGaps(limit?: number): Promise<GapsResult>;
```

**Implementering:**
- Spara kunskapsluckor som `research`-noder i Aurora-grafen med
  `properties.gapType: 'unanswered'` och `properties.frequency: N`.
- `recordGap()` söker efter liknande befintlig gap-nod (semantisk dedup).
  Om match: öka `frequency`. Om inte: skapa ny.
- Integrera med `ask()`: om `noSourcesFound`, anropa `recordGap(question)`.

### 5. CLI-kommandon

**`src/commands/aurora-timeline.ts`:**
```bash
# npx tsx src/cli.ts aurora:timeline
# npx tsx src/cli.ts aurora:timeline --type fact --limit 10
# npx tsx src/cli.ts aurora:timeline --since 2026-03-01
#
# Output:
# 📅 Aurora Timeline (last 20)
#
#   2026-03-09 12:30  [fact] "TypeScript har strict mode" (confidence: 0.9)
#   2026-03-09 12:25  [preference] "Föredrar TypeScript" (confidence: 0.8)
#   2026-03-09 11:00  [document] "README" (confidence: 1.0)
#                     Source: /path/to/README.md
#   ...
```

**`src/commands/aurora-gaps.ts`:**
```bash
# npx tsx src/cli.ts aurora:gaps
#
# Output:
# 🔍 Knowledge Gaps
#
#   [3x] "Vad är kvantfysik?" — ställd 3 gånger utan bra svar
#   [1x] "Hur fungerar Docker networking?"
#
#   Total: 2 gaps from 4 unanswered questions
```

Registrera båda i `src/cli.ts`.

### 6. MCP-tools

**`src/mcp/tools/aurora-timeline.ts`:**
```typescript
export function registerAuroraTimelineTool(server: McpServer): void {
  server.tool(
    'aurora_timeline',
    'Get a chronological timeline of Aurora knowledge base entries.',
    {
      limit: z.number().min(1).max(100).optional().default(20),
      type: z.string().optional().describe('Filter by node type'),
      scope: z.enum(['personal', 'shared', 'project']).optional(),
      since: z.string().optional().describe('From date (ISO format)'),
    },
    async (args) => { /* ... */ },
  );
}
```

**`src/mcp/tools/aurora-gaps.ts`:**
```typescript
export function registerAuroraGapsTool(server: McpServer): void {
  server.tool(
    'aurora_gaps',
    'List knowledge gaps — questions that Aurora could not answer due to missing sources.',
    {
      limit: z.number().min(1).max(50).optional().default(10),
    },
    async (args) => { /* ... */ },
  );
}
```

Registrera i `src/mcp/server.ts`.

### 7. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `timeline`, `TimelineEntry`, `TimelineOptions` från `./timeline.js`
- `recordGap`, `getGaps`, `KnowledgeGap`, `GapsResult` från `./knowledge-gaps.js`

### 8. Tester

**Nya testfiler:**

- `tests/aurora/ask-learn.test.ts`:
  - `ask()` med `learn: true` extraherar fakta
  - `ask()` med `learn: true` sparar fakta via `remember()`
  - `ask()` med `learn: true` + misslyckad Claude → returnerar svar ändå
  - `ask()` utan `learn` → inga extra anrop
  - `ask()` med `noSourcesFound` → anropar `recordGap()`
  - **Mock:** Mocka `semanticSearch`, `createAgentClient`, `remember`, `recordGap`

- `tests/aurora/contradiction.test.ts`:
  - `remember()` med motsägande befintlig nod → skapar `contradicts`-kant
  - `remember()` utan motsägelser → skapar `related_to`-kant (som förut)
  - `remember()` med Haiku-fel → fallback till `related_to`
  - `remember()` utan kandidater → inget Claude-anrop
  - `RememberResult.contradictions` innehåller korrekta noder
  - **Mock:** Mocka `searchAurora`, `loadAuroraGraph`, `saveAuroraGraph`, `createAgentClient`

- `tests/aurora/timeline.test.ts`:
  - `timeline()` returnerar noder sorterade efter datum
  - `timeline()` filtrerar på typ
  - `timeline()` filtrerar på datum
  - `timeline()` limit fungerar
  - Hanterar tom graf

- `tests/aurora/knowledge-gaps.test.ts`:
  - `recordGap()` skapar research-nod
  - `recordGap()` ökar frequency vid upprepad fråga
  - `getGaps()` sorterar efter frequency
  - Hanterar tom graf

- `tests/commands/aurora-timeline.test.ts`:
  - CLI visar tidslinje korrekt
  - `--type` filtrerar
  - `--since` filtrerar

- `tests/commands/aurora-gaps.test.ts`:
  - CLI visar kunskapsluckor
  - Tomt resultat → tydligt meddelande

- `tests/mcp/tools/aurora-timeline.test.ts`:
  - MCP-tool returnerar TimelineEntry[]
  - Parametrar fungerar

- `tests/mcp/tools/aurora-gaps.test.ts`:
  - MCP-tool returnerar GapsResult
  - Hanterar tomt resultat

**Alla befintliga 1264 tester ska passera oförändrade.**

## Avgränsningar

- **Inget agent-ramverk** — inga Aurora-specifika agent-klasser (IntakeAgent etc.)
  som kör autonomt. Det förenklas i en framtida brief.
- **Ingen konversationshistorik** — auto-lärande sker per fråga, inte över en konversation
- **Ingen automatisk konfliktlösning** — motsägelser upptäcks och loggas,
  men användaren bestämmer vilken version som gäller
- **Max 3 contradiction-checks per remember** — begränsar Claude-kostnader
- **Fakta-extraktion max 5 fakta per svar** — begränsar skrivningar

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Auto-lärande
npx tsx src/cli.ts aurora:ask "What is Neuron HQ?" --learn
# Förväntat: svar + "Learned 3 facts"

# Motsägelsedetektering
npx tsx src/cli.ts aurora:remember "TypeScript är bättre än Python" --type preference
npx tsx src/cli.ts aurora:remember "Python är bättre än TypeScript" --type preference
# Förväntat: "Contradiction detected with existing memory"

# Tidslinje
npx tsx src/cli.ts aurora:timeline --limit 5
# Förväntat: senaste 5 noder kronologiskt

# Kunskapsluckor
npx tsx src/cli.ts aurora:ask "Vad handlar kvantfysik om?"
npx tsx src/cli.ts aurora:gaps
# Förväntat: "kvantfysik" syns som en kunskapslucka
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `ask()` med `learn: true` extraherar och sparar fakta | Enhetstest (mock) |
| `ask()` med `learn: true` + fel → svar returneras ändå | Enhetstest |
| `ask()` med `noSourcesFound` → `recordGap()` anropas | Enhetstest |
| `remember()` detekterar motsägelser → `contradicts`-kant | Enhetstest (mock) |
| `remember()` utan kandidater → inget Claude-anrop | Enhetstest |
| `timeline()` returnerar noder kronologiskt | Enhetstest |
| `timeline()` filtrerar på typ/datum | Enhetstest |
| `recordGap()` skapar/uppdaterar research-nod | Enhetstest |
| `getGaps()` returnerar sorterat efter frekvens | Enhetstest |
| CLI `aurora:timeline` visar tidslinje | Enhetstest |
| CLI `aurora:gaps` visar kunskapsluckor | Enhetstest |
| MCP `aurora_timeline` returnerar TimelineEntry[] | Enhetstest |
| MCP `aurora_gaps` returnerar GapsResult | Enhetstest |
| 1264 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Mest additivt:

1. **Utökade fält** — `AskOptions.learn`, `AskResult.factsLearned`,
   `RememberResult.contradictions` — bakåtkompatibla (alla optional)
2. **Nya filer** — `timeline.ts`, `knowledge-gaps.ts`, CLI, MCP-tools
3. **Claude-anrop** — bara i `learn`-mode och vid contradiction-check,
   mockat i alla tester
4. **Graceful fallback** — auto-lärande och contradiction-check misslyckas
   tyst om Haiku-anrop inte funkar

**Rollback:** `git revert <commit>`
