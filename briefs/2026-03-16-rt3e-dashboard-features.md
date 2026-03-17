# RT-3e: Brief-panel, Kostnad per agent, ETA, Konfidens-histogram

**Bygger på:** RT-1a/b/c + RT-2 + RT-3 + RT-3b + RT-3c + RT-3d-fix

> *"Jag ser briefen, vet vad varje agent kostar, kan uppskatta tid kvar, och ser beslutsfördelningen."*

---

## Bakgrund

Dashboard-buggarna är fixade (RT-3d-fix). Nu kan vi lägga till de fyra features som identifierats under sessionerna:

1. Briefen syns inte i dashboarden — man måste öppna filen separat
2. Kostnad per agent saknas — bara total kostnad i headern
3. Ingen tidsuppskattning — svårt att planera
4. Ingen beslutsfördelning — oklart om agenterna är säkra

---

## Del A: Brief-panel överst i dashboarden

### Nuvarande beteende
Brief.md kopieras till `runs/<runid>/brief.md` (run.ts:216) men visas aldrig i dashboarden. Headern visar bara titel, timer, uppgifter, tokens, kostnad.

### Nytt beteende
Ny sektion under headern med briefens titel + sammanfattning (max 300 tecken), expanderbar till hela briefen.

```
┌─────────────────────────────────────────────────────┐
│ RT-3e: Brief-panel, Kostnad per agent, ETA          │
│                                                      │
│ Dashboard-buggarna är fixade. Nu lägger vi till      │
│ brief-visning, kostnad per agent, ETA och histogram. │
│                                                      │
│ ▼ Visa hela briefen                                  │
└─────────────────────────────────────────────────────┘
```

### Implementering

1. **Nytt event `brief` i `event-bus.ts`:**
```typescript
'brief': {
  runid: string;
  title: string;       // Första H1-raden
  summary: string;     // Första stycket (max 300 tecken)
  fullContent: string; // Hela briefen
}
```

2. **Emittera i `run.ts`** efter brief-kopiering (rad ~216):
   - Parsa brief.md: extrahera H1 som titel, första stycke som sammanfattning
   - `eventBus.safeEmit('brief', { runid, title, summary, fullContent })`

3. **Nytt endpoint `GET /brief/:runid`** i `dashboard-server.ts`:
   - Läs `runs/<runid>/brief.md`
   - Returnera som text (för reconnect/historik)

4. **UI i `dashboard-ui.ts`:**
   - Ny `<div id="brief-panel">` under headern, före uppgiftslistan
   - Collapsible: klick togglear hela briefen
   - Dölj om ingen brief mottagits

---

## Del B: Kostnad per agent

### Nuvarande beteende
Agent-tiles visar tokens (`389k in · 6k ut`) men inte kostnad (dashboard-ui.ts:571–589). Total kostnad beräknas med hårdkodade Sonnet-priser: `totalCost=(totalIn*3.0+totalOut*15.0)/1000000`.

### Nytt beteende
```
Manager
● Arbetar — planering
Steg 9/120 · 389k in · 6k ut · $1.42
```

### Implementering

1. **Per-agent kostnad i dashboard-ui.ts:**
   - Beräkna kostnad vid varje `tokens`-event med samma prisformel som headern
   - Spara i `at2.cost` (nytt fält på agent-objektet)
   - Visa efter tokens-texten: `fmtK(at2.tokIn)+' in · '+fmtK(at2.tokOut)+' ut · $'+at2.cost.toFixed(2)`

2. **Priskonstanter:**
   - Pricing.ts har redan `sonnet: {input: 3.0, output: 15.0}` etc.
   - Använd samma hårdkodade Sonnet-priser som headern (alla agenter kör Sonnet)
   - Extrahera till en JS-konstant i dashboard-ui.ts: `var PRICE_IN=3.0,PRICE_OUT=15.0;`

---

## Del C: ETA-beräkning

### Nuvarande beteende
Headern visar `⏱ 19:32 / 46:00 · 📋 5/10 uppgifter` men ingen uppskattning av tid kvar. `taskStartTimes` spåras redan (dashboard-ui.ts:209).

