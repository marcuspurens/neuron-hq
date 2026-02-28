# Neuron HQ — Retry vid nätverksavbrott

## Kör-kommando

```bash
# Kör från: /Users/mpmac/Documents/VS Code/neuron-hq
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-25-retry-connection-errors.md --hours 1
```

## Mål

Utöka `withRetry` i `src/core/agents/agent-utils.ts` så att den även hanterar
nätverksavbrott (ETIMEDOUT, ENOTFOUND, ECONNRESET) med exponential backoff.
Idag crashar körningar vid tillfälliga nätverkstapp — de borde återhämta sig automatiskt.

## Bakgrund

`withRetry` hanterar idag bara `overloaded_error`. Vid nätverksfel som:
- `ETIMEDOUT` — anslutning timeout
- `ENOTFOUND` — DNS-fel (api.anthropic.com kan inte nås)
- `ECONNRESET` — anslutning bröts

...kastas felet direkt och körningen misslyckas. Idag (2026-02-25) behövde vi
resumea körningar 4 gånger på grund av detta.

## Uppgifter

### 1. Lägg till `isConnectionError` i `src/core/agents/agent-utils.ts`

```typescript
/**
 * Returns true if an error is a transient network/connection error worth retrying.
 */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    const cause = (error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException | undefined;
    const code = (error as NodeJS.ErrnoException).code ?? cause?.code ?? '';
    return (
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      msg.includes('Connection error') ||
      msg.includes('read ETIMEDOUT') ||
      msg.includes('connect ETIMEDOUT')
    );
  }
  return false;
}
```

### 2. Uppdatera `isRetryableError` (byt namn från inget — lägg till ny hjälpfunktion)

```typescript
/**
 * Returns true if the error is retryable (overloaded or transient connection error).
 */
export function isRetryableError(error: unknown): boolean {
  return isOverloadedError(error) || isConnectionError(error);
}
```

### 3. Uppdatera `withRetry`

Ändra villkoret från:
```typescript
if (!isOverloadedError(error) || attempt === maxAttempts) {
```

Till:
```typescript
if (!isRetryableError(error) || attempt === maxAttempts) {
```

Uppdatera också loggmeddelandet så det visar rätt feltyp:
```typescript
const reason = isOverloadedError(error) ? 'API overloaded' : 'Connection error';
console.log(
  `  ${reason} — retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxAttempts})...`
);
```

### 4. Uppdatera konstanter för connection-retry

Connection-fel kan behöva lite längre initial väntetid:

```typescript
export const CONNECTION_RETRY_BASE_DELAY_MS = 10_000; // 10s, 20s, 40s
```

Använd denna i `withRetry` när det är ett connection-fel:
```typescript
const delay = isConnectionError(error) ? CONNECTION_RETRY_BASE_DELAY_MS : baseDelayMs;
const delayMs = delay * Math.pow(2, attempt - 1);
```

### 5. Tester i `tests/core/agent-utils.test.ts`

Lägg till tester för:
- `isConnectionError` returnerar true för ETIMEDOUT, ENOTFOUND, ECONNRESET
- `isConnectionError` returnerar false för overloaded_error och andra fel
- `isRetryableError` returnerar true för både overloaded och connection-fel
- `withRetry` retryar vid connection-fel (mocka ett ETIMEDOUT som lyckas på attempt 2)
- `withRetry` kastar direkt vid icke-retrybart fel

## Verifiering

```bash
pnpm typecheck
pnpm test
```

Förväntat: alla 329+ tester gröna, inga TypeScript-fel.

## Avgränsningar

- Ändra INTE antalet max-försök (`MAX_RETRY_ATTEMPTS = 3`) — räcker för tillfälliga avbrott
- Ändra INTE hur `withRetry` anropas i agenterna — signaturen förblir densamma
- Retry gäller BARA API-anrop via `withRetry`, inte filsystem eller bash-kommandon
