# RT-2: Berättande Dashboard + Körningsdigest

**AI Act: Art. 13 (Transparens) + Art. 12 (Loggning)**

> *"Jag kan följa vad som händer — i naturligt språk, och efteråt läsa en sammanfattning som förklarar vad som gjordes och vad som hände."*

---

## Bakgrund

Nuvarande dashboard (RT-1a/b/c) visar rå event-data: JSON-objekt i händelseloggen, agent-tiles med strömmande text, och en minimal task-lista. Problemet: **en människa kan inte förstå vad som händer**. Vem pratar med vem? Varför valde agenten det den valde? Vad gick fel och hur löstes det?

EU:s AI Act (Art. 13) kräver att AI-system ska vara "tillräckligt transparenta för att användaren ska kunna tolka outputen". Art. 12 kräver automatisk loggning av händelser.

Vi behöver två saker:
1. **Live:** En berättande vy som översätter events till naturligt språk
2. **Efteråt:** En automatisk `digest.md` som sammanfattar körningen

Dessutom: nuvarande dashboard visar bara den pågående körningen. Det finns ingen möjlighet att se historiska körningar.

### Nuvarande tillgångar
- `event-bus.ts`: 12 event-typer, cirkulär 200-events history, `onAny()` wildcard
- `dashboard-server.ts`: SSE-stream, max 5 klienter, reconnect med history replay
- `dashboard-ui.ts`: HTML med agent-tiles, task-lista, event-logg
- `metrics.json`: timing, tokens, tester, kod, delegationer — beräknas i `finalizeRun()`
- `usage.json`: token-breakdown per agent + verktygsanrop
- `task_scores.jsonl`: per-task efficiency/safety/first_pass
- `audit.jsonl`: varje tool call, policy block, delegation
- `report.md`: STOPLIGHT + sammanfattning (skrivs av agenter)
- `ideas.md`, `knowledge.md`, `questions.md`: kontextuella artefakter

### Kända buggar att fixa
- Timer visar alltid 00:00 (time-event emitteras men dashboard updaterar inte korrekt)
- Token-räknare visar inte ackumulerat värde
- Cost ($) beräknas inte i realtid

---

## Mål

### Del A: Körningsdigest (Run Digest)

En ny modul `src/core/run-digest.ts` som genererar `digest.md` automatiskt efter varje körning.

**Skillnad mot report.md:** Rapporten skrivs av agenterna *under* körningen och fokuserar på leveransen (STOPLIGHT, acceptanskriterier). Digesten genereras *efter* körningen av ren kod (ingen LLM) och fokuserar på **berättelsen** — vad planerades, vad gjordes, vad hände, vad lärdes.

#### Digest-format

```markdown
# Körning #147 — TD-4 Idea Nodes
2026-03-16 12:52–13:38 (46 min) | 🟢 GREEN | $0.14 | +57 tester

## Plan
Manager delade briefen i 6 uppgifter:
1. T1: Schema — lägg till 'idea' nodtyp + 'inspired_by' kanttyp
2. T2: Tools — uppdatera graph-tools enums
3. T3: Migration — 017_idea_nodes.sql
4. T4: Parser — ideas-parser.ts
5. T5: Historian — processIdeas() integration
6. T6: Tester — integration tests

Exekveringsordning: Wave 1 (T1–T4 parallellt) → T5 → T6

## Utfört
- T1 ✅ Schema: NodeTypeSchema + EdgeTypeSchema utökade (2 filer)
- T2 ✅ Tools: 5 enum-uppdateringar i graph-tools.ts
- T3 ✅ Migration: CHECK constraints för nya typer
- T4 ✅ Parser: parseIdeasMd() — extraherar titel, beskrivning, impact/effort
- T5 ✅ Historian: processIdeas() med semantisk dedup (>0.85)
- T6 ✅ Tester: 36 parser + 21 integration = 57 nya

## Händelser
- Inga testfel
- Inga policy-blockeringar
- 0 re-delegeringar (allt fungerade första gången)

## Resultat
- Filer: 3 modifierade, 4 nya (+948 / -5 rader)
- Tester: 2492 totalt (2435 baseline + 57 nya)
- Agenter: Manager 12 iter, Implementer 8 iter, Reviewer 4 iter

## Lärdomar
- idea_draft-tabellen var oanvänd → kan rensas framöver
- Semantisk dedup vid 0.85 fungerar bra för att undvika dubbletter
```

