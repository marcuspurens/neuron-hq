# Research: Token-optimering i multi-agent LLM-system

> **Datum:** 2026-03-22 · Session 125
> **Kontext:** Neuron HQ-körningar ökade från ~8M till ~20M tokens efter prompt-förbättringar (S120-S124)
> **Syfte:** Hitta etablerade mönster för att balansera djup vs kostnad

---

## TIER 1 — Direkt applicerbart på Neuron HQ

### 1. Sub-Agent Context Isolation (HÖG PÅVERKAN)

**Insikt:** Varje sub-agent ska bara få minimal kontext och returnera en komprimerad sammanfattning (under 500-2000 tokens) till parent. Parent-agenten ska aldrig se raw tool outputs från barn-agenter.

**Evidens:** Google ADK, Anthropic, Pydantic AI, Vercel AI SDK och LangChain konvergerar alla på detta mönster. Anthropic rekommenderar specifikt: "Every model call sees the minimum context required, and agents must reach for more information explicitly via tools."

**Relevans för Neuron HQ:** Om Manager tar emot fulla konversationshistorik från sub-agenter istället för sammanfattningar, snöbollar token-användningen. Varje agent bör arbeta i isolerad kontext och returnera en strukturerad, kompakt rapport.

**Källor:**
- Anthropic: Effective Context Engineering for AI Agents
- Google: Architecting Efficient Context-Aware Multi-Agent Framework
- Dev.to: Why One Agent Isn't Enough - Subagent Delegation

---

### 2. Tool Result Clearing (HÖG PÅVERKAN, LÅG ANSTRÄNGNING)

**Insikt:** Anthropics API stöder nu server-side `clear_tool_uses_20250919`-strategi. När Claude har bearbetat en filläsning eller sökresultat, ersätts råinnehållet med en platshållare. Detta är "one of the safest and lightest touch forms of compaction."

**Konfiguration:** Sätt en `trigger_tokens`-tröskel (t.ex. 80% av context window). När den överskrids rensas äldsta tool-resultat kronologiskt. En `clear_at_least`-parameter säkerställer att tillräckligt med tokens frigörs.

**Relevans för Neuron HQ:** Våra agenter gör tung tool-användning (filläsningar, grep, bash). Körning #174 visade Manager med 55 `read_file`-anrop. De råa filinnehållen ackumuleras i kontexten. Att aktivera tool result clearing kan dramatiskt minska token-slöseri i långkörande agenter.

**Källa:** Anthropic: Context Editing API Docs

---

### 3. Model Cascading / Tiered Model Assignment (HÖG PÅVERKAN)

**Insikt:** Använd billiga modeller för rutinuppgifter, dyra modeller bara för beslut som kräver det. BudgetMLAgent uppnådde 94.2% kostnadsreduktion (från $0.931 till $0.054 per körning) med BÄTTRE prestanda genom att kaskadkoppla från fria/billiga modeller till GPT-4 bara vid behov.

**Mönster:** "Ask-the-Expert Lifelines" — en planeringsagent får begränsade anrop till den dyra modellen. Worker-agenter använder billigare modeller för exekvering.

**Relevans för Neuron HQ:** Vi har redan börjat detta (S123: Sonnet default, Opus för Manager/Reviewer). Forskningen validerar detta. Överväg att gå längre: Implementers rutinmässiga kodändringar kan använda Sonnet, med Opus-eskalering bara för komplexa arkitekturbeslut.

**Källor:**
- BudgetMLAgent (arxiv: 2411.07464v1)
- LLM Cascading Cost Optimization
- CascadeFlow GitHub

---

### 4. Prompt Caching för delade systemprompts (MEDIUM PÅVERKAN, LÅG ANSTRÄNGNING)

**Insikt:** System-prompt-only caching ger mest konsekvent kostnad- och latensförbättring. Cachade tokens kostar ~10% av vanliga input-tokens (90% besparing på cachad del). Specifikt för Anthropic: cache reads kostar $0.30/MTok vs $3.00/MTok nytt.

**Kritisk detalj:** Dynamiskt innehåll (tidsstämplar, sessions-IDn, ändrade tool-definitioner) bryter cache-prefix. Håll statiskt innehåll (systemprompts, preamble) längst fram i kontexten, dynamiskt innehåll sist.

**Relevans för Neuron HQ:** Vår `prompts/preamble.md` injiceras i alla 11 agenter. Om vi strukturerar API-anrop så att preamble + rollprompt bildar ett stabilt prefix, får varje efterföljande turn 90% billigare input-bearbetning för den delen.

**Källa:** Don't Break the Cache (arxiv: 2601.06007v1)

---

### 5. Server-Side Compaction för långkörande agenter (MEDIUM PÅVERKAN)

**Insikt:** Anthropics API och Claude Agent SDK stöder automatisk kontext-kompaktering. När token-antal överskrider en tröskel injiceras en sammanfattningsprompt, Claude genererar en strukturerad sammanfattning, och full historik ersätts. Möjliggör att agenter kan köra obegränsat utan att nå kontextgränser.

**Relevans för Neuron HQ:** Våra agenter kör 30-60 minuter med 50+ iterationer. Kontext-kompaktering förhindrar "context rot" där noggrannhet försämras när fönstret fylls.

**Källa:** Claude Agent SDK Overview, Anthropic: Building Agents with Claude Agent SDK

---

## TIER 2 — Värdefulla mönster att överväga

### 6. Agent Contracts: Formella resursbudgetar

