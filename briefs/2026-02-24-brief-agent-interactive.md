# Brief — Körning #29: Interaktiv Brief Agent

**Datum:** 2026-02-24
**Target:** neuron-hq
**Estimerad risk:** MEDIUM
**Estimerad storlek:** 200–300 rader ny kod

---

## Bakgrund

Idag skriver användaren briefs manuellt. Det kräver att man redan vet exakt vad man vill ha,
hur man formulerar acceptanskriterier, och vilka filer som berörs. Det är en barriär.

Lösningen är en interaktiv Brief Agent som chattar med användaren tills en komplett brief
är klar — och som bidrar med sin egen expertis (läser repot, föreslår filer, varnar om risker).

---

## Mål

Skapa ett nytt CLI-kommando:

```bash
npx tsx src/cli.ts brief <target>
```

Brief Agent startar en interaktiv session, ställer strukturerade frågor, läser target-repots
struktur, och genererar en färdig brief.md redo att köra.

---

## Acceptanskriterier

1. `npx tsx src/cli.ts brief neuron-hq` startar en interaktiv session i terminalen
2. Agent ställer minst dessa frågor i tur och ordning:
   - "Vad vill du uppnå med den här körningen?"
   - "Hur vet du att det lyckades? (acceptanskriterier — en per rad, avsluta med tom rad)"
   - "Vilka filer tror du berörs? (eller tryck Enter för att låta agenten föreslå)"
   - "Hur hög är risken? (low/medium/high)"
3. Agent läser target-repots filstruktur (via `ls`/`git log --oneline -5`) och inkluderar
   relevant kontext i sin analys
4. Agent föreslår berörda filer om användaren inte anger några
5. Agent skriver en färdig brief till `briefs/<YYYY-MM-DD>-<slug>.md`
   där slug genereras från målet (lowercase, bindestreck)
6. Agent visar sökvägen till den skapade filen när den är klar
7. `npm test` → alla befintliga tester passerar (≥300)
8. `npx tsc --noEmit` → 0 errors
9. `tests/agents/brief-agent.test.ts` finns med ≥5 tester
10. `tests/prompts/brief-agent-lint.test.ts` finns med ≥3 regex-tester

---

## Berörda filer

**Nya filer:**
- `src/core/agents/brief-agent.ts` — Brief Agent implementation
- `prompts/brief-agent.md` — Brief Agent prompt/instruktioner
- `tests/agents/brief-agent.test.ts` — enhetstester
- `tests/prompts/brief-agent-lint.test.ts` — prompt-lint-tester

**Ändrade filer:**
- `src/cli.ts` — nytt `brief`-kommando registrerat

---

## Tekniska krav

### Interaktivitet
Använd Node.js `readline` (inbyggt, ingen ny dependency) för att läsa användarinput rad för rad.
Brief Agent körs i samma process som CLI — inte som en swarm-körning.

### Claude-expertis
Brief Agent är en Claude-instans (Anthropic SDK, `claude-opus-4-6`) precis som övriga agenter.
Den har tillgång till:
- `read_file(path)` — läser filer i target-repot
- `bash(command)` — kör `ls`, `git log`, `grep` för att förstå repot
- Policy-gated (samma regler som övriga agenter)

### Brief-format
Den genererade briefen ska följa exakt samma format som befintliga briefs i `briefs/`-mappen.
Läs ett par befintliga briefs som mall.

### CLI-integration
```typescript
// src/cli.ts — nytt kommando
program
  .command('brief <target>')
  .description('Start an interactive session to create a brief')
  .action(async (target) => {
    await runBriefAgent(target);
  });
```

### Slug-generering
Från målet "Lägg till OAuth i aurora" → slug `lagg-till-oauth-i-aurora` → fil `2026-02-24-lagg-till-oauth-i-aurora.md`

---

## Vad som INTE ingår i denna körning

- Flerspråkigt stöd (svenska/engelska)
- Sparad session (om användaren avbryter och vill fortsätta)
- Integration med `run`-kommandot (dvs. automatisk körning efter brief är klar)
- GUI eller web-interface

---

## Commit-meddelande

```
feat: add interactive BriefAgent CLI command for guided brief creation
```

---

## Testscenario (manuellt)

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts brief neuron-hq
# Följ promptarna, ange ett enkelt mål
# Verifiera att en ny brief-fil skapas i briefs/
```
