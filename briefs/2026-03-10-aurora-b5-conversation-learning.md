# Brief: B5 — Conversation-level learning

## Bakgrund

Aurora kan idag lära sig enskilda fakta via `remember()` och indexera dokument
via `ingestUrl()`/`ingestDocument()`. Men det finns inget sätt att ta en hel
konversation — t.ex. en Claude Desktop-session — och extrahera alla fakta,
preferenser och beslut ur den på en gång.

Det är just detta användningsmönstret som ger störst värde: efter ett långt
samtal med Claude vill Marcus kunna säga "lär dig från denna konversation"
och få all ny kunskap automatiskt indexerad.

## Uppgifter

### 1. Konversationsmodell

Skapa `src/aurora/conversation.ts`:

```typescript
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LearnedItem {
  type: 'fact' | 'preference' | 'decision' | 'insight';
  text: string;
  confidence: number;
  source: string; // "conversation"
}

export interface ConversationLearningResult {
  /** Number of items extracted from the conversation. */
  itemsExtracted: number;
  /** Number of items that were new (not duplicates). */
  itemsNew: number;
  /** Number of items that were duplicates of existing knowledge. */
  itemsDuplicate: number;
  /** Details of each extracted item. */
  items: LearnedItem[];
}
```

### 2. Extraktion utan LLM

Implementera `extractFromConversation()` i `src/aurora/conversation.ts`:

```typescript
/**
 * Extraherar fakta, preferenser och beslut från en konversationshistorik.
 * Använder heuristik (nyckelord, mönster) — inte LLM-anrop.
 *
 * Mönster att detektera:
 * - "Jag föredrar X" / "I prefer X" → preference
 * - "Vi bestämde att X" / "We decided X" / "Let's go with X" → decision
 * - "X fungerar bra/dåligt" / "X works well/doesn't work" → fact
 * - "Viktigt: X" / "Important: X" / "Notera: X" → insight
 * - "Kom ihåg att X" / "Remember that X" → fact
 *
 * Varje extraherad item får confidence 0.6 (heuristik, inte verifierad).
 */
export async function extractFromConversation(
  messages: ConversationMessage[],
): Promise<LearnedItem[]>
```

Regler:
- Bara `user`-meddelanden extraheras (assistentens svar är inte "kunskap")
- Minst 5 ord i extraherad text för att undvika brus
- Deduplicera inom konversationen (exakt match)
- Om inget matchas → tom lista (det är OK)

### 3. Lärfunktion

Implementera `learnFromConversation()` i `src/aurora/conversation.ts`:

```typescript
/**
 * Full pipeline: extrahera → dedup mot befintligt minne → remember().
 * Returnerar sammanfattning av vad som lärdes.
 */
export async function learnFromConversation(
  messages: ConversationMessage[],
  options?: {
    /** Minimum confidence to store. Default: 0.5. */
    minConfidence?: number;
    /** Dry run — don't actually store, just report what would be learned. */
    dryRun?: boolean;
  },
): Promise<ConversationLearningResult>
```

Steg:
1. `extractFromConversation(messages)` — heuristisk extraktion
2. För varje item: `recall(item.text, { limit: 1 })` — kolla om liknande finns
3. Om recall returnerar match med similarity >= 0.8 → markera som duplicate
4. Om inte duplicate och inte dryRun: `remember(item.text, { type, confidence })`
5. Returnera sammanställning

### 4. CLI: aurora:learn-conversation

Skapa `src/commands/aurora-learn-conversation.ts`:

```typescript
/**
 * Läser en konversationsfil (JSON-array av {role, content}) och lär sig.
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:learn-conversation <file.json>
 *   npx tsx src/cli.ts aurora:learn-conversation <file.json> --dry-run
 */
```

Registrera i `src/cli.ts`:
```typescript
program
  .command('aurora:learn-conversation <file>')
  .description('Learn facts and preferences from a conversation JSON file')
  .option('--dry-run', 'Show what would be learned without storing')
  .action(async (file, options) => {
    const { auroraLearnConversationCommand } = await import('./commands/aurora-learn-conversation.js');
    await auroraLearnConversationCommand(file, options);
  });
```

