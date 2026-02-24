# Brief: Neuron HQ — Historian timing-fix och stäng ⚠️
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #16
**Estimerad tid:** 1 timme

---

## Bakgrund

I körning #15 delegerade Manager till Historian (iteration ~5) och **sedan** till Librarian
(iteration 16). Historian körde `grep_audit(query="librarian")` vid 11:23:55 — men Librarian
körde inte förrän 11:25:07. Historian hittade ingen delegation och skapade en felaktig ⚠️-post:
*"Librarian auto-trigger ignorerades av Manager"*.

Audit.jsonl bekräftar att Librarian faktiskt körde och skrev 3 papers till techniques.md.
Felet är ett **ordningsproblem**: `prompts/manager.md` säger idag
*"After Historian has completed, automatically delegate to Librarian"* — Historian körs alltså
alltid FÖRE Librarian, och kan aldrig verifiera Librarians arbete.

**Tre konkreta fixar:**
1. `prompts/manager.md` — ändra ⚡ Auto-trigger-ordning: Librarian ska delegeras FÖRE Historian
2. `prompts/historian.md` — lägg till guardrail: vid ⚡ Auto-trigger i brief, verifiera Librarian
   via `read_memory_file(file="techniques")` (kontrollera senaste datum), inte bara grep_audit
3. Historian stänger ⚠️ "Librarian auto-trigger ignorerades av Manager" med `update_error_status`

**Baseline (2026-02-23):**
```
npm test               → 236/236 gröna (25 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 1 (Librarian auto-trigger — ska stängas i denna körning)
```

**Hälsokontroll:** Verifiera dessa tre värden INNAN arbetet börjar. Om något avviker
— stoppa och rapportera i `questions.md`.

---

## Uppgift 1 — Implementer: Fixa manager.md (delegationsordning)

I `prompts/manager.md`, hitta sektionen `## Auto-trigger Librarian`:

```
## Auto-trigger Librarian

If the brief contains a line starting with `⚡ Auto-trigger:`, this is a milestone run
(every 5th completed run). After Historian has completed, automatically delegate to Librarian
for an arxiv knowledge update — no manual instruction needed.
```

Ersätt med:

```
## Auto-trigger Librarian

If the brief contains a line starting with `⚡ Auto-trigger:`, this is a milestone run
(every 5th completed run). Delegate to Librarian **before** Historian — Librarian must
complete before Historian runs so that Historian can verify what was written.

Correct order: Tester → Reviewer → Merger → Librarian → Historian

Do NOT delegate to Historian first and then Librarian — Historian cannot verify
Librarian's work if it runs before Librarian.
```

---

## Uppgift 2 — Implementer: Fixa historian.md (Librarian-verifieringsguardrail)

I `prompts/historian.md`, i **What You Do**, steg 1, hitta raden:

```
   - If the brief involved **Librarian**: call `read_memory_file(file="techniques")` to count entries and verify what was written.
```

Ersätt med:

```
   - If the brief involved **Librarian** (i.e. brief contains `⚡ Auto-trigger:`):
     call `read_memory_file(file="techniques")` to verify what was written.
     Check that the most recent entry's date matches today's run date.
     Do NOT rely solely on `grep_audit(query="librarian")` — grep_audit only reflects
     events up to the point when Historian was called, not the final state.
     Trust `read_memory_file` as the authoritative source for Librarian output.
```

---

## Uppgift 3 — Verifiering

```bash
npm test
npx tsc --noEmit
```

Förväntad utdata:
- `npm test` → **236 tester** (inga nya tester tillkommer — bara promptändringar)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 4 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `prompts/manager.md` ⚡ Auto-trigger-sektion anger ordning: Librarian FÖRE Historian
2. ✅ `prompts/manager.md` innehåller explicit: "Do NOT delegate to Historian first and then Librarian"
3. ✅ `prompts/historian.md` Librarian-verifieringsraden instruerar `read_memory_file` som primär källa
4. ✅ `prompts/historian.md` varnar explicit att grep_audit ej är heltäckande
5. ✅ `npm test` → alla 236 tester gröna
6. ✅ `npx tsc --noEmit` → 0 errors
7. ✅ Git commit med båda ändrade filer (manager.md + historian.md)

---

## Uppgift 5 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Researcher behövs inte — detta är en prescriptive brief
- Historian ska i denna körning stänga ⚠️ "Librarian auto-trigger ignorerades av Manager"
  med `update_error_status` (status → ✅, förklara att Librarian faktiskt körde men att
  Historian sökte i audit.jsonl för tidigt — och att ordningsproblemet nu är fixat)
- Inga nya tester behövs för denna ändring (promptändringar täcks av befintliga manager-lint
  och historian-lint tester som redan verifierar nyckelord — de 5 testerna i
  `tests/prompts/manager-lint.test.ts` och `tests/prompts/historian-lint.test.ts` bör
  fortfarande passera efter ändringarna)
- Nästa kvarliggande idé från körning #15: prompt-lint för `researcher.md`, `reviewer.md`,
  `tester.md` — kan tas i körning #17
