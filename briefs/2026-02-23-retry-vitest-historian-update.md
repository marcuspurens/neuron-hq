# Brief: API-retry + Vitest-fix + Historian update-in-place
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #12
**Estimerad tid:** 1 timme

---

## Bakgrund

Tre förbättringar med tydlig motivering från körning #11:

**Problem 1 — Alla agentloopar kraschar direkt på overloaded_error**
Körning #11 kraschade tre gånger i rad på `APIConnectionError: overloaded_error`. Inget av de 8 agentlooparna (Manager, Implementer, Reviewer, Researcher, Merger, Historian, Tester, Librarian) har retry-logik. En `withRetry()`-helper med exponential backoff (5s → 10s → 20s, max 3 försök) löser detta.

**Problem 2 — Vitest kör workspace-kopior av tester**
`vitest.config.ts` saknar `exclude` för `workspaces/`. Varje workspace-kopia av neuron-hq innehåller en `tests/`-mapp som Vitest hittar och kör. Istället för 173 tester körs ~846 (4 workspace-kopior × ~170 + ursprungliga 173). En enkel `exclude`-rad fixar detta.

**Problem 3 — Historian saknar verktyg för att uppdatera befintliga poster**
Prompten instruerar nu Historian att "uppdatera in place", men `write_to_memory` kan bara appenda. Historian behöver ett nytt verktyg `update_error_status(title, new_status)` som söker upp rätt `## `-sektion i errors.md och ersätter `**Status:**`-raden.

**Baseline (2026-02-23):**
```
npm test → 173/173 passed (i tests/ — totalt ~846 inkl. workspace-kopior)
npx tsc --noEmit → 0 errors
```

---

## Uppgift 1 — Implementer: withRetry() i agent-utils

### 1a. Lägg till `withRetry` i `src/core/agents/agent-utils.ts`

Lägg till detta i slutet av filen:

```typescript
/**
 * Maximum number of retry attempts for overloaded API errors.
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay in ms for exponential backoff: 5s, 10s, 20s.
 */
export const RETRY_BASE_DELAY_MS = 5_000;

/**
 * Returns true if an error is an Anthropic overloaded_error.
 */
export function isOverloadedError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('overloaded_error');
  }
  return false;
}

/**
 * Execute an async function with exponential backoff retry on overloaded_error.
 * Retries up to maxAttempts times. Other errors are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  baseDelayMs = RETRY_BASE_DELAY_MS
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isOverloadedError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(
        `  API overloaded — retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxAttempts})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // TypeScript: unreachable, but needed for type safety
  throw new Error('withRetry: exhausted all attempts');
}
```

### 1b. Tillämpa `withRetry` i alla 8 agentloopar

I varje agent finns ett mönster liknande detta i agenloopen:
```typescript
const stream = this.anthropic.messages.stream({...});
let prefixPrinted = false;
stream.on('text', (text) => { ... });
const response = await stream.finalMessage();
```

Ersätt detta med:
```typescript
const response = await withRetry(async () => {
  let prefixPrinted = false;
  const stream = this.anthropic.messages.stream({...});
  stream.on('text', (text) => { ... });
  return await stream.finalMessage();
});
```

Tillämpa i alla 8 agenter:
- `src/core/agents/manager.ts`
- `src/core/agents/implementer.ts`
- `src/core/agents/reviewer.ts`
- `src/core/agents/researcher.ts`
- `src/core/agents/merger.ts`
- `src/core/agents/historian.ts`
- `src/core/agents/tester.ts`
- `src/core/agents/librarian.ts`

Importera `withRetry` i varje fil: `import { ..., withRetry } from './agent-utils.js';`

**Obs:** Kontrollera att `prefixPrinted` och `process.stdout.write`-logiken fungerar korrekt när `withRetry` omslutar blocket. Vid retry skrivs output om från början — det är OK.

---

## Uppgift 2 — Implementer: Vitest exclude workspaces

### 2a. Uppdatera `vitest.config.ts`

Läs filen. Lägg till `exclude`-lista:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['workspaces/**', 'runs/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

**Förväntad effekt:** `npm test` kör nu 173 tester (inte ~846). Snabbare och tydligare.

---

## Uppgift 3 — Implementer: Historian update_error_status-verktyg

### 3a. Lägg till verktyg i `src/core/agents/historian.ts`

I `defineTools()`-metoden, lägg till ett nytt verktyg efter `write_to_memory`:

```typescript
{
  name: 'update_error_status',
  description:
    'Update the **Status:** line of an existing entry in memory/errors.md. ' +
    'Use this instead of write_to_memory when closing an existing ⚠️ entry. ' +
    'Finds the section by title and replaces its Status line in place.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The exact section title (text after ## ) of the entry to update',
      },
      new_status: {
        type: 'string',
        description:
          'The new status text, e.g. "✅ Löst — fixed in run #12 by adding withRetry()"',
      },
    },
    required: ['title', 'new_status'],
  },
},
```

### 3b. Implementera `executeUpdateErrorStatus` i `historian.ts`

Lägg till metoden i `HistorianAgent`-klassen:

```typescript
private async executeUpdateErrorStatus(input: {
  title: string;
  new_status: string;
}): Promise<string> {
  const { title, new_status } = input;
  const filePath = path.join(this.memoryDir, 'errors.md');

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return `Error: errors.md not found`;
  }

  // Find the section with the exact title
  const sectionRegex = new RegExp(
    `(## ${escapeRegex(title)}\\n[\\s\\S]*?\\*\\*Status:\\*\\*)([^\\n]*)`,
    'g'
  );

  if (!sectionRegex.test(content)) {
    return `Error: Section "${title}" not found in errors.md, or it has no **Status:** line`;
  }

  const updated = content.replace(
    new RegExp(
      `(## ${escapeRegex(title)}\\n[\\s\\S]*?\\*\\*Status:\\*\\*)([^\\n]*)`,
      'g'
    ),
    `$1 ${new_status}`
  );

  await fs.writeFile(filePath, updated, 'utf-8');
  await this.ctx.audit.log({
    ts: new Date().toISOString(),
    role: 'historian',
    tool: 'update_error_status',
    allowed: true,
    files_touched: [filePath],
    note: `Updated status of "${title}" to: ${new_status}`,
  });

  return `Updated status of "${title}" in errors.md`;
}
```

Lägg till hjälpfunktionen `escapeRegex` i samma fil (privat, ej exporterad):

```typescript
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 3c. Koppla verktyget i `executeTools`

