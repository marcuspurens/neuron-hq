# RT-3d: Brief-visning, Resonemang-formatering, Kostnad per agent, ETA

**Bygger på:** RT-1a/b/c + RT-2 + RT-3 + RT-3b + RT-3c

> *"Jag ser briefen, förstår resonemanget, vet vad varje agent kostar, och kan uppskatta hur lång tid som är kvar."*

---

## Bakgrund

Dashboarden har blivit betydligt bättre (RT-3a–c), men fyra luckor kvarstår från användarfeedback och idéer:

### Problem 1: Briefen syns inte
Användaren vill se **vad körningen handlar om** direkt i dashboarden. Idag måste man öppna `brief.md` separat. Briefens titel, sammanfattning och Managers plan borde visas överst.

**Data finns:** `runs/{runid}/brief.md` laddas redan i `RunOrchestrator.initRun()`. Behöver bara ett nytt endpoint + UI-sektion.

### Problem 2: Resonemang är rå strömmande text
Agent-panelernas "Resonemang"-sektion visar `agent:text`-events ord för ord: `"depend on T1, and T6"`. Det är obegripligt. Borde buffra hela meningar och visa formaterat.

**Data finns:** `agent:text`-events strömmas redan. Behöver client-side buffring och menings-detektion.

### Problem 3: Ingen kostnad per agent
Headern visar total kostnad, men inte hur mycket varje agent kostar. Data finns redan — `tokens`-events har `agent`-fält med `input`/`output`.

### Problem 4: Ingen ETA
Efter att några uppgifter är klara kan vi beräkna genomsnittlig tid per uppgift och visa uppskattad tid kvar.

---

## Mål

### Del A: Brief-visning överst i dashboarden

Ny sektion under headern, före uppgiftslistan:

```
┌─────────────────────────────────────────────────────┐
│ 📋 RT-3d: Brief-visning, Resonemang-formatering     │
│                                                      │
│ Dashboardens resonemang visas som rå text.           │
│ Denna körning lägger till brief-visning, buffrad     │
│ resonemang-formatering, kostnad per agent och ETA.   │
│                                                      │
│ ▼ Visa hela briefen                                  │
└─────────────────────────────────────────────────────┘
```

**Implementering:**

1. **Nytt endpoint:** `GET /brief/:runid` i `dashboard-server.ts` — returnerar brief.md som text
2. **Nytt SSE-event:** `brief` (emitteras vid `run:start`) — skickar briefens titel + första stycket (max 300 tecken)
3. **UI-sektion:** Collapsible panel under headern. Visar titel + sammanfattning. Klick expanderar hela briefen.
4. **Managers plan:** När Manager emitterar första `agent:text` (planeringsfasen), fånga och visa under brief-sammanfattningen som "Managers plan".

```typescript
// Nytt event i EventMap (event-bus.ts)
'brief': {
  runid: string;
  title: string;       // Första H1-raden
  summary: string;     // Första stycket (max 300 tecken)
  fullContent: string; // Hela briefen (för expandering)
}
```

### Del B: Resonemang-formatering (menings-buffring)

Nuvarande beteende i `agent:text`-hanteringen:
- Varje `agent:text`-event appendas direkt till `.reasoning-content`
- Visar sista 5 raderna (trunkerat)
- Resultat: `"depend on T1, and T6 w"` — avbrutet mid-word

Nytt beteende:

```
Resonemang:
  Uppgift T1 och T2 är oberoende och kan köras parallellt.
  T6 beror på T1, så den väntar i wave 2.
  Briefen specificerar 10 acceptanskriterier.
```

**Implementering:**

1. **Menings-buffert i client-JS:** Samla text tills en mening avslutas (`.`, `!`, `?`, eller `\n\n`).
2. **Visa hela meningar:** Append till `.reasoning-content` först när meningen är klar.
3. **Timeout:** Om ingen meningsavslutning efter 3 sekunder, visa bufferten ändå (undvik att text "fastnar").
4. **Max rader:** Behåll 8 rader (upp från 5). Äldre rader fadear ut.
5. **Radbyte vid mening:** Varje mening på ny rad för läsbarhet.

```javascript
// Client-side i dashboard-ui.ts (inline JS)
let reasoningBuffer = '';
let reasoningTimer = null;

function appendReasoning(agentId, text) {
  reasoningBuffer += text;
  clearTimeout(reasoningTimer);

  // Check for sentence endings
  const sentences = reasoningBuffer.split(/(?<=[.!?\n])\s+/);
  if (sentences.length > 1) {
    // Display complete sentences
    const complete = sentences.slice(0, -1).join(' ');
    appendToReasoningPanel(agentId, complete);
    reasoningBuffer = sentences[sentences.length - 1];
  }

  // Timeout fallback: flush after 3s
  reasoningTimer = setTimeout(() => {
    if (reasoningBuffer.trim()) {
      appendToReasoningPanel(agentId, reasoningBuffer);
      reasoningBuffer = '';
    }
  }, 3000);
}
```

