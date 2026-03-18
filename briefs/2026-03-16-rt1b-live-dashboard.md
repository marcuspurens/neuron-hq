# RT-1b: Live Dashboard — SSE-server + Kontrollrums-UI

## Bakgrund

RT-1a skapade EventBus — det centrala event-systemet. Nu behövs två saker:
1. En server som skickar events till webbläsaren
2. En webbsida som visar dem visuellt

## Förutsättningar

RT-1a måste vara implementerad och mergad.

## Mål

När du kör `npx tsx src/cli.ts run ...` öppnas automatiskt en webbsida i din webbläsare som visar:
- Vilken agent som är aktiv just nu
- Parallella Implementers och deras task-status
- Task-progress (vilka tasks i planen som är klara)
- Tidsbudget och iteration-räknare
- STOPLIGHT-resultat
- Token-förbrukning
- Live-resonemang (agent:text) per agent
- Event-logg med alla händelser

## Arkitektur

### Varför SSE istället för WebSocket

Dashboarden behöver bara **ta emot** data — den skickar inget tillbaka. Då är Server-Sent Events (SSE) bättre:
- Inbyggt i webbläsaren (`EventSource` API) — ingen klient-library
- Inbyggt i Node.js (`http` modul) — ingen server-library
- **Noll nya dependencies**
- Auto-reconnect inbyggt i webbläsaren
- Enklare att debugga (vanlig HTTP, syns i Network-tabben)

### Nya filer

```
src/core/dashboard-server.ts  ← HTTP-server: SSE-endpoint + serverar HTML
src/core/dashboard-ui.ts      ← HTML+CSS+JS som template string
```

### Dashboard-server (`src/core/dashboard-server.ts`)

En minimal HTTP-server med två endpoints:

| Endpoint | Metod | Vad den gör |
|----------|-------|-------------|
| `GET /` | HTTP | Serverar HTML-dashboarden |
| `GET /events` | SSE | Strömmar events som `text/event-stream` |

**Livscykel:**
1. Startar vid `run`-kommandot (integreras i `RunOrchestrator` eller CLI run-command)
2. Öppnar `http://localhost:4200` automatiskt i webbläsaren (via `open` på macOS)
3. Prenumererar på EventBus — varje event → SSE `data:` rad till alla anslutna klienter
4. Stängs automatiskt vid `run:end`-event
5. **Felhantering:** Om port 4200 är upptagen — logga URL till terminalen, kör körningen ändå. Dashboard-server-fel får ALDRIG stoppa en körning.

**Ingen dependency** — använder Node.js inbyggda `http.createServer()`.

### Dashboard-UI (`src/core/dashboard-ui.ts`)

En enda HTML-fil med inbäddad CSS och JavaScript, exporterad som template string (samma mönster som befintliga `dashboard-template.ts`).

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│  NEURON HQ — Körning 20260316-0246-neuron-hq         │
│  ⏱ 12:34 / 60:00 min   🔄 Iteration 3/50           │
│  📊 Tokens: 45.2k in / 12.8k out   💰 $0.23        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ MANAGER │  │ IMPL A  │  │ IMPL B  │              │
│  │  ● aktiv│  │  ● klar │  │  ◐ kör  │              │
│  │         │  │  T1: ✓  │  │  T2: ... │              │
│  │ [Reso-  │  │ [Reso-  │  │ [Reso-  │              │
│  │  nemang]│  │  nemang]│  │  nemang]│              │
│  └─────────┘  └─────────┘  └─────────┘              │
│                                                      │
│  Tasks:                                              │
│  ✅ T1 — Konsolidera speakers (Impl A, 2:14)        │
│  🔄 T2 — Konsolidera jobs (Impl B, pågår...)        │
│  ⏳ T3 — Scope registry (väntar på T1+T2)           │
│                                                      │
├──────────────────────────────────────────────────────┤
│  STOPLIGHT: ─── (väntar på Reviewer)                 │
├──────────────────────────────────────────────────────┤
│  Live-logg (senaste 50 events):                      │
│  09:41:02 [Manager] Delegating T1 to Implementer A  │
│  09:41:03 [Manager] Delegating T2 to Implementer B  │
│  09:43:17 [Impl A] Task completed: 8→1 tool         │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

