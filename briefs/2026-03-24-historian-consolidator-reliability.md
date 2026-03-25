# Brief: 3.6 Historian/Consolidator reliability — 0-token retry + diagnostik

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Fas 3 — Agent-mognad, punkt 3.6
**Prioritet:** KRITISK — dataförlust vid tysta 0-token-svar

## Bakgrund

API:et returnerar ibland HTTP 200 med 0 output tokens. Historian och Consolidator tappar data tyst i dessa fall. Nuvarande skydd: en enda retry med 5s delay, enbart på iteration 1 (historian.ts:239, consolidator.ts:175). Om det händer på iteration 2+ ignoreras det.

`withRetry()` i agent-utils.ts (rad 214) fångar bara HTTP-fel (overloaded/connection). 0-token-svar ser ut som lyckade anrop och passerar rakt igenom.

**Resultat:** Historian missar att skriva körningshistorik. Consolidator missar att konsolidera kunskapsgrafen. Observer rapporterar inte att detta hände.

## Designbeslut

### 1. Gemensam 0-token-retry i agent-utils.ts (DRY)

Historian och Consolidator har identisk 0-token-logik (copy-paste). Extrahera till en ny utility-funktion `streamWithEmptyRetry()` i agent-utils.ts. Båda agenterna anropar den.

### 2. 3 retries med exponentiell backoff

Backoff: 5s, 15s, 30s (totalt max ~50s). Oavsett iteration — inte bara på iteration 1.

### 3. Diagnostiklogg vid varje 0-token-svar

Logga med befintlig `createLogger()`:
- Agentroll (historian/consolidator)
- Iteration
- System prompt storlek (chars)
- Messages storlek (estimerat med `estimateMessagesChars()` som redan finns i agent-utils.ts:37)
- Modell
- Retry-nummer (1/3, 2/3, 3/3)

### 4. Fallback till icke-streaming efter 3 misslyckade streaming-försök

Om alla 3 streaming-retries ger 0 tokens: gör ETT anrop med `client.messages.create()` istället för `client.messages.stream()`. Streaming-buggar i SDK:n kan orsaka 0-token — icke-streaming kringgår det.

### 5. Observer awareness — flagga 0-token-agenter

Observer.ts `analyzeRun()` (rad 411) utökas med en ny check `checkZeroTokenAgents()` som flaggar agenter med 0 output tokens som WARNING.

## Vad ska byggas

### 1. agent-utils.ts — `streamWithEmptyRetry()` + `isEmptyResponse()`

Ny funktion som tar ett `Anthropic.Message` response och returnerar `true` om `output_tokens === 0`:

```typescript
export function isEmptyResponse(response: Anthropic.Message): boolean {
  return response.usage.output_tokens === 0;
}
```

Ny funktion som kapslar in streaming-anropet med 0-token-retry + diagnostik + fallback:

```typescript
export interface StreamWithRetryOptions {
  client: Anthropic;
  model: string;
  maxTokens: number;
  system: Anthropic.MessageCreateParams['system'];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  agent: string;                    // för logging
  iteration?: number;               // för diagnostik (default 0)
  onText?: (text: string) => void;  // streaming text callback
}

export async function streamWithEmptyRetry(
  opts: StreamWithRetryOptions,
  maxEmptyRetries?: number,  // default 3
): Promise<Anthropic.Message>
```

**Logik:**
1. Streaming-anrop via `client.messages.stream()` (som idag)
2. Om `output_tokens === 0`: logga diagnostik, vänta backoff, retry (upp till 3 gånger)
3. Efter 3 misslyckade streaming-retries: fallback till `client.messages.create()` (icke-streaming, 1 försök)
4. Om fallback också ger 0 tokens: logga WARN och returnera svaret ändå (anroparen hanterar)

**Backoff-sekvens:** `EMPTY_RETRY_DELAYS = [5_000, 15_000, 30_000]` (exporterad konstant för testbarhet).

**Diagnostik-logg vid varje 0-token:**
```
logger.warn('Empty response (0 output tokens)', {
  agent, iteration, retryAttempt, maxRetries,
  systemPromptChars, messagesChars, model
})
```

### 2. historian.ts — använd `streamWithEmptyRetry()`

I `runAgentLoop()` (rad 174-275):
- **Ta bort** den befintliga 0-token-hanteringen (rad 239-243)
- **Ersätt** `withRetry(async () => { ... stream ... })` (rad 199-220) med `streamWithEmptyRetry()` som wrappas i `withRetry()` (behåll HTTP-error-retry):

```typescript
const response = await withRetry(async () => {
  return streamWithEmptyRetry({
    client: this.client,
    model: this.model,
    maxTokens: this.modelMaxTokens,
    system: buildCachedSystemBlocks(systemPrompt),
    messages,
    tools: this.defineTools(),
    agent: 'historian',
    iteration,
    onText: (text) => {
      if (!prefixPrinted) {
        process.stdout.write('\n[Historian] ');
        prefixPrinted = true;
      }
      process.stdout.write(text);
    },
  });
});
```