### Nytt beteende (efter 3+ klara uppgifter)
```
⏱ 19:32 / 46:00   📋 5/10 uppgifter   📊 973k in · 11k ut   💰 $3.09   ⚡ 42 tok/s   🏁 ~12 min kvar
```

### Implementering

1. **Spåra uppgiftstider:**
   - Nytt objekt `taskDurations = {}` — mappa taskId → tid i sekunder
   - Vid `task:status` med status `completed`: beräkna `Date.now() - taskStartTimes[taskId]`, spara i `taskDurations`

2. **Beräkna ETA (efter 3+ klara):**
   - Samla alla durationer i en array
   - Sortera, ta **median** (skyddar mot outliers)
   - `eta = median × remainingTasks`
   - Visa: `🏁 ~X min kvar`

3. **Uppdatera var 10:e sekund** (inte vid varje event — undviker flimmer):
   - `setInterval(updateETA, 10000)`
   - Funktion `updateETA()` räknar om och uppdaterar headern

4. **Dölj om:**
   - Färre än 3 uppgifter klara
   - Alla uppgifter klara (visa "Klar!" istället)

---

## Del D: Konfidens-histogram i digest

### Nuvarande beteende
`run-digest.ts` (rad 314–363, `buildDecisionsSection`) listar beslut med titel, agent och confidence — men ingen sammanfattande fördelning.

### Nytt beteende
Ny sektion i digest.md efter "Beslut":

```markdown
## Beslutsfördelning

Hög    ██████████ 8 (67%)
Medel  ████ 3 (25%)
Låg    █ 1 (8%)
```

### Implementering

1. **Räkna confidence-nivåer** i `buildDecisionsSection()`:
   - Iterera alla decisions, räkna high/medium/low

2. **ASCII-histogram:**
   - Max 10 `█`-tecken bred
   - `'█'.repeat(Math.round(count / total * 10))`
   - Visa antal och procent

3. **Placera före beslutslistningen** i digest

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/event-bus.ts` | Ny event-typ `brief` |
| `src/core/run.ts` | Emittera `brief`-event efter brief-kopiering |
| `src/core/dashboard-server.ts` | Nytt endpoint `GET /brief/:runid` |
| `src/core/dashboard-ui.ts` | Brief-panel, agent-kostnad, ETA i header |
| `src/core/run-digest.ts` | Konfidens-histogram i `buildDecisionsSection()` |

### Tester

| Fil | Tester (ca) |
|-----|------------|
| Ny: `tests/core/dashboard-brief-panel.test.ts` | ~12 (brief event, panel rendering, collapsible, truncation) |
| Ny: `tests/core/dashboard-eta.test.ts` | ~10 (median-beräkning, <3 uppgifter, alla klara, outliers) |
| Utöka: `tests/core/dashboard-ui.test.ts` | ~8 (agent-kostnad visas, prisberäkning) |
| Utöka: `tests/core/dashboard-server.test.ts` | ~5 (brief endpoint, 404 vid saknad brief) |
| Utöka: `tests/core/run-digest.test.ts` | ~8 (histogram, tomma beslut, alla hög, alla låg) |
| Utöka: `tests/core/event-bus.test.ts` | ~3 (brief event-typ) |
| **Totalt** | **~46 nya** |

### Dataflöde

```
[Brief-panel]
  run.ts: initRun() → kopierar brief.md → parsear H1 + första stycke
    → eventBus.emit('brief', { title, summary, fullContent })
    → SSE → client: brief-panel renderas under headern

  GET /brief/:runid → returnerar brief.md text (reconnect/historik)

[Kostnad per agent]
  tokens event → { agent, input, output }
    → client: at2.cost += (input * 3.0 + output * 15.0) / 1_000_000
    → visa i agent-tile: "389k in · 6k ut · $1.42"

[ETA]
  task:status (completed) → taskDurations[taskId] = elapsed
    → om taskDurations.length >= 3: median × remaining → "🏁 ~12 min kvar"
    → uppdateras var 10:e sekund

[Konfidens-histogram]
  run-digest.ts → extractDecisions() → räkna high/medium/low
    → ASCII-stapeldiagram i digest.md
