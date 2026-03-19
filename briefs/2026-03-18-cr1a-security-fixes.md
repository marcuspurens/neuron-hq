# CR-1a: Fixa CRITICAL säkerhetsproblem + snabba HIGH-fixes

## Bakgrund

CR-1 code review (körning 20260318-0941) identifierade 3 CRITICAL och 9 HIGH findings. Denna brief fixar alla 3 CRITICAL plus 4 HIGH-findings med effort S (snabba att fixa).

Fullständig rapport: `runs/20260318-0941-neuron-hq/report.md`

## Mål

Fixa 7 findings (3 CRITICAL + 4 HIGH). Alla tester ska passera efter ändringarna.

## Uppgifter

### CRITICAL 1: Shell injection i git.ts (Effort M)

- **Fil:** `src/core/git.ts:33,68,79,98,127,140,185,203,213,222`
- **Problem:** 9 st `execAsync()` med template literals — `execAsync(\`git checkout -b ${branchName}\`)`. Användarinput kan innehålla `; rm -rf /`.
- **Fix:** Byt alla `execAsync()` till `execFileAsync('git', [...args])` med argument-array. Importera `execFile` från `child_process` och `promisify`.
- **Testa:** Befintliga git-tester + verifiera att inga template literals kvarstår i shell-anrop.

### CRITICAL 2: Shell injection i emergency-save.ts (Effort S)

- **Fil:** `src/core/emergency-save.ts:58`
- **Problem:** `execAsync(\`git commit -m "${commitMessage}"\`)` — commit-meddelande interpoleras i shell.
- **Fix:** Byt till `execFileAsync('git', ['commit', '-m', commitMessage])`.

### CRITICAL 3: Path traversal i MCP runs-tool (Effort S)

- **Fil:** `src/mcp/tools/runs.ts:22,131,200`
- **Problem:** `runid` valideras som `z.string()` utan traversal-check. `runid: "../../etc"` ger tillgång till godtycklig sökväg.
- **Fix:** Ändra Zod-schema till `z.string().regex(/^[a-zA-Z0-9_-]+$/)`. Alternativt: resolva med `path.resolve()` och verifiera att resultatet börjar med `RUNS_DIR`.

### HIGH 1: Path-validering bypass i MCP start-tool (Effort S)

- **Fil:** `src/mcp/tools/start.ts:36-42`
- **Problem:** `path.normalize()` + `startsWith('briefs/')` kan kringgås.
- **Fix:** Resolva till absolut sökväg: `const resolved = path.resolve(BASE_DIR, args.brief); if (!resolved.startsWith(path.resolve(BASE_DIR, 'briefs/'))) throw`.

### HIGH 2: Race condition i ensureOllama (Effort S)

- **Fil:** `src/core/ollama.ts:17,62`
- **Problem:** `ollamaVerified` boolean utan lås — parallella anrop kan starta två Ollama-processer.
- **Fix:** Ersätt boolean med Promise-gate:
```typescript
let ollamaReady: Promise<boolean> | null = null;

export async function ensureOllama(model?: string): Promise<boolean> {
  if (!ollamaReady) {
    ollamaReady = doEnsureOllama(model);
  }
  return ollamaReady;
}
```

### HIGH 3: Temp-filer rensas aldrig i extract_video.py (Effort S)

- **Fil:** `aurora-workers/extract_video.py:20`
- **Problem:** `tempfile.mkdtemp()` utan cleanup — gigabytes ackumuleras i /tmp.
- **Fix:** Byt till `tempfile.TemporaryDirectory()` som context manager:
```python
with tempfile.TemporaryDirectory(prefix="aurora_vid_") as tmpdir:
    audio_path = os.path.join(tmpdir, "audio.m4a")
    # ... existing logic ...
# auto-cleanup vid exit
```

### HIGH 4: Cirkulärt beroende core → commands (Effort S)

- **Fil:** `src/core/run.ts:14`
- **Problem:** `src/core/run.ts` importerar `updateCostTracking` från `src/commands/costs.ts`. Core-lagret ska inte bero på commands.
- **Fix:** Flytta `updateCostTracking`-funktionen till `src/core/usage.ts` (eller ny `src/core/costs.ts`). Uppdatera importer i `run.ts` och `commands/costs.ts`.

## Avgränsningar

- Fixa BARA de 7 listade problemen
- Rör INTE de övriga 39 findings (de hanteras i CR-1b)
- Lägg INTE till nya features
- Ändra INTE tester som inte behöver uppdateras

## Verifiering

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Alla tre ska passera utan fel.

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| Inga template literals i execAsync i git.ts | `grep 'execAsync(\`' src/core/git.ts` returnerar tomt |
| emergency-save.ts använder execFileAsync | Manuell kontroll |
| runid har regex-validering i runs.ts | Manuell kontroll |
| start.ts använder absolute path check | Manuell kontroll |
| ensureOllama använder Promise-gate | Manuell kontroll |
| extract_video.py använder TemporaryDirectory | Manuell kontroll |
| Inget cirkulärt core→commands beroende | `grep 'commands/' src/core/run.ts` returnerar tomt |
| Alla tester passerar | `pnpm test` |
| Typecheck passerar | `pnpm typecheck` |

## Risk

**Låg.** Alla ändringar är lokala refactorings med samma beteende. Git-operationer och MCP-tools har befintliga tester.

## Agentinställningar

- Manager: max 100 iterationer
- Implementer: max 80 iterationer
- Researcher: max 40 iterationer
- Reviewer: max 40 iterationer
- Tester: max 30 iterationer