### 3. consolidator.ts — samma ändring

I `runAgentLoop()` (rad 112-211):
- **Ta bort** befintlig 0-token-hantering (rad 175-179)
- **Ersätt** streaming-koden (rad 135-156) med `streamWithEmptyRetry()` på samma sätt som historian

### 4. observer.ts — `checkZeroTokenAgents()`

Ny privat metod:

```typescript
private checkZeroTokenAgents(): void {
  for (const [agent, usage] of this.tokenUsage) {
    if (usage.outputTokens === 0 && this.agentDelegations.has(agent)) {
      this.observations.push({
        timestamp: new Date().toISOString(),
        agent,
        type: 'absence',
        severity: 'WARNING',
        promptClaim: 'Agent should produce output tokens',
        actualBehavior: `${agent} produced 0 output tokens (${usage.inputTokens} input tokens consumed)`,
        evidence: `Model: ${usage.model}, total cost: $${usage.cost.toFixed(2)}`,
      });
    }
  }
}
```

Anropa i `analyzeRun()` (rad 411-419), efter befintliga checks:

```typescript
analyzeRun(): Observation[] {
  try {
    this.checkToolAlignment();
    this.checkAbsences();
    this.checkEarlyStopping();
    this.checkZeroTokenAgents();  // NYT
  } catch (err) { ... }
  return [...this.observations];
}
```

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/agents/agent-utils.ts` | `isEmptyResponse()`, `streamWithEmptyRetry()`, `EMPTY_RETRY_DELAYS` |
| `src/core/agents/historian.ts` | Ersätt inline 0-token-retry med `streamWithEmptyRetry()` |
| `src/core/agents/consolidator.ts` | Samma ändring som historian |
| `src/core/agents/observer.ts` | `checkZeroTokenAgents()` i `analyzeRun()` |

## Filer att INTE ändra

- `src/core/agents/manager.ts` — Manager använder streaming men har inte 0-token-problem (alltid tool calls)
- `src/core/agents/implementer.ts` — samma resonemang som Manager
- `src/core/agents/reviewer.ts` — kortlivad agent, 0-token hanteras redan av `withRetry`
- `src/core/policy.ts` — inget med retry/streaming att göra
- `prompts/` — inga promptändringar behövs
- `policy/limits.yaml` — inga nya gränser

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Backoff gör körningen långsammare vid API-problem | Medel | +50s extra per agent | Max 50s total, acceptabelt för reliability |
| Icke-streaming fallback ger sämre UX (ingen live-text) | Låg | Saknad console output | Logga att fallback används, data > UX |
| `streamWithEmptyRetry` blir svårtestbar | Låg | Dålig coverage | Extrahera `isEmptyResponse()` som ren funktion, mocka resten |
| Observer false positive: agent som legitimt genererar 0 tokens | Låg | Onödig WARNING | Bara delegerade agenter flaggas, och 0 output tokens + delegerad = alltid misstänkt |

## Acceptanskriterier

### agent-utils.ts

- **AC1:** `isEmptyResponse({ usage: { output_tokens: 0 } })` returnerar `true`. `isEmptyResponse({ usage: { output_tokens: 42 } })` returnerar `false`. Ren funktion — testas direkt
- **AC2:** `EMPTY_RETRY_DELAYS` är `[5_000, 15_000, 30_000]` (exporterad konstant)
- **AC3:** `streamWithEmptyRetry()` returnerar response direkt om `output_tokens > 0` på första försöket (ingen onödig delay)

### Retry-beteende

- **AC4:** Om streaming ger 0 tokens 3 gånger i rad: `streamWithEmptyRetry()` gör 1 icke-streaming anrop som fallback
- **AC5:** Om fallback-anropet också ger 0 tokens: funktionen returnerar svaret utan att kasta error (anroparen bestämmer)
- **AC6:** Varje 0-token-svar loggas med diagnostik: agent, iteration, retryAttempt, maxRetries, systemPromptChars, messagesChars, model

### Historian + Consolidator

- **AC7:** historian.ts innehåller INTE den gamla inline 0-token-checken (`if (iteration === 1 && response.usage.output_tokens === 0)`)
- **AC8:** consolidator.ts innehåller INTE den gamla inline 0-token-checken
- **AC9:** Båda anropar `streamWithEmptyRetry()` istället

### Observer

- **AC10:** Observer flaggar en delegerad agent med 0 output tokens som `severity: 'WARNING'`, `type: 'absence'`
- **AC11:** Observer flaggar INTE en icke-delegerad agent med 0 output tokens (agent som aldrig startade)

### Regression

- **AC12:** Alla befintliga tester passerar utan regression (`pnpm test`)
