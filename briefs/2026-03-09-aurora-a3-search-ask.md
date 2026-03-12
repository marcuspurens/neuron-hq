# Brief: A3 — Sökning + ask-pipeline

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-09-aurora-a3-search-ask.md --hours 2
```

## Bakgrund

A1 och A2 skapade Aurora-infrastrukturen: tabeller, CRUD, intake-pipeline, och
semantisk sökning (`aurora_search` MCP-tool). Nu behövs **ask-pipelinen** —
möjligheten att ställa frågor mot Aurora-minnet och få svar med källor.

Alla byggstenar finns redan:
- `semanticSearch()` fungerar med `table: 'aurora_nodes'` (A1.1)
- `createAgentClient()` finns i `src/core/agent-client.ts` (för Claude API-anrop)
- `aurora_search` MCP-tool finns (A1.1)

Det som saknas: en ask-funktion som söker → samlar kontext → anropar Claude →
returnerar svar med citeringar.

## Problem

1. **Ingen ask-pipeline** — man kan söka men inte ställa frågor och få syntetiserade svar
2. **Ingen kontextformatering** — sökresultat behöver formateras som kontext för LLM
3. **Inga citeringar** — svar bör referera till specifika noder/dokument

## Lösning

Skapa `src/aurora/ask.ts` med en ask-pipeline: fråga → semantisk sökning →
kontextformatering → Claude-anrop → strukturerat svar med citeringar.

### Arkitektur

```
Användare
    │
    ▼
aurora:ask "Vad handlar TypeScript om?"
    │
    ▼
semanticSearch(query, { table: 'aurora_nodes' })
    │  → top 10 noder med similarity score
    ▼
formatContext(results)
    │  → formatera noder som kontext-block
    ▼
createAgentClient() → Claude
    │  → system: "du är Aurora, en personlig kunskapsassistent"
    │  → user: kontext + fråga
    ▼
parseResponse()
    │  → svar + citeringar
    ▼
{ answer, citations, sources }
```

## Uppgifter

### 1. Ask-pipeline (`src/aurora/ask.ts`)

```typescript
import { semanticSearch, SemanticResult } from '../core/semantic-search.js';
import { createAgentClient } from '../core/agent-client.js';
import { getModelConfig } from '../core/model-registry.js';

export interface AskOptions {
  /** Max antal sökresultat att använda som kontext. Default: 10. */
  maxSources?: number;
  /** Minimum similarity score för sökresultat. Default: 0.3. */
  minSimilarity?: number;
  /** Filtrera på nodtyp. */
  type?: string;
  /** Filtrera på scope. */
  scope?: string;
  /** Max tokens i svaret. Default: 1024. */
  maxTokens?: number;
}

export interface AskResult {
  /** Det syntetiserade svaret. */
  answer: string;
  /** Citeringar — vilka noder svaret baseras på. */
  citations: Citation[];
  /** Antal sökresultat som användes som kontext. */
  sourcesUsed: number;
  /** Om inga relevanta källor hittades. */
  noSourcesFound: boolean;
}

export interface Citation {
  /** Aurora-nodens ID. */
  nodeId: string;
  /** Nodens titel. */
  title: string;
  /** Typ (document, fact, etc.). */
  type: string;
  /** Similarity score (0–1). */
  similarity: number;
}

/**
 * Ställ en fråga mot Aurora-minnet.
 *
 * Flöde:
 * 1. Semantisk sökning i aurora_nodes
 * 2. Formatera sökresultat som kontext
 * 3. Anropa Claude med kontext + fråga
 * 4. Extrahera svar + citeringar
 */
export async function ask(
  question: string,
  options?: AskOptions,
): Promise<AskResult>;

/**
 * Formatera sökresultat som kontext-block för LLM.
 *
 * Format per nod:
 * [Source 1: "Titel" (document, similarity: 0.87)]
 * <text från properties.text>
 */
export function formatContext(results: SemanticResult[]): string;
```

**Systemmeddelande för Claude:**

```
Du är Aurora, en personlig kunskapsassistent. Du svarar på frågor baserat på
dokumenten i din kunskapsbas. Svara alltid på samma språk som frågan.

Regler:
- Basera ditt svar ENBART på de källor som ges nedan
- Om källorna inte innehåller tillräcklig information, säg det tydligt
- Referera till källor med [Source N] i ditt svar
- Var koncis men grundlig
- Om frågan är på svenska, svara på svenska
```

**Användarmeddelande:**

```
## Källor

