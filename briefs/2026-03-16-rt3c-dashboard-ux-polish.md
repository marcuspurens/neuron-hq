# RT-3c: Dashboard UX-polish — Läsbar header, uppgiftsbeskrivningar, besluts-filtrering

**Bygger på:** RT-1a/b/c + RT-2 + RT-3 + RT-3b

> *"Jag ser direkt: hur långt har vi kommit, vad kostar det, och vad gör varje uppgift."*

---

## Bakgrund

Dashboardens header, uppgiftslista och besluts-sektion har UX-problem som gör den svår att använda för en icke-utvecklare:

### Problem 1: Headern visar rå data
```
⏱ 00:00 / --:--   🔄 19/100   📊 in:972.8k out:11.4k   💰 $3.09
```
- Timer visar 00:00 trots att körningen pågått 19 minuter (bugg)
- "19/100" = iterationer, men vad betyder det?
- "in:972.8k out:11.4k" = tokens, meningsfullt men svårläst
- Saknas: hur många uppgifter klara, latency/hastighet

### Problem 2: Uppgiftslistan saknar beskrivning
```
🔄 T1 — running
🔄 T2 — running
✅ T7 — completed
```
Vad gör T1? Vad gör T7? Beskrivningen finns i `task:status`-events (`data.description`) och `taskDescriptions`-mappen, men visas inte alltid.

### Problem 3: Beslut-sektionen i digesten brus
Från körning 149: Reviewer har 55 rader "Review action: bash_exec (viss osäkerhet)". Heuristiken i `decision-extractor.ts` klassificerar varje tool call som beslut.

---

## Mål

### Del A: Läsbar header

Ersätt headern med:

```
NEURON HQ — Körning 20260316-1415-neuron-hq
⏱ 19:32 / 46:00   📋 5/10 uppgifter   📊 973k in · 11k ut   💰 $3.09   ⚡ 42 tok/s
```

**Ändringar:**

1. **Timer fixad:** `time`-events har `elapsed` och `remaining` — beräkna `MM:SS / total:SS`. Buggen: headern uppdateras redan korrekt i `handleEvent` men timer-eventet emitteras inte ofta nog. Lösning: beräkna timer client-side med `setInterval` baserad på senaste `time`-event.

2. **Uppgiftsräknare:** `📋 5/10 uppgifter` — räkna `completed` / `total` från tasks-mappen.

3. **Tokens läsbart:** `973k in · 11k ut` istället för `in:972.8k out:11.4k`. Behåll men avrunda.

4. **Latency/hastighet:** `⚡ 42 tok/s` — beräkna output tokens per sekund baserat på senaste tokens-event vs tid. Uppdateras var 5:e sekund.

5. **Iterationsräknare borttagen från header** — flytta till agent-panelerna där den hör hemma. Headern visar "uppgifter" istället.

### Del B: Uppgiftslista med beskrivning och wave-gruppering

Nuvarande:
```
🔄 T1 — running
✅ T2 — completed
```

Nytt:
```
━━━ Wave 1 ━━━
✅ T1 — Beslutsextraktor (decision-extractor.ts)     👷 Implementer · 6 min
✅ T2 — Synfältsspårning (field-of-view.ts)           👷 Implementer · 5 min
━━━ Wave 2 ━━━
🔄 T5 — Ny event-typ i EventBus                      👷 Implementer · pågår
🔄 T6 — Narrativ med osäkerhetsmarkörer               👷 Implementer · pågår
🔄 T7 — Decisions endpoint i dashboard-server         👷 Implementer · pågår
⏳ T8 — Digest-utökning med beslut                     —
━━━ Wave 3 ━━━
⏳ T9 — Dashboard-UI med beslutskedja                  —
⏳ T10 — Tester                                        —
```

**Hur:**

1. **Beskrivning:** `task:status`-events har `data.description`. Spara i `taskDescriptions` (redan finns, men visas bara ibland). Fallback: parsa `write_task_plan` audit-entry för att hämta planen.

2. **Wave-gruppering:** Manager emitterar `delegate_parallel_wave` med wave-nummer. Fånga i handleEvent och gruppera tasks.