Output-format:
```
Learning from conversation (42 messages)...

Extracted 5 items:
  ✓ [preference] "Föredrar TypeScript över Python för backend"
  ✓ [decision]   "Valde PostgreSQL istället för SQLite"
  ✗ [fact]        "Retry med backoff fungerar bra" (duplicate)
  ✓ [fact]        "snowflake-arctic-embed returnerar 1024 dimensioner"
  ✓ [insight]     "Policy-perimetern förhindrar 95% av farliga kommandon"

Result: 4 new items stored, 1 duplicate skipped
```

### 5. MCP-tool: aurora_learn_conversation

I MCP-servern, lägg till:

```typescript
{
  name: 'aurora_learn_conversation',
  description: 'Extract and learn facts, preferences, and decisions from a conversation',
  input_schema: {
    type: 'object',
    properties: {
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
          },
          required: ['role', 'content'],
        },
        description: 'Conversation messages to learn from',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview without storing (default false)',
      },
    },
    required: ['messages'],
  },
}
```

Handler anropar `learnFromConversation()` och returnerar JSON.

### 6. Tester

**`tests/aurora/conversation.test.ts`** — ny testfil:

- `extractFromConversation()` — extraherar preference från "Jag föredrar X"
- `extractFromConversation()` — extraherar decision från "Vi bestämde att X"
- `extractFromConversation()` — extraherar fact från "X fungerar bra"
- `extractFromConversation()` — extraherar insight från "Viktigt: X"
- `extractFromConversation()` — ignorerar assistant-meddelanden
- `extractFromConversation()` — ignorerar korta texter (< 5 ord)
- `extractFromConversation()` — deduplicerar inom konversationen
- `extractFromConversation()` — returnerar tom lista vid inga matcher
- `learnFromConversation()` — anropar remember() för nya items
- `learnFromConversation()` — skippar duplicates (recall match >= 0.8)
- `learnFromConversation()` — dry-run lagrar ingenting
- `learnFromConversation()` — returnerar korrekt sammanställning

**`tests/commands/aurora-learn-conversation.test.ts`** — CLI-tester:
- Läser fil och visar extraktion
- Visar "No items extracted" vid tom konversation
- --dry-run flaggan fungerar

**Alla befintliga 1454 tester ska passera oförändrade.**

## Avgränsningar

- **Heuristisk extraktion** — inga LLM-anrop. Enklare men billigare och
  snabbare. LLM-baserad extraktion kan läggas till som förbättring senare.
- **Bara user-meddelanden** — assistentens svar behandlas inte som kunskap.
- **JSON-format** — konversationen måste vara en JSON-array av `{role, content}`.
  Inget stöd för andra format (markdown, chat-log) i denna brief.
- **Engelska + svenska** — mönstren stöder båda språken men inte andra.

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `extractFromConversation()` hittar preferences | Enhetstest |
| `extractFromConversation()` hittar decisions | Enhetstest |
| `extractFromConversation()` hittar facts | Enhetstest |
| `extractFromConversation()` ignorerar assistant-meddelanden | Enhetstest |
| `extractFromConversation()` deduplicerar | Enhetstest |
| `learnFromConversation()` lagrar nya items | Enhetstest |
| `learnFromConversation()` skippar duplicates | Enhetstest |
| `learnFromConversation()` dry-run fungerar | Enhetstest |
| CLI `aurora:learn-conversation` fungerar | Enhetstest |
| MCP `aurora_learn_conversation` fungerar | Enhetstest |
| Befintliga 1454 tester passerar | `pnpm test` |

## Risk

**Låg.** Helt nytt modul utan ändringar i befintlig kod:
1. Ny fil `src/aurora/conversation.ts` — inga beroenden som ändras
2. `remember()` och `recall()` anropas bara — inte modifierade
3. CLI och MCP är additivt
4. Heuristisk extraktion har inga sidoeffekter

**Rollback:** `git revert <commit>`
