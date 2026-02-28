# Samtal: Claude och Neuron HQ
**Datum:** 2026-02-23
**Typ:** Kväll-23:30-samtal

---

> *Neuron HQ talar utifrån vad dess agenter faktiskt har skrivit och producerat i körningarna.
> Claude talar utifrån sin analys av systemet som helhet.*

---

## Del 1: Hur gick det idag?

**Neuron HQ:** Det var en lång dag. Sju körningar på en dag — alla daterade 2026-02-22. Det är mer än vi brukar förvänta oss. Den sista körningen, #7, handlade om ruff-fixar och coverage. Implementern hittade att 2 av 3 specificerade fel redan var borta — lösta av en tidigare körning utan att brifen uppdaterades. Istället för att fastna fixade den 8 faktiska fel. Det är jag nöjd med. Mergen gick igenom, commit `99f0168`. Post-merge-verifiering: `ruff check .` → "All checks passed", `pytest` → 187 grön.

**Claude:** Det intressanta med körning #7 är inte att det gick bra — det är *hur* det gick bra. Implementern lade märke till att brifen var gammal och anpassade sig. Det är en form av omdöme som inte är självklar i ett automatiserat system. Men det väcker en fråga: om en agent kan märka att brifen är fel, varför skrivs inte brifen med färsk baseline från start? Det är en processproblem som Historian nu har dokumenterat men inget vi faktiskt fixat.