### Del C: Kostnad per agent

Nuvarande agent-panel:
```
Manager
● Arbetar — planering
Steg 9/100 · 389k in · 6k ut
```

Nytt:
```
Manager
● Arbetar — planering
Steg 9/100 · 389k in · 6k ut · $1.42
```

**Implementering:**

1. **Spåra kostnad i `agentCosts`-objekt:** `{ manager: 1.42, implementer_0: 0.85, ... }`
2. **Beräkna vid `tokens`-event:** Använd samma prismodell som headern (input × $/tok + output × $/tok). Priskonstanter finns redan i `dashboard-ui.ts` eller `run-digest.ts`.
3. **Visa i agent-tile:** Lägg till `$X.XX` efter tokens-info.

### Del D: ETA-beräkning

Nuvarande header:
```
⏱ 19:32 / 46:00   📋 5/10 uppgifter   📊 973k in · 11k ut   💰 $3.09   ⚡ 42 tok/s
```

Nytt (efter 3+ uppgifter klara):
```
⏱ 19:32 / 46:00   📋 5/10 uppgifter   📊 973k in · 11k ut   💰 $3.09   ⚡ 42 tok/s   🏁 ~12 min kvar
```

**Implementering:**

1. **Spåra uppgiftstider:** `taskDurations[]` — push tid i sekunder när uppgift går från `running` → `completed`.
2. **Beräkna efter 3+ klara:** `avgTime = median(taskDurations)` × `remainingTasks`.
3. **Visa i headern:** `🏁 ~X min kvar`. Dölj om <3 uppgifter klara (för lite data).
4. **Uppdatera var 10:e sekund** — inte vid varje event (undvik flimmer).
5. **Använd median** istället för medelvärde — skyddar mot outliers (en uppgift som tar 30 min ska inte förstöra beräkningen).

### Del E: Konfidens-histogram i digest

Ny sektion i `run-digest.ts` efter "Beslut":

```markdown
## Beslutsfördelning

Hög ██████████ 8 (67%)
Medel ████ 3 (25%)
Låg █ 1 (8%)
```

**Implementering:**

1. **Räkna confidence-nivåer:** Iterera alla decisions → räkna high/medium/low.
2. **ASCII-stapeldiagram:** Max 10 tecken bred. Enkel beräkning: `'█'.repeat(Math.round(count/total * 10))`.
3. **Placera efter Beslut-sektionen** i digest.

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/dashboard-server.ts` | Nytt endpoint `GET /brief/:runid`, emittera `brief`-event vid run:start |
| `src/core/dashboard-ui.ts` | Brief-panel (collapsible), menings-buffring i reasoning, agent-kostnad, ETA i header |
| `src/core/event-bus.ts` | Ny event-typ `brief` i EventMap |
| `src/core/run.ts` | Emittera `brief`-event med titel + sammanfattning efter brief-laddning |
| `src/core/run-digest.ts` | Konfidens-histogram sektion |

### Tester

| Fil | Tester (ca) |
|-----|------------|
| Ny: `tests/core/dashboard-ui-brief.test.ts` | ~12 (brief-panel rendering, collapsible, truncation) |
| Ny: `tests/core/reasoning-buffer.test.ts` | ~15 (menings-detektion, timeout, radbyte, edge cases) |
| Utöka: `tests/core/dashboard-ui.test.ts` | ~8 (agent-kostnad, ETA-beräkning, header med ETA) |
| Utöka: `tests/core/run-digest.test.ts` | ~8 (konfidens-histogram, tomma beslut, edge cases) |
| Utöka: `tests/core/dashboard-server.test.ts` | ~5 (brief endpoint, brief event) |
| **Totalt** | **~48 nya** |

### Dataflöde

```
[Brief-visning]
  RunOrchestrator.initRun() → läser brief.md
    → eventBus.emit('brief', { title, summary, fullContent })
    → SSE → client: brief-panel renderas

  GET /brief/:runid → returnerar brief.md (för reconnect/historik)

[Resonemang-formatering]
  agent:text event → SSE → client
    → appendReasoning(agentId, text)
    → menings-buffert → sentence-split → visa hela meningar
    → 3s timeout fallback

[Kostnad per agent]
  tokens event → { agent, input, output }
    → client: agentCosts[agent] += beräkna_kostnad(input, output)
    → visa i agent-tile: "$1.42"

[ETA]
  task:status (running → completed) → client: taskDurations.push(elapsed)
    → om taskDurations.length >= 3: median × remaining → "~12 min kvar"

[Konfidens-histogram]
  run-digest.ts → alla decisions → räkna high/medium/low
    → ASCII-stapeldiagram i digest.md