**Insikt:** "Agent Contracts"-pappret formaliserar resursstyrning som en tupel (I, O, S, R, T, phi, psi) där R är en flerdimensionell budgetvektor: tokens, API-anrop, iterationer, beräkningstid, USD. Ramverket uppnådde 90% token-reduktion med 525x lägre varians på code review-uppgifter.

**Nyckelupptäckt:** "Simply granting larger tool-call budgets fails to improve agent performance; explicit budget awareness enables effective scaling." Alltså: att bara ge agenter mer utrymme ≠ bättre resultat.

**Relevans:** Formaliserar vad Neuron HQ gör informellt med `limits.yaml`. Konservationslagen för hierarkisk delegering (summan av barnbudgetar ≤ föräldrabudget) är direkt relevant.

**Källa:** Agent Contracts (arxiv: 2601.08815v1)

---

### 7. Token-Budget-Aware Reasoning (TALE)

**Insikt:** Att inkludera en token-budget i prompten kan minska output-tokens med 50-67% med bibehållen noggrannhet (inom 3%). Men det finns ett kritiskt fenomen: "token elasticity" — för små budgetar ökar paradoxalt nog förbrukningen. Det finns ett "idealiskt budgetintervall" per uppgiftskomplexitet.

**Relevans:** Vi kan experimentera med budget-hints i agentprompter: "Aim to complete this task in approximately N tokens of reasoning." Kräver kalibrering per uppgiftstyp.

**Källa:** Token-Budget-Aware LLM Reasoning (arxiv: 2412.18547v5)

---

### 8. OPTIMA: Tränad kommunikationseffektivitet

**Insikt:** Multi-agent-system kan tränas att kommunicera 90% mer effektivt. Agenter utvecklas naturligt från verbose naturligt språk till "concise, structured, task-oriented exchanges" när de optimeras. 2.8x prestandaökning med <10% tokens.

**Relevans:** Inte direkt implementerbart (kräver fine-tuning), men validerar en designprincip: agent-till-agent-kommunikation bör vara strukturerad data, inte prosa.

**Källa:** OPTIMA (arxiv: 2410.08115v1)

---

### 9. Strukturerad anteckningsföring / Externt minne

**Insikt:** Agenter underhåller externa minnesfiler (som NOTES.md) för persistent spårning mellan tool-anrop. Möjliggör multi-timmes koherens utan att hålla allt i aktivt kontext. Anthropic kallar detta "agentic memory."

**Relevans:** Vår Observer-agent och `memory/`-katalog implementerar redan en version av detta. Forskningen validerar mönstret.

**Källa:** Anthropic: Context Engineering

---

## TIER 3 — Industrikontex & trender

### 10. Kostnad är inte längre #1-problemet (men token-effektivitet spelar roll)

LangChains State of Agent Engineering-undersökning fann att kvalitet (32%) och latens (20%) nu väger tyngre än kostnad. Men vid Neuron HQs skala ($36-61/körning Sonnet, $307 Opus) är kostnadsdisciplin fortfarande kritisk.

### 11. Framework Token Overhead-jämförelse

| Framework | Tokens/request (3 agenter) | Daglig kostnad (10k req, GPT-4o) |
|-----------|---------------------------|----------------------------------|
| LangGraph | ~800 | ~$32 |
| CrewAI | ~1,250 (+56%) | ~$50 |

Neuron HQs custom TypeScript-framework undviker framework-overhead och ger LangGraph-liknande kontroll.

### 12. Observability — branschstandard

89% av organisationer med produktionsagenter har implementerat observabilitet. Langfuse (som vi redan har) stöder per-trace kostnadsattribution och agent-level token breakdown.

### 13. Context Files (AGENTS.md) kan faktiskt skada

**InfoQ (mars 2026):** LLM-genererade kontextfiler minskar task-success med 3% och ökar inference-kostnader med 20%+. Human-written filer hjälper bara marginellt (+4% success) och ökar också kostnader (+19%). Rekommendation: inkludera bara icke-upptäckbar information (tooling-gotchas, konventioner som inte kan hittas genom att läsa kod).

**Neuron HQs `CLAUDE.md` och `.claude/rules/` är human-written och innehåller genuint icke-upptäckbara konventioner — korrekt approach.**

---

## Top 5 rekommendationer för Neuron HQ

| Prio | Åtgärd | Förväntad påverkan | Ansträngning |
|------|--------|---------------------|--------------|
| 1 | Aktivera `clear_tool_uses_20250919` i `agent-client.ts` | 30-50% token-reduktion på långa körningar | Låg |
| 2 | Strukturera API-anrop för prompt caching (preamble + rollprompt som stabilt prefix) | ~90% besparing på cachad del | Låg-Medium |
| 3 | Aktivera SDK compaction med konfigurerbar tröskel | Förhindrar context rot i 50+ iterationer | Låg |
| 4 | Tvinga sub-agent summary-only returns (max 1-2k tokens tillbaka till Manager) | Förhindrar context-snöboll i orchestrator | Medium |
| 5 | Formalisera per-agent token-budgetar i `limits.yaml` med Agent Contracts-modellen | Förutsägbara kostnader, lägre varians | Medium |

---

## Slutsats

Vi är inte ensamma. Hela industrin brottas med samma problem — men lösningarna finns. De tre mest lovande för oss:

1. **Tool result clearing** — gratis, inbyggt i Anthropics API, massiv påverkan
2. **Prompt caching** — vi betalar redan för static content varje anrop
3. **Compaction** — SDK-native, förhindrar context rot

Kombination av dessa tre kan troligen ta tillbaka oss till 7-10M tokens per körning utan att offra den djup vi vann i S120-S124.
