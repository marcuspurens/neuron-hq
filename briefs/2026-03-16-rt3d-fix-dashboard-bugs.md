# RT-3d-fix: Dashboard-bugfixar — Resonemang, Beskrivningar, Dropdown, Beslut

**Bygger på:** RT-1a/b/c + RT-2 + RT-3 + RT-3b + RT-3c + TD-5

> *"Dashboarden ska visa begriplig information — inte rå stream-text, tomma fält eller trasiga kontroller."*

---

## Bakgrund

Användaren tittade på dashboarden live under körning 152 och identifierade 4 buggar. Dessa måste fixas innan nya features (RT-3e) läggs till.

---

## Del 1: Ta bort "Resonemang" från agent-paneler

### Problem
Agent-panelernas "Resonemang"-sektion visar `agent:text`-events ord för ord: `"depend on T1, and T6"`. Det är obegripligt för en icke-teknisk användare. Resonemanget finns redan i händelseloggen, beslutsvyn och thinking-panelen.

### Befintlig kod (`dashboard-ui.ts`, rad ~519–525)
```javascript
else if(event==='agent:text'){
  var a2=agents[data.agent];if(!a2)a2=getOrCreateTile(data.agent||'unknown');
  a2.lines.push(data.text||'');
  if(a2.lines.length>5)a2.lines=a2.lines.slice(-5);
  var rEl=a2.el.querySelector('.reasoning');
  rEl.textContent=a2.lines.join('\n');
  rEl.scrollTop=rEl.scrollHeight;}
```

### Fix
Ersätt hela "Resonemang"-sektionen med en **enkel statusrad** som visar senaste aktiviteten:

```
Manager
● Arbetar — planering
Steg 9/120 · 389k in · 6k ut
Senast: Delegerar T3 till Implementer
```

**Implementering:**
1. **Ta bort `.reasoning`-elementet** från agent-tile HTML-mallen.
2. **Lägg till `.status-line`-element** istället — en rad, max 80 tecken.
3. **Vid `agent:text`-event:** Extrahera sista hela meningen (split vid `.!?\n`) och visa den i `.status-line`. Om ingen mening hittats, visa ingenting (behåll föregående).
4. **Ta bort `a2.lines`-arrayen** — den behövs inte längre.

---

## Del 2: Fixa uppgiftsbeskrivningar

### Problem
Uppgiftslistan visar "T3 — · 7 min" — beskrivningen efter `—` är tom. Koden i `dashboard-ui.ts` (rad ~453) gör:
```javascript
var desc=taskDescriptions[tid]?(' — '+taskDescriptions[tid]):'';
```

Beskrivningen sätts bara om `task:status`-event har `description`-fältet ifyllt (rad ~538):
```javascript
updateTask(data.taskId||'?',data.status||'pending',data.description,data.agent);
```

Men agenterna skickar inte alltid `description` i `task:status`-events.

### Fix
1. **Fånga beskrivning från `task:plan`-event:** När Manager planerar uppgifter emitteras `task:plan` med beskrivningar. Spara dessa i `taskDescriptions`.
2. **Fallback från `task:status`:** Om `task:status` har `description`, uppdatera `taskDescriptions`.
3. **Visa alltid `—` bara om beskrivning finns:** Ändra rendering-koden:
```javascript
var desc = taskDescriptions[tid] ? (' — ' + taskDescriptions[tid]) : '';
```
Inga tomma `—` — om ingen beskrivning finns, visa bara "T3 · 7 min".
4. **Kontrollera att Manager emitterar beskrivningar i `task:plan`-events.** Om inte, lägg till det i `run.ts` eller Managers task-plan-logik.

---

## Del 3: Fixa dropdown (körningsbiblioteket)

### Problem
Dropdown för att byta till historiska körningar fungerar inte. Fetch-anropet (`dashboard-ui.ts`, rad ~616) sväljer alla fel:
```javascript
fetch('/runs').then(function(r){return r.json();}).then(function(runs){
  // ... populate dropdown ...
}).catch(function(){});  // ← TYST FEL
```

### Fix
1. **Logga fel:** Ersätt tom `.catch()` med felmeddelande i dropdown-elementet:
```javascript
.catch(function(err){
  console.error('Failed to load runs:', err);
  // Visa "Kunde inte ladda körningar" i dropdown
});
```
2. **Kontrollera `/runs`-endpointen** i `dashboard-server.ts` — verifiera att den returnerar korrekt JSON-array med `runid`, `status`, `startedAt`.
3. **Testa endpoint manuellt** — om den returnerar fel, fixa backend-koden.
4. **Retry-knapp:** Lägg till en "Försök igen"-knapp i dropdown om laddningen misslyckas.

---

## Del 4: Emittera decision-events live

### Problem
Beslut-knappen i dashboarden är tom. Infrastrukturen finns:

- `event-bus.ts` (rad ~24–28) har `'decision'`-event-typ:
```typescript
'decision': {
  runid: string;
  agent: string;
  decision: import('./decision-extractor.js').Decision;
};
```

- `dashboard-ui.ts` (rad ~590–591) lyssnar på `decision`-events:
```javascript
else if(event==='decision'){
  // Decision events handled by addLogEntry decision rendering
}
```

Men **ingen kod emitterar** `safeEmit('decision', ...)` under live körning. `extractDecisions()` anropas bara i post-run digest (`run-digest.ts`) och vid historik-hämtning (`dashboard-server.ts`).

