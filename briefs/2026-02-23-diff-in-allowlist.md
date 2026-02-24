# Brief — Körning #21: Lägg till `diff` i bash_allowlist

**Datum:** 2026-02-23
**Target:** neuron-hq
**Kategori:** Policy-fix (allowlist)

---

## Bakgrund

I körning #20 försökte Merger köra `diff`, `md5` och `git hash-object` för att verifiera att workspace-filer matchade target-filer innan kopiering. Alla anrop blockerades av policy (`BASH_ALLOWLIST`). Mergen lyckades ändå via en workaround.

Kortsiktig fix gjordes: `prompts/merger.md` uppdaterades med `wc -l` / `grep -c ""` som alternativa verifieringskommandon. Men `diff` är ett mer naturligt och exakt verktyg för filverifiering — och det är rent läsande (ingen skrivåtkomst, inga sidoeffekter).

Felet är dokumenterat i `memory/errors.md`:
> "Merger-agentens verifieringskommandon blockeras av policy"

---

## Uppgift

Lägg till `diff` i `policy/bash_allowlist.txt` så Merger kan använda det för filverifiering.

**Konkret:**

1. Lägg till `^diff(\s|$)` i `policy/bash_allowlist.txt` under sektionen `# Read operations`

2. Uppdatera `tests/policy.test.ts` — lägg till ett test som verifierar att `diff file1 file2` är tillåtet

3. Verifiera att befintliga policy-tester fortfarande passar

**Viktigt:**
- `md5` och `git hash-object` behöver INTE läggas till — `diff` räcker för Mergers ändamål
- `prompts/merger.md` behöver INTE uppdateras (den fungerar redan med `wc -l` som fallback)
- Inga ändringar i andra filer

---

## Acceptanskriterier

1. `diff file1 file2` tillåts av policy (matcher regex `^diff(\s|$)`)
2. `tests/policy.test.ts` har ett nytt test: `diff` är allowed
3. `npm test` → alla befintliga + nya tester gröna (276+ totalt)
4. `npx tsc --noEmit` → 0 errors
5. Git commit

---

## Begränsningar

- Ändringar begränsade till `policy/bash_allowlist.txt` och `tests/policy.test.ts`
- Researcher behöver bara läsa dessa två filer — ingen djupare analys behövs
- Håll det enkelt: detta är en 2-raders ändring + 1 nytt test

---

## Filer att läsa

| Fil | Vad du letar efter |
|-----|-------------------|
| `policy/bash_allowlist.txt` | Var i filen `diff` ska läggas till |
| `tests/policy.test.ts` | Hur befintliga allowed/blocked-tester är strukturerade |
