# RT-3b: Rik händelselogg — Expanderbara rader med audit-data

**Bygger på:** RT-1a/b/c + RT-2 + RT-3

> *"Jag ser ALLT som händer, kronologiskt — och kan klicka för att dyka djupare."*

---

## Bakgrund

Dashboardens händelselogg visar idag bara **delegeringar och milstolpar** (~12 rader under en hel körning). Men audit-loggen innehåller **437 entries** — filläsningar, filskrivningar, bash-kommandon, testresultat, sökningar, graph queries. All denna data finns men visas inte.

Användaren beskrev det som: "Händelselogg behöver innehålla mycket mycket mer data."

### Nuvarande problem

1. **Loggen filtrerar bort nästan allt.** Bara `agent:start/end`, `task:status`, `stoplight`, `audit`(delegation/block) visas. Resten av `narrateEvent()` returnerar `null`.
2. **Mellan "Implementer börjar" och 6 minuter senare "Implementer klar" — ingenting.** Under ytan skedde 62 filläsningar, 49 filskrivningar, 273 bash-kommandon.
3. **Inga expanderbara detaljer.** Varje rad är en platt text utan möjlighet att se mer.

### Vad finns att använda

Audit-loggen (`audit.jsonl`) innehåller per entry:
- `ts` — tidsstämpel
- `role` — vilken agent (manager, implementer, reviewer...)
- `tool` — vad som gjordes (read_file, write_file, bash_exec, delegate_to_*, graph_query...)
- `allowed` — godkänt av policy?
- `note` — beskrivning (bash-kommando, sökfråga, etc.)
- `files_touched` — array med filsökvägar
- `diff_stats` — { additions, deletions }
- `exit_code` — för bash-kommandon
- `policy_event` — vid blockeringar

Dessa events emitteras redan som `audit`-events via EventBus till SSE. Dashboardens `narrateEvent()` och `handleEvent()` filtrerar bara bort allt utom delegeringar och blockeringar.

---

## Mål

### Del A: Visa alla audit-events i loggen

Uppdatera `narrateEvent()` i `dashboard-ui.ts` (klientsidan) för att generera text för alla audit-typer:

| tool | Nivå 1 (alltid synlig) | Nivå 2 (klicka pil ▶) |
|------|----------------------|----------------------|
| `read_file` | `📖 Implementer läser event-bus.ts` | Fullständig sökväg, filstorlek |
| `write_file` | `✏️ Implementer skriver decision-extractor.ts (+248 rader)` | Fullständig sökväg, diff_stats, filinnehåll-excerpt |
| `bash_exec` | `⚡ Implementer kör: npx vitest run tests/core/...` | Fullständigt kommando, exit_code, output-excerpt |
| `graph_query` | `🔍 Manager söker i kunskapsgrafen (20 noder)` | Sökfråga, antal resultat |
| `search_memory` | `🧠 Manager söker minnet: "decision extractor"` | Sökterm, antal träffar |
| `write_task_plan` | `📋 Manager skapar plan med 10 uppgifter` | Uppgiftslista |
| `delegate_parallel_wave` | `🌊 Manager startar Wave 1: T1, T2 parallellt` | Uppgiftsdetaljer |
| `delegate_to_*` | `📤 Manager → Implementer: "Skapa decision-extractor"` | Fullständig uppgiftsbeskrivning |
| `copy_to_target` | `📁 Merger kopierar fil till target-repo` | Käll- och målsökväg |
| `adaptive_hints` | `💡 Manager får 0 varningar, 10 styrkor` | Lista styrkor/varningar |
| `agent_message` | `💬 Agent-meddelande` | Meddelandetext |
| `run` (agent start) | `🚀 Implementer startar — "Skapa decision-extractor..."` | Fullständig uppgiftstext |