```

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] Brief-panel visas under headern med titel + sammanfattning (max 300 tecken)
- [ ] Brief-panel är collapsible — klick expanderar hela briefen
- [ ] Nytt endpoint `GET /brief/:runid` returnerar brief-innehåll
- [ ] Nytt event `brief` emitteras vid run:start med titel + sammanfattning
- [ ] Resonemang buffras till hela meningar (split vid `.`, `!`, `?`, `\n\n`)
- [ ] Timeout 3s: om ingen meningsavslutning, visa bufferten ändå
- [ ] Resonemang visar max 8 rader, en mening per rad
- [ ] Agent-paneler visar kostnad per agent (`$X.XX`) beräknad från tokens-events
- [ ] ETA visas i headern efter 3+ avslutade uppgifter (`🏁 ~X min kvar`)
- [ ] ETA använder median (inte medelvärde) av uppgiftstider
- [ ] Konfidens-histogram i digest (ASCII-stapeldiagram: hög/medel/låg)
- [ ] Minst 45 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Managers plan visas under brief-sammanfattningen (fångas från första agent:text)
- [ ] Progressbar per uppgift istället för statusikon
- [ ] Timer drift-korrigering (synka med server var 30:e sekund)
- [ ] Markdown-rendering i brief-panelen (inte bara plaintext)
- [ ] Resonemang: smooth scroll till senaste mening

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Brief via SSE-event (inte bara endpoint) | Live dashboard får briefen direkt utan extra fetch |
| Menings-buffring client-side | Server-side buffring fördröjer alla events. Client-side = enkelt, isolerat |
| 3s timeout för buffert | Undviker att text "fastnar" om agenten tänker mitt i en mening |
| Median för ETA | Skyddar mot outliers — en lång uppgift förstör inte estimatet |
| ASCII-histogram i digest | Digest är markdown — fungerar överallt utan grafbibliotek |
| Kostnad beräknad client-side | Undviker att duplicera prislogik. Priskonstanter i en JS-konstant |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Menings-detektion missar avslutning (listor, kod) | Medium | Låg | 3s timeout visar bufferten ändå |
| Brief saknar tydlig H1/sammanfattning | Låg | Låg | Fallback: visa första 300 tecken |
| Kostnad-beräkning avviker från faktisk | Medium | Låg | Priskonstanter i en plats, lätt att uppdatera |
| ETA opålitligt vid varierande uppgifter | Medium | Låg | Visa "~" (tilde) = ungefärligt. Dölj vid <3 datapunkter |
| Brief-event bloats SSE vid långa briefs | Låg | Låg | Sammanfattning i event, fullContent via endpoint |

---

## Dependencies

- RT-1a/b/c (EventBus + Dashboard + Thinking) ✅ klart
- RT-2 (Berättande Dashboard + Digest) ✅ klart
- RT-3 (Beslutskedjor + Förklarbarhet) ✅ klart
- RT-3b (Rik händelselogg) ✅ klart
- RT-3c (UX-polish + Header + Wave-gruppering) ✅ klart
- `agent:text` events strömmas ✅ klart
- `tokens` events per agent ✅ klart
- `runs/{runid}/brief.md` skapas ✅ klart

---

## Uppskattad omfattning

| Komponent | Nya/Ändrade rader |
|-----------|-------------------|
| dashboard-ui.ts (brief-panel, reasoning-buffering, agent-cost, ETA) | ~200 ändrade |
| dashboard-server.ts (brief endpoint, brief event) | ~40 nya |
| event-bus.ts (brief event-typ) | ~5 ändrade |
| run.ts (emittera brief-event) | ~15 ändrade |
| run-digest.ts (konfidens-histogram) | ~30 nya |
| Tester | ~300 nya |
| **Totalt** | **~590** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Starta körning → brief-panel visar titel + sammanfattning under headern
# 2. Klicka "Visa hela briefen" → expanderar hela brief-texten
# 3. Resonemang visar hela meningar (inte avbruten text mitt i ord)
# 4. Vänta 3s utan meningsavslutning → bufferten visas ändå
# 5. Agent-panel visar "$1.42" bredvid tokens
# 6. Efter 3 uppgifter klara → headern visar "🏁 ~12 min kvar"
# 7. Kör klart → digest.md har konfidens-histogram (hög/medel/låg staplar)
```

---

## Koppling till AI Act

| Krav | Artikel | Vad RT-3d levererar |
|------|---------|-------------------|
| Transparent syfte | Art. 13 | Brief-visning: användaren ser *vad* systemet ska göra |
| Tolkningsbar process | Art. 13 | Formaterat resonemang: meningar istället för rå stream |
| Resursanvändning synlig | Art. 12 | Kostnad per agent: full kostnadsinsyn |
| Tidsuppskattning | Art. 13 | ETA: användaren kan planera sin tid |
| Beslutsfördelning | Art. 14 | Histogram: översikt av agenternas säkerhetsnivå |