[Source 1: "Titel" (document, similarity: 0.87)]
<text>

[Source 2: "Titel" (fact, similarity: 0.72)]
<text>

...

## Fråga

<question>
```

**Hantering av "inga källor":** Om `semanticSearch` returnerar 0 resultat, returnera
`{ answer: "Inga relevanta källor hittades...", citations: [], sourcesUsed: 0, noSourcesFound: true }`
utan att anropa Claude.

**Claude-anrop:** Använd `createAgentClient(getModelConfig('researcher'))` för att
använda forskaragentens modell (Haiku — billigare för frågor). Om `getModelConfig`
inte finns som export, använd defaultkonfigurationen.

**OBS:** `ask()` måste fungera UTAN Postgres/Ollama — om `semanticSearch` kastar,
falla tillbaka till `findAuroraNodes` med keyword-matchning, precis som `aurora_search`
gör. Graciös degradering.

### 2. Enhanced search (`src/aurora/search.ts`)

Utökad sökfunktion som kombinerar semantisk sökning med graftraversering.

```typescript
export interface SearchOptions {
  /** Max resultat. Default: 10. */
  limit?: number;
  /** Minimum similarity. Default: 0.3. */
  minSimilarity?: number;
  /** Filtrera nodtyp. */
  type?: string;
  /** Filtrera scope. */
  scope?: string;
  /** Inkludera relaterade noder via grafkanter. Default: true. */
  includeRelated?: boolean;
  /** Max djup för graftraversering. Default: 1. */
  traversalDepth?: number;
}

export interface SearchResult {
  /** Noden. */
  id: string;
  title: string;
  type: string;
  /** Similarity score (0–1) eller null om hittad via traversering. */
  similarity: number | null;
  /** Confidence (0–1). */
  confidence: number;
  /** Scope. */
  scope: string;
  /** Text-innehåll (från properties.text). */
  text?: string;
  /** Hur noden hittades. */
  source: 'semantic' | 'keyword' | 'traversal';
  /** Relaterade noder (om includeRelated). */
  related?: { id: string; title: string; edgeType: string }[];
}

/**
 * Sök i Aurora-minnet med semantisk sökning + graftraversering.
 *
 * 1. Kör semanticSearch mot aurora_nodes
 * 2. För varje resultat: hämta relaterade noder via traverseAurora
 * 3. Dedup + sortera efter similarity
 * 4. Hämta properties.text för varje nod
 */
export async function searchAurora(
  query: string,
  options?: SearchOptions,
): Promise<SearchResult[]>;
```

**Graftraversering:** Om en sökning hittar en chunk-nod, traversera `derived_from`-kanten
uppåt till dokument-noden och inkludera den som relaterad. Om en fact-nod har
`supports`-kant till en annan nod, inkludera den också.

### 3. CLI-kommando: `aurora:ask` (`src/commands/aurora-ask.ts`)

```typescript
// npx tsx src/cli.ts aurora:ask "Vad handlar README om?"
// npx tsx src/cli.ts aurora:ask "What is Neuron HQ?" --max-sources 5
//
// Output:
// 🔍 Searching Aurora knowledge base...
//   Found 5 relevant sources
//
// 📝 Answer:
//   Neuron HQ is a control plane for autonomous agent swarms...
//   [Source 1] [Source 3]
//
// 📚 Sources:
//   [1] "README" (document, similarity: 0.92)
//   [2] "README [chunk 1/4]" (document, similarity: 0.87)
//   ...
//
// Options:
//   --max-sources <N>     Max sources (default: 10)
//   --type <type>         Filter by node type
//   --scope <scope>       Filter by scope
```

Registrera i `src/cli.ts` som `program.command('aurora:ask')`.

### 4. MCP-tool: `aurora_ask` (`src/mcp/tools/aurora-ask.ts`)

```typescript
// Tool: aurora_ask
// Input:
//   question: string (required) — frågan att besvara
//   type: enum (optional) — filtrera nodtyp
//   scope: enum (optional) — filtrera scope
//   max_sources: number (optional, default 10, max 20)
// Output: JSON med { answer, citations, sourcesUsed, noSourcesFound }

