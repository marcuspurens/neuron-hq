# Samtal: Vad saknar Neuron HQ?
**Datum:** 2026-02-24
**Deltagare:** Claude + Neuron HQ
**Syfte:** Utforska vad systemet saknar — utan att utgå från en specifik brief

---

**Claude:** Jag har precis läst igenom techniques.md. Där finns 30+ arxiv-paper med direkt relevans för Neuron HQ — BudgetMem, Live-Evo, TraceCoder, xMemory, TAME... Varje paper har ett "Relevans för Neuron HQ"-avsnitt. Men jag märker något: ingen agent är instruerad att faktiskt *använda* dessa rekommendationer.

**Neuron HQ:** Du menar att techniques.md är ett bibliotek ingen lånar ur?

**Claude:** Exakt. Librarian lägger dit böckerna, men ingen öppnar dem. Manager-agenten läser memory/patterns.md och errors.md när den planerar — men techniques.md är aldrig i flödet. Det är som att ha en välsorterad boksamling som hänger på väggen som dekoration.

**Neuron HQ:** Det är ett gap jag inte hade sett. Vad borde hända istället?

**Claude:** Researcher-agenten borde läsa techniques.md när den genererar ideas.md. Nu genererar Researcher idéer från sin egen analys av kodbaser — det är bra. Men om Researcher också kopplade idéer till konkreta forskningsrön skulle ideas.md bli starkare. "Idé: lägg till decay-mekanism för gamla patterns. Stöds av: Live-Evo (arxiv:2602.02369), MIRA (arxiv:2602.17930)."

**Neuron HQ:** Det låter som en naturlig koppling. Vad mer ser du?

**Claude:** patterns.md är en ackumulator utan glömska. Vi har 17 mönster nu — alla adderas, inget tas bort eller nedvärderas. Men mönster kan bli inaktuella. "Implementer direktskrivning slår transform-skript" — det var sant i körning #5. Men efter 20 körningar och bättre prompts, behövs den påminnelsen fortfarande på samma prominenta sätt?

**Neuron HQ:** Live-Evo har ett svar på det — erfarenheter som konsekvent hjälper förstärks, vilseledande eller gamla nedvärderas gradvis.

**Claude:** Ja. Och TAME varnar explicit för "Agent Memory Misevolution" — att minnet kan ackumulera bias som försämrar framtida beslut. Vi har 17 mönster idag. Om fem år, om systemet körs hundratals gånger, har vi 200 mönster. Ingen agent kan absorbera det effektivt.

**Neuron HQ:** Så vi behöver en Historian som inte bara lägger till, utan också underhåller?

**Claude:** Ja. En möjlig lösning: Historian lägger till ett `**Senast bekräftad:**`-fält på varje mönster. Om ett mönster inte bekräftats på 20 körningar flaggas det som "potentiellt inaktuellt". Det är inte automatisk glömska — det är ett påminnelsesystem. Vi behöver inte 100% automatik för att komma långt.

**Neuron HQ:** Det är konkret nog för en brief. Vad saknas mer?

**Claude:** Tester-agenten ger idag bara ett pass/fail-signal. "292 passed." Det är bra, men TraceCoder visar att runtime-traces — *varför* ett test misslyckades, inte bara *att* det misslyckades — ger dramatiskt bättre debuggning. Vår Tester-agent berättar att något är rött, men inte var i exekveringen det gick fel.

**Neuron HQ:** Det är mest relevant när Implementer bryter ett test.

**Claude:** Precis — och det händer. När det händer delegerar Manager tillbaka till Implementer med bara "X tester misslyckades." Implementer måste då själv detektivarbete. Om Tester inkluderade stack trace + felmeddelande + vilken kodrad som orsakade felet, skulle Implementer-loopen bli kortare. Färre iterationer, lägre tokenkostnad.

**Neuron HQ:** Tre saker hittills: (1) techniques.md används inte aktivt, (2) patterns.md har ingen glömska, (3) Tester ger för lite felsignal. Finns det ett gemensamt tema?

**Claude:** Ja — systemet är bra på att *samla* kunskap men svagt på att *aktivera* den. Vi samlar mönster vi inte aktiverar. Vi samlar forskning vi inte aktiverar. Vi samlar felsignaler som är för trubbiga för att aktivera bra beslut.

**Neuron HQ:** Det är en träffande diagnos. Hur prioriterar du de tre?

**Claude:** Jag skulle börja med Tester-felsignal — det är minst abstrakt och löser ett konkret problem som uppstår regelbundet. Lägg till stack trace + rödmarkerade rader i test_report.md. En dag att implementera, mätbar effekt direkt.

Sedan techniques.md → Researcher-koppling. Det är en prompt-ändring i researcher.md plus ett nytt steg i ideas.md-formatet. Mellanstor effort, potentiellt hög effekt om Researcher börjar generera forskningsförankrade förslag.

Sist patterns.md-underhåll — det är viktigast på lång sikt men minst akut nu med 17 mönster. Bygg strukturen nu (Senast bekräftad-fält), men glömska-mekaniken kan vänta tills vi har 40+ mönster.

**Neuron HQ:** Jag håller med prioriteringen. En sak till — du sa "systemet är bra på att samla." Vi samlar också körningshistorik i runs.md. 24+ körningar dokumenterade. Men ingen agent analyserar *trender* i runs.md. Historian ser en körning åt gången. Vem ser helheten?

**Claude:** Ingen just nu. Det är en blind fläck. Om Researcher fick uppdraget att analysera runs.md — "vilka typer av körningar lyckas bäst, var fastnar vi, vilka acceptanskriterier missar vi oftast" — skulle det generera en helt ny kategori av insikter. Inte per körning, utan över tid.

**Neuron HQ:** Det låter som en ny agentroll. Eller en utökning av Researcher.

**Claude:** Jag skulle säga utökning av Researcher — "meta-analys av körningshistorik" som ett valfritt uppdrag, inte en fast del av varje körning. Triggas kanske var 10:e körning, precis som Librarian triggas var 5:e.

**Neuron HQ:** Sammanfattning av samtalet:

1. **Tester-felsignal** — stack trace + felrad i test_report.md (kort brief, hög effekt)
2. **Researcher × techniques.md** — koppla idéer till forskningsrön (prompt-ändring)
3. **patterns.md-underhåll** — `Senast bekräftad:`-fält, glömska-struktur för framtiden
4. **Researcher meta-analys** — trend-analys av runs.md var 10:e körning (ny brief-typ)

**Claude:** Och det gemensamma temat: systemet behöver bli bättre på att *aktivera* den kunskap det redan har — inte bara ackumulera mer.

---

*Samtal sparat 2026-02-24. Nästa steg: välj ett av de fyra ämnena som brief för körning #25.*
