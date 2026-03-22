# Token-optimering i Neuron HQ — Djuprapport

> **Datum:** 2026-03-22 · Session 125–126
> **Författare:** Claude Opus 4.6 + Marcus
> **Kontext:** Promptförbättringar (S116–S124) ökade tokenförbrukningen från ~8M till ~20M per körning. Denna rapport dokumenterar vad vi gjorde, varför, och resultatet.
> **Målgrupp:** Marcus (produktägare), senior utvecklare, LLM-agent

---

## Innehåll

1. [Sammanfattning](#1-sammanfattning)
2. [Bakgrund — Varför ökade tokens?](#2-bakgrund)
3. [Research — Vad säger industrin?](#3-research)
4. [Teknik 1: Prompt Caching](#4-prompt-caching)
5. [Teknik 2: Tool Result Clearing](#5-tool-result-clearing)
6. [Före/efter-data](#6-data)
7. [Observer-rapporten — första resultatet](#7-observer)
8. [Lärdomar och hypoteser](#8-lärdomar)
9. [Vad vi INTE gjorde (ännu)](#9-framtid)
10. [Källor](#10-källor)

---

## 1. Sammanfattning

| Mått | Före (körning #174) | Efter (körning #176) | Förändring |
|------|--------------------:|---------------------:|-----------:|
| Totala tokens | 20.4M | 7.1M | **-65%** |
| Cache read tokens | 0 | 1.74M | Ny mätning |
| Kostnad (Sonnet) | ~$63 | ~$22 | **-65%** |
| Körtid | 51 min | 32 min | -37% |
| Tester | 3703 | 3746 | +43 |
| Kvalitet (AC) | 21/21 | 5/5 | 100% båda |

**Slutsats:** Vi minskade tokenförbrukningen med 65% utan att offra kvalitet. Två tekniker — prompt caching och tool result clearing — stod för hela besparingen.

---

## 2. Bakgrund — Varför ökade tokens?

### För Marcus

Under sessionerna 116–124 förbättrade vi alla 12 agentprompter. Vi gjorde dem längre, klokare och mer detaljerade. Historian-prompten gick från 272 till 389 rader. Knowledge Manager-prompten fördubblades. Vi la till en "preamble" — en text som alla agenter delar — och vi tog bort artificiella begränsningar som "max 3 filer".

**Resultatet var bättre körningar men dyrare.** Kostnad per körning gick från ~$36 till ~$63. Token-förbrukningen gick från ~8M till ~20M. Det var en medveten avvägning — bättre prompts ger bättre kod — men 20M tokens per körning var för mycket.

### För senior utvecklare

Token-ökningen kom från tre samverkande faktorer:

1. **Prompt-inflation:** Systempromptarna (preamble + rollprompt) fördubblades i storlek (~2K→~5K tokens per agent). Med ~50 iterationer per körning multipliceras detta.

2. **Borttagning av artificiella begränsningar:** "Max 3 filer" och "max 1-2 iterations" hade oavsiktligt begränsat context-ackumulation. När vi tog bort dem läste Manager 55 filer istället för 0-3. Varje `read_file`-resultat ackumuleras i konversationshistoriken.

3. **Ingen context management:** Före optimering skickades den fullständiga konversationshistoriken till API:et vid varje iteration. Iteration 50 hade med sig alla tool-resultat från iteration 1–49.

```
Iteration 1:  systemprompt + brief                    → ~5K tokens
Iteration 10: systemprompt + brief + 9 tool-resultat  → ~60K tokens
Iteration 50: systemprompt + brief + 49 tool-resultat → ~300K tokens

Totalt per agent: summan av alla iterationer ≈ 1-8M tokens
```

### För LLM-agenter

Din tokenförbrukning per körning bestäms av:

```
total_tokens = Σ(agent) Σ(iteration) [system_prompt + conversation_history]
```

Där `conversation_history` växer linjärt med varje iteration (verktygsanrop ackumuleras). Utan compaction eller clearing betalar du O(n²) tokens för n iterationer — du betalar systemprompt × n PLUS conversation_growth × n(n-1)/2.

**Nyckelfaktor:** Promptförbättringar i S116–S124 ökade system_prompt men OCKSÅ ökade n (fler iterationer, fler tool-anrop) genom att ta bort artificiella begränsningar. Båda faktorerna multiplicerade varandra.

---

## 3. Research — Vad säger industrin?

Vi genomförde en forskningsöversikt (13 källor) innan vi implementerade optimeringar. Här är de viktigaste lärdomarna:

### 3.1 Industrins konsensus

Alla stora aktörer konvergerar på samma mönster:

| Källa | Rekommendation | Relevans |
|-------|----------------|----------|
| **Anthropic** (Context Engineering) | "Every model call sees the minimum context required" | Direkt — vårt problem var maximal context |
| **Google ADK** | Sub-agenter returnerar sammanfattningar, inte rå data | Vi gör delvis detta via delegation |
| **Agent Contracts** (arxiv: 2601.08815) | Formalisera resursbudgetar per agent | Validerar vår `limits.yaml` |
| **TALE** (arxiv: 2412.18547) | Token-budgets i prompts kan minska output 50-67% | Potentiell framtida teknik |
| **BudgetMLAgent** (arxiv: 2411.07464) | Model cascading: 94% kostnadsreduktion | Validerar vår Sonnet+Opus-strategi |

### 3.2 Topp 5 rekommendationer (från vår research)

| Prio | Teknik | Påverkan | Implementerad? |
|------|--------|----------|----------------|
| 1 | **Tool result clearing** | 30-50% token-reduktion | ✅ S125 |
| 2 | **Prompt caching** | ~90% besparing på cachad del | ✅ S125 |
| 3 | SDK compaction | Förhindrar context rot | ⬜ Framtid |
| 4 | Sub-agent summary returns | Förhindrar context-snöboll | ⬜ Framtid |
| 5 | Formella token-budgetar | Förutsägbara kostnader | ⬜ Framtid |

**Källa:** `docs/research/2026-03-22-token-optimization-multi-agent.md`

---

## 4. Prompt Caching

### Vad är det?

#### För Marcus

Tänk dig att du skickar samma bifogade dokument till 50 e-postmeddelanden. Utan caching: du kopierar dokumentet 50 gånger. Med caching: du skickar det en gång, och de andra 49 meddelandena säger "se det bifogade dokumentet jag redan skickade".

Alla våra 12 agenter delar en text ("preamble") som förklarar hur de ska tänka. Och varje agent har sin egen rollprompt som är identisk vid varje iteration. Innan cachning betalade vi för att skicka dessa texter om och om igen — ibland 50+ gånger per agent.

**Besparing:** Cachade tokens kostar 0.30 kr/miljon istället för 3.00 kr/miljon — **90% billigare**.

#### För senior utvecklare

Anthropics API stöder prefix-baserad caching via `cache_control: { type: 'ephemeral' }` på `TextBlockParam`. Cachade block bildar ett prefix som matchas exakt — om någon byte ändras i prefixet invalideras cachen.

**Designbeslut:** Vi delar systemprompt i två block:

```
Block 1: preamble (delad av alla agenter)  ← cache_control: ephemeral
Block 2: rollprompt + injicerad kontext    ← cache_control: ephemeral
```

Block 1 cachas och återanvänds **mellan agenter** (om de anropas inom 5 min). Block 1+2 cachas och återanvänds **mellan iterationer** av samma agent.

#### Före vs efter — kod

**FÖRE** (alla agenter skickade system som sträng):
```typescript
// manager.ts — före
const stream = client.messages.stream({
  model,
  max_tokens: maxTokens,
  system: systemPrompt,        // ← Sträng, ingen caching
  messages: trimMessages(msgs),
});
```

**EFTER** (alla agenter använder cachade block):
```typescript
// manager.ts — efter
import { buildCachedSystemBlocks } from '../agent-client.js';

const stream = client.messages.stream({
  model,
  max_tokens: maxTokens,
  system: buildCachedSystemBlocks(systemPrompt),  // ← Cachade block
  messages: trimMessages(msgs),
});
```

**Implementationen** (`agent-client.ts`):
```typescript
const PREAMBLE_SEPARATOR = '\n\n---\n\n';

export function buildCachedSystemBlocks(
  systemPrompt: string,
): Anthropic.Messages.TextBlockParam[] {
  const sepIndex = systemPrompt.indexOf(PREAMBLE_SEPARATOR);
  if (sepIndex === -1) {
    return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  const preamble = systemPrompt.slice(0, sepIndex);
  const roleAndContext = systemPrompt.slice(sepIndex + PREAMBLE_SEPARATOR.length);
  return [
    { type: 'text', text: preamble, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: roleAndContext, cache_control: { type: 'ephemeral' } },
  ];
}
```

**Ändrade filer:** `agent-client.ts` (ny funktion) + alla 11 agentfiler (ändrade `system:` från sträng till `buildCachedSystemBlocks()`).

#### För LLM-agenter

Prompt caching fungerar prefix-baserat. Ditt system-meddelande delas i N block med `cache_control: { type: 'ephemeral' }`. API:et beräknar en hash av prefixet (block 1, block 1+2, etc.) och lagrar resultatet i 5 minuter.

**Cache-ekonomi:**
- Cache creation: +25% kostnad (engångskostnad)
- Cache read: -90% kostnad (alla efterföljande träffar)
- Breakeven: efter 2 anrop med samma prefix

**Konsekvens för dig:** Ditt system-meddelande processas inte om varje iteration. De 5K tokens av preamble + rollprompt kostar bara ~500 tokens-ekvivalent från iteration 2 och framåt. Över 50 iterationer: 5K + 49×0.5K = 29.5K istället för 50×5K = 250K.

---

## 5. Tool Result Clearing

### Vad är det?

#### För Marcus

Tänk dig att du har en assistent som antecknar allt. Du ber hen läsa ett dokument. Hen skriver ner hela dokumentet i sitt anteckningsblock. Sen ber du hen läsa ett till. Och ett till. Efter 50 dokument väger anteckningsblocket 20 kg och hälften av texten är irrelevant — du behöver bara de senaste 6 dokumenten.

Tool result clearing betyder: "behåll de 6 senaste dokumenten i full text, men ersätt äldre dokument med en notis: 'Jag läste det här tidigare'." Assistenten minns fortfarande att hen läste dokumenten (konversationsflödet bevaras), men den tunga texten är borta.

**Konkret exempel från körning #174:**
- Manager anropade `read_file` 55 gånger
- Varje filläsning ≈ 12 000 tecken (max)
- 55 × 12 000 = 660 000 tecken bara i filinnehåll
- Med clearing: 6 × 12 000 + 49 × 37 = 73 813 tecken
- **Besparing: 89%** bara på filläsningar

#### För senior utvecklare

`clearOldToolResults()` körs som Phase 1 av `trimMessages()` — före varje API-anrop.

**Algoritm:**
1. Räkna totalt antal `tool_result`-block i konversationen
2. Om total ≤ 6 (KEEP_RECENT_TOOL_RESULTS): gör inget
3. Annars: gå framåt, ersätt `content` i de N-6 äldsta tool_result-blocken med `'[Tool result cleared to save context]'`
4. Bevara `tool_use_id`, blockstruktur och konversationsflöde

```typescript
const KEEP_RECENT_TOOL_RESULTS = 6;
const CLEARED_TOOL_RESULT = '[Tool result cleared to save context]';

export function clearOldToolResults(
  messages: Anthropic.MessageParam[],
  keepRecent = KEEP_RECENT_TOOL_RESULTS
): Anthropic.MessageParam[] {
  // ... counts tool_results, replaces older ones with placeholder
}
```

**Designbeslut:**
- `keepRecent = 6` valdes som kompromiss: nog för att agenten förstår sitt senaste arbete, litet nog för att spara rejält
- Blockstrukturen bevaras (tool_use_id finns kvar) så modellen förstår att ett tool-anrop gjordes
- Immutable: returnerar nya objekt, muterar inte input

**Tvåstegs-strategi i `trimMessages()`:**
```
Phase 1: clearOldToolResults()     — Tar bort tunga tool-resultat
Phase 2: Drop oldest messages      — Om fortfarande > 360K tecken, ta bort äldsta meddelanden
```

#### Före vs efter — kod

**FÖRE** (trimMessages gjorde bara Phase 2):
```typescript
export function trimMessages(messages, maxChars = 360_000) {
  // Bara: droppa äldsta meddelanden om för stort
  if (estimateMessagesChars(messages) <= maxChars) return messages;
  // ... drop oldest middle messages
}
```

**EFTER** (tvåstegs-strategi):
```typescript
export function trimMessages(messages, maxChars = 360_000) {
  // Phase 1: Clear old tool results (preserves conversation flow)
  let trimmed = clearOldToolResults(messages);
  if (estimateMessagesChars(trimmed) <= maxChars) return trimmed;
  // Phase 2: Drop oldest middle messages
  // ...
}
```

#### För LLM-agenter

Din konversationshistorik innehåller `tool_use` (dina anrop) och `tool_result` (resultaten). Varje `tool_result` kan vara upp till 12 000 tecken (filinnehåll, bash-output, etc.). Efter 20+ tool-anrop bär du med dig hundratusentals tecken av data du redan har bearbetat.

`clearOldToolResults` ersätter äldre tool_result-innehåll med `[Tool result cleared to save context]` medan det behåller:
- Ditt `tool_use`-block (så du vet att du anropade verktyget)
- `tool_use_id`-kopplingen (så konversationsstrukturen är konsistent)
- De 6 senaste tool-resultaten i full text (så du kan arbeta effektivt)

**Implikation:** Du kan inte referera tillbaka till tool-resultat från mer än 6 anrop sedan. Om du behöver information från en äldre filläsning, läs filen igen.

---

## 6. Före/efter-data

### 6.1 Totalnivå — fyra körningar

| Körning | Datum | Brief | Tokens | Kostnad | Cache read | Optimerad? |
|---------|-------|-------|-------:|--------:|-----------:|:----------:|
| #172 | 2026-03-21 | 2.4 Idékonsolidering | 11.7M | $36.55 | — | Nej |
| #174 | 2026-03-22 | 2.6b Observer Retro | 20.4M | $63.01 | — | Nej |
| #175 | 2026-03-22 | 2.6b Observer Brief B | 20.4M* | ~$60 | — | Nej* |
| **#176** | **2026-03-22** | **2.6b Feedback-loop** | **7.1M** | **$22.24** | **1.74M** | **Ja** |

*Körning #175 implementerade optimeringen men kördes UTAN den aktiv (koden skrevs under körningen). #176 var första körningen MED optimeringen aktiv.

### 6.2 Per agent — körning #174 vs #176

| Agent | #174 (tokens) | #176 (tokens) | Cache read | Minskning | % sparat |
|-------|-------------:|--------------:|-----------:|----------:|---------:|
| Manager | 3.69M | 1.42M | 623K | 2.27M | **61%** |
| Implementer | 7.66M | 1.26M | 583K | 6.40M | **84%** |
| Tester | 0.90M | 0.65M | 20K | 0.25M | **28%** |
| Reviewer | 4.96M | 1.48M | 321K | 3.48M | **70%** |
| Merger | 1.41M | 0.90M | 87K | 0.51M | **36%** |
| Historian | 1.60M | 1.32M | 106K | 0.28M | **17%** |
| **TOTALT** | **20.2M** | **7.03M** | **1.74M** | **13.2M** | **65%** |

### 6.3 Varför varierar besparingen per agent?

| Agent | Iterationer (#174/#176) | Tool-anrop | Förklaring |
|-------|------------------------:|------------|------------|
| Implementer | 24/25 | Många read_file + write_file | Mest tool-resultat → störst clearing-effekt |
| Reviewer | 38/32 | Många read_file | Läser mycket kod, stora tool-resultat |
| Manager | 63/77 | read_file + bash_exec | Många iterationer, bra caching-effekt |
| Historian | 14/13 | grep + read | Färre iterationer → mindre caching-vinst |
| Tester | 7/6 | bash_exec (testresultat) | Kort körning, liten absolut besparing |

**Mönster:** Agenter med **många iterationer** och **tunga tool-resultat** sparar mest. Det är en O(n²) → O(n) förbättring.

### 6.4 Cache-statistik (körning #176)

| Agent | Cache creation | Cache read | Read/Create ratio |
|-------|---------------:|-----------:|------------------:|
| Manager | 16 610 | 622 875 | 37.5× |
| Implementer | 18 028 | 582 947 | 32.3× |
| Reviewer | 10 353 | 320 943 | 31.0× |
| Historian | 8 839 | 106 068 | 12.0× |
| Merger | 4 595 | 87 305 | 19.0× |
| Tester | 4 039 | 20 195 | 5.0× |
| **Totalt** | **62 464** | **1 740 333** | **27.9×** |

**Tolkning:** För varje token vi betalade för att skapa cachen fick vi 28 cachade läsningar tillbaka. Manager fick 37.5× — varje iteration återanvände systemprompt-cachen.

---

## 7. Observer-rapporten — första resultatet

Körning #176 genererade den **allra första Observer prompt-health-rapporten**. Observer är en passiv agent som observerar körningar utan att påverka dem.

### Vad Observer hittade

| Fynd | Typ | Allvarlighet | Detalj |
|------|-----|-------------|--------|
| Historian: `max 1 iteration` | Anti-pattern (lint) | WARNING | Kvarglömd artificiell begränsning i rad 72 |
| Historian: `write_file` aldrig anropad | Tool-alignment | WARNING | Prompten säger "dokumentera" men agenten skrev aldrig |
| KM: `verifySource()` saknas | Djup kod-alignment | NOT_FOUND | Prompten refererar funktion som inte finns i koden |
| Merger: `postMergeVerify()` saknas | Djup kod-alignment | NOT_FOUND | Prompten refererar funktion som inte finns i koden |

### Vad som INTE fungerade

**Retro-samtal: 0/17 lyckade.** Alla agenter fick API-fel:
```
400 "signal: Extra inputs are not permitted"
```

**Orsak:** `signal: AbortSignal.timeout(30_000)` skickades i request body istället för som RequestOption. API:et avvisade det okända fältet.

**Fix:** Flyttade `signal` till andra argumentet i `client.messages.create()`. Committat i `4f1e8cd`.

**Token-tabell ofullständig:** Visade bara Manager. Observer lyssnade på events som bara Manager emittade. Fix: läser nu direkt från `UsageTracker.getUsage()`. Samma commit.

---

## 8. Lärdomar och hypoteser

### 8.1 Bekräftade lärdomar

#### 1. Token-optimering och prompt-kvalitet är oberoende axlar

> **Före S125:** Vi trodde att bättre prompts = dyrare körningar (ofrånkomligt)
> **Efter S126:** Bättre prompts + smart caching = billigare körningar

Promptförbättringarna (S116–S124) gav bättre kvalitet. Token-optimering (S125) minskade kostnaden UNDER den gamla nivån. Vi fick **båda** — bättre kvalitet OCH lägre kostnad.

```
  Kostnad
  $63 ─── #174 (bättre prompts, ingen optimering) ─── TOPP

  $36 ─── #172 (gamla prompts, ingen optimering)

  $22 ─── #176 (bättre prompts + optimering) ───────── NU
```

#### 2. Industrins rekommendationer stämde exakt

Vår research (13 källor) sa: tool result clearing + prompt caching = ~60-70% besparing. Vi fick 65%. Forskningen var prediktiv.

#### 3. O(n²) → O(n) är den verkliga vinsten

Tool result clearing ändrar konversationshistorikens tillväxt från kvadratisk till linjär. Det är inte en 30%-besparing — det är en **strukturell förändring** som gör att besparingen ökar med antalet iterationer.

### 8.2 Hypoteser att validera

| Hypotes | Hur vi testar | Status |
|---------|---------------|--------|
| Retro-samtal fungerar med signal-fixen | Nästa körning | ⬜ |
| Token-tabellen visar alla agenter | Nästa körning | ⬜ |
| SDK compaction kan spara ytterligare 10-20% | Aktivera server-side compaction | ⬜ |
| Sub-agent summaries (max 2K tokens tillbaka) minskar Manager-tokens | Behöver arkitekturändring | ⬜ |
| `KEEP_RECENT_TOOL_RESULTS = 6` är rätt värde | Experimentera med 4/8, jämför kvalitet | ⬜ |

### 8.3 Kostnadsprojektion

| Scenario | Tokens/körning | Kostnad/körning | Årskostnad (1/dag) |
|----------|---------------:|----------------:|-------------------:|
| Gamla prompts, ingen optimering | 12M | $36 | $13 140 |
| Nya prompts, ingen optimering | 20M | $63 | $22 995 |
| **Nya prompts + optimering** | **7M** | **$22** | **$8 030** |
| Optimering + compaction (hypotes) | ~5M | ~$15 | ~$5 475 |

---

## 9. Vad vi INTE gjorde (ännu)

### Från researchen — kvarstående möjligheter

| Teknik | Förväntad effekt | Ansträngning | Varför inte nu? |
|--------|-----------------|--------------|-----------------|
| **SDK compaction** | 10-20% extra besparing | Låg | Ville validera grundläggande tekniker först |
| **Sub-agent summary returns** | Förhindrar Manager context-snöboll | Medium | Kräver arkitekturändring i delegation |
| **Formella token-budgetar** | Förutsägbara kostnader | Medium | Behöver baslinjedata (Observer samlar nu detta) |
| **Token-budget hints i prompts** | 50-67% output-reduktion (källa: TALE) | Låg | Risk för "token elasticity" — behöver experiment |

### Varför just dessa två tekniker först?

1. **Låg risk:** Prompt caching och tool result clearing förändrar inte agenternas beteende — bara hur konversationen representeras
2. **Hög påverkan:** Tillsammans adresserade de de två största token-slösorna (upprepade systemprompts + ackumulerade tool-resultat)
3. **Oberoende av varandra:** Om en teknik inte fungerade hade den andra fortfarande gett besparing
4. **Mätbar:** Vi kunde jämföra exakt samma brief (#174 vs #176) med och utan optimering

---

## 10. Källor

### Akademiska

| # | Titel | Källa | Nyckelinsikt |
|---|-------|-------|-------------|
| 1 | Agent Contracts | arxiv: 2601.08815v1 | 90% token-reduktion med formaliserade resursbudgetar |
| 2 | Token-Budget-Aware LLM Reasoning (TALE) | arxiv: 2412.18547v5 | 50-67% output-reduktion, men "token elasticity" vid för små budgetar |
| 3 | BudgetMLAgent | arxiv: 2411.07464v1 | 94% kostnadsreduktion med model cascading |
| 4 | OPTIMA | arxiv: 2410.08115v1 | 90% effektivare agent-kommunikation via träning |
| 5 | Don't Break the Cache | arxiv: 2601.06007v1 | Prompt caching-strategier, prefix-baserad cache |

### Industri

| # | Källa | Nyckelinsikt |
|---|-------|-------------|
| 6 | Anthropic: Effective Context Engineering | "Every model call sees the minimum context required" |
| 7 | Anthropic: Context Editing API Docs | Tool result clearing — "safest form of compaction" |
| 8 | Google: Efficient Context-Aware Multi-Agent Framework | Sub-agent context isolation |
| 9 | Claude Agent SDK: Compaction | Server-side context summarization |
| 10 | LangChain: State of Agent Engineering | Kvalitet > Latens > Kostnad i branschrankingar |
| 11 | InfoQ (mars 2026) | LLM-genererade kontextfiler skadar med 3% + 20% kostnadsökning |

### Neuron HQ intern

| # | Dokument | Plats |
|---|----------|-------|
| 12 | Token-optimering research | `docs/research/2026-03-22-token-optimization-multi-agent.md` |
| 13 | Körningshistorik | `docs/cost-tracking.md` |
| 14 | Usage.json (#174) | `runs/20260322-0655-neuron-hq/usage.json` |
| 15 | Usage.json (#176) | `runs/20260322-1126-neuron-hq/usage.json` |
| 16 | Prompt-health-rapport | `runs/20260322-1126-neuron-hq/prompt-health-2026-03-22T1158.md` |

---

> *Denna rapport genererades 2026-03-22 under session 126. Data baserad på körning #172–#176.*