#### Digest-modulen

```typescript
// src/core/run-digest.ts
export interface DigestData {
  runid: string;
  briefTitle: string;       // extraherat från brief.md
  timing: { start: string; end: string; durationMin: number };
  stoplight: 'GREEN' | 'YELLOW' | 'RED';
  costUsd: number;
  testsAdded: number;
  plan: TaskInfo[];          // från task_plan.md
  completed: TaskResult[];   // från task_scores.jsonl + report.md
  events: DigestEvent[];     // från audit.jsonl — filtrerade höjdpunkter
  results: CodeMetrics;      // från metrics.json
  learnings: string[];       // från knowledge.md
}

export async function generateDigest(runDir: string): Promise<string>
// Läser: metrics.json, usage.json, task_scores.jsonl, report.md,
//        brief.md, task_plan.md, knowledge.md, questions.md, audit.jsonl
// Returnerar: markdown-sträng (digest.md innehåll)
// Skriver: runs/<runid>/digest.md

export function extractHighlights(auditLines: string[]): DigestEvent[]
// Filtrerar audit.jsonl till intressanta händelser:
// - Delegeringar (vem → vem, varför)
// - Policy-blockeringar
// - Testresultat (pass/fail)
// - Re-delegeringar (något gick fel första gången)
// - Merge-operationer
// Returnerar max 20 höjdpunkter i kronologisk ordning
```

**Integration:** Anropas i `finalizeRun()` efter `computeRunMetrics()` — helt kodfritt (ingen LLM, ren string-formatering).

### Del B: Berättande händelselogg (live)

Ersätt JSON-eventloggen i dashboarden med naturligt språk.

#### Event-till-text-översättning

Ny modul `src/core/narrative.ts`:

```typescript
export function narrateEvent(event: string, data: Record<string, unknown>): string
```

| Event | Nuvarande (JSON) | Berättande |
|-------|-------------------|------------|
| `run:start` | `{"runid":"...","target":"neuron-hq","hours":1}` | `🚀 Körning startad: neuron-hq (1 timme)` |
| `agent:start` | `{"runid":"...","agent":"manager"}` | `📋 Manager börjar arbeta` |
| `agent:start` + task | `{"agent":"implementer","task":"T1"}` | `👷 Implementer tar uppgift T1: Schema-uppdatering` |
| `agent:text` | `{"agent":"manager","text":"Good, I have context"}` | *(visas i agent-panelen, inte i loggen)* |
| `agent:thinking` | `{"agent":"manager","text":"..."}` | `🧠 Manager resonerar...` (kollapsat) |
| `agent:end` | `{"agent":"implementer","result":"done"}` | `✅ Implementer klar med T1` |
| `task:status` pending→running | `{"taskId":"T2","status":"running"}` | `🔄 Uppgift T2 startar: Tools-uppdatering` |
| `task:status` →completed | `{"taskId":"T2","status":"completed"}` | `✅ Uppgift T2 klar` |
| `task:status` →failed | `{"taskId":"T2","status":"failed"}` | `❌ Uppgift T2 misslyckades` |
| `tokens` | `{"agent":"manager","input":24223,"output":307}` | *(ackumuleras i header, inte i loggen)* |
| `time` | `{"elapsed":120,"remaining":3480}` | *(uppdaterar timer i header)* |
| `stoplight` | `{"status":"GREEN"}` | `🟢 STOPLIGHT: GREEN — körningen godkänd` |
| `iteration` | `{"agent":"manager","current":3,"max":58}` | *(uppdaterar counter i header)* |
| `audit` + delegation | `{"tool":"delegate_to_implementer"}` | `📤 Manager → Implementer: "Implementera T1"` |
| `audit` + blocked | `{"allowed":false}` | `🚫 Policy blockade: [anledning]` |

