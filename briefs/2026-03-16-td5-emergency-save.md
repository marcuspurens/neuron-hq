# TD-5: Nödsparning — Bevara arbete vid max iterationer

**Prioritet:** HÖG — förlorad kod vid körning 152 (RT-3d) motiverar omedelbar åtgärd

> *"Om agenten tar slut på iterationer ska arbetet aldrig försvinna."*

---

## Bakgrund

### Vad hände

Körning 152 (RT-3d) fick GREEN från Reviewer med 2920 tester, 59 nya. Men Manager nådde iteration 100/100 innan Merger anropades. Resultatet:

- **Rapporten säger GREEN** — allt ser bra ut
- **Koden finns inte** — aldrig committad, aldrig mergad
- **Workspace tomt** — ocommittade ändringar försvann vid avslutning
- **Ingen varning** — användaren trodde allt gick bra

### Grundorsak

`manager.ts` rad 262–384: `while (iteration < this.maxIterations)` — när loopen avslutas:
1. Skriver "Max iterations reached" till konsolen
2. Anropar `recordIterations()` för statistik
3. **Gör inget med ocommittad kod i workspace**
4. **Skriver ingen varning till rapport eller artefakter**

### Designlucka

Systemet saknar tre saker:
1. **Nöd-commit** — ocommittad kod borde sparas automatiskt
2. **Varning i rapport** — "Max iterationer nådda, merge ej genomförd"
3. **Workspace-bevarande** — branchen borde bevaras, inte rensas

---

## Mål

### Del A: Nöd-commit vid max iterationer

När Manager, Implementer eller Merger når max iterationer OCH det finns ocommittade ändringar i workspace:

```typescript
// I slutet av agent-loopen (manager.ts, implementer.ts, merger.ts)
if (iteration >= this.maxIterations) {
  await this.emergencySave();
}
```

```typescript
// Ny metod i BaseAgent eller utility
async emergencySave(): Promise<void> {
  const status = await execInWorkspace('git status --porcelain');
  if (!status.trim()) return; // Inget att spara

  // Committa allt ocommitterat
  await execInWorkspace('git add -A');
  await execInWorkspace(`git commit -m "EMERGENCY SAVE: ${this.agentName} reached max iterations (${this.maxIterations})"`);

  // Logga till audit
  this.ctx.audit.append({
    type: 'emergency_save',
    agent: this.agentName,
    iteration: this.currentIteration,
    maxIterations: this.maxIterations,
    timestamp: new Date().toISOString(),
  });

  console.warn(`⚠️ EMERGENCY SAVE: ${this.agentName} committed workspace at iteration ${this.currentIteration}/${this.maxIterations}`);
}
```

### Del B: Varning i rapport

Uppdatera `reviewer.ts` eller rapporten med tydlig varning:

```markdown
⚠️ VARNING: Manager nådde max iterationer (100/100).
Merge till main genomfördes EJ.
Arbetet finns sparat i workspace-branchen: swarm/20260316-1833-neuron-hq
Kör `git cherry-pick <hash>` för att manuellt applicera.
```

**Implementering:**

1. `manager.ts`: Sätt `this.ctx.metadata.maxIterationsReached = true` vid max iterations
2. `run.ts`: Kontrollera `metadata.maxIterationsReached` efter Manager avslutas
3. Om true: skriv varning till `runs/{runid}/WARNING.md` + uppdatera rapport
4. Dashboard: Visa ⚠️ i headern om max iterations nåddes

### Del C: Bevara workspace-branch

Nuvarande beteende: workspace rensas efter körning (eller vid nästa körning).

Nytt beteende:

1. **Om merge lyckades:** Rensa workspace som vanligt (koden finns på main)
2. **Om max iterations nåtts:** Behåll workspace-branchen. Skriv till `runs/{runid}/recovery.md`:

```markdown
# Återställning

Koden finns i workspace-branchen. Kör:

```bash
cd workspaces/20260316-1833-neuron-hq
git log --oneline -5   # Se committad kod
git diff main           # Se skillnaden mot main

# Applicera manuellt:
git checkout main
git cherry-pick <commit-hash>
```
```

3. **Markera workspace som "bevarad"** i en `.preserved`-fil så att cleanup-logik inte raderar den.

### Del D: EventBus-varning

Emittera ett nytt event:

```typescript
// event-bus.ts
'warning': {
  runid: string;
  type: 'max_iterations' | 'merge_failed' | 'test_timeout';
  message: string;
  agent: string;
  recoveryPath?: string;  // Sökväg till bevarad workspace
}
```

Dashboard visar varningen som en gul banner:

```
⚠️ Manager nådde max iterationer (100/100). Koden sparades i workspace men mergades inte till main.
```

---

## Arkitektur

### Modifierade filer

| Fil | Ändring |
|-----|---------|
| `src/core/agents/manager.ts` | `emergencySave()` vid max iterations, sätt metadata-flagga |
| `src/core/agents/implementer.ts` | `emergencySave()` vid max iterations |
| `src/core/agents/merger.ts` | `emergencySave()` vid max iterations |
| `src/core/run.ts` | Kontrollera `maxIterationsReached`, skriv WARNING.md, bevara workspace |
| `src/core/event-bus.ts` | Ny event-typ `warning` |
| `src/core/dashboard-ui.ts` | Visa varnings-banner vid `warning`-event |
| `src/core/dashboard-server.ts` | Vidarebefordra `warning`-events till SSE |

