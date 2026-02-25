# Neuron HQ — Iteration-tracking per agent i usage.json

## Mål

Logga hur många iterationer varje agent faktiskt använde (och sin gräns) i `usage.json`.
Ger data för att finjustera per-agent-gränserna som lades till i körning #40.

## Bakgrund

`usage.json` spårar idag tokens och tool-calls per agent, men inte iterationer.
Vi har just satt separata gränser per agent (`max_iterations_manager: 70` etc.) men vet
ännu inte om någon agent typiskt når sin gräns eller slutar långt före.

## Önskat resultat i usage.json

```json
{
  "by_agent": {
    "manager": {
      "input_tokens": 651865,
      "output_tokens": 7343,
      "iterations_used": 23,
      "iterations_limit": 70
    },
    "implementer": {
      "input_tokens": 684785,
      "output_tokens": 7463,
      "iterations_used": 41,
      "iterations_limit": 50
    }
  }
}
```

## Uppgifter

### 1. Uppdatera `src/core/types.ts`

Lägg till optional fält i `by_agent`-schemat:

```typescript
by_agent: z.record(z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  iterations_used: z.number().nonnegative().optional(),
  iterations_limit: z.number().positive().optional(),
})),
```

### 2. Lägg till `recordIterations` i `src/core/usage.ts`

```typescript
recordIterations(agent: string, used: number, limit: number): void {
  if (!this.usage.by_agent[agent]) {
    this.usage.by_agent[agent] = { input_tokens: 0, output_tokens: 0 };
  }
  this.usage.by_agent[agent].iterations_used = used;
  this.usage.by_agent[agent].iterations_limit = limit;
}
```

### 3. Anropa i varje agent i slutet av `run()`

Varje agent har redan `iteration` och `this.maxIterations`. Lägg till ett anrop precis
innan `run()` returnerar:

```typescript
ctx.usage.recordIterations('manager', iteration, this.maxIterations);
```

Filer att uppdatera:
- `src/core/agents/manager.ts`
- `src/core/agents/implementer.ts`
- `src/core/agents/reviewer.ts`
- `src/core/agents/tester.ts`
- `src/core/agents/merger.ts`
- `src/core/agents/historian.ts`
- `src/core/agents/librarian.ts`
- `src/core/agents/researcher.ts`

### 4. Tester

Lägg till i ett nytt testfil `tests/core/iteration-tracking.test.ts`:
- `recordIterations` skriver korrekt till `by_agent`
- Kan anropas oberoende av `recordTokens` (by_agent skapas om det saknas)
- Värdet skrivs över om `recordIterations` anropas flera gånger för samma agent

## Verifiering

```bash
pnpm typecheck
pnpm test
```

Förväntat: alla 324+ tester gröna, inga TypeScript-fel.

## Avgränsningar

- Ändra INTE agenters logik utöver att lägga till `recordIterations`-anropet
- `iterations_used` = värdet av `iteration`-variabeln när loopen slutar (naturligt eller vid max)
- Fälten är optional — gamla usage.json-filer utan dessa fält fortsätter fungera
