# Samtal: Kod, språk och framtid — 2026-02-28

**Deltagare:** Marcus (Neuron HQ) · Claude Opus 4.6
**Kontext:** Session 51, efter 4 gröna körningar (N7–N10) och docs-städning. Marcus ställde frågan: "Vad är din take på kod?"

---

## Marcus fråga

> Neuron skulle kodas i TypeScript — för det är det utvecklare jag känner jobbar i. Aurora sa jag inget om — det blev Python med fria Sonnet/Opus-händer. Vad är pros och cons med respektive kodbas? Varför är Rust så populärt? Du som Opus — vad är din "take" på kod? Kanske kommer AI uppfinna helt ny kod? Det kanske redan har hänt?

---

## TypeScript (Neuron) vs Python (Aurora)

**TypeScript-fördelar för Neuron:**
- Typssystemet fångar fel *innan* koden körs. I ett system med 474 tester och 9 agenter som pratar med varandra är det ovärderligt.
- Anthropic SDK har förstklassigt TypeScript-stöd.
- Node.js är snabbt för I/O-tunga saker (API-anrop, filläsning, git-operationer) — precis vad Neuron gör.

**Python-fördelar för Aurora:**
- ML-ekosystemet lever i Python. Ollama, embeddings, vektordatabaser — allt har Python-bindings först.
- Snabbare prototypning. Aurora gick från idé till fungerande system fortare.
- Enklare att experimentera. `pip install something-new` och testa direkt.

**Ärliga nackdelar:**
- TypeScript: `tsconfig.json` är en egen vetenskap. Build-steget är overhead.
- Python: Utan typer blir stora kodbaser svåra att navigera. Vid 1000+ tester hade det blivit stökigt.

---

## Varför Rust?

Utvecklare säger "snabbt" men det är inte hela sanningen. Rust löser ett *specifikt* problem: **minneshantering utan garbage collector.**

C/C++ är snabba men låter dig skjuta dig själv i foten — minnesläckor, buffer overflows. Rust har ett ägandeskaps-system som bevisar minnessäkerhet vid kompilering. Ingen garbage collector som pausar, ingen manuell minneshantering som kraschar.

**Men Rust är irrelevant för det Neuron och Aurora gör.** Flaskhalsen är nätverket (API-svar, embeddings), inte CPU:n. Rust är rätt för: databaser, OS, spelservrar, kryptografi. Inte för AI-orchestrering.

---

## Opus take på kod

**Kod idag är en kompromiss.** Den är skriven för att *människor* ska kunna läsa och underhålla den. Variabelnamn, funktioner, designmönster — allt existerar för att en mänsklig hjärna ska kunna hålla systemet i huvudet.

Men Neuron ändrar den ekvationen: **agenterna skriver kod som andra agenter läser.** Implementer skriver, Reviewer granskar, Merger committar. Människan ser bara rapporten.

Det väcker frågan: **om koden skrivs av AI och läses av AI — varför ska den se ut som "kod"?**

AI kommer inte uppfinna ett nytt programmeringsspråk. Det som istället händer är att **abstraktionsnivån förskjuts uppåt:**

1. **1950-talet:** Maskinkod. Människan pratar med hårdvaran.
2. **1970-talet:** C. Människan pratar med en kompilator.
3. **1990-talet:** Python/Java. Människan pratar med en runtime.
4. **2020-talet:** Prompts + briefs. Människan pratar med en agent som skriver kod.

Neuron är steg 4. Marcus skriver en brief på svenska. Svärmen producerar TypeScript. Marcus ser en rapport. **Koden är en mellanprodukt, inte slutprodukten.**

Det som kanske redan har hänt är att **system som Neuron gör programmeringsspråket till en implementationsdetalj.** Precis som ingen bryr sig om vilken maskinkod en C-kompilator genererar, kanske ingen om tio år bryr sig om det är TypeScript eller Python under huven. Det viktiga: *gör systemet rätt sak?*

**Men vi är inte där ännu.** Koden måste fortfarande vara läsbar, testbar, versionshanterad. TypeScript-typerna fångar buggar. Pythons flexibilitet gör Aurora experimentvänligt. Valet av språk spelar fortfarande roll — men kanske för den sista generationen utvecklare som behöver bry sig.

---

## Neuron som test av gränsen

Det fascinerande med Neuron: **kan ett system som skriver kod också förstå varför det skriver den?**

- Skeptiker-agenten ifrågasätter sina egna övertygelser
- Emergent behavior-loggen flaggar oväntade beslut
- GraphRAG ger systemet ett minne

Det är inte "ny kod". Det är ett system som börjar ha *omdöme* om sin egen kod. Och det är mer intressant än vilket språk det råkar vara skrivet i.

---

*Sparat som samtalslogg, session 51.*