3. **Agentnamn + tid:** Spara `taskAgents[taskId]` (redan finns) + `taskStartTime[taskId]`. Visa tidsåtgång per uppgift.

### Del C: Besluts-filtrering i digest

Problemet i `run-digest.ts` → `Beslut`-sektionen:

```
Reviewer fattade 55 beslut:
- ⚠️ Review action: bash_exec (viss osäkerhet)
- ⚠️ Review action: bash_exec (viss osäkerhet)
(53 till...)
```

**Lösning: Aggregera och filtrera**

```typescript
// I run-digest.ts, Beslut-sektionen:

// 1. Filtrera bort "non-decisions" — read_file, bash_exec etc. är handlingar, inte beslut
//    Bara type: plan, delegation, fix, escalation, review (verdict) är riktiga beslut

// 2. Aggregera repetitiva:
//    "Reviewer körde 55 kommandon" istället för 55 rader
//    "Implementer läste 12 filer" istället för 12 rader

// 3. Max 15 beslut i digesten (de viktigaste):
//    - Planläggning (hur briefen delades upp)
//    - Delegeringar (vem fick vad)
//    - Fixa (något gick fel → omstrategi)
//    - Review-verdict (godkänd/avvisad)
```

Ny digest "Beslut"-sektion:
```markdown
## Beslut
Manager fattade 4 beslut:
1. ✅ Delade briefen i 10 uppgifter, 3 waves (hög confidence)
2. ✅ Wave 1: T1+T2 parallellt — oberoende nya filer (hög confidence)
3. ✅ Wave 2: T5–T8 parallellt — alla beror på T1 (hög confidence)
4. ✅ Wave 3: T9–T10 sekventiellt (hög confidence)

Reviewer: Godkände alla ändringar (55 kommandon, 5 filgranskningar)
```

**Implementering:**

Uppdatera `decision-extractor.ts`:
- `filterSignificantDecisions(decisions)` — behåll bara plan/delegation/fix/escalation/review-verdict
- `aggregateRepetitive(decisions)` — gruppera `bash_exec × 55` → en sammanfattning
- Exportera `getDigestDecisions(decisions, maxCount=15)` som kedjar filter → aggregate → limit

### Del D: Agent-paneler — iteration och uppgift

Nuvarande:
```
manager
● aktiv
Iter 9/100 388.5k in/6.1k ut
Wave 1: T1 and T2 are independent new files...
```

Nytt:
```
Manager
● Arbetar — planering
Steg 9/100 · 389k in · 6k ut
```

**Ändringar:**

1. **Status-text:** "Arbetar — planering" / "Arbetar med T1: Beslutsextraktor" istället för bara "aktiv"
2. **Tokens avrundade:** `389k in · 6k ut` (redan gjort men kan förbättras)
3. **Resonemang:** Behåll men begränsa till 5 rader (inte 10) och formatera bättre — radbyte vid meningar, inte mid-word
4. **Rå text-stream rensad:** Nuvarande visar ord-för-ord strömmande text. Bör buffra och visa hela meningar.

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/dashboard-ui.ts` | Header med uppgiftsräknare + latency, task-lista med wave + beskrivning + tid, agent-paneler, client-side timer |
| `src/core/decision-extractor.ts` | `filterSignificantDecisions()`, `aggregateRepetitive()`, `getDigestDecisions()` |
| `src/core/run-digest.ts` | Använd `getDigestDecisions()` istället för rå decisions-lista |
| `src/core/narrative.ts` | `narrateAggregatedDecision()` för grupperade beslut |

### Tester

| Fil | Tester (ca) |
|-----|------------|
| Utöka `tests/core/dashboard-ui.test.ts` | ~15 (header-format, task-lista, wave-gruppering) |
| Utöka `tests/core/decision-extractor.test.ts` | ~15 (filter, aggregering, getDigestDecisions) |
| Utöka `tests/core/run-digest.test.ts` | ~10 (filtrerad beslut-sektion) |
| **Totalt** | **~40 nya** |

### Dataflöde

```
[Header]
  tokens-event → totalIn/Out → "973k in · 11k ut"
  tokens-event + time-event → "42 tok/s"
  tasks-map → "5/10 uppgifter"
  setInterval(1s) → timer "19:32 / 46:00"

