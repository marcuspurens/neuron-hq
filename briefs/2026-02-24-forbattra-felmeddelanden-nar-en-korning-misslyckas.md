

# Brief — Förbättra felmeddelanden vid misslyckade körningar

**Datum:** 2026-02-24
**Target:** neuron-hq
**Estimerad risk:** HIGH
**Estimerad storlek:** ~80–150 rader

---

## Bakgrund

När en körning (run) misslyckas idag får användaren ett generiskt felmeddelande som inte tydligt anger *vilket steg* i pipelinen som fallerade. En körning i Neuron HQ passerar flera distinkta faser — baseline-validering, implementation, testning och merge — och varje fas kan misslyckas av helt olika anledningar. Utan tydlig information om var felet uppstod måste användaren manuellt granska loggar och gissa sig fram, vilket kostar tid och iterationer.

Det senaste arbetet (körning #25, `feat: improve tester failure reporting`) förbättrade Tester-agentens rapportering, men problemet kvarstår på orkestreringsnivå: själva run-flödet kommunicerar inte tillräckligt tydligt vilken fas som misslyckades och varför.

---

## Mål

Förbättra felrapporteringen i körningsflödet så att varje felmeddelande tydligt anger:
- Vilket steg som misslyckades (baseline, implementation, test, merge)
- Vad som gick fel (det underliggande felet)
- Tillräcklig kontext för att användaren eller en agent ska kunna agera direkt

---

## Acceptanskriterier

1. Felmeddelanden inkluderar explicit information om vilken fas som misslyckades — en av: `BASELINE`, `IMPLEMENTATION`, `TEST`, `MERGE`
2. Felmeddelanden inkluderar det underliggande felet (felmeddelande + exitkod om tillämpligt)
3. Felmeddelanden har ett konsekvent format som är maskinläsbart (t.ex. `[PHASE:BASELINE] <message>`)
4. Felrapport i `memory/runs.md` inkluderar fasnamn vid misslyckade körningar
5. `npm test` — alla existerande tester passerar fortfarande (inga regressioner)
6. `npx tsc --noEmit` → 0 errors
7. Nya enhetstester verifierar att rätt fasnamn inkluderas i felmeddelanden för varje fas

---

## Berörda filer

**Nya filer:**
- `tests/core/run-errors.test.ts` — Enhetstester som verifierar felmeddelanden per fas

**Ändrade filer:**
- `src/core/run-orchestrator.ts` — Huvudlogik för körningsflödet; lägg till fasnamn i felhantering
- `src/core/errors.ts` — Definiera `RunPhase`-enum och `RunPhaseError`-klass (skapa om den inte finns)
- `src/core/agents/baseline.ts` — Wrappa fel med faskontext `BASELINE`
- `src/core/agents/implementer.ts` — Wrappa fel med faskontext `IMPLEMENTATION`
- `src/core/agents/tester.ts` — Wrappa fel med faskontext `TEST`
- `src/core/agents/merger.ts` — Wrappa fel med faskontext `MERGE`
- `memory/errors.md` — Dokumentera det nya felmeddelandeformatet

---

## Tekniska krav

- Definiera en `RunPhase` enum: `BASELINE | IMPLEMENTATION | TEST | MERGE`
- Skapa en `RunPhaseError extends Error` som inkluderar `phase: RunPhase`, `cause: Error`, och formaterar `message` som `[PHASE:<phase>] <original message>`
- Varje agent-anrop i orkestratorn ska wrappas i try/catch som kastar `RunPhaseError` med rätt fas
- Befintligt felflöde (hur orkestratorn hanterar och loggar fel) ska respekteras — vi lägger till kontext, inte ny kontrollflödeslogik
- Alla nya typer ska exporteras korrekt och passera `tsc --noEmit`
- Tester ska verifiera varje fas isolerat med mockade agenter som kastar fel

---

## Commit-meddelande

```
feat: add phase-aware error messages for failed runs

Include explicit phase name (BASELINE/IMPLEMENTATION/TEST/MERGE)
in all run failure messages. Add RunPhaseError class and tests.
```