**Nyckelprincip:** Inte alla events visas i loggen. `agent:text`, `tokens`, `time`, `iteration` uppdaterar andra UI-element. Loggen visar bara *handlingar och milstolpar*.

### Del C: Körningsbibliotek

En dropdown/lista ovanför dashboarden som visar alla körningar.

#### Datakälla

Läs alla `runs/*/metrics.json` + `runs/*/digest.md` (om finns). Returnera via nytt SSE-endpoint eller REST-endpoint.

```typescript
// Nytt endpoint i dashboard-server.ts
// GET /runs → JSON-lista med sammanfattning per körning
export interface RunSummary {
  runid: string;
  briefTitle: string;
  date: string;
  durationMin: number;
  stoplight: 'GREEN' | 'YELLOW' | 'RED' | 'unknown';
  testsAdded: number;
  costUsd: number;
  hasDigest: boolean;
}
```

#### UI-beteende

- **Dropdown** längst upp i dashboarden: `[▼ Körning #147 — TD-4 Idea Nodes 🟢]`
- Öppna → lista med alla körningar, sorterade nyast först
- "Current (live)" alltid överst om en körning pågår (pulsande grön prick)
- Klicka på historisk körning → ladda digest.md som berättelse i huvudpanelen
- Klicka tillbaka på "Current" → tillbaka till live-vy

### Del D: Förbättrad agent- och task-panel

#### Agent-paneler

Nuvarande: namn + "aktiv" + strömmande text.

Nytt:
- **Status-rad:** `👷 Implementer — Arbetar med T1: Schema` (inte bara "aktiv")
- **Iterationsräknare:** `Iteration 3/15`
- **Token-förbrukning:** `62k in / 18k ut`
- Resonemang: behåll befintlig collapsible, men begränsa till senaste 10 rader (inte 30)

#### Task-panel

Nuvarande: enkel lista med status-ikoner.

Nytt:
- Visa **beskrivning** per task (inte bara "T1")
- Visa **vilken agent** som arbetar med uppgiften
- Visa **wave-nummer**: `Wave 1: T1 T2 T3 T4 | Wave 2: T5 | Wave 3: T6`

### Del E: Fixa kända buggar

1. **Timer:** Koppla `time`-events korrekt till header-elementet
2. **Tokens:** Ackumulera tokens-events (inte visa senaste, utan summa)
3. **Kostnad:** Beräkna `cost = (input * pricePerInputToken + output * pricePerOutputToken)` löpande
4. **Iterationer:** Visa `current/max` per aktiv agent i headern

---

## Arkitektur

### Nya filer

| Fil | Rader (ca) | Syfte |
|-----|-----------|-------|
| `src/core/run-digest.ts` | ~200 | Digest-generering (ren kod, ingen LLM) |
| `src/core/narrative.ts` | ~120 | Event→text översättning |
| `tests/core/run-digest.test.ts` | ~150 | Digest-tester |
| `tests/core/narrative.test.ts` | ~100 | Narrativ-tester |

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/run.ts` | Anropa `generateDigest()` i `finalizeRun()` |
| `src/core/dashboard-server.ts` | Lägg till `GET /runs` endpoint, fixa reconnect |
| `src/core/dashboard-ui.ts` | Ny HTML: dropdown, narrativ logg, förbättrade paneler, buggfixar |

### Dataflöde

```
[Körning pågår]
  EventBus → narrative.ts → dashboard-ui (berättande logg)
  EventBus → dashboard-ui (agent-paneler, task-panel, header)

[Körning klar]
  finalizeRun() → computeRunMetrics() → generateDigest() → digest.md

[Historisk vy]
  GET /runs → lista körningar
  Klick → ladda digest.md → visa i huvudpanel