[Uppgiftslista]
  delegate_parallel_wave → wave-nummer per task
  task:status → beskrivning + agent + starttid
  renderTasks() → grupperat per wave

[Beslut i digest]
  extractDecisions() → filterSignificantDecisions() → aggregateRepetitive()
  → getDigestDecisions(max=15) → markdown
```

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] Header visar: timer (fungerande), uppgiftsräknare (X/Y), tokens (avrundade), kostnad, latency (tok/s)
- [ ] Timer uppdateras var sekund client-side (inte bara vid time-events)
- [ ] Iterationsräknare borttagen från header, kvar i agent-paneler
- [ ] Uppgiftslista visar beskrivning per uppgift ("T1 — Beslutsextraktor")
- [ ] Uppgiftslista visar vilken agent som arbetar + tidsåtgång
- [ ] Uppgifter grupperade per wave (Wave 1 / Wave 2 / Wave 3)
- [ ] Beslut-sektion i digest filtrerar bort non-decisions (read_file, bash_exec)
- [ ] Repetitiva beslut aggregeras ("Reviewer körde 55 kommandon")
- [ ] Max 15 beslut i digest-sektionen
- [ ] Agent-paneler visar "Arbetar med T1: Beskrivning" istället för "aktiv"
- [ ] Minst 40 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Kostnad per agent i agent-panelerna
- [ ] Uppgifts-progress som progressbar (inte bara ikon)
- [ ] "ETA" baserat på genomsnittlig uppgiftstid
- [ ] Mörkt/ljust tema-toggle
- [ ] Responsiv layout för smala fönster

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Client-side timer med setInterval | Timer-events emitteras sporadiskt. Klienten kan räkna själv. |
| Latency beräknad client-side | Tar senaste tokens-event och dividerar output med tidsdelta |
| Wave-info från delegate_parallel_wave | Redan emitteras i audit, bara behöver fångas i handleEvent |
| Filter i decision-extractor (inte digest) | Renare separation — extraktorn vet vad som är "riktigt beslut" |
| Max 15 beslut | Håller digesten läsbar. Fullständiga beslut finns via `/decisions/:runid` |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Wave-info saknas i audit | Låg | Medium | Fallback: visa uppgifter utan wave-gruppering |
| Uppgiftsbeskrivning saknas | Medium | Låg | Fallback: visa bara "T1" som idag |
| Timer driftar vid lång körning | Låg | Låg | Synka med time-events vid varje emission |
| Latency-beräkning opålitlig | Medium | Låg | Visa "—" om för få datapunkter |

---

## Uppskattad omfattning

| Komponent | Nya/Ändrade rader |
|-----------|-------------------|
| dashboard-ui.ts (header, tasks, agent-paneler) | ~180 ändrade |
| decision-extractor.ts (filter, aggregate) | ~80 nya |
| run-digest.ts (filtrerad beslut-sektion) | ~30 ändrade |
| narrative.ts (aggregerade beslut) | ~20 ändrade |
| Tester | ~250 nya |
| **Totalt** | **~560** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Starta körning → headern visar "0/10 uppgifter" + tickande timer + $0.00
# 2. Efter 5 min → headern visar "3/10 uppgifter · $1.50 · 38 tok/s"
# 3. Uppgiftslistan visar "Wave 1: T1 — Beslutsextraktor 👷 Implementer · 6 min"
# 4. Körning klar → digest.md har "Beslut: Manager fattade 4 beslut" (inte 55)
# 5. Agent-panel visar "Arbetar med T1: Beslutsextraktor" (inte "aktiv")
```

---

## Ordning

**RT-3b först** (rik händelselogg) → **RT-3c sedan** (UX-polish).

RT-3b ger mer data i loggen. RT-3c gör headern, uppgiftslistan och besluten läsbara. Tillsammans gör de dashboarden begriplig.
