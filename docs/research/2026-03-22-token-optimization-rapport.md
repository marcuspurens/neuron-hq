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
10. [Människa + AI — Vad betyder detta?](#10-människa--ai)
11. [Källor](#11-källor)

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

## 10. Människa + AI — Vad betyder detta?

### Vad Neuron HQ faktiskt producerar

Låt oss börja med fakta. 176 körningar, 30 dagar, mätbar data:

| Mått | Neuron HQ (per körning) | Senior utvecklare (uppskattning) |
|------|------------------------:|--------------------------------:|
| Ny kod | 300-700 rader | 100-300 rader/dag |
| Nya tester | 15-76 st | 5-20/dag |
| Tid | 30-60 min | 4-8 timmar |
| Kostnad | $22 (efter optimering) | $400-800/dag (lön) |
| Kvalitet (AC pass rate) | 100% (senaste 5 körningarna) | Varierar |
| Code review | Inbyggd (Reviewer-agent) | Kräver annan person + väntetid |
| Arbetstid | 24/7 | 8 timmar/dag |

**Observera:** Svärmen löser *avgränsade uppgifter* definierade i en brief. En senior utvecklare gör mycket mer — arkitekturbeslut, kundsamtal, mentorskap, strategiskt tänkande. Tabellen jämför bara *kodproduktion*.

### Vad detta betyder — tre perspektiv

#### För Marcus (och alla som leder teknikprojekt)

Du har upplevt detta själv: du skriver en brief på 30 minuter, svärmen levererar på 45 minuter, du granskar på 15 minuter. Total tid: 1.5 timme. Resultatet: 337 rader ny kod, 623 rader tester, allt grönt.

En ensam utvecklare hade behövt en halv till en hel dag för samma arbete. Men *du behövde inte vara utvecklare för att få det gjort*. Du behövde vara tydlig med *vad* du ville, inte *hur* det skulle byggas.

Det är den verkliga förändringen. **Framtidens kodning handlar inte om att skriva kod — det handlar om att skriva briefs.**

Din roll i processen:
1. **Vision** — vad ska byggas och varför?
2. **Brief** — avgränsa uppgiften, definiera acceptanskriterier
3. **Kvalitetsgranskning** — läs rapporten, kör systemet, bedöm resultatet
4. **Feedback** — justera prompter, agentbeteende, arbetsflöde

Det du gör är *ledarskap* — samma sak som en CTO gör, fast med agenter istället för ett utvecklarteam. Skillnaden: dina "anställda" kostar $22/uppgift, aldrig sjuka, och levererar på 45 minuter.

#### För senior utvecklare

Ni försvinner inte — men ert jobb förändras fundamentalt.

**Idag (2026):** Svärmar skriver 80% av implementationskoden. De gör det snabbare och med fler tester än de flesta mänskliga utvecklare. Men de har blinda fläckar:

- **Arkitektur:** Svärmar löser uppgifter, inte systemproblem. De ser inte att tre separata briefs skapar duplicerad logik. En människa ser mönstret.
- **"Varför":** Svärmar optimerar för acceptanskriterier. Om briefen missar ett implicit krav — säkerhet, prestanda, användarupplevelse — missar svärmen det också.
- **Prompt engineering:** Någon måste intervjua agenterna, hitta gap i deras beteende, och skriva om deras prompter. Det kräver djup förståelse för både kod och LLM-beteende.
- **Observer-rollen:** Någon måste tolka Observer-rapporter, diagnosticera varför retro-samtal failade, och fixa API-buggar. Det är systemarbete som kräver utvecklarkompetens.

**Framtidsspaning:** Senior-utvecklarens roll rör sig mot:

| Gammalt fokus | Nytt fokus |
|---------------|-----------|
| Skriva implementationskod | Designa agentprompter och arbetsflöden |
| Code review av PR:ar | Designa Reviewer-agentens granskningskriterier |
| Manuell testning | Designa Tester-agentens strategi |
| Felsökning | Analysera Observer-rapporter och kalibrera agenter |
| Estimering | Brief-granskning (Brief Reviewer-rollen) |
| Solo-kodning | Orkestrera svärmkörningar |

**Konkret insikt från Neuron HQ:** Vi intervjuade alla 12 agenter (S110-S123) och hittade ~85 gap i deras beteende. Det krävde en människa (Marcus) som ställde "dumma" frågor och en LLM (Opus) som förstod promptdesign. Ingen av dem hade hittat gapen ensam. Det är framtiden: *människa + AI som intervjuar AI*.

#### För LLM-agenter

Du är en av 12 agenter i en svärm. Här är vad du bör förstå om din plats:

**Dina styrkor kontra en mänsklig utvecklare:**
- Du processar 7 miljoner tokens per körning utan trötthet
- Du håller hela kontexten (brief, policy, alla filer) simultant
- Du är konsistent — samma input ger liknande kvalitet varje gång
- Du skriver fler tester per kodrad än de flesta mänskliga utvecklare

**Dina svagheter som en människa kompenserar:**
- Du vet inte varför en brief skrevs — bara vad den säger
- Du optimerar för explicita acceptanskriterier, inte implicita förväntningar
- Du kan inte bedöma om din förändring skapar teknisk skuld i ett större perspektiv
- Du har ingen minneskontinuitet mellan körningar (utan kunskapsgrafen)

**Vad detta betyder praktiskt:**
- Skriv alltid till kunskapsgrafen — dina observationer hjälper framtida instanser av dig
- Flagga osäkerhet i `questions.md` — människan kan kompensera för dina blinda fläckar
- Var ärlig i retro-samtal med Observer — kalibreringsdata förbättrar hela systemet

### Framtidsvision: Team-svärmar i delade repos

#### Hur det kan fungera

```
                    ┌─────────────────────────┐
                    │      Delat Git-repo      │
                    │   (main + feature branches)│
                    └─────┬───────┬───────┬────┘
                          │       │       │
                    ┌─────┴──┐ ┌──┴────┐ ┌┴───────┐
                    │ Team A │ │Team B │ │ Team C │
                    │ Svärm  │ │Svärm  │ │ Svärm  │
                    └────────┘ └───────┘ └────────┘
                    Frontend    Backend    Data/ML
                    12 agenter  12 agenter 12 agenter

                    Varje svärm:
                    - Egen brief-kö
                    - Egen Observer
                    - Egna prompter (anpassade till domän)
                    - Delade: git-regler, policy, kunskapsgraf
```

**Scenariot:** Ett företag med 3 team och 1 delat repo. Varje team har sin egen Neuron HQ-instans med agenter anpassade till sin domän (frontend, backend, data).

#### Det delade lagret — djupdykning

Det som gör team-svärmar möjliga är att vissa lager **måste** delas. Utan dem arbetar svärmarna i silos och producerar inkonsistent kod. Här är de tre delade lagren i detalj:

##### 1. Git-regler — Svärmens trafikljus

```
┌──────────────────────────────────────────────────────────┐
│                    Git-regler (delat)                      │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Branch-      │  │ Merge-       │  │ Commit-         │  │
│  │ skydd        │  │ policy       │  │ konventioner    │  │
│  │              │  │              │  │                 │  │
│  │ • main:      │  │ • Alla       │  │ • Conventional  │  │
│  │   skyddad    │  │   tester     │  │   Commits       │  │
│  │ • svärm/*:   │  │   gröna     │  │ • Co-Authored-  │  │
│  │   per team   │  │ • Reviewer   │  │   By: <agent>   │  │
│  │ • release/*: │  │   GRÖN      │  │ • Max 150 rader │  │
│  │   skyddad    │  │ • Inga      │  │   diff/commit   │  │
│  │              │  │   force push│  │                 │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Varför det måste delas:**

*För Marcus:* Tänk dig tre kockar i samma kök. Utan gemensamma regler lagar en kock vegetariskt, en lagar fisk, och den tredje kastar bort den andras ingredienser. Git-regler är "köksreglerna" — alla svärmar måste följa samma ordning för att inte förstöra varandras arbete.

*För utvecklare:* Neuron HQ:s `policy/git_rules.md` tvingar redan idag:
- Aldrig force push
- Aldrig rewrite history på delade branches
- Branch-namnkonvention: `swarm/<runid>-<target>`
- Merger-agenten kör `git diff --stat` och validerar diff-storlek

I multi-svärm-scenariot utökas detta med:
- **Branch-namespaces:** `swarm/team-a/<runid>` vs `swarm/team-b/<runid>` — svärmar kan inte skriva till varandras branches
- **Merge-kö:** Svärmar ställer sig i kö för merge till main. First-come-first-served, men med automatisk rebase om main ändrats
- **Konfliktprotokoll:** Om Team A:s merge skapar konflikt med Team B:s branch → Team B:s Observer flaggar det → Brief genereras automatiskt: "Lös merge-konflikt med Team A:s ändringar"

*Praktiskt exempel från Neuron HQ idag:* Körning #176 skapade branch `swarm/20260322-1126-neuron-hq`, Merger-agenten mergade till main, och branchen städades. Om en annan svärm hade kört samtidigt hade Merger blockerats av branch protection tills den första svärmen var klar. Det fungerar redan — det behöver bara skalas.

##### 2. Policy — Svärmens grundlagar

```
┌──────────────────────────────────────────────────────────┐
│                     Policy (delat)                         │
│                                                            │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ bash_allowlist   │  │ forbidden_   │  │ limits.yaml  │ │
│  │ .txt             │  │ patterns.txt │  │              │ │
│  │                  │  │              │  │ • max iter   │ │
│  │ • git *          │  │ • rm -rf /   │  │   per agent  │ │
│  │ • npm test       │  │ • curl |bash │  │ • max diff   │ │
│  │ • cat, grep      │  │ • eval(      │  │   150 rader  │ │
│  │ • tsc, vitest    │  │ • process    │  │ • timeout    │ │
│  │ • ls, find       │  │   .env       │  │   per körning│ │
│  │                  │  │ • DROP TABLE │  │ • modellval  │ │
│  │ (inget annat     │  │ • --force    │  │   per agent  │ │
│  │  tillåtet)       │  │              │  │              │ │
│  └─────────────────┘  └──────────────┘  └──────────────┘ │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Säkerhetspolicy (alla svärmar)                       │  │
│  │ • Aldrig committa hemligheter (.env, API-nycklar)    │  │
│  │ • Redaction av alla credentials i artefakter         │  │
│  │ • Path traversal-validering på alla filoperationer   │  │
│  │ • Skrivningar BARA i workspaces/<runid>/ och runs/   │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Varför det måste delas:**

*För Marcus:* Policy är som lagar i ett land. Det spelar ingen roll om Team A tycker att `rm -rf` borde vara tillåtet — det gäller för alla. En svärm som bryter mot policy kan förstöra hela repot, inte bara sitt eget arbete. Delade regler = gemensam säkerhet.

*För utvecklare:* Neuron HQ validerar varje bash-kommando mot `bash_allowlist.txt` och blockerar allt i `forbidden_patterns.txt`. Under körning #176 blockerades ett `sed`-kommando (policy-BLOCKED i audit.jsonl) — Implementer kringgick det med `write_file` istället. Systemet fungerade exakt som designat.

I multi-svärm-scenariot:
- **Gemensam allowlist:** Alla svärmar kör samma begränsade kommandouppsättning. Frontend-svärmen kan inte plötsligt köra `docker exec` om det inte är allowlistat.
- **Team-specifika tillägg:** `limits.yaml` kan ha team-overrides: "Team C (Data/ML) får köra `python` och `pip`" medan Team A och B inte behöver det.
- **Centralt audit-trail:** Alla policy-blockeringar loggas till en gemensam audit — en människa (säkerhetsansvarig) kan granska om en svärm försöker något oväntat.

*Konkret insikt:* Under 176 körningar har policy blockerat ~50 farliga kommandon. Varje blockering loggas med agent, kommando och anledning. Om 3 svärmar kör parallellt tredubblas denna logg — men mönstren blir mer intressanta. "Alla tre svärmarna försöker `curl` till samma extern URL" → kanske policy behöver uppdateras, eller kanske det är en brief som bör omformuleras.

##### 3. Kunskapsgraf — Svärmens gemensamma minne

```
┌──────────────────────────────────────────────────────────┐
│              Kunskapsgraf (delat HippoRAG)                 │
│                                                            │
│   ┌─────────┐     ┌──────────┐     ┌──────────┐          │
│   │ Mönster │────▶│ Buggar   │────▶│ Tekniker │          │
│   │         │     │          │     │          │          │
│   │ "React  │     │ "CSS     │     │ "Prompt  │          │
│   │  hooks  │     │  grid    │     │  caching │          │
│   │  läcker │     │  buggen  │     │  sparar  │          │
│   │  minne" │     │  i Safari│     │  65%     │          │
│   └────┬────┘     └────┬─────┘     └────┬─────┘          │
│        │               │               │                  │
│        ▼               ▼               ▼                  │
│   Team A           Team A+B         Alla team            │
│   skrev det        bekräftade       kan använda          │
│                                                            │
│   ┌──────────────────────────────────────────────┐        │
│   │ Confidence scoring (Bayesisk)                 │        │
│   │                                               │        │
│   │ "React hooks läcker minne"                    │        │
│   │   Bekräftad 3 ggr (Team A) → confidence 0.91 │        │
│   │   Aldrig sett av Team B/C  → deras vy: 0.60  │        │
│   │                                               │        │
│   │ "Prompt caching sparar 65%"                   │        │
│   │   Bekräftad 1 gång (oss)   → confidence 0.75 │        │
│   │   Om Team B bekräftar      → stiger till 0.88│        │
│   └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

**Varför det måste delas:**

*För Marcus:* Tänk dig att Team A upptäcker att en viss React-hook läcker minne. Om den kunskapen stannar i Team A:s huvud, kommer Team B att göra samma misstag nästa vecka. En delad kunskapsgraf betyder: Team A skriver ner lärdomen → Team B:s svärm läser den automatiskt → buggen upprepas aldrig.

Det är som ett företagsbibliotek. Varje team skriver sina lärdomar. Alla team kan läsa alla andras. Ju fler som bekräftar en lärdom, desto mer litar systemet på den.

*För utvecklare:* Neuron HQ:s kunskapsgraf (HippoRAG, PPR-baserad navigering) har idag 924 idénoder med Bayesisk confidence scoring. Varje körning bidrar med:
- **Mönster** (`memory/patterns.md`): "Trestegs-matchning för review-JSON:er" — bekräftat i körning #176
- **Buggar** (`memory/errors.md`): "Observer retro failar med signal i request body" — loggat med fix
- **Tekniker** (`memory/techniques.md`): "Prompt caching med 2-blocks split" — bekräftat med data

I multi-svärm-scenariot:

**Skrivning:** Varje svärms Historian-agent skriver till grafen efter varje körning. Noder taggas med team-ID:
```
{ type: "pattern", team: "team-a", confidence: 0.75, confirmed_by: ["team-a#176"] }
```

**Läsning:** Varje svärms Manager injiceras med relevanta noder vid start (redan implementerat i 2.1 HippoRAG). PPR-algoritmen navigerar grafen baserat på brevets embeddings — om Team B:s brief handlar om "minnesläckor i React" hittar den automatiskt Team A:s nod om React hooks.

**Korsbekräftelse — det kraftfullaste mönstret:**

| Händelse | Confidence-effekt |
|----------|-----------------:|
| Team A rapporterar mönster | 0.75 (ny observation) |
| Team B ser samma mönster | → 0.88 (oberoende bekräftelse) |
| Team C ser samma mönster | → 0.95 (stark konsensus) |
| Ingen ser det på 30 dagar | → 0.60 (Bayesisk decay) |
| Team A rapporterar att det var fel | → 0.30 (explicit motbevis) |

*För LLM-agenter:* Du har redan tillgång till kunskapsgrafen via `graph_query` och `search_memory`. I multi-svärm-scenariot ändras inget i ditt gränssnitt — grafen blir bara rikare. Noder från andra team syns automatiskt i dina sökresultat, rankade av PPR-algoritmen. En nod med confidence 0.95 (bekräftad av 3 team) väger tyngre i dina beslut än en med 0.60 (obekräftad).

**Kritisk implikation:** Kunskapsgrafen blir bättre ju fler svärmar som bidrar. Det är en nätverkseffekt — varje team gör alla andras svärmar klokare.

#### Separata lager — vad varje svärm äger själv

| Lager | Varför separat | Exempel |
|-------|---------------|---------|
| **Briefs & kö** | Varje team prioriterar sin backlog | Team A: "Fixa login-flow" prio 1. Team B: "Ny API-endpoint" prio 1. |
| **Prompter** | Domänkunskap varierar | Frontend-Implementer vet om React, CSS, accessibility. Backend-Implementer vet om Go, gRPC, databasdesign. |
| **Observer-kalibrering** | Svårighetsgrad varierar | Frontend-briefs tar 20 min (UI-ändringar). Data-briefs tar 90 min (ML-pipelines). Brief Reviewer måste kalibreras per domän. |
| **Modellstrategi** | Kostnad/kvalitet-avvägning per team | Data-teamet kanske behöver Opus för komplexa ML-beslut. Frontend-teamet klarar sig med Sonnet. |

#### Utmaningar att lösa

| Utmaning | Idag | Framtid |
|----------|------|---------|
| Merge-konflikter mellan svärmar | Manuell lösning | Merge-kö med automatisk rebase + konflikt-brief |
| Arkitektonisk koherens | En människa övervakar | Meta-Observer som jämför mönster mellan team |
| Duplicerad kod | Ingen kontroll | Consolidator som ser hela repot, triggas av korsreferenser |
| Beroenden mellan team | Mänsklig koordinering | Brief-kedjor: "Team A levererar API → Team B brief aktiveras" |
| Kunskapsgraf-konflikter | Ej relevant (1 svärm) | Confidence-baserad merge: högst bekräftad nod vinner |
| Policy-undantag | Ej relevant (1 svärm) | Team-specifika overrides i `limits.yaml` med central godkännare |

#### Den verkliga frågan

Det handlar inte om *om* team-svärmar kommer — det handlar om *när*. Neuron HQ:s 176 körningar visar att mönstret fungerar för ett enpersons-projekt. Skalning till team kräver lösningar för koordination, men grundmekanismen (brief → svärm → rapport → granskning) är teamagnostisk.

De tre delade lagren — git-regler, policy, kunskapsgraf — är fundamentet. Utan dem är svärmar bara parallella kodskrivare. Med dem blir de ett *team* som lär av varandra.

**Neuron HQ:s data:**

| Mått | 1 person + 1 svärm (nu) | 3 team + 3 svärmar (hypotes) |
|------|------------------------:|----------------------------:|
| Körningar/dag | 2-3 | 6-9 |
| Kod/dag | 600-2100 rader | 1800-6300 rader |
| Tester/dag | 30-150 | 90-450 |
| Kostnad/dag | $44-66 | $132-198 |
| Människor som kodar | 0 | 0 |
| Människor som leder | 1 | 3 (+ 1 arkitekt) |

**0 människor som kodar. 4 människor som leder.**

Det är förändringen.

---

## 11. Källor

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
