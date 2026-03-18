# RT-1a: EventBus — Centralt Event-system för Agent-observability

## Bakgrund

Neuron HQ saknar insyn i realtid under körningar. All data finns redan (audit.jsonl, usage, task status) men det finns inget centralt event-system som andra moduler kan prenumerera på.

Denna brief skapar **grundstenen** — en typad EventBus som emitterar events från agenternas nyckelmoment. Inga nya dependencies, inga nya servrar. Bara events som strömmar genom systemet.

RT-1b (dashboard-server + UI) bygger på detta. RT-1c (thinking-extraktion) bygger på RT-1a+b.

## Mål

- En typad singleton EventBus i `src/core/event-bus.ts`
- Events emitteras från alla nyckelställen i agent-loopen, parallell-koordinatorn och audit-loggern
- **Järnhårt krav:** EventBus-fel får ALDRIG påverka en körning. Alla emit-anrop är fire-and-forget med try/catch.

## Arkitektur

### Ny fil: `src/core/event-bus.ts`

```typescript
import { EventEmitter } from 'node:events';

// Typade event-definitioner
interface EventMap {
  'run:start':    { runid: string; target: string; hours: number; startTime: string };
  'run:end':      { runid: string; duration: number; status?: string };
  'agent:start':  { runid: string; agent: string; task?: string; taskId?: string };
  'agent:end':    { runid: string; agent: string; result?: string; error?: string };
  'agent:text':   { runid: string; agent: string; text: string };
  'agent:thinking': { runid: string; agent: string; text: string };
  'iteration':    { runid: string; agent: string; current: number; max: number };
  'task:status':  { runid: string; taskId: string; status: 'pending'|'running'|'completed'|'failed'; branch?: string };
  'stoplight':    { runid: string; status: 'GREEN'|'YELLOW'|'RED' };
  'tokens':       { runid: string; agent: string; input: number; output: number };
  'time':         { runid: string; elapsed: number; remaining: number; percent: number };
  'audit':        Record<string, unknown>;  // AuditEntry passthrough
}
```

**Singleton-mönster:**
- Exportera `eventBus` — en enda instans som alla moduler importerar
- `safeEmit(event, data)` — wrapper som fångar alla fel tyst (console.error + fortsätt)
- `eventBus.history` — cirkulär buffer (senaste 200 events) för reconnect-state (används i RT-1c)

### Integrationspunkter

Dessa befintliga filer behöver **en rad tillagd** vid varje nyckelmoment:

| Fil | Rad (ca) | Event | Vad som händer |
|-----|----------|-------|---------------|
| `src/core/run.ts` | ~199 | `run:start` | Efter `initRun()` skapar RunContext |
| `src/core/run.ts` | ~slutet | `run:end` | Efter körningen avslutas |
| `src/core/agents/manager.ts` | ~273 | `iteration` | Varje iteration-start |
| `src/core/agents/manager.ts` | ~287-292 | `agent:text` | `stream.on('text', ...)` |
| `src/core/agents/manager.ts` | ~301-305 | `tokens` | `usage.recordTokens()` |
| `src/core/agents/manager.ts` | ~264 | `time` | Tidskontroll |
| `src/core/agents/manager.ts` | ~727 | `agent:start` | Delegering till Implementer |
| `src/core/agents/manager.ts` | ~789 | `agent:end` | Implementer klar |
| `src/core/agents/manager.ts` | ~910 | `agent:start` | Delegering till Reviewer |
| `src/core/agents/manager.ts` | ~973 | `agent:end` + `stoplight` | Reviewer klar + resultat |
| `src/core/agents/manager.ts` | ~978-1076 | `agent:start/end` | Researcher, Historian, Tester, etc. |
| `src/core/agents/manager.ts` | ~835 | `task:status` → running | Parallel task startar |
| `src/core/agents/manager.ts` | ~844 | `task:status` → completed | Parallel task klar |
| `src/core/agents/manager.ts` | ~856 | `task:status` → failed | Parallel task misslyckas |
| `src/core/audit.ts` | ~16 | `audit` | Varje audit-entry (efter filskrivning) |

**Mönster för varje integration:**
```typescript
import { eventBus } from './event-bus.js';

// I befintlig kod, lägg till EN rad:
eventBus.safeEmit('agent:start', { runid: this.ctx.runid, agent: 'implementer', task: input.task });
```

## Krav

### Måste ha (acceptance criteria)
- [ ] `src/core/event-bus.ts` — typad singleton EventEmitter med alla 12 event-typer
- [ ] `safeEmit()` — wrapper med try/catch som aldrig kastar (loggar till console.error)
- [ ] `eventBus.history` — cirkulär buffer med senaste 200 events (typ + data + timestamp)
- [ ] Events emitteras från Manager: `run:start`, `iteration`, `agent:text`, `tokens`, `time`, alla `agent:start/end`, `stoplight`
- [ ] Events emitteras från `delegateParallelWave()`: `task:status` (pending/running/completed/failed)
- [ ] Events emitteras från `AuditLogger.log()`: `audit`
- [ ] **Isolationskrav:** Om EventBus kastar, om listener kastar, om emit tar lång tid — körningen påverkas INTE. Testat explicit.
- [ ] Alla 2371 befintliga tester fortsätter passera
- [ ] Minst 12 nya tester:
  - EventBus singleton (samma instans)
  - safeEmit med/utan listeners
  - safeEmit vid listener-error (fångas tyst)
  - History-buffer (cirkulär, max 200)
  - Varje event-typ emitteras korrekt
  - Integration: Manager emit vid delegation (mock)
  - Integration: AuditLogger emit vid log (mock)

### Bra att ha (stretch goals)
- [ ] `eventBus.onAny(callback)` — wildcard-listener för debugging/logging
- [ ] Event-räknare per typ (för diagnostik)

## Tekniska beslut

- **Ingen ny dependency** — `EventEmitter` finns i Node.js stdlib
- **Singleton** — alla moduler delar samma instans via `import { eventBus }`
- **Fire-and-forget** — `safeEmit()` fångar alla fel tyst, loggar till stderr, och fortsätter
- **History-buffer** — cirkulär array med max 200 poster, för att RT-1c ska kunna skicka state-snapshot vid reconnect

## Riskanalys

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Listener kastar exception | Medel | `safeEmit()` fångar med try/catch |
| Memory leak vid många listeners | Låg | `setMaxListeners()` + cleanup vid run:end |
| Cirkulär buffer växer | Ingen | Fast storlek 200 |

## Dependencies

Inga nya.

## Uppskattad omfattning

- ~150 rader: `event-bus.ts` (typer + singleton + safeEmit + history)
- ~50 rader: Integrationskod (emit-anrop spridda i befintliga filer)
- ~150 rader: Tester
- **Totalt: ~350 rader**
