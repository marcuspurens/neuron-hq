# Brief: Merger auto-commit — ta bort tvåfas-logiken

## Bakgrund

`prompts/merger.md` säger nu "execute immediately — no approval gate", men
koden i `src/core/agents/merger.ts` gör fortfarande tvåfas-detektion via
`detectPhase()` som letar efter `answers.md`. Prompten och koden är osynkroniserade.

Symptom: Merger skapar `merge_plan.md` och stannar — ingen merge sker.

## Uppgift

Ta bort `detectPhase()`-logiken och gör Merger till en single-phase agent
som alltid kör direkt. Merger committar när Reviewer har gett GREEN.

## Acceptanskriterier

- [ ] `merger.ts`: `detectPhase()`-metoden borttagen
- [ ] `merger.ts`: `run()` kör alltid execute-flödet direkt (ingen plan-fas)
- [ ] `merger.ts`: Läser `report.md`, kontrollerar att Reviewer gav GREEN — om inte, returnerar `MERGER_BLOCKED`
- [ ] `merger.ts`: Returnerar `MERGER_COMPLETE` vid lyckad merge
- [ ] `merger.ts`: Skriver `merge_summary.md` med commit-hash och `git revert <hash>` rollback-instruktion
- [ ] `tests/agents/merger.test.ts`: Befintliga `detectPhase()`-tester ersatta med tester för det nya beteendet
- [ ] `tests/agents/merger.test.ts`: Test för MERGER_BLOCKED när Reviewer inte gett GREEN
- [ ] Alla 357 befintliga tester passerar fortfarande (352 + 5 nya från handoff-körningen)

## Vad som INTE ska ändras

- `merge_plan.md` kan tas bort (inte längre relevant) — alternativt behållas som debug-artefakt
- Merger-prompten (`prompts/merger.md`) är redan korrekt — ändra den inte
- `copy_to_target`, `bash_exec_in_target` och övrig merge-logik förblir oförändrad

## Tekniska detaljer

**Nuvarande kod att ta bort:**
- `merger.ts`: `detectPhase(): Promise<'plan' | 'execute'>` (runt rad 73-93)
- `merger.ts`: Tvåfas-logiken i `run()` (läser answers.md, kallar plan-fas)

**Ny `run()`-logik:**
1. Läs `report.md` — extrahera Reviewer-verdict
2. Om inte GREEN → returnera `MERGER_BLOCKED: Reviewer did not give GREEN. See report.md.`
3. Kör execute-flödet (copy, git add, git commit)
4. Skriv `merge_summary.md` med commit-hash
5. Returnera `MERGER_COMPLETE`

## Risk

Medium — ändrar hur Merger beter sig i produktion. Tester täcker beteendet.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 357 passed (5 pre-existing failures i merger-lint/manager-lint —
dessa är INTE pre-existing längre, de fixades manuellt 2026-02-27. Kontrollera att
alla 362 tester passerar efter fix.)

## Not

Prompt-lint-testerna för merger (`tests/prompts/merger-lint.test.ts`) och manager
(`tests/prompts/manager-lint.test.ts`) uppdaterades redan 2026-02-27 och matchar
den nya beteendet. Implementer behöver INTE uppdatera dem — fokusera på `merger.ts`
och `tests/agents/merger.test.ts`.