**Tekniska detaljer:**
- Ren HTML/CSS/JS — ingen React, inget byggsteg, inget bundling
- `EventSource('/events')` — webbläsarens inbyggda SSE-klient med auto-reconnect
- CSS med mörkt tema (kontrollrums-känsla)
- Agent-tiles dyker upp dynamiskt vid `agent:start`, försvinner/markeras vid `agent:end`
- `agent:text`-event scrollar live i varje agent-tile under "Resonemang"-sektionen (senaste 30 rader)
- Task-listan uppdateras vid `task:status`-events
- STOPLIGHT-sektionen animeras vid `stoplight`-event (bakgrundsfärg blinkar grön/gul/röd)
- Timer uppdateras vid `time`-events
- Auto-scroll i event-loggen (kan pausas med klick)
- Responsiv — funkar i alla webbläsare

## Krav

### Måste ha (acceptance criteria)
- [ ] `dashboard-server.ts` — HTTP-server med `GET /` (HTML) och `GET /events` (SSE)
- [ ] `dashboard-ui.ts` — HTML-template med mörkt tema, agent-tiles, task-lista, timer, stoplight, event-logg
- [ ] SSE-streaming: varje EventBus-event → JSON i SSE `data:`-format till alla anslutna klienter
- [ ] Agent-tiles med live `agent:text`-resonemang (expanderbart, senaste 30 rader per agent)
- [ ] Servern startar automatiskt vid `run`-kommandot
- [ ] Webbläsaren öppnas automatiskt (via `open` på macOS)
- [ ] Servern stängs automatiskt vid `run:end`
- [ ] **Isolationskrav:** Server-fel, port-konflikter, klient-disconnects — INGET av detta får påverka körningen
- [ ] Alla befintliga tester fortsätter passera
- [ ] Minst 10 nya tester:
  - Server start/stop
  - SSE-endpoint svarar med rätt Content-Type
  - Events vidarebefordras som SSE-data
  - HTML-template genereras utan fel
  - Port-konflikt hanteras gracefully
  - Cleanup vid run:end

### Bra att ha (stretch goals)
- [ ] Sparkline-visualisering av token-förbrukning per agent
- [ ] Sound-notifikation vid GREEN/RED (webbläsar `Audio()`)
- [ ] E-stop-knapp i dashboarden (POST /estop → skapar STOP-filen)
- [ ] Mörkt/ljust tema-toggle

## Tekniska beslut

- **SSE istället för WebSocket** — envägs-push räcker, noll dependencies, auto-reconnect inbyggt
- **Port 4200** — undviker kollision med 3000 (Langfuse), 4100 (SwarmWatch), 5432 (Postgres)
- **HTML som template string** — samma mönster som `dashboard-template.ts`
- **Ingen ny dependency** — `http.createServer()` + `EventSource` (webbläsare-inbyggd)

## Riskanalys

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Port 4200 upptagen | Låg | Logga URL, skippa auto-open, körningen fortsätter |
| Webbläsaren öppnas inte | Låg | Logga URL till terminalen som fallback |
| Många SSE-klienter (minnesläcka) | Mycket låg | Max 5 klienter, reject resterande |
| SSE-reconnect tappar events | Medel | Hanteras i RT-1c (state-snapshot) |

## Dependencies

**Inga nya.** Node.js `http`-modul + webbläsarens `EventSource` API.

## Uppskattad omfattning

- ~120 rader: `dashboard-server.ts` (HTTP + SSE + lifecycle)
- ~350 rader: `dashboard-ui.ts` (HTML + CSS + JS)
- ~30 rader: Integration i run-kommandot (starta/stoppa server)
- ~120 rader: Tester
- **Totalt: ~620 rader**