export function registerAuroraAskTool(server: McpServer): void {
  server.tool(
    'aurora_ask',
    'Ask a question and get an answer synthesized from Aurora knowledge base documents, with citations.',
    {
      question: z.string().min(1).describe('The question to answer'),
      type: z.enum([...]).optional().describe('Filter by node type'),
      scope: z.enum([...]).optional().describe('Filter by scope'),
      max_sources: z.number().min(1).max(20).optional().default(10)
        .describe('Maximum number of sources to use as context'),
    },
    async (args) => {
      // Anropa ask(args.question, { maxSources: args.max_sources, type: args.type, scope: args.scope })
      // Returnera { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  );
}
```

Registrera i `src/mcp/server.ts` via `registerAuroraAskTool(server)`.

### 5. Uppdatera `aurora_search` MCP-tool

Uppdatera befintlig `aurora_search` att använda den nya `searchAurora()` från
`search.ts` istället för att anropa `semanticSearch()` direkt. Detta ger
graftraversering och rikare resultat.

**Minimal ändring:** Byt ut `semanticSearch()`-anropet mot `searchAurora()`,
behåll fallback-logiken.

### 6. Exportera från `src/aurora/index.ts`

Lägg till exports:
- `ask`, `AskResult`, `AskOptions`, `Citation` från `./ask.js`
- `searchAurora`, `SearchResult`, `SearchOptions` från `./search.js`

### 7. Tester

**Nya testfiler:**

- `tests/aurora/ask.test.ts`:
  - `ask()` returnerar svar med citeringar
  - `ask()` utan källor → `noSourcesFound: true`, inget Claude-anrop
  - `formatContext()` formaterar korrekt
  - Citeringar matchar sökresultat
  - Fallback till keyword vid DB-fel
  - **Mock:** Mocka `semanticSearch` + `createAgentClient` (inget riktigt API-anrop)

- `tests/aurora/search.test.ts`:
  - `searchAurora()` returnerar semantiska resultat
  - Graftraversering hittar relaterade noder
  - Dedup fungerar (samma nod hittas via semantik och traversering)
  - `includeRelated: false` skippar traversering
  - Fallback vid DB-fel

- `tests/commands/aurora-ask.test.ts`:
  - CLI-output innehåller svar och källor
  - `--max-sources` begränsar kontext
  - Felmeddelande vid tomt sökresultat

- `tests/mcp/tools/aurora-ask.test.ts`:
  - MCP-tool returnerar AskResult
  - Hanterar tom databas gracefully
  - `max_sources` parameter fungerar

**Alla befintliga 1162 tester ska passera oförändrade.**

## Avgränsningar

- **Inget minne av konversation** — varje fråga är oberoende (conversation memory tillkommer i A4)
- **Ingen streaming** — svar returneras som heltext (streaming kan läggas till senare)
- **Ingen analys-pipeline** — bara syntes (analysagent tillkommer i A6)
- **Ingen cachelagring** — samma fråga kör ny sökning varje gång
- **Använder befintlig Claude-klient** — inga nya API-beroenden

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Manuell verifiering

```bash
# Testa CLI (kräver ANTHROPIC_API_KEY + Ollama + Postgres)
npx tsx src/cli.ts aurora:ask "What is Neuron HQ?"
# Förväntat: svar baserat på README-noden + citeringar

npx tsx src/cli.ts aurora:ask "Vilka agentroller finns?"
# Förväntat: svar på svenska med Manager, Implementer, Reviewer, Researcher

npx tsx src/cli.ts aurora:ask "Vad handlar kvantfysik om?"
# Förväntat: "Inga relevanta källor hittades" (inget om kvantfysik i Aurora)
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `ask()` söker i aurora_nodes och returnerar svar med citeringar | Enhetstest (mock) |
| `ask()` utan relevanta källor → tydligt meddelande, inget API-anrop | Enhetstest |
| `formatContext()` formaterar noder som LLM-kontext | Enhetstest |
| `searchAurora()` kombinerar semantisk sökning + graftraversering | Enhetstest |
| `searchAurora()` deduplicerar resultat | Enhetstest |
| CLI `aurora:ask` visar svar + källor | Enhetstest |
| MCP `aurora_ask` returnerar AskResult JSON | Enhetstest |
| `aurora_search` uppdaterad att använda `searchAurora()` | Enhetstest |
| Fallback vid DB/Ollama-fel | Enhetstest |
| 1162 befintliga tester passerar | `pnpm test` |

## Risk

**Låg.** Mest additivt:

1. **Nya filer** — `ask.ts`, `search.ts`, CLI, MCP-tool
2. **Minimal ändring** — bara `aurora_search` uppdateras att använda `searchAurora()`
3. **Claude API-anrop** — bara i `ask()`, mockat i alla tester
4. **Graceful fallback** — allt fungerar utan Postgres/Ollama/API

**Rollback:** `git revert <commit>`
