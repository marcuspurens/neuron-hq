---
session: 24
datum: 2026-04-28
tags: [release-note, refactoring, config, prompts, llm-defaults]
---

# Session 24 — Alla LLM-inställningar på ett ställe, alla promptar i textfiler

## Vad är nytt?

- **En fil styr alla LLM-inställningar.** Det fanns 46 ställen i koden där saker som "hur lång får svaret vara?" och "vilken tröskel räknas som hög likhet?" var inbakade direkt i koden som råsiffror. Om du ville ändra dem behövde du hitta alla 46 ställen och uppdatera var och en för hand — utan garanti att du hittade alla. Nu finns `src/aurora/llm-defaults.ts` med sex namngivna grupper: modeller, token-gränser, likhets-trösklar, konfidenströsklar, färskhetsgränser och diverse begränsningar. Vill du justera vad som räknas som "hög likhet" ändrar du ett tal på ett ställe.

- **17 promptar är nu textfiler du kan redigera.** Systemets AI-instruktioner (hur Aurora ska söka, sammanfatta, gissa talare, tolka OCR-bilder, med mera) låg inbakade i TypeScript-koden. Om du ville justera hur systemet formulerar sig behövde du editera kodfiler och köra om byggprocessen. Nu ligger de som `.md`-filer i `prompts/`-mappen — du kan öppna dem i Obsidian och redigera direkt. Nästa gång systemet kör läser det den uppdaterade versionen.

- **Testsviten är nu grön.** Sessionen startade med 24 röda tester. Alla är nu gröna: 4 254 tester, 0 fel. (Notera: den faktiska rensningen av teknisk skuld är det viktiga, testerna var symptom.)

## Hur använder jag det?

Du behöver inte göra något annorlunda. Förändringarna är interna. Om du vill justera hur systemet beter sig, titta i:

- `src/aurora/llm-defaults.ts` — för siffror (trösklar, token-gränser, modellnamn)
- `prompts/` — för textinstruktioner till AI:n (en `.md`-fil per funktion)

## Vad saknas fortfarande?

- Tvåstegs-transkriberingspipelinen (draft → entity extraction → full quality) finns som kod men inte som en skill-fil (.md) som AI:n kan läsa och följa. Det är nästa sessions primära uppgift.
- `extract_entities`-verktyget är fortfarande otestat mot Ollama med riktigt material.
- YAML-konfiguration som alternativ till TypeScript-konstanterna är en möjlig framtida evolution om ett grafiskt gränssnitt för inställningar blir aktuellt.
