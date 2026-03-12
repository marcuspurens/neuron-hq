# Brief: A4 — Minne (preferences, fakta, context)

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a4-memory.md --hours 2
```

## Bakgrund

A1–A3 byggde Aurora-infrastrukturen: tabeller, intake-pipeline, sökning och
ask-pipeline. Nu behövs **minneslagret** — möjligheten att spara och hämta
fakta, preferenser och kontext från konversationer.

Alla byggstenar finns:
- `addAuroraNode()` i `aurora-graph.ts` stödjer nodtyperna `fact` och `preference`
- `searchAurora()` i `search.ts` söker med semantik + graftraversering (A3)
- `ask()` i `ask.ts` syntetiserar svar från Aurora-noder (A3)
- `applyAuroraConfidenceDecay()` hanterar tidsmässig nedtrappning
- Kanttyper `supports`, `contradicts`, `related_to` finns i schemat

Det som saknas: funktioner för att **skriva** fakta/preferenser, **hämta**
relevanta minnen för en given kontext, och **dedup** mot befintliga noder.

## Problem

1. **Inget sätt att spara fakta/preferenser** — intake skapar bara document-noder
2. **Ingen semantisk dedup** — samma fakta kan sparas flera gånger
3. **Ingen kontextbyggare** — agenter kan inte hämta relevanta minnen för en fråga
4. **Ingen minnesstatistik** — ingen överblick av vad Aurora minns

## Lösning

Skapa `src/aurora/memory.ts` med funktioner för att skriva, hämta och
hantera fakta/preferenser i Aurora-minnet.

### Arkitektur

```
"Jag föredrar TypeScript framför Python"
    │
    ▼
remember(text, { type: 'preference', scope: 'personal' })
    │
    ├─ semanticSearch → finns liknande nod?
    │   ├─ JA → updateAuroraNode (uppdatera confidence + text)
    │   └─ NEJ → addAuroraNode (ny nod)
    │
    ├─ Skapa kanter: related_to, supports, contradicts
    │
    └─ saveAuroraGraph → DB + embeddings
```

## Uppgifter

### 1. Memory-modul (`src/aurora/memory.ts`)

```typescript
import { loadAuroraGraph, saveAuroraGraph, addAuroraNode, updateAuroraNode, findAuroraNodes } from './aurora-graph.js';
import { searchAurora } from './search.js';

export interface RememberOptions {
  /** Nodtyp: 'fact' eller 'preference'. Default: 'fact'. */
  type?: 'fact' | 'preference';
  /** Scope: 'personal', 'shared', 'project'. Default: 'personal'. */
  scope?: 'personal' | 'shared' | 'project';
  /** Tags för kategorisering. */
  tags?: string[];
  /** Källa (var faktumet kommer ifrån). */
  source?: string;
  /** Minimum similarity för dedup. Default: 0.85. */
  dedupThreshold?: number;
}

export interface RememberResult {
  /** Nodens ID (ny eller uppdaterad). */
  nodeId: string;
  /** Om noden var ny eller uppdaterade en befintlig. */
  action: 'created' | 'updated' | 'duplicate';
  /** Om uppdaterad: den befintliga nodens ID. */
  existingNodeId?: string;
  /** Similarity score mot befintlig nod (om dedup). */
  similarity?: number;
}

export interface RecallOptions {
  /** Max antal minnen att returnera. Default: 10. */
  limit?: number;
  /** Filtrera på nodtyp. */
  type?: 'fact' | 'preference';
  /** Filtrera på scope. */
  scope?: 'personal' | 'shared' | 'project';
  /** Minimum similarity. Default: 0.3. */
  minSimilarity?: number;
}

export interface RecallResult {
  /** Hämtade minnen. */
  memories: Memory[];
  /** Totalt antal matchande noder. */
  totalFound: number;
}

export interface Memory {
  /** Nodens ID. */
  id: string;
  /** Titeln. */
  title: string;
  /** Nodtyp. */
  type: 'fact' | 'preference';
  /** Innehåll. */
  text: string;
  /** Confidence (0–1). */
  confidence: number;
  /** Scope. */
  scope: string;
  /** Tags. */
  tags: string[];
  /** Similarity score från sökning. */
  similarity: number | null;
  /** Relaterade minnen. */
  related: { id: string; title: string; edgeType: string }[];
  /** Skapad. */
  createdAt: string;
  /** Uppdaterad. */
  updatedAt: string;
}

