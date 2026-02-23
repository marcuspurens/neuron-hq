# Brief: Self-hosting — Fix documented prompt issues in Neuron HQ
**Datum:** 2026-02-23
**Target:** neuron-hq
**Verify:** `npm test`

---

## Bakgrund

Neuron HQ:s egna agenter har under 7 körningar producerat återkommande fel som nu är dokumenterade i `memory/errors.md`. Dessa fel beror på brister i agent-prompterna. Den här körningen riktar svärmen mot Neuron HQ självt för att åtgärda tre dokumenterade promptproblem och lägga till saknade enhetstester.

Läs `memory/errors.md` och `memory/patterns.md` för full kontext innan du börjar.

---

## Uppgifter

### Uppgift 1 — `prompts/researcher.md`: knowledge.md som obligatorisk leverabel

**Problem (från errors.md):** Researcher skapade inte `knowledge.md` i körning 20260222-1457. Researcher-prompten betonar `ideas.md` men nämner inte `knowledge.md` som obligatorisk.

**Åtgärd:** Lägg till `knowledge.md` i Researchers rollbeskrivning och i den dokumenterade output-listan. Det ska vara lika tydligt som `ideas.md` och `research/sources.md` — alla tre är obligatoriska.

**Var:** I "Your Role"-sektionen och eventuellt i en ny "Required Outputs"-sektion.

---

### Uppgift 2 — `prompts/manager.md`: Lita på Researcher, upprepa inte analysen

**Problem (från errors.md):** Manager duplicerade Researchers arbete i minst 3 av 7 körningar — läste ~15 filer och körde ~10 bash-kommandon efter att Researcher redan levererat `ideas.md`. Slösade ~30% av körningens tokens.

**Åtgärd:** Lägg till ett explicit avsnitt i Manager-prompten med titeln "After Researcher Completes" (eller liknande). Instruktionen ska vara:
1. Läs Researchers `ideas.md` och `knowledge.md`
2. Verifiera att de uppfyller briefens krav
3. Delegera vidare till Implementer — upprepa INTE Researchers analys
4. Manager är koordinator, inte utförare

---

### Uppgift 3 — `prompts/implementer.md`: Explicit git commit-steg

**Problem (från errors.md):** Implementer glömde git commit efter lyckade ruff-fixar i körning 20260222-1457 — ändringar låg kvar som unstaged trots att testerna var gröna.

**Åtgärd:** Lägg till ett explicit steg i "After You Code"-sektionen och/eller i Quality Checklist:
- Efter att testerna är gröna och lint passerar: gör `git commit` med ett tydligt conventional-commit-meddelande
- Committa ALDRIG med backtick-tecken i meddelandet (använd enkla citattecken för kodnamn)
- Om brief inte explicit ber om commit — committa ändå, Merger hanterar merge senare

---

### Uppgift 4 — `tests/core/agent-utils.test.ts`: Tester för truncateToolResult och trimMessages

**Problem:** `truncateToolResult` och `trimMessages` i `src/core/agents/agent-utils.ts` är exporterade funktioner utan egna enhetstester. De används av alla agenter för context management men testas bara indirekt.

**Åtgärd:** Lägg till tester i `tests/core/agent-utils.test.ts` (samma fil som redan testar `searchMemoryFiles`). Testa:

För `truncateToolResult`:
- Kort string returneras oförändrad
- Lång string trunkeras vid maxChars
- Trunkerad string innehåller `[... truncated N chars ...]`
- Custom maxChars respekteras

För `trimMessages`:
- Kort meddelande-array returneras oförändrad
- Lång array trimmeras till under maxChars
- Första meddelandet (brief) bevaras alltid
- Minst MIN_RECENT_MESSAGES bevaras alltid
- Trimmed array innehåller insertion note om borttagning

---

## Acceptanskriterier

- [ ] `prompts/researcher.md` nämner `knowledge.md` explicit som obligatorisk leverabel (inte bara ideas.md)
- [ ] `prompts/manager.md` har ett avsnitt som instruerar Manager att lita på Researcher och inte upprepa analysen
- [ ] `prompts/implementer.md` har ett explicit git commit-steg i "After You Code" eller Quality Checklist
- [ ] `tests/core/agent-utils.test.ts` har tester för `truncateToolResult` (minst 3 fall) och `trimMessages` (minst 4 fall)
- [ ] `npm test` passerar med fler tester än 153 (alla nya tester gröna)
- [ ] Ingen ny TypeScript-kompileringsfel (`npx tsc --noEmit`)

---

## Avgränsning

- Ändra INTE core TypeScript-logik i `src/` (förutom om det behövs för testerna)
- Ändra INTE `policy/` eller `targets/`
- Ändra INTE andra promptfiler än de tre specificerade
- Inga beroenden får läggas till eller tas bort

---

## Rollfördelning (förslag)

- **Researcher:** Läs errors.md, patterns.md och alla fyra berörda filer. Dokumentera exakt vilka meningar som ska läggas till var.
- **Implementer:** Gör ändringarna i de tre promptfilerna och utöka testerna.
- **Tester:** Kör `npm test` och bekräfta att alla tester (inkl. nya) är gröna.
- **Reviewer:** Verifiera varje acceptanskriterium med konkreta grep-kommandon mot de ändrade filerna.
- **Merger:** Kopiera ändringar till target (neuron-hq = samma repo), committa med `fix: address documented prompt issues from errors.md`.
- **Historian:** Skriv körningssammanfattning till `memory/runs.md`.