```

---

## Krav

### Acceptanskriterier

- [ ] Brief-panel visas under headern med titel + sammanfattning (max 300 tecken)
- [ ] Brief-panel är collapsible — klick expanderar hela briefen
- [ ] Nytt endpoint `GET /brief/:runid` returnerar brief-innehåll
- [ ] Nytt event `brief` emitteras vid run:start med titel + sammanfattning
- [ ] Agent-paneler visar kostnad per agent (`$X.XX`) beräknad från tokens-events
- [ ] ETA visas i headern efter 3+ avslutade uppgifter (`🏁 ~X min kvar`)
- [ ] ETA använder median (inte medelvärde) av uppgiftstider
- [ ] ETA uppdateras var 10:e sekund (inte vid varje event)
- [ ] ETA döljs om <3 uppgifter klara
- [ ] Konfidens-histogram i digest (ASCII-stapeldiagram: hög/medel/låg)
- [ ] Histogram visar antal och procent
- [ ] Minst 40 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Managers plan visas under brief-sammanfattningen
- [ ] Markdown-rendering i brief-panelen
- [ ] Progressbar per uppgift istället för statusikon
- [ ] Timer drift-korrigering (synka med server var 30:e sekund)
- [ ] Resonemang: smooth scroll till senaste mening

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Brief saknar H1/sammanfattning | Låg | Låg | Fallback: visa första 300 tecken som sammanfattning |
| Kostnad avviker från faktisk | Medium | Låg | Priskonstanter på en plats, lätt att uppdatera |
| ETA opålitligt vid varierande uppgifter | Medium | Låg | Visa `~` (tilde) = ungefärligt, dölj vid <3 datapunkter |
| Brief-event bloats SSE vid långa briefs | Låg | Låg | Sammanfattning i event, fullContent via endpoint |
| Histogram meningslöst vid <5 beslut | Låg | Låg | Visa histogram bara om ≥3 beslut finns |

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Brief via SSE-event + endpoint | Live: brief direkt utan fetch. Reconnect: endpoint som fallback |
| Median för ETA | Skyddar mot outliers — en lång uppgift förstör inte estimatet |
| 10s update-intervall för ETA | Undviker flimmer, tillräckligt responsivt |
| Kostnad med hårdkodade Sonnet-priser | Alla agenter kör Sonnet. Enkelt och korrekt. Extrahera till konstant |
| ASCII-histogram i digest | Markdown-kompatibelt, fungerar överallt utan grafbibliotek |

---

## Dependencies

- RT-3d-fix (Dashboard-bugfixar) ✅
- `event-bus.ts` med EventMap ✅
- `dashboard-server.ts` med SSE ✅
- `run-digest.ts` med `extractDecisions()` ✅
- `pricing.ts` med modellpriser ✅
- `taskStartTimes` spåras redan ✅

---

## Uppskattad omfattning

| Komponent | Rader |
|-----------|-------|
| event-bus.ts (brief event) | ~5 nya |
| run.ts (emittera brief) | ~20 nya |
| dashboard-server.ts (brief endpoint) | ~25 nya |
| dashboard-ui.ts (brief-panel, kostnad, ETA) | ~150 ändrade |
| run-digest.ts (histogram) | ~30 nya |
| Tester | ~300 nya |
| **Totalt** | **~530** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Starta körning → brief-panel visar titel + sammanfattning
# 2. Klicka "Visa hela briefen" → expanderar
# 3. Agent-panel visar "$1.42" bredvid tokens
# 4. Efter 3 uppgifter klara → "🏁 ~12 min kvar" i headern
# 5. ETA uppdateras var 10:e sekund
# 6. Kör klart → digest.md har konfidens-histogram
```

---

## Koppling till AI Act

| Krav | Artikel | Vad RT-3e levererar |
|------|---------|---------------------|
| Transparent syfte | Art. 13 | Brief-visning: användaren ser vad systemet ska göra |
| Resursanvändning synlig | Art. 12 | Kostnad per agent: full kostnadsinsyn |
| Tidsuppskattning | Art. 13 | ETA: användaren kan planera sin tid |
| Beslutsfördelning | Art. 14 | Histogram: översikt av agenternas säkerhetsnivå |