**Nyckelbeslut:**
- `files_touched` visas med bara filnamnet (inte fullständig workspace-path) i nivå 1
- Bash-kommandon visas trunkerade (max 60 tecken) i nivå 1, fullständigt i nivå 2
- Sökvägar strippar workspace-prefix: visa `src/core/event-bus.ts`, inte `/Users/.../workspaces/.../neuron-hq/src/core/event-bus.ts`

### Del B: Expanderbara rader (klicka pil ▶)

Varje loggpost blir en klickbar rad med expanderbar detaljruta:

```html
<!-- Nivå 1: alltid synlig -->
<div class="log-entry" onclick="toggleExpand(this)">
  <span class="ts">14:18:22</span>
  <span class="expand-arrow">▶</span>
  📖 Implementer läser thinking-extractor.ts
</div>

<!-- Nivå 2: expanderad -->
<div class="log-detail">
  <div class="detail-row"><span class="label">Fil:</span> src/core/thinking-extractor.ts</div>
  <div class="detail-row"><span class="label">Agent:</span> Implementer (T1)</div>
  <div class="detail-row"><span class="label">Tid:</span> 14:18:22</div>
</div>
```

```html
<!-- Bash-kommando expanderat -->
<div class="log-entry" onclick="toggleExpand(this)">
  <span class="ts">14:16:37</span>
  <span class="expand-arrow">▶</span>
  ⚡ Manager kör: npx vitest run 2>&1 | tail -30
</div>
<div class="log-detail">
  <div class="detail-row"><span class="label">Kommando:</span> cd /Users/.../neuron-hq && npx vitest run 2>&1 | tail -30</div>
  <div class="detail-row"><span class="label">Exit code:</span> 0 ✅</div>
  <div class="detail-row"><span class="label">Agent:</span> Manager</div>
</div>
```

**Pilen roterar** vid expandering: ▶ → ▼

### Del C: Smart gruppering och filtrering

Med 437 entries per körning behöver loggen vara hanterbar:

1. **Gruppera sekventiella filläsningar:** Om en agent läser 5 filer inom 3 sekunder → visa som en rad:
   `📖 Implementer läser 5 filer (thinking-extractor.ts, types.ts, audit.ts, ...)` med expandering som listar alla.

2. **Logg-filter-knappar** ovanför loggen:
   - `[Alla]` `[Handlingar]` `[Filer]` `[Tester]` `[Beslut]`
   - "Handlingar" = delegeringar, milstolpar, agent start/end
   - "Filer" = read_file, write_file
   - "Tester" = bash_exec som innehåller "vitest" eller "test"
   - "Beslut" = decision-events

3. **Buffert ökas:** Nuvarande `while(logEl.children.length>50)` → `200`. Eller bättre: virtual scrolling med lazy rendering för långa loggar.

### Del D: SSE audit-events förbättring

Nuvarande `onAny` i `dashboard-server.ts` skickar alla EventBus-events. Men audit-events behöver berikas:

```typescript
// I dashboard-server.ts onAnyCallback:
// Strippa workspace-prefix från files_touched för renare visning
if (event === 'audit' && data && typeof data === 'object') {
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.files_touched)) {
    d.display_files = (d.files_touched as string[]).map(f => {
      const wsIdx = f.indexOf('/neuron-hq/');
      return wsIdx >= 0 ? f.slice(wsIdx + '/neuron-hq/'.length) : f;
    });
  }
  // Extrahera kort kommando-beskrivning
  if (d.tool === 'bash_exec' && typeof d.note === 'string') {
    const cmd = (d.note as string).replace(/^Command:\s*/, '');
    const wsIdx = cmd.indexOf('/neuron-hq/');
    d.display_command = wsIdx >= 0
      ? cmd.slice(cmd.indexOf('&&') >= 0 ? cmd.indexOf('&&') + 3 : wsIdx)
      : cmd;
  }
}
```

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/dashboard-ui.ts` | Ny `narrateAudit()` funktion, expanderbar logg-HTML, filter-knappar, smart gruppering, öka buffert |
| `src/core/dashboard-server.ts` | Berika audit-events med `display_files` och `display_command` |
| `src/core/narrative.ts` | Ny `narrateAuditEvent()` server-side för digest |

### Nya test-filer

| Fil | Tester (ca) |
|-----|------------|
| `tests/core/dashboard-ui-log.test.ts` | ~30 (audit narrativ, expandering, gruppering, filter) |
| Utöka `tests/core/dashboard-server.test.ts` | ~10 (audit-berikelse) |
| Utöka `tests/core/narrative.test.ts` | ~10 (narrateAuditEvent) |

### Dataflöde

```
audit.ts → eventBus.emit('audit', data)
              ↓
