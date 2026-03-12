# Brief: S5 — Multi-provider (billigare modeller för enklare uppgifter)

## Bakgrund

Idag kör alla 10 agenter samma modell (`claude-opus-4-6`) via direkt Anthropic SDK-anrop.
Varje agent skapar sin egen `new Anthropic()` med identisk kod. Modellen är hardcoded.

Det innebär att Researcher (som mest googlar och sammanfattar) kostar lika mycket
som Manager (som planerar och koordinerar). En körning med 50 iterationer kostar
~$5–10 när hela svärmen kör Opus — men Researcher, Librarian och Historian
skulle fungera bra med Haiku (~20x billigare).

S5 skapar ett **abstraktionslager** mellan agenter och LLM-leverantörer:
- Factory-mönster som ger rätt klient baserat på agentroll
- Modell-konfiguration per roll (inte hardcoded)
- Stöd för Anthropic + OpenAI-kompatibla API:er (Ollama, vLLM)
- Befintlig `UsageTracker` kopplas till rätt modell

**Avgränsning:** S5 bygger infrastrukturen. Själva routingen (vilken modell
per agent) konfigureras i `policy/limits.yaml` — inte i koden. Inga nya
beroenden (vi använder bara Anthropic SDK + fetch för OpenAI-kompatibla).

## Scope

Fyra delar:

1. **`model-registry.ts`** — konfiguration och factory
2. **`agent-client.ts`** — adapter som wrapprar olika SDK:er till gemensamt interface
3. **Alla 10 agenter** — byt från direkt SDK-anrop till factory
4. **Policy + CLI** — modellkonfiguration i limits.yaml + --model flag

## Uppgifter

### 1. Model Registry

Skapa `src/core/model-registry.ts`:

```typescript
import { z } from 'zod';

export const ModelProviderSchema = z.enum(['anthropic', 'openai-compatible']);

export const ModelConfigSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string(),
  baseUrl: z.string().optional(),      // för openai-compatible
  apiKeyEnv: z.string().optional(),    // env-variabel med API-nyckel (default: ANTHROPIC_API_KEY)
  maxTokens: z.number().positive().default(8192),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const AgentModelMapSchema = z.record(
  z.enum([
    'manager', 'implementer', 'reviewer', 'researcher',
    'tester', 'merger', 'historian', 'librarian', 'consolidator', 'brief-agent',
  ]),
  ModelConfigSchema.optional(),
);

export type AgentModelMap = z.infer<typeof AgentModelMapSchema>;

/**
 * Default model config — used when no per-agent override exists.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  maxTokens: 8192,
};

/**
 * Resolve the model config for a given agent role.
 * Priority: per-agent override → default config
 */
export function resolveModelConfig(
  role: string,
  agentModelMap?: AgentModelMap,
): ModelConfig;
```

### 2. Agent Client (adapter)

Skapa `src/core/agent-client.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ModelConfig } from './model-registry.js';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'stop';
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolUseId?: string;
}

/**
 * Creates an Anthropic client for the given model config.
 * For 'anthropic' provider: uses Anthropic SDK directly.
 * For 'openai-compatible': uses Anthropic SDK with baseURL override.
 *
 * Returns { client, model } ready for messages.stream().
 */
export function createAgentClient(config: ModelConfig): {
  client: Anthropic;
  model: string;
  maxTokens: number;
};
```

**Viktigt:** Anthropic SDK stödjer redan `baseURL` i konstruktorn, så för
OpenAI-kompatibla endpoints (Ollama, vLLM som exponerar Anthropic-kompatibelt
API) behövs bara:

```typescript
const client = new Anthropic({
  apiKey: process.env[config.apiKeyEnv ?? 'ANTHROPIC_API_KEY'],
  baseURL: config.baseUrl,  // undefined = default Anthropic URL
});
```

### 3. Uppdatera alla agenter

I varje agent (`manager.ts`, `implementer.ts`, etc.), ersätt:

```typescript
// FÖRE:
import Anthropic from '@anthropic-ai/sdk';

constructor(private ctx: RunContext, baseDir: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  this.anthropic = new Anthropic({ apiKey });
}

// I messages.stream():
model: 'claude-opus-4-6',
```

Med:

```typescript
// EFTER:
import { createAgentClient } from './agent-client.js';
import { resolveModelConfig } from './model-registry.js';

constructor(private ctx: RunContext, baseDir: string) {
  const config = resolveModelConfig('manager', this.ctx.agentModelMap);
  const { client, model, maxTokens } = createAgentClient(config);
  this.client = client;
  this.model = model;
  this.maxTokens = maxTokens;
}

// I messages.stream():
model: this.model,
max_tokens: this.maxTokens,
```

Gör detta för alla 10 agenter:
- `manager.ts` (roll: `manager`)
- `implementer.ts` (roll: `implementer`)
- `reviewer.ts` (roll: `reviewer`)
- `researcher.ts` (roll: `researcher`)
- `merger.ts` (roll: `merger`)
- `tester.ts` (roll: `tester`)
- `historian.ts` (roll: `historian`)
- `librarian.ts` (roll: `librarian`)
- `consolidator.ts` (roll: `consolidator`)
- `brief-agent.ts` (roll: `brief-agent`)