### Nya filer

| Fil | Syfte |
|-----|-------|
| `src/core/emergency-save.ts` | Delad logik: git add + commit + audit + varning (~80 rader) |
| `tests/core/emergency-save.test.ts` | Tester (~60 rader) |

### Tester

| Fil | Tester (ca) |
|-----|------------|
| Ny: `tests/core/emergency-save.test.ts` | ~20 (commit sker, tomt workspace = no-op, audit-logg) |
| Utöka: `tests/core/manager.test.ts` | ~8 (max iterations → emergencySave anropas) |
| Utöka: `tests/core/run.test.ts` | ~6 (WARNING.md skapas, workspace bevaras) |
| Utöka: `tests/core/dashboard-ui.test.ts` | ~5 (varnings-banner visas) |
| **Totalt** | **~39 nya** |

---

## Krav

### Måste ha (acceptanskriterier)

- [ ] `emergencySave()` committar ocommitterade ändringar vid max iterations
- [ ] Om workspace är tomt (inga ändringar) görs ingen commit
- [ ] `emergency_save` audit-entry skrivs med agent, iteration, timestamp
- [ ] Konsol-varning `⚠️ EMERGENCY SAVE` skrivs
- [ ] `WARNING.md` skapas i `runs/{runid}/` med info om vad som hände
- [ ] Workspace-branch bevaras (inte rensad) vid max iterations
- [ ] `recovery.md` skapas med instruktioner för manuell merge
- [ ] `.preserved`-fil skapas i workspace för att förhindra cleanup
- [ ] Dashboard visar varnings-banner vid max iterations
- [ ] Ny event-typ `warning` i EventBus
- [ ] Minst 35 nya tester
- [ ] Alla befintliga tester passerar (noll regressioner)

### Bra att ha (stretch goals)

- [ ] Automatisk `git cherry-pick` i CLI: `npx tsx src/cli.ts recover <runid>`
- [ ] Varning i digest.md (inte bara WARNING.md)
- [ ] Notis till användaren via dashboard-toast
- [ ] Statistik: spåra hur ofta max iterations nås per brief-typ

---

## Tekniska beslut

| Beslut | Motivering |
|--------|------------|
| `git add -A` i nöd-commit | Bättre att spara allt (inkl. hjälpscript) än att riskera förlora kod |
| Commit-meddelande "EMERGENCY SAVE" | Tydligt markerat — lätt att hitta i git log |
| `.preserved`-fil | Enkel mekanism — cleanup-logik kollar `if (.preserved exists) skip` |
| Delad `emergency-save.ts` | Samma logik i Manager, Implementer, Merger — undvik duplicering |
| `WARNING.md` separat från rapport | Rapporten skrivs av Reviewer (kan säga GREEN). Varningen är systemets |

---

## Riskanalys

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|------------|----------|------------|
| Nöd-commit inkluderar trasig kod | Medium | Låg | Koden är i en separat branch, inte main. Manuell review krävs |
| Workspace-ackumulering (bevarade) | Låg | Låg | CLI-kommando `npx tsx src/cli.ts cleanup` för manuell rensning |
| `git add -A` fångar känsliga filer | Låg | Medium | .gitignore gäller fortfarande. Redaction scanning i nöd-commit |
| Förvirring: rapport säger GREEN men merge misslyckades | Medium | Medium | WARNING.md + dashboard-banner gör det tydligt |

---

## Dependencies

- Alla agent-filer (`manager.ts`, `implementer.ts`, `merger.ts`)
- `run.ts` (workspace-hantering)
- EventBus + Dashboard (för varning)

---

## Uppskattad omfattning

| Komponent | Nya/Ändrade rader |
|-----------|-------------------|
| emergency-save.ts (ny) | ~80 |
| manager.ts + implementer.ts + merger.ts | ~30 ändrade (anropa emergencySave) |
| run.ts (WARNING.md + bevara workspace) | ~50 ändrade |
| event-bus.ts + dashboard-ui.ts (varning) | ~40 ändrade |
| Tester | ~250 nya |
| **Totalt** | **~450** |

---

## Verifiering

```bash
pnpm test
pnpm typecheck

# Manuell verifiering:
# 1. Sätt max_iterations_manager: 5 temporärt
# 2. Kör en brief → Manager når 5/5
# 3. Kontrollera: workspace har EMERGENCY SAVE commit
# 4. Kontrollera: runs/{runid}/WARNING.md finns
# 5. Kontrollera: workspace/.preserved finns
# 6. Kontrollera: dashboard visar ⚠️ varnings-banner
# 7. Återställ max_iterations_manager: 120
```

---

## Prioritet

Denna brief bör köras **före** nästa feature-brief. Utan nödsparning riskerar varje körning att förlora arbete vid oväntade iterationsövertramp.