```

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] `run-digest.ts` genererar `digest.md` med sektionerna: Plan, Utfört, Händelser, Resultat, Lärdomar
- [ ] Digest genereras automatiskt i `finalizeRun()` utan LLM-anrop
- [ ] `narrative.ts` översätter alla 12 event-typer till svenska naturligt-språk-strängar
- [ ] Händelseloggen i dashboarden visar berättande text istället för JSON
- [ ] Dropdown med körningsbibliotek: lista alla körningar från `runs/*/metrics.json`
- [ ] Klick på historisk körning visar digest i huvudpanelen
- [ ] "Current (live)" visas överst med visuell markering när körning pågår
- [ ] Agent-paneler visar aktuell uppgift + iteration + tokens
- [ ] Task-panel visar beskrivning och tilldelad agent per task
- [ ] Timer, tokens och kostnad uppdateras korrekt i header (buggfixar)
- [ ] Minst 40 nya tester (digest + narrativ + server endpoints)
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Task-panel visar wave-gruppering (Wave 1, Wave 2, ...)
- [ ] Sökfält i körningsbiblioteket (fritext)
- [ ] Filter i körningsbiblioteket: per status (GREEN/YELLOW/RED)
- [ ] Kostnad per agent i agent-panelerna
- [ ] Digest inkluderar "Se också"-länkar till relaterade körningar (baserat på brief-topic)

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Digest utan LLM | Snabbt, deterministiskt, gratis. All data finns i metrics.json + audit.jsonl |
| Narrativ på svenska | Användaren läser svenska. Konsistent med resten av UI |
| Dropdown istället för separat sida | Minimal navigering, allt i samma vy |
| REST endpoint för körningslista | Enklare än SSE för statisk data. SSE fortsätter för live-events |
| Max 20 highlights i digest | Håller digesten läsbar. Fullständig log finns i audit.jsonl |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Många runs → långsam /runs-endpoint | Låg (150 körningar) | Låg | Cacha lista, lazy-load digest |
| Narrativ text blir missvisande | Medium | Medium | Testa alla event-typer, fallback till rå JSON |
| Digest saknar viktig info | Låg | Medium | Digest pekar alltid till audit.jsonl för detaljer |
| Dashboard-UI blir för stor (en HTML-fil) | Medium | Låg | Modularisera CSS/JS i funktioner, inte nya filer |

---

## Dependencies

- RT-1a/b/c (EventBus + Dashboard + Thinking) ✅ redan klart
- `metrics.json` genereras i `finalizeRun()` ✅ redan klart
- `task_scores.jsonl` genereras post-run ✅ redan klart

---

## Uppskattad omfattning

| Komponent | Nya rader | Modifierade rader |
|-----------|----------|-------------------|
| run-digest.ts | ~200 | — |
| narrative.ts | ~120 | — |
| dashboard-ui.ts | — | ~150 (ny HTML/JS) |
| dashboard-server.ts | — | ~40 (GET /runs) |
| run.ts | — | ~5 (anropa digest) |
| Tester | ~250 | — |
| **Totalt** | **~570** | **~195** |

---

## Verifiering

```bash
# Alla tester gröna
pnpm test

# Typecheck
pnpm typecheck

# Manuell verifiering
# 1. Kör en körning → kontrollera att digest.md genereras
# 2. Öppna dashboard → kontrollera berättande logg
# 3. Öppna dropdown → se historiska körningar
# 4. Klicka på en historisk körning → se digest
```

---

## Koppling till AI Act

| Krav | Artikel | Vad RT-2 levererar |
|------|---------|-------------------|
| Tolkningsbar output | Art. 13 | Berättande logg + digest i naturligt språk |
| Automatisk loggning | Art. 12 | Digest genereras automatiskt, indexerar audit.jsonl |
| Spårbarhet | Art. 12 | Körningsbibliotek med all historik tillgänglig |
| Information till användare | Art. 13 | Agent-paneler visar vad + varför, inte bara status |

---

## Framtida nivåer (RT-3 → RT-5)

Denna brief är **Nivå 1: Transparens**. Kommande nivåer:

- **RT-3 (Förklarbarhet):** Beslutskedjor, agentens synfält, osäkerhetsmarkörer
- **RT-4 (Mänsklig kontroll):** Paus, fråga, korrigera, godkänn/avslå
- **RT-5 (Riskhantering + Audit):** Anomali-detektion, jämförelse, export, 6 mån retention