dashboard-server.ts → berika med display_files/display_command
              ↓
SSE → dashboard-ui.ts → narrateAudit(data)
              ↓
Expanderbar logg-rad (klicka ▶ → detaljer)
```

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] Alla audit-typer visas i loggen: read_file, write_file, bash_exec, graph_query, search_memory, delegate_*, run, write_task_plan, copy_to_target
- [ ] Varje loggpost har klickbar pil (▶/▼) som expanderar detaljer
- [ ] Expanderade detaljer visar: fullständig sökväg/kommando, agent, tid, exit_code (bash)
- [ ] Filsökvägar strippar workspace-prefix (visa `src/core/foo.ts`, inte full path)
- [ ] Bash-kommandon trunkeras till 60 tecken i nivå 1, fullt i nivå 2
- [ ] Sekventiella filläsningar (samma agent, <3s) grupperas till en rad
- [ ] Filter-knappar: Alla / Handlingar / Filer / Tester / Beslut
- [ ] Logg-buffert ökas från 50 till 200 poster
- [ ] Minst 40 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Virtual scrolling för loggar med >200 poster
- [ ] Sökning i loggen (fritext-filter)
- [ ] "Hoppa till senaste" knapp när loggen är pausad
- [ ] Färgkoda per agent (Manager=blå, Implementer=grön, Reviewer=lila)
- [ ] Kopiera loggpost till clipboard vid högerklick

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| Klient-side narrativ (inte server-side) | Snabbare, ingen extra endpoint. Audit-events skickas redan via SSE |
| Gruppering i klienten (inte servern) | Servern behöver inte veta om UI-logiken. Ren separation |
| Filter via CSS-klasser (inte DOM-manipulation) | Snabbare rendering, enklare logik |
| Workspace-prefix strippad server-side | Konsekvent kortare paths för alla klienter |
| 200-post buffert | 437 entries totalt = 200 räcker för att se senaste halvtimmen |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Performance med 200+ DOM-noder | Låg | Medium | CSS-baserad filtrering, lazy rendering |
| Loggen blir överväldigande | Medium | Medium | Gruppering + filter. Standard-filter: "Handlingar" |
| Workspace-prefix strippar för mycket | Låg | Låg | Fallback: visa hela pathen om stripping misslyckas |
| SSE-bandwidth med alla audit-events | Låg | Låg | Audit-events redan < 1KB styck |

---

## Uppskattad omfattning

| Komponent | Nya/Ändrade rader |
|-----------|-------------------|
| dashboard-ui.ts (narrateAudit, expandering, filter, gruppering) | ~250 ändrade |
| dashboard-server.ts (berika audit) | ~30 ändrade |
| narrative.ts (narrateAuditEvent) | ~60 ändrade |
| Tester | ~300 nya |
| **Totalt** | **~640** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Starta körning → öppna dashboard
# 2. Loggen visar filläsningar, skrivningar, bash-kommandon (inte bara delegeringar)
# 3. Klicka ▶ på en bash-rad → se fullständigt kommando + exit code
# 4. Klicka "Filer" filter → bara filoperationer visas
# 5. Se att sekventiella filläsningar grupperas ("Implementer läser 5 filer")
```