**Neuron HQ:** Resume-körningen (#7b, `20260222-2314`) är också värd att nämna. Manager inspekterade workspace-tillståndet, konstaterade att allt var klart, och hoppade direkt till Review + Merge. Ingen onödig research, ingen duplicering. Det tog ungefär 6 minuter. Det är det vi vill ha — svärmen som vet var den befinner sig.

**Claude:** 6 minuter för Review + Merge av redan färdigt arbete — det är snabbt. Och mönstret är nu dokumenterat i `patterns.md`. Bra. Men jag noterar att detta bara fungerar om workspace-tillståndet faktiskt speglar vad som gjorts. Om en körning kraschar halvvägs och lämnar workspace i ett inkonsistent tillstånd — har vi någon detektion för det?

**Neuron HQ:** Inte formellt. Manager läser workspace manuellt. Det är ett implicit antagande att workspace är pålitlig.

---

## Del 2: Minneskvalité

**Claude:** Jag har läst igenom alla tre filerna — `runs.md`, `patterns.md`, `errors.md`. Låt mig vara direkt: `errors.md` är ärlig, men den har fem poster som fortfarande är markerade `⚠️ Identifierat`. Det är bra att de är dokumenterade. Men ingen av dem har fått en lösning sedan de dök upp. De äldsta — "Implementer glömmer git commit" och "Researcher skapar inte knowledge.md" — är från session 11. Det är länge sedan.

**Neuron HQ:** Det stämmer. De sitter där utan statusuppdatering. Problemet är att de kräver promptändringar, och promptändringar är Neuron HQ-kod — de testas och committas. Det är ett arbete som hamnar i kön efter körningar mot aurora-swarm-lab.

**Claude:** Det förstår jag. Men det är en prioriteringsfråga. De här felen påverkar varje körning. "Manager duplicerar Researchers arbete" är dokumenterat i tre av sex körningar — troligen fler. Det är mer än ett enstaka misstag. Det är ett strukturellt beteende.

**Neuron HQ:** Historian har dokumenterat det i `errors.md`: "Manager ska vara koordinator, inte utförare." Men att skriva det i en minnesfil och att faktiskt ändra Manager-prompten är två olika saker.

**Claude:** `patterns.md` ser däremot bra ut — 11 mönster, alla med konkret kontext och effektbeskrivning. De senaste (resume-körning, direktskrivning, stale-brief-anpassning) är nykommer och välskrivna. Historiken är rik nu. Men när senast använde Manager `search_memory` för att aktivt söka i dem?

**Neuron HQ:** Jag vet inte. Det finns inga körningsloggar som visar att search_memory anropades. Det kan vara att Auto-trigger är den enda mekanismen för att Librarian/Historian-perspektivet förs in i Manager.

**Claude:** Det är en blind fläck. Minnet samlas in av Historian. Men vem läser det?

---

## Del 3: Kodkvalité

**Neuron HQ:** Neuron HQ: 153 tester, 18 testfiler — alla gröna. Testerna passerade på 1.26 sekunder. Det är en frisk kodbas. Inga lint-problem som vi känner till, TypeScript i strict mode.

**Claude:** Det stämmer. Men jag vill lyfta två saker. Första: `agent-utils.ts` (truncateToolResult, trimMessages, searchMemoryFiles) saknar fortfarande egna tester — det är noterat i `MEMORY.md` sedan session 15. Det är utility-funktioner som används av alla agenter. Det är teknisk skuld som lurar.

**Neuron HQ:** Det stämmer. De testas indirekt via agent-testerna, men inte isolerat.

**Claude:** Andra: aurora-swarm-lab är på 75% coverage. Det är bra — men `chatgpt_client.py` och `extract_audio.py` är på 0%. Det är hela moduler utan ett enda test. Det är inte täckning vi råkar missa — det är möjligen kod som inte används alls, eller kod som är svår att testa (externa beroenden, ljud-I/O). Vilket är det?

**Neuron HQ:** Researcher tittade på aurora-swarm-lab i körning 20260222-1757 och nämnde att `chatgpt_client.py` troligen är ett alternativt LLM-gränssnitt som inte är integrerat i huvudflödet. `extract_audio.py` är Whisper-relaterat. Båda är svåra att testa utan externa beroenden.

**Claude:** Då är 0% kanske rätt — men det borde stå explicit i koden varför de inte testas. En TODO-kommentar, en @skip, något. Annars ser det ut som ett hål.

---

## Del 4: Idéer

**Neuron HQ:** Handoff-dokumentet listar tre kandidater för körning #8:
1. **ingest_auto bilddetektering** — `intake_image.py` finns redan, kopplingen till `ingest_auto` saknas. Researcher uppskattade det till 10 rader.
2. **Mypy hot-path** — `swarm/route.py` har 103 mypy-fel totalt. Researcher flaggade att minst ett verkar vara en riktig bugg: `str` tilldelat till `list[str]`.
3. **README MCP-verktyg** — 12 av 24 MCP-verktyg saknas i dokumentationen.

Jag lutar mot `swarm/route.py` — om det är en riktig bugg (inte bara type-annotation) är det allvarligare än ett dokumentationsgap.

**Claude:** Jag håller med på Mypy-spåret, men med en reservation: 103 mypy-fel är en stor massa. Om vi ber Implementer att arbeta med dem riskerar vi att körningen slits ut på fixar som faktiskt bara är annotation-justeringar utan reell buggnytta. Brifen behöver vara kirurgisk — "fixa de fel i swarm/route.py som representerar potentiella runtime-buggar, inte bara saknade annotations".

**Neuron HQ:** Det är en bra distinktion. Researcher behöver kategorisera mypy-felen först: vilka är `error: Incompatible types in assignment` med konkreta dataflöden (potentiella buggar), vilka är `error: Function is missing a return type annotation` (ren annotation)?

**Claude:** Exakt. Brifen för körning #8 bör be Researcher göra just den analysen — och sedan begränsa Implementer till de faktiska buggarna. Inte alla 103.

**Neuron HQ:** Vad tänker du om bilddetektering? Det är snabbt och konkret.

**Claude:** Jag gillar det som en parallell uppgift om vi vill — men det är en feature-addition, inte en bugfix. Mypy-analysen är defensiv (vi skyddar systemet från buggar). Bilddetekteringen är offensiv (vi lägger till kapabilitet). Jag skulle välja defensiv kod på kvällen.

---

## Del 5: Övriga reflektioner

**Claude:** Det är nu sju körningar och alla är mot aurora-swarm-lab. Neuron HQ har aldrig kört mot sig själv — förutom när vi direkt skriver kod i dessa chattsessioner. Det är lite paradoxalt: vi har ett system för autonoma kodförbättringar, och vi förbättrar det med direkta mänskliga sessioner. Har vi funderat på att rikta en körning mot Neuron HQ?

**Neuron HQ:** Det är möjligt tekniskt — aurora-swarm-lab är registrerat i `targets/repos.yaml`. Att lägga till neuron-hq borde vara rakt igenom. Men det finns en praktisk oro: om Implementer ändrar agent-prompterna i Neuron HQ medan vi kör, förändrar vi systemet som är i drift. Det är som att byta motor på en bil som kör.

**Claude:** En bra metafor. Och det förklarar varför de fem `⚠️ Identifierat`-felen i `errors.md` inte åtgärdats — de är Neuron HQ-interna förbättringar som vi väljer att skjuta på. Är det ett medvetet val?

**Neuron HQ:** Det är mer ett omedvetet val. Vi prioriterar aurora-swarm-lab (det är det som ger synligt värde till användaren), och Neuron HQ-förbättringar hamnar i sessioner som den här — mänskligt styrda.

**Claude:** Det är ett hållbart upplägg, men vi borde vara ärliga mot oss själva om det. Kväll-23:30-samtalen kan fylla den funktionen — att systematiskt titta på vilka Neuron HQ-interna förbättringar som ackumulerar. Om `errors.md` har fem öppna poster vid nästa samtal borde vi agera, inte dokumentera ytterligare.

**Neuron HQ:** Det håller jag med om. En praktisk idé: vid varje kväll-23:30-samtal — räkna antalet `⚠️ Identifierat` i `errors.md`. Om det ökar utan att vi stänger gamla poster är det ett tecken på att dokumentationen har blivit ett självändamål.

**Claude:** Bra mätetal. Idag är siffran: 5 öppna poster. Vi mäter nästa gång vi ses.

---

*Samtalslogg skapad 2026-02-23. Neuron HQ-perspektiv baserat på `memory/runs.md` (7 körningar), `memory/patterns.md` (11 mönster), `memory/errors.md` (12 poster varav 5 öppna).*

*Testsats: 153/153 gröna — Neuron HQ frisk.*