I `switch`-satsen i `executeTools`, lägg till:

```typescript
case 'update_error_status':
  result = await this.executeUpdateErrorStatus(
    block.input as { title: string; new_status: string }
  );
  break;
```

### 3d. Uppdatera `prompts/historian.md` Tools-sektion

Lägg till i Tools-listan:
```markdown
- **update_error_status**: Update the **Status:** line of an existing ⚠️ entry in errors.md. Use this when closing a known error — do NOT use write_to_memory to create a duplicate entry.
```

---

## Uppgift 4 — Tester

### 4a. Lägg till tester i `tests/core/agent-utils.test.ts`

Lägg till ett nytt `describe`-block:

```typescript
describe('withRetry', () => {
  it('returns result immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on overloaded_error and succeeds on second attempt', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('{"type":"error","error":{"type":"overloaded_error"}}');
        return 'success';
      },
      3,
      0 // no delay in tests
    );
    expect(result).toBe('success');
    expect(calls).toBe(2);
  });

  it('throws after maxAttempts retries on overloaded_error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('{"type":"error","error":{"type":"overloaded_error"}}');
        },
        3,
        0
      )
    ).rejects.toThrow('overloaded_error');
    expect(calls).toBe(3);
  });

  it('throws immediately on non-overloaded errors without retry', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('Some other API error');
      }, 3, 0)
    ).rejects.toThrow('Some other API error');
    expect(calls).toBe(1);
  });
});

describe('isOverloadedError', () => {
  it('returns true for overloaded_error message', () => {
    expect(isOverloadedError(new Error('{"type":"overloaded_error"}'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isOverloadedError(new Error('rate_limit_error'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isOverloadedError('string error')).toBe(false);
    expect(isOverloadedError(null)).toBe(false);
  });
});
```

### 4b. Lägg till test i `tests/agents/historian.test.ts`

Lägg till ett test för `update_error_status` i det befintliga test-filen.
Läs filen och placera testet på lämplig plats (efter befintliga tester för `executeWriteToMemory`).

Testa att:
- `update_error_status` med existerande titel uppdaterar korrekt status
- `update_error_status` med okänd titel returnerar error-meddelande

---

## Uppgift 5 — Verifiering

```bash
npm test
npx tsc --noEmit
```

Förväntad utdata:
- `npm test` → **173 tester** (inte ~846 — workspace-kopiorna exkluderas nu)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 6 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `src/core/agents/agent-utils.ts` har `withRetry`, `isOverloadedError`, exporterade konstanter
2. ✅ Alla 8 agenter använder `withRetry` runt sina `messages.stream()`-anrop
3. ✅ `vitest.config.ts` exkluderar `workspaces/**` och `runs/**`
4. ✅ `npm test` kör exakt 173 tester (inte ~846)
5. ✅ `src/core/agents/historian.ts` har `update_error_status`-verktyg + metod
6. ✅ `prompts/historian.md` är uppdaterad med ny verktyg-beskrivning
7. ✅ Tester för `withRetry` + `isOverloadedError` + historian update_error_status
8. ✅ `npx tsc --noEmit` → 0 errors
9. ✅ Git commit med korrekta filer

---

## Uppgift 7 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Auto-trigger: körning #12 triggar INTE Librarian (nästa trigger vid #15, runs.md har 11 entries)
- withRetry delay i tester: använd `baseDelayMs = 0` för att undvika timeouts i tester
- Historian update_error_status: regex-matchning på titel är case-sensitiv och matchar exakt `## <title>` — viktigt att dokumentera detta i tool-description
- TypeScript: `withRetry<T>` är generisk och behöver ingen explicit typannotering vid anrop i agenter