export interface MemoryStats {
  /** Antal fakta. */
  facts: number;
  /** Antal preferenser. */
  preferences: number;
  /** Totalt antal minnes-noder (facts + preferences). */
  total: number;
  /** Genomsnittlig confidence. */
  avgConfidence: number;
  /** Per scope. */
  byScope: Record<string, number>;
}

/**
 * Spara ett faktum eller en preferens i Aurora-minnet.
 *
 * Flöde:
 * 1. Sök efter liknande befintliga noder (semantisk dedup)
 * 2. Om similarity >= dedupThreshold: uppdatera befintlig nod
 *    (höj confidence, uppdatera text om nyare)
 * 3. Om ingen match: skapa ny nod
 * 4. Skapa kanter till relaterade noder (similarity >= 0.5 men < dedupThreshold)
 * 5. Spara graf (dual-write + auto-embed)
 */
export async function remember(
  text: string,
  options?: RememberOptions,
): Promise<RememberResult>;

/**
 * Hämta relevanta minnen baserat på en fråga/kontext.
 *
 * Använder searchAurora() med type-filter för fact/preference.
 * Inkluderar relaterade noder via graftraversering.
 */
export async function recall(
  query: string,
  options?: RecallOptions,
): Promise<RecallResult>;

/**
 * Hämta statistik om Aurora-minnet.
 */
