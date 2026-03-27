# Dagbok för Marcus

**Vad är det här?**
Det här är din personliga projektdagbok. Inga kodsnuttar, inget fackspråk. Bara en ärlig logg över vad som händer, varför vi gör det, och hur det känns.

**Vem skriver?** AI-agenten lägger till rader under sessionen. Du kan fylla i dina egna tankar när som helst.

**När?** En gång per dag, eller efter varje session som kändes viktig.

**Historik:** Allt som hände _innan_ 2026-03-26 finns i `docs/DAGBOK.md`. Den rör vi inte — det är historien. Vill du ha ännu mer detalj om en specifik session hittar du det i `docs/handoffs/`.

---

## Bakgrund — 150 sessioner med Opus

Sedan januari 2026 har du byggt Neuron HQ ihop med Claude Opus i VS Code. Det är ungefär två månader av intensivt arbete: 183 körningar, 3949 tester, 13 AI-agenttyper, och ett komplett kunskapsgrafsystem (Aurora) som kopplar ihop allt.

Det är inte lite. De flesta projekt av den här storleken tar ett team månader. Du har gjort det ensam med en AI-kompis.

Fas 1 (daglig nytta) är klar sedan mars. Nu är vi mitt i Fas 2 (intelligens) — agenter som faktiskt tänker, inte bara utför.

Idag börjar ett nytt kapitel.

---

## Hur man skriver

- Skriv på svenska, vanlig svenska
- Kora ner vad som hände, vad du bestämde, och hur det gick
- En händelse per rad i tabellen, eller ett vanligt stycke om det var ett samtal
- Taggar: SESSION, KÖRNING, BESLUT, IDÉE, PROBLEM, SAMTAL, FIX
- Länka till `docs/handoffs/` om du vill gräva djupare

---

## 2026-03-26

### Verktygsbyte — från VS Code + Opus till OpenCode + LiteLLM

Det stora bytet idag. Du har jobbat i VS Code med Claude Opus direkt sedan starten. Nu byter vi till OpenCode, ett nytt kodredigeringssystem med inbyggd AI, och kopplar det mot LiteLLM — en proxy som låter dig använda flera olika AI-modeller utan att byta gränssnitt.

Vad det i praktiken betyder: du slipper byta flik, byta konto, eller hålla koll på vilket verktyg du är i. Allt sitter på samma ställe.

🤖 **Atlas** — det är namnet på den nya orkestratorn (den AI som koordinerar allt). Atlas tar över rollen som "chefsdirektör" för agenterna, den rollen Claude Opus hade informellt innan.

| Tid    | Typ     | Vad hände                                                                          |
| ------ | ------- | ---------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | Bytte från VS Code + Opus till OpenCode + LiteLLM. Atlas (ny AI-orkestrator) aktiv |
| ~09:15 | SESSION | Första OpenCode-sessionen. Ingen sessionssiffra ännu i det gamla systemet          |
| ~09:30 | FIX     | Tre nya dagböcker skapade: en för dig, en för utvecklare, en för AI-agenter        |

### Varför tre dagböcker?

Den gamla dagboken (`docs/DAGBOK.md`) blandade ihop allt — kodrader, beslut, agentintervjuer, tekniska termer. Det fungerade okej när det bara var du och Opus, men nu när fler typer av "läsare" behöver förstå historiken fungerar det inte lika bra.

Nu har vi:

- **Den här** (DAGBOK-MARCUS.md) — för dig. Plain Swedish, inga koder.
- **DAGBOK-DEV.md** — om en riktig utvecklare någonsin tittar in, eller om du vill förstå exakt vad som ändrades
- **DAGBOK-LLM.md** — för AI-agenterna. De läser den för att förstå var projektet är och vad som hänt

### Hur mår projektet?

Bra. Seriöst bra, faktiskt. 🟢

- 3949 tester som körs grönt
- 183 körningar (de flesta gröna)
- 13 agenter byggda och fungerande
- Aurora-kunskapsgrafen med 924 idénoder
- Fas 1 (daglig nytta) komplett
- Fas 2 (intelligens) pågår — 26 av 32 uppgifter klara

Det närmaste att göra är att peka Neuron mot Aurora på riktigt, vilket är vad de kommande körningarna handlar om.

---
