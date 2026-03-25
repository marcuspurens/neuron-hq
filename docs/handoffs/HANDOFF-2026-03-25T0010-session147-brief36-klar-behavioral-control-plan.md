# HANDOFF-2026-03-25T0010 — Session 147: Brief 3.6 GRÖN + Behavioral Control Plan

## Vad som gjordes

### 1. Brief 3.6 skriven och GODKÄND (9/10)

Skrev Brief 3.6 (Historian/Consolidator reliability) efter att ha läst alla 4 nyckelfiler:
- `src/core/agents/historian.ts` — inline 0-token-check rad 239 (bara iteration 1, 5s delay)
- `src/core/agents/consolidator.ts` — identisk inline check rad 175
- `src/core/agents/agent-utils.ts` — `withRetry()` fångar bara HTTP-errors, inte 0-token
- `src/core/agents/observer.ts` — ingen check för 0-token-agenter

**Brief Reviewer:** 2 rundor.
- Runda 1: ❌ UNDERKÄND — namninkonsistens (`retryOnEmptyResponse` vs `streamWithEmptyRetry`), AC6 saknade `iteration`, `StreamWithRetryOptions` saknade `iteration`
- Runda 2: ✅ GODKÄND 9/10 — alla fixar verifierade
- Konversation: `runs/reviews/review-1774385914601.json`

**Insikt om varför briefen gick snabbt (2 rundor istället för 7-9):** Jag läste ALL relevant kod INNAN jag skrev. Briefen blev en formalisering av vad jag redan förstod, inte en gissning som itererades fram. Sparad som `feedback-read-code-before-brief.md`.

### 2. Körning 3.6 — GRÖN

| Mått | Värde |
|------|-------|
| Status | 🟢 GREEN |
| AC | 12/12 |
| Tester | 3917 (+8) |
| Kostnad | $60.54 |
| Run ID | 20260324-2114-neuron-hq |

**Levererat:**
- `streamWithEmptyRetry()` + `isEmptyResponse()` i agent-utils.ts
- `EMPTY_RETRY_DELAYS = [5_000, 15_000, 30_000]`
- Historian + Consolidator använder gemensam 0-token-retry
- Observer `checkZeroTokenAgents()` flaggar 0-token-agenter
- 47 nya tester

**Knowledge.md noterade:** `estimateMessagesChars()` var inte exporterad — briefen sa att den var tillgänglig men den var privat. Implementern fixade det. Brief Reviewer hade flaggat det som "ej verifierbart" och hade rätt.

### 3. Djupsamtal: Varför gör agenterna samma misstag i 20 körningar?

Marcus frågade varför samma retro-insikter upprepas utan förändring. Djupsamtal ledde till insikten:

**Rotorsak:** Systemet har en sensor (Observer) men ingen regulator. Retro-insikter skrivs till fil men flödar aldrig tillbaka till prompter eller policy. Varje körning startar med identiska prompter — agenterna har inget minne av sina egna misstag.

**Bevis från körning 3.6:**
- Manager: 109 bash_exec (retro: "borde vara <60")
- Implementer: 200 bash_exec, 124/180 iterationer (retro: "verification tunnel vision")
- Consolidator: $19.51 för 11k output tokens, 37 graph_query (retro: "redundant utforskning")
- Reviewer: 59 bash_exec (retro: "dubbelkollar Tester")
- Totalt: 418 bash_exec

### 4. Behavioral Control Plan

Designade ett trelagersystem baserat på kontrollteori:

| Lager | Funktion | Mekanism |
|-------|----------|----------|
| 1. Enforcement | Hårda tool-call-budgetar | `limits.yaml` + `PolicyEnforcer` WARN/BLOCK |
| 2. Signal | Mid-run-varning vid 80% | Prepend till tool_result |
| 3. Lärande | Retro → prompt-pipeline | Lessons med livscykel (aktiv → retired/graduated) |

**Nyckelinsikt:** `this.ctx.usage.recordToolCall(block.name)` anropas FÖRE varje tool-exekvering i varje agent. Det är den perfekta interception-punkten — ingen ny arkitektur behövs.

**Plan sparad:** `docs/PLAN-behavioral-control.md`

Marcus djuptänkte med mig om hur retro-lessons tas bort (pensionering efter 3 lyckade körningar, graduation till policy-limit efter 5+ misslyckade). Livscykeln liknar `applyConfidenceDecay()` som redan finns i kunskapsgrafen.

### 5. ROADMAP.md uppdaterad

| Ändring | Detalj |
|---------|--------|
| 3.5 | ⬜ → ✅ S143 |
| 3.6 | Ny: Historian/Consolidator reliability ✅ S147 |
| 3.6b | Agentintervjuer (omdöpt från 3.6) |
| 3.7 | Ny: Tool-call-budgetar + mid-run-varningar ⬜ |
| 3.8 | Ny: Retro → Prompt-pipeline ⬜ |
| Totalt | 24/30 klar (var 23/28) |
| Tester | 3917 (var 3916) |
| Körningar | 181 (var 180) |

### 6. Minnen sparade

| Fil | Typ | Innehåll |
|-----|-----|----------|
| `feedback-read-code-before-brief.md` | feedback | Läs ALL kod innan brief — 2 rundor istället för 7-9 |
| `MEMORY.md` | index | Uppdaterad med S146-status + ny feedback |