### Fix
1. **Emittera decision-events i realtid:** Lägg till en hook i agenternas loop (eller i `run.ts`) som:
   - Lyssnar på `agent:text` eller `tool_result`-events
   - Kör `extractDecisions()` periodiskt (t.ex. efter varje agent-steg)
   - Emitterar nya beslut via `eventBus.safeEmit('decision', { runid, agent, decision })`
2. **Undvik dubbletter:** Håll en Set med redan emitterade beslut-IDs.
3. **Alternativ (enklare):** Emittera decision-event direkt i `decision-extractor.ts` vid extraction — gör extractorn EventBus-medveten.
4. **Uppdatera dashboard-ui.ts:** Verifiera att decision-event-hanteraren faktiskt renderar beslutet i Beslut-panelen (inte bara loggar).

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/dashboard-ui.ts` | (1) Ersätt reasoning med statusrad, (2) fix tom beskrivning, (3) fix dropdown-catch, (4) verifiera decision-rendering |
| `src/core/dashboard-server.ts` | Verifiera `/runs`-endpoint, eventuellt fixa JSON-format |
| `src/core/run.ts` | Emittera decision-events under körning, skicka beskrivningar i task:plan |
| `src/core/decision-extractor.ts` | Eventuellt göra extractorn EventBus-medveten för live emission |

### Tester

| Fil | Tester (ca) |
|-----|------------|
| Utöka: `tests/core/dashboard-ui.test.ts` | ~15 (statusrad istället för reasoning, tom beskrivning-fix, dropdown-felhantering) |
| Utöka: `tests/core/dashboard-server.test.ts` | ~5 (runs-endpoint returnerar korrekt JSON) |
| Ny: `tests/core/live-decision-emit.test.ts` | ~12 (decision-events emitteras, inga dubbletter, korrekt format) |
| Utöka: `tests/core/decision-extractor.test.ts` | ~5 (EventBus-integration) |
| **Totalt** | **~37 nya** |

---

## Krav

### Acceptanskriterier

- [ ] Agent-paneler visar **statusrad** istället för rå reasoning-text
- [ ] Statusraden visar senaste hela meningen (max 80 tecken)
- [ ] Inga `.reasoning`-element finns i agent-tile HTML
- [ ] Uppgiftslistan visar beskrivningar ("T3 — Fixa dropdown") eller bara ID ("T3 · 7 min") — aldrig tomt "T3 — · 7 min"
- [ ] Dropdown visar felmeddelande vid misslyckad laddning (inte tyst fel)
- [ ] `/runs`-endpoint returnerar korrekt JSON
- [ ] Decision-events emitteras live under körning via `safeEmit('decision', ...)`
- [ ] Beslut-panelen i dashboarden visar live-beslut
- [ ] Inga duplicate decision-events
- [ ] Minst 35 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Retry-knapp i dropdown vid misslyckad laddning
- [ ] Statusrad animeras subtilt vid uppdatering (fade-in)
- [ ] Decision-events inkluderar confidence-level som visas med färgkod

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Statusrad-extraktion missar meningar | Låg | Låg | Fallback: visa hela texten trunkerad |
| `/runs`-endpoint har djupare problem | Låg | Medium | Testa endpoint först, fixa om nödvändigt |
| `extractDecisions()` är för dyr att köra live | Medium | Medium | Kör bara efter varje avslutat agent-steg, inte per event |
| Befintliga tester bryts av reasoning-borttagning | Medium | Låg | Uppdatera tester som testar reasoning-element |

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Ta bort reasoning helt (inte buffra) | Användaren vill ha det borta — data finns redan i händelseloggen och thinking-panelen |
| Statusrad istället för reasoning | Ger snabb överblick utan informationsöverflöd |
| Live decision-emission | Beslut-panelen är värdelös utan live-data |
| Periodisk extraction (inte per event) | Balans mellan latens och CPU-kostnad |

---

## Dependencies

- RT-1a/b/c (EventBus + Dashboard + Thinking) ✅
- RT-2 (Berättande Dashboard + Digest) ✅
- RT-3 (Beslutskedjor + Förklarbarhet) ✅
- RT-3b (Rik händelselogg) ✅
- RT-3c (UX-polish) ✅
- TD-5 (Nödsparning) ✅
- `decision-extractor.ts` ✅
- `event-bus.ts` med decision-typ ✅

---

## Uppskattad omfattning

| Komponent | Rader |
|-----------|-------|
| dashboard-ui.ts (statusrad, beskrivning-fix, dropdown-fix) | ~80 ändrade |
| run.ts (decision-emission, task-beskrivningar) | ~40 nya |
| decision-extractor.ts (EventBus-koppling) | ~20 ändrade |
| dashboard-server.ts (runs-endpoint-fix) | ~15 ändrade |
| Tester | ~250 nya |
| **Totalt** | **~405** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Starta körning → agent-paneler visar statusrad (inte rå text)
# 2. Uppgiftslistan visar "T3 — Fixa dropdown" (inte "T3 — ")
# 3. Klicka dropdown → körningshistorik laddas (eller felmeddelande visas)
# 4. Beslut-panelen visar live-beslut under körning
# 5. Inga duplicate-beslut i panelen
```

---

## Koppling till AI Act

| Krav | Artikel | Vad RT-3d-fix levererar |
|------|---------|------------------------|
| Tolkningsbar information | Art. 13 | Begriplig statusrad istället för rå stream |
| Transparent process | Art. 13 | Uppgiftsbeskrivningar synliga |
| Beslutsspårbarhet | Art. 14 | Live decision-events i dashboarden |
| Tillförlitlig UI | Art. 15 | Dropdown fungerar, fel kommuniceras |
