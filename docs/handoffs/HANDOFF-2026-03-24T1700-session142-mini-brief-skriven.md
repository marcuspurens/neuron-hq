# HANDOFF-2026-03-24T1700 — Session 142: Mini-brief 3.5 skriven + 3 bollningsrundor

## Bakgrund

Session 141 fixade alla agentproblem från 3.2b. Nästa steg: skriva en mini-brief för diagnostisk körning som testar att alla agentfixar fungerar. Marcus bad mig välja rätt ROADMAP-punkt och skriva briefen.

## Samtalsflöde

### 1. ROADMAP-analys och val

Läste hela ROADMAP.md. Öppna punkter: 3.3 (Research före implementation), 3.4 (Schemalagda agent-samtal), 3.5 (Dynamisk diff-limit), 2.8 (AI Act Art. 14).

Valde **3.5 Dynamisk diff-limit** — bäst diagnostiskt värde:
- Liten scope men berör hela stacken (policy, types, Manager, Implementer, prompter)
- Alla 10 agenter får meningsfullt arbete
- Befintliga policy-tester att baseline mot
- Researcher triggas via `⚡ Auto-trigger`

### 2. Brief skriven + Code Anchor R1

Skrev briefen. Körde Code Anchor (40 iterationer). Hittade 5 avvikelser:
- **BLOCK:** `PolicyEngine` → `PolicyEnforcer` (klassen heter annorlunda)
- **BLOCK:** `TaskPlanItemSchema` → `AtomicTaskSchema` (schemat heter annorlunda)
- **WARN:** Reviewer läser INTE task_plan.md — ny funktionalitet, inte existerande
- **WARN:** Manager har 4 ställen med "150 lines" (inte bara 1)
- **INFO:** Radnummer i implementer.md stämmer (rad 9 och 102)

Fixade alla 5 i briefen.

### 3. Brief Reviewer R1 — 7.6/10 UNDERKÄND

Två kritiska problem:
1. **Override > BLOCK-gränsen ospecificerat** — `diff_override_max_lines: 500` men BLOCK=300, skapar "omöjligt fönster" [301-500]
2. **Reviewer vet inte vilken task** — `delegateToReviewer()` utan task-identitet

Fixade:
- Override klipps mot BLOCK
- Manager injicerar direkt i Reviewer-kontext

### 4. Brief Reviewer R2 — 7.8/10 UNDERKÄND

Två nya kritiska problem:
1. **`diff_override_max_lines: 500` är meningslös** — `min(x, 500, 300)` = alltid `min(x, 300)`. Nyckeln binder aldrig.
2. **State-hantering `currentTaskDiffOverride`** — stale state-risk mellan tasks

### 5. Djuptänkande — 3 varv

Marcus bad mig tänka djupare, flera gånger. Tre insikter:

**Varv 1:** Ta bort `diff_override_max_lines`. BLOCK-gränsen ÄR taket.

**Varv 2:** Reviewer behöver INTE override. Override = kontrakt mellan Manager och Implementer (tillstånd att arbeta), inte instruktion till Reviewer (bedöm annorlunda). Reviewer bedömer oberoende — kan läsa task_plan.md om den vill förstå varför diffen är stor.

**Varv 3:** Implementer-prompt ska BEHÅLLA "150" med "unless overridden" — defensivt mot injektionsfel. Manager ska ALLTID injicera gräns (150 eller override) — explicit > implicit. Policy.ts förblir ren funktion — ingen audit-loggning där.

### 6. Omskrivning från scratch

Briefen hade 3 lager av inkrementella fixar — arkeologiska lager. Skrev om helt från scratch med slutgiltig design.

## Slutgiltig brief-design

| Designbeslut | Val |
|-------------|-----|
| Override-tidpunkt | Planeringstid (Manager planerar, inte runtime-förhandling) |
| Tak | `diff_block_lines` (300) — ingen separat config-nyckel |
| Reviewer | Oberoende — ingen override-injektion |
| Implementer-prompt | Behåller "150" + "unless overridden" (defensivt) |
| Manager-injektion | ALLTID — "Diff limit: 150/250 lines" |
| Policy.ts | Ren funktion — tar override-param, ingen audit |
| Audit | Bara `diff_override_set` vid planering |

**6 filer, 12 AC:er.**

## Brief-fil

`briefs/2026-03-24-dynamic-diff-limit.md`

## Ändrade filer (inga commits denna session — bara briefen)

| Fil | Ändring |
|-----|---------|
| `briefs/2026-03-24-dynamic-diff-limit.md` | NY — mini-brief 3.5 dynamisk diff-limit |

## Tester

3898 gröna (oförändrat — inga kodändringar denna session).

## Inte gjort

- Code Anchor R2 mot omskriven brief
- Brief Reviewer R3 mot omskriven brief
- Commit av briefen
- Körning

## Nästa steg — PRIO

1. **Code Anchor R2** mot den omskrivna briefen (verifiera att alla kodreferenser stämmer)
2. **Brief Reviewer R3** (bör godkänna — alla kritiska problem lösta)
3. **Committa briefen**
4. **Marcus kör:** `npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-24-dynamic-diff-limit.md --hours 1`
5. **Läs alla agentrapporter** — speciellt:
   - Historian/Consolidator: fungerar retry-logiken? (0-token-fix från S141)
   - Manager: exploration < 60 bash-anrop? (antipattern #1 fix)
   - Reviewer: pre-verification planning? (ny sektion)
   - Researcher: brief-specifika söktermer? (ny strategi)
   - Observer: renare rapport utan false positives? (aurora_search fix)

## Branch

`swarm/20260324-0959-neuron-hq` — inga nya commits denna session.

## VIKTIGT för nästa chatt

Läs MEMORY.md och denna handoff noggrant. Briefen i `briefs/2026-03-24-dynamic-diff-limit.md` är FÄRDIGDESIGNAD — kör Code Anchor R2 + Brief Reviewer R3, committa, ge Marcus kommandot.

Kör ALDRIG `run` själv. CoT. Läs feedback-always-cot.md, feedback-never-run-commands.md, feedback-always-commit.md.
