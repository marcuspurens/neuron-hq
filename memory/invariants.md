# Invariants — Strukturkrav som alltid måste gälla

Explicita regler om systemets struktur. Varje post beskriver vad som måste vara sant,
och vilken mekanism som vaktar det. Appendas av Historian-agenten vid nya upptäckter.

---

## [INV-001] Varje prompt måste ha ett lint-test
**Beskrivning:** Varje `prompts/*.md` måste ha ett motsvarande `tests/prompts/*-lint.test.ts`
**Vaktas av:** `tests/prompts/coverage.test.ts`
**Tillagd:** Körning #18

---

## [INV-002] Librarian körs FÖRE Historian i Manager-delegationsordningen
**Beskrivning:** Vid milestone-körningar (var 5:e) måste Librarian delegeras och slutföras innan Historian delegeras, annars kan Historian inte verifiera Librarian-output
**Vaktas av:** `prompts/manager.md` (explicit ordning) + `tests/prompts/manager-lint.test.ts`
**Tillagd:** Körning #16

---

## [INV-003] Alla 8 agenter har withRetry() runt messages.stream()
**Beskrivning:** Varje agents `run()`-metod måste wrappa `messages.stream()` med `withRetry()` för att hantera transienta API-fel
**Vaktas av:** `tests/core/agent-utils.test.ts` (withRetry-tester)
**Tillagd:** Körning #12

---