## Vad som INTE gjordes

- Brief 3.7 (tool-call-budgetar) — plan finns, brief ej skriven
- Brief 3.8 (retro-pipeline) — plan finns, brief ej skriven
- Aurora-repot — fortfarande trasigt (MCP-refaktorering)
- Commit av körning 3.6:s artefakter — ej bett om

## Filer ändrade denna session

| Fil | Ändring |
|-----|---------|
| `briefs/2026-03-24-historian-consolidator-reliability.md` | Brief 3.6 — NY |
| `docs/PLAN-behavioral-control.md` | Detaljerad plan 3.7+3.8 — NY |
| `docs/handoffs/HANDOFF-2026-03-25T0010-...md` | Denna handoff — NY |
| `ROADMAP.md` | 3.5✅, 3.6✅, 3.7⬜, 3.8⬜, stats |
| `memory/feedback-read-code-before-brief.md` | Ny feedback |
| `memory/MEMORY.md` | Uppdaterat index |

---

## Aurora Sprint-status

- Sprint-plan: [docs/SPRINT-PLAN-AURORA.md](../SPRINT-PLAN-AURORA.md) (v2, dubbelkollad S145)
- Aurora roadmap: [ROADMAP-AURORA.md](../../ROADMAP-AURORA.md)

| Fas | Status | Detalj |
|-----|--------|--------|
| Fas 0: Förberedelser | ✅ F1-F5 klar, ✅ N1 (3.6) GRÖN | Aurora-repo FORTFARANDE TRASIGT (MCP) |
| Fas 1: N1 (Brief 3.6) | ✅ GRÖN | Gate passerad — Historian tappar inte längre data |
| Fas 2: Aurora-körningar A1-A2 | ⬜ | Blockerat av Aurora-repo-fix |
| Fas 3: Fria körningar A3-A8 | ⬜ | Efter A1-A2 + utvärdering |

**Nästa Aurora-steg:** Fixa Aurora-repot (reverta MCP-refaktorering), verifiera 236 tester, sedan Brief A1 (Obsidian round-trip).

**Beslutspunkt:** Marcus väljer om nästa session ska vara Brief 3.7 (Neuron tool-budgetar) eller Aurora-fix + Brief A1. Båda vägar är öppna — N1-gate är passerad.

---

## Nästa session: Brief 3.7 — Tool-call-budgetar (ELLER Aurora)

### Kontext

**Rotorsak:** Agenter slösar tool calls (418 bash_exec i senaste körningen). Retro diagnostiserar rätt men insikterna försvinner. Lösning: hårda budgetar i policy + mid-run-varningar.

### Mål

1. Läsa `src/core/usage.ts`, `src/core/policy.ts`, `src/core/types.ts` — förstå nuvarande tracking + enforcement
2. Läsa `docs/PLAN-behavioral-control.md` — fullständig design
3. Skriva Brief 3.7 med exakta kodankare
4. Granska med Brief Reviewer
5. Marcus kör körningen

### Filer att studera

| Fil | Varför |
|-----|--------|
| `src/core/usage.ts` | `UsageTracker`, `recordToolCall()` — utökas med per-agent tracking |
| `src/core/policy.ts` | `PolicyEnforcer`, `checkDiffSize()` — WARN/BLOCK-mönstret att återanvända |
| `src/core/types.ts` | `PolicyLimitsSchema` — utökas med `tool_budgets` |
| `policy/limits.yaml` | Befintliga limits — utökas |
| `src/core/agents/manager.ts:694-698` | Tool-exekvering — interception-punkt |
| `src/core/agents/implementer.ts:264-266` | Samma mönster |
| `docs/PLAN-behavioral-control.md` | Fullständig designplan |

### Arbetsordning

1. Läs usage.ts + policy.ts + types.ts — förstå befintlig arkitektur
2. Verifiera att `recordToolCall()` i varje agent har samma mönster
3. Skriv briefen med kodankare
4. Egen CoT-granskning
5. Brief Reviewer
6. Marcus kör

### Regler

- **Skriv brief → Marcus kör → läs rapport.** Kör aldrig `run` själv.
- **Dubbelkolla planer mot faktisk kod** (S145-insikt)
- **Läs ALL kod innan brief** (S147-insikt — detta gav 2 rundor istället för 7-9)
- Brief 3.7 **måste vara GRÖN** innan Brief 3.8 startar

---

## VIKTIGT för nästa chatt

- Läs ROADMAP.md och MEMORY.md noggrant innan du agerar
- **CoT (Chain of Thought):** Visa alltid ditt resonemang som synlig text i chatten
- **Persisted-output:** Kör agent-dialoger (brief-review etc.) via bash så Marcus kan klicka och läsa i chatten
- Läs dessa minnen INNAN du agerar:
  - `feedback-always-cot.md`
  - `feedback-brief-review-always.md`
  - `feedback-brief-quality.md`
  - `feedback-never-run-commands.md`
  - `feedback-doublecheck-plans.md`
  - `feedback-read-code-before-brief.md` ← NY från denna session
  - `project-aurora-pivot.md`
