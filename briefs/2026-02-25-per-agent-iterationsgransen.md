# Neuron HQ — Per-agent iterationsgränser

## Mål

Ersätt den gemensamma `max_iterations_per_run: 50` med separata gränser per agentroll.
Manager behöver fler iterationer än Merger; Historian behöver färre än Implementer.

## Bakgrund

Alla agenter delar idag samma gräns (`max_iterations_per_run: 50` i `policy/limits.yaml`).
Det är ett problem eftersom:
- **Manager** ibland kör slut på iterationer utan att delegera (rotorsak till misslyckade körningar)
- **Merger** och **Historian** typiskt använder 5–15 iterationer — 50 är onödigt högt
- En enskild gräns ger ingen signal om *vilken* agent som är problemet

En session-39-fix lades till i Manager-prompten (delegera före iteration 30), men
infrastrukturen saknar fortfarande per-agent-gränser.

## Uppgifter

### 1. Uppdatera `policy/limits.yaml`

Ersätt:
```yaml
max_iterations_per_run: 50
```

Med:
```yaml
max_iterations_per_run: 50  # fallback om per-agent saknas
max_iterations_manager: 70
max_iterations_implementer: 50
max_iterations_reviewer: 50
max_iterations_tester: 30
max_iterations_merger: 30
max_iterations_historian: 30
max_iterations_librarian: 30
max_iterations_researcher: 40
```

### 2. Uppdatera `src/core/types.ts`

Lägg till de nya fälten i Zod-schemat för limits (alla optional med fallback):

```typescript
max_iterations_manager: z.number().positive().optional(),
max_iterations_implementer: z.number().positive().optional(),
max_iterations_reviewer: z.number().positive().optional(),
max_iterations_tester: z.number().positive().optional(),
max_iterations_merger: z.number().positive().optional(),
max_iterations_historian: z.number().positive().optional(),
max_iterations_librarian: z.number().positive().optional(),
max_iterations_researcher: z.number().positive().optional(),
```

### 3. Uppdatera varje agent

I varje agent (`manager.ts`, `implementer.ts`, etc.) — ändra hur `maxIterations` sätts:

```typescript
// Före:
this.maxIterations = ctx.policy.getLimits().max_iterations_per_run;

// Efter (exempel för manager):
const limits = ctx.policy.getLimits();
this.maxIterations = limits.max_iterations_manager ?? limits.max_iterations_per_run;
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

### 4. Uppdatera tester

Befintliga tester som refererar till `max_iterations_per_run: 50` ska fortfarande fungera
(fallback-logiken säkerställer det). Lägg till minst ett test som verifierar att:
- Manager får 70 om `max_iterations_manager` är satt
- En agent faller tillbaka på `max_iterations_per_run` om per-agent-värdet saknas

## Verifiering

```bash
pnpm typecheck
pnpm test
```

Förväntat: alla 318+ tester gröna, inga TypeScript-fel.

## Avgränsningar

- Ändra INTE existerande agenters logik utöver `maxIterations`-tilldelningen
- Ändra INTE prompt-filer
- Håll fallback-logiken (`?? max_iterations_per_run`) så att gamla configs fungerar
