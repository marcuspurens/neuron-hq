# HANDOFF — Session 125: Token-optimering

**Datum:** 2026-03-22 12:20
**Commit:** `0f45843`
**Tester:** 3718/3718 gröna (+15 nya)

---

## Bakgrund

Körning #174 och #175 (med nya förbättrade prompter från S120-S124) visade dramatiskt ökad token-förbrukning: ~20M tokens per körning jämfört med ~8M med gamla prompter. Orsak: agenterna läser fler filer (Manager 63 read_file), snöbollar kontext, och system prompts skickas om varje iteration utan caching.

## Vad gjordes

### 1. Research: Token-optimering i multi-agent-system
- **13 källor** genomsökta (arxiv, Anthropic docs, LangChain, BudgetMLAgent, Agent Contracts)
- **5 rekommendationer** identifierade, de 3 viktigaste implementerade
- Sparad i `docs/research/2026-03-22-token-optimization-multi-agent.md`

### 2. Prompt Caching (`src/core/agent-client.ts`)
- `buildCachedSystemBlocks()` — delar systemprompt i preamble + rollprompt
- Varje block markeras med `cache_control: { type: 'ephemeral' }`
- Cache reads: 90% billigare ($0.30/MTok vs $3.00/MTok)
- Alla 11 agenter uppdaterade

### 3. Smart Tool Result Clearing (`src/core/agents/agent-utils.ts`)
- `clearOldToolResults()` — ersätter gamla tool-resultat med kort platshållare
- Behåller 6 senaste i full text, äldre: 12k chars → 37 chars
- Körs som fas 1 i `trimMessages()`, före message-trimning

### 4. Cache-spårning (`src/core/usage.ts` + `src/core/types.ts`)
- Nya fält: `cache_creation_tokens`, `cache_read_tokens`
- Per agent och totalt
- `formatSummary()` visar cache-statistik

### 5. ROADMAP uppdaterad
- 2.6 Observer: ✅ (Brief A + Brief B klara)
- Tester: 3718, Körningar: 175, Sessioner: 125, Klar: 16/26

## Filer ändrade (token-optimering)

| Fil | Ändring |
|-----|---------|
| `src/core/agent-client.ts` | `buildCachedSystemBlocks()` tillagd |
| `src/core/agents/agent-utils.ts` | `clearOldToolResults()` + tvåfas-trimMessages |
| `src/core/types.ts` | Cache-fält i UsageSchema |
| `src/core/usage.ts` | Cache-tracking i recordTokens + formatSummary |
| `src/core/agents/*.ts` (11 filer) | `system: buildCachedSystemBlocks(systemPrompt)` + cache metrics |
| `tests/core/token-optimization.test.ts` | 15 nya tester |
| `tests/core/iteration-tracking.test.ts` | Uppdaterad för cache-fält |

## Diskussioner

### "Vet vi att Manager läser filer = kvalitetslyft?"
**Ärligt svar: nej.** Manager läser 63 filer nu (vs 0 förut), men vi har inget bevis för att resultatet är *bättre kod*. Observer ska samla data för att svara på detta — behöver 5-10 körningar.

### Balans djup vs kostnad
Tre strategier diskuterades:
- **A) Smarta budgetar** — svårt, LLM:er räknar tokens dåligt
- **B) Sänka iterationslimiter** — snabb åtgärd men risk att klippa av arbete
- **C) Observera först, optimera sedan** — $300-500 för data, 5-10 körningar
**Beslut:** C, kompletterat med tekniska åtgärder (caching + clearing) som direkt effekt.

### Prompt-caching-2024-07-31 header
Refererad i research-planen men INTE implementerad — gammal beta header (22 månader). Implementationen använder `cache_control: { type: 'ephemeral' }` direkt på TextBlockParam, som är GA i SDK v0.78. Ingen extra beta header behövs.

## Nästa steg

1. **Kör 2.6b feedback-loop** — första körningen med token-optimering aktiv:
   ```
   npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-22-observer-feedback-loop.md --hours 1
   ```
2. **Jämför tokens:** 20M → förhoppningsvis ~8-12M
3. **Verifiera cache-data** i `usage.json`: `cache_creation_tokens` och `cache_read_tokens` bör visa tydliga siffror
4. **Samla Observer-data** (strategi C): 5-10 körningar för att förstå vilka filläsningar som ger värde

## Relevanta filer

- Research: `docs/research/2026-03-22-token-optimization-multi-agent.md`
- Brief 2.6b: `briefs/2026-03-22-observer-feedback-loop.md`
- Denna handoff: `docs/handoffs/HANDOFF-2026-03-22T1220-session125-token-optimization.md`