### 4. RunContext-utvidgning

I `src/core/run.ts`, lägg till i `RunContext`:

```typescript
export interface RunContext {
  // ... befintliga fält
  agentModelMap?: AgentModelMap;  // per-agent model overrides
}
```

Ladda från `policy/limits.yaml` under `agent_models`:

```yaml
# I policy/limits.yaml, lägg till:
agent_models:
  researcher:
    provider: anthropic
    model: claude-haiku-4-5-20251001
  historian:
    provider: anthropic
    model: claude-haiku-4-5-20251001
  librarian:
    provider: anthropic
    model: claude-haiku-4-5-20251001
```

**OBS:** Alla agenter som INTE har override kör default (claude-opus-4-6).
Börja med 3 billiga agenter, utöka senare.

### 5. CLI-stöd

I `src/cli.ts`, lägg till `--model` flag till `run` och `resume`:

```typescript
// --model: override default model for ALL agents
//   Example: --model claude-sonnet-4-6
```

Om `--model` anges, sätts `DEFAULT_MODEL_CONFIG.model` till det angivna värdet.
Per-agent overrides i limits.yaml har fortfarande högre prioritet.

### 6. UsageTracker-koppling

I `src/core/usage.ts`, uppdatera så att rätt modellnamn loggas per agent:

```typescript
// Varje agent skickar sin resolved model till usage tracking
this.ctx.usage.trackTokens(this.model, inputTokens, outputTokens);
```

### 7. Tester

Skriv tester i `tests/core/model-registry.test.ts`:

1. `resolveModelConfig` — returnerar default config utan overrides
2. `resolveModelConfig` — returnerar per-agent override när den finns
3. `resolveModelConfig` — fallback till default för okänd roll
4. `ModelConfigSchema` — validerar korrekt config
5. `ModelConfigSchema` — avvisar felaktig provider
6. `AgentModelMapSchema` — validerar map med flera agenter
7. `DEFAULT_MODEL_CONFIG` — har korrekta default-värden

Skriv tester i `tests/core/agent-client.test.ts`:

8. `createAgentClient` — skapar Anthropic-klient med default config
9. `createAgentClient` — skapar klient med custom baseUrl
10. `createAgentClient` — använder rätt apiKeyEnv
11. `createAgentClient` — returnerar model och maxTokens

Skriv tester i `tests/core/model-config-policy.test.ts`:

12. `agent_models` laddas korrekt från limits.yaml
13. Agenter utan override behåller default-modell
14. Per-agent override har rätt provider och model

Skriv lint-tester i `tests/agents/agent-model-usage.test.ts`:

15. Ingen agent importerar `@anthropic-ai/sdk` direkt (alla använder factory)
16. Ingen agent har hardcoded `'claude-opus-4-6'` i koden
17. Alla agenter anropar `resolveModelConfig` i sin constructor

## Acceptanskriterier

- [ ] `src/core/model-registry.ts` existerar med `resolveModelConfig()`, `ModelConfigSchema`, `AgentModelMapSchema`
- [ ] `src/core/agent-client.ts` existerar med `createAgentClient()`
- [ ] Alla 10 agenter använder `createAgentClient()` istället för direkt `new Anthropic()`
- [ ] Ingen agent har hardcoded `'claude-opus-4-6'` — alla läser från config
- [ ] `RunContext` har `agentModelMap?: AgentModelMap`
- [ ] `policy/limits.yaml` har `agent_models` med minst 3 agenter (researcher, historian, librarian) som override
- [ ] CLI-flagga `--model` fungerar
- [ ] 7+ tester i `tests/core/model-registry.test.ts`
- [ ] 4+ tester i `tests/core/agent-client.test.ts`
- [ ] 3+ tester i `tests/core/model-config-policy.test.ts`
- [ ] 3+ lint-tester i `tests/agents/agent-model-usage.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**High.** Ändrar alla 10 agentfiler. Tre specifika risker:

1. **Trasig streaming** — Om adapter-lagret inte wrapprar `messages.stream()`
   korrekt, kan agenter hänga eller missa tool calls. Mitigering: Wrappern
   returnerar samma `Anthropic`-instans — inget nytt streaming-lager.

2. **API-nyckel-problem** — Felkonfigurerad `apiKeyEnv` kan ge 401-fel.
   Mitigering: Fallback till `ANTHROPIC_API_KEY` om inget anges.

3. **Modell-kapacitet** — Haiku kan inte hantera lika komplexa tool calls som
   Opus. Mitigering: Bara Researcher/Historian/Librarian (enklare roller)
   konfigureras med Haiku. Manager/Implementer/Reviewer behåller Opus.

Kodstorleken hålls nere genom att `createAgentClient()` returnerar samma
`Anthropic`-typ — agenternas message loop ändras minimalt.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 750+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-multi-provider.md --hours 1
```