export async function memoryStats(): Promise<MemoryStats>;
```

**Dedup-logik i detalj:**

1. Kör `searchAurora(text, { type, limit: 5, minSimilarity: 0.5 })`.
2. Om bästa resultatet har similarity >= `dedupThreshold` (0.85):
   - Uppdatera befintlig nod: `updateAuroraNode(id, { confidence: Math.min(1, old + 0.1), properties: { text: newText, updatedAt } })`
   - Returnera `{ action: 'updated', existingNodeId }`.
3. Om similarity >= 0.95: det är en exakt duplikat.
   - Returnera `{ action: 'duplicate', existingNodeId }` utan att ändra noden.
4. Om ingen match >= dedupThreshold:
   - Skapa ny nod med `addAuroraNode()`.
   - Skapa `related_to`-kanter till alla resultat med similarity >= 0.5.
   - Returnera `{ action: 'created' }`.

**Titelgenerering:** Använd de första 60 tecknen av texten, trunkera vid ordgräns.

**Graceful degradering:** Om `searchAurora` kastar (DB/Ollama nere), falla tillbaka
till `findAuroraNodes()` med keyword-matchning för dedup-kontrollen.

### 2. CLI-kommando: `aurora:remember` (`src/commands/aurora-remember.ts`)

```typescript
// npx tsx src/cli.ts aurora:remember "Jag föredrar TypeScript framför Python"
// npx tsx src/cli.ts aurora:remember "Neuron HQ använder Vitest" --type fact
// npx tsx src/cli.ts aurora:remember "Svara alltid på svenska" --type preference --scope personal
//
// Output:
// 💾 Remembering...
//   Type: preference | Scope: personal
//
// ✅ Created new memory: "Jag föredrar TypeScript framför..."
//   ID: abc123
//
// --- eller ---
//
// 🔄 Updated existing memory: "Jag föredrar TypeScript"
//   Similarity: 0.91 | Confidence: 0.8 → 0.9
//
// Options:
//   --type <type>       fact | preference (default: fact)
//   --scope <scope>     personal | shared | project (default: personal)
//   --tags <tags>       Comma-separated tags
//   --source <source>   Source of the information
```

Registrera i `src/cli.ts` som `program.command('aurora:remember')`.

### 3. CLI-kommando: `aurora:recall` (`src/commands/aurora-recall.ts`)

```typescript
// npx tsx src/cli.ts aurora:recall "programmeringsspråk"
// npx tsx src/cli.ts aurora:recall "preferences" --type preference
//
// Output:
// 🔍 Recalling from Aurora memory...
//   Found 3 memories
//
// 📝 Memories:
//   [1] "Jag föredrar TypeScript framför Python" (preference, confidence: 0.9)
//       Tags: språk, programmering
//       Related: "Neuron HQ använder Vitest" (related_to)
//
//   [2] "TypeScript har strict mode" (fact, confidence: 0.7)
//
// Options:
//   --type <type>       fact | preference
//   --scope <scope>     personal | shared | project
//   --limit <N>         Max results (default: 10)
```

Registrera i `src/cli.ts` som `program.command('aurora:recall')`.

### 4. CLI-kommando: `aurora:memory-stats` (`src/commands/aurora-memory-stats.ts`)

```typescript
// npx tsx src/cli.ts aurora:memory-stats
//
// Output:
// 📊 Aurora Memory Stats
//   Facts: 42
//   Preferences: 8
//   Total: 50
//   Avg confidence: 0.73
//
//   By scope:
//     personal: 35
//     shared: 10
//     project: 5
```

Registrera i `src/cli.ts` som `program.command('aurora:memory-stats')`.

### 5. MCP-tool: `aurora_remember` (`src/mcp/tools/aurora-remember.ts`)

```typescript
export function registerAuroraRememberTool(server: McpServer): void {
  server.tool(
    'aurora_remember',
    'Save a fact or preference to Aurora memory. Deduplicates against existing memories.',
    {
      text: z.string().min(1).describe('The fact or preference to remember'),
      type: z.enum(['fact', 'preference']).optional().default('fact')
        .describe('Type of memory'),
      scope: z.enum(['personal', 'shared', 'project']).optional().default('personal')
        .describe('Scope of the memory'),
      tags: z.array(z.string()).optional()
        .describe('Tags for categorization'),
      source: z.string().optional()
        .describe('Source of the information'),
    },
    async (args) => {
      // Anropa remember(args.text, { type, scope, tags, source })
      // Returnera { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  );
}
```

### 6. MCP-tool: `aurora_recall` (`src/mcp/tools/aurora-recall.ts`)

```typescript
export function registerAuroraRecallTool(server: McpServer): void {
  server.tool(
    'aurora_recall',
    'Recall relevant facts and preferences from Aurora memory based on a query.',
    {
      query: z.string().min(1).describe('What to recall (topic, question, or keyword)'),
      type: z.enum(['fact', 'preference']).optional()
        .describe('Filter by memory type'),
      scope: z.enum(['personal', 'shared', 'project']).optional()
        .describe('Filter by scope'),
      limit: z.number().min(1).max(50).optional().default(10)
        .describe('Maximum number of memories to return'),
    },
    async (args) => {
      // Anropa recall(args.query, { type, scope, limit })
      // Returnera { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  );
}
```

### 7. MCP-tool: `aurora_memory_stats` (`src/mcp/tools/aurora-memory-stats.ts`)

```typescript
export function registerAuroraMemoryStatsTool(server: McpServer): void {
  server.tool(
    'aurora_memory_stats',
    'Get statistics about Aurora memory (facts, preferences, confidence scores).',
    {},
    async () => {
      // Anropa memoryStats()
      // Returnera { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  );
}
```

### 8. Registrera i MCP-server

Uppdatera `src/mcp/server.ts`:
- `import { registerAuroraRememberTool } from './tools/aurora-remember.js';`
- `import { registerAuroraRecallTool } from './tools/aurora-recall.js';`
- `import { registerAuroraMemoryStatsTool } from './tools/aurora-memory-stats.js';`
- Anropa alla tre `register*`-funktioner.

### 9. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `remember`, `recall`, `memoryStats` från `./memory.js`
- `RememberOptions`, `RememberResult`, `RecallOptions`, `RecallResult`, `Memory`, `MemoryStats` från `./memory.js`

### 10. Tester

**Nya testfiler:**

- `tests/aurora/memory.test.ts`:
  - `remember()` skapar ny fact-nod
  - `remember()` skapar ny preference-nod
  - `remember()` uppdaterar befintlig nod vid hög similarity (dedup)
  - `remember()` returnerar 'duplicate' vid exakt match (>= 0.95)
  - `remember()` skapar related_to-kanter vid medelhög similarity
  - `remember()` fallback till keyword vid DB-fel
  - `recall()` returnerar relevanta minnen
  - `recall()` filtrerar på type
  - `recall()` filtrerar på scope
  - `recall()` inkluderar relaterade noder
  - `memoryStats()` räknar facts och preferences
  - `memoryStats()` beräknar avgConfidence
  - **Mock:** Mocka `searchAurora`, `loadAuroraGraph`, `saveAuroraGraph` (inga riktiga DB-anrop)

- `tests/commands/aurora-remember.test.ts`:
  - CLI visar "Created" vid ny nod
  - CLI visar "Updated" vid dedup
  - `--type preference` sätter rätt typ
  - `--tags` parsas korrekt

- `tests/commands/aurora-recall.test.ts`:
  - CLI visar minnen med confidence
  - `--type` filtrerar
  - `--limit` begränsar resultat
  - Tomt resultat → tydligt meddelande

- `tests/commands/aurora-memory-stats.test.ts`:
  - CLI visar statistik korrekt
  - Hanterar tom databas

- `tests/mcp/tools/aurora-remember.test.ts`:
  - MCP-tool returnerar RememberResult
  - Hanterar alla parametrar
  - Hanterar tom databas

- `tests/mcp/tools/aurora-recall.test.ts`:
  - MCP-tool returnerar RecallResult
  - `limit` parameter fungerar

- `tests/mcp/tools/aurora-memory-stats.test.ts`:
  - MCP-tool returnerar MemoryStats

**Alla befintliga 1187 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen automatisk fact-extraktion** — fakta sparas explicit (automatisk extraktion tillkommer i A6 med agenter)
- **Ingen konversationshistorik** — varje remember/recall är oberoende
- **Inget TTL per nodtyp** — alla noder använder samma decay-funktion
- **Ingen konfliktlösning** — om `contradicts`-kanter hittas loggas det men inget görs automatiskt
- **Inga nya Python-beroenden** — allt i TypeScript

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Spara en preferens
npx tsx src/cli.ts aurora:remember "Jag föredrar TypeScript framför Python" --type preference
# Förväntat: ✅ Created new memory

# Spara samma sak igen → dedup
npx tsx src/cli.ts aurora:remember "TypeScript är bättre än Python för mig" --type preference
# Förväntat: 🔄 Updated existing memory (similarity ~0.85+)

# Hämta minnen
npx tsx src/cli.ts aurora:recall "programmeringsspråk"
# Förväntat: visar preference-noden

# Statistik
npx tsx src/cli.ts aurora:memory-stats
# Förväntat: Facts: 0, Preferences: 1, Total: 1
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `remember()` skapar fact/preference-noder | Enhetstest |
| `remember()` deduplicerar vid hög similarity | Enhetstest |
| `remember()` skapar kanter till relaterade noder | Enhetstest |
| `recall()` hämtar relevanta minnen med sökning | Enhetstest |
| `recall()` filtrerar på type och scope | Enhetstest |
| `memoryStats()` returnerar korrekt statistik | Enhetstest |
| CLI `aurora:remember` sparar och visar resultat | Enhetstest |
| CLI `aurora:recall` visar minnen | Enhetstest |
| CLI `aurora:memory-stats` visar statistik | Enhetstest |
| MCP `aurora_remember` returnerar RememberResult | Enhetstest |
| MCP `aurora_recall` returnerar RecallResult | Enhetstest |
| MCP `aurora_memory_stats` returnerar MemoryStats | Enhetstest |
| Fallback vid DB/Ollama-fel | Enhetstest |
| 1187 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Helt additivt:

1. **Nya filer** — `memory.ts`, 3 CLI-kommandon, 3 MCP-tools
2. **Minimal ändring** — bara `src/mcp/server.ts` (registrera tools) + `src/cli.ts` (registrera kommandon) + `src/aurora/index.ts` (exports)
3. **Ingen Claude API** — remember/recall använder bara lokal sökning (inget API-anrop)
4. **Graceful fallback** — allt fungerar utan Postgres/Ollama

**Rollback:** `git revert <commit>`
