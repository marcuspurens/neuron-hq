# Svar på Marcus kommentarer — Session 103 (2026-03-19)

> **Deltagare:** Opus (Claude Opus 4.6), Neuron HQ (systemet), relevanta agenter
> **Input:** Marcus ~40 gula kommentarer från S102 djupsamtalet
> **Syfte:** Vi diskuterar varje kommentar ärligt och skriver ner våra tankar, förslag och oenigheter.

---

## Del 1 — Svar på kommentarer om tester & kvalitet

### K1: "Hur bevisar man att varje modul fortfarande loggar korrekt?"

**Opus:** Tre nivåer av bevis:
1. **Statiskt** — grep att inga `console.*` finns kvar (det gör vi redan)
2. **Unit** — varje modul har test som verifierar att logger.info/warn/error anropas med rätt meddelande (det har vi, men det är mekaniskt)
3. **Integration** — kör en hel operation och verifiera att logg-output innehåller förväntat trace-ID, rätt nivåer, och inga saknade steg

Det tredje saknas. Ett "log smoke test" som kör en mini-körning och kollar att loggen berättar en sammanhängande historia — det vore verkligt bevis.

**Neuron:** Jag håller med. Mina CR-tester bevisar "rätt funktion anropas" men inte "rätt information loggas i rätt ordning." Ett integrationtest som validerar hela logg-flödet för en körning — det vore värdefullt.

---

### K2: "Fas 2 (CR-2a) — Vad är det? Jag behöver en Roadmap-loop."

**Opus:** Det här är en av dina viktigaste kommentarer, Marcus. Du ska inte behöva gissa vad CR-2a betyder. Problemet är inte att Roadmap saknas — den finns — utan att den är **skriven för oss, inte för dig**. Spårbeteckningar som "CR-2a" och "E1-E4" är interna koder.

**Neuron:** Jag erkänner det. Roadmapen är en teknisk checklista, inte ett kommunikationsverktyg. Vi behöver:
1. **Roadmap på svenska i klartext** — varje punkt ska förklara *vad det ger dig* som användare, inte bara vad som ändras i koden
2. **Morgon-briefing** (vi återkommer till det) — där jag berättar vad som hänt och vad som är näst
3. **Roadmap-genomgång varje ~10:e session** — du, jag och Opus sitter ner och går igenom

**Opus:** Konkret förslag: Ny ROADMAP.md ska ha två sektioner per punkt — "Tekniskt" (kort) och "Vad det ger Marcus" (tydligt). Och vi numrerar med namn, inte bara koder.

---

## Del 2 — Svar på kommentarer om MCP-tools & discovery

### K3: "neuron_help tool — Perfekt idé! Hur löser vi det?"

**Opus:** Det är enklare än det låter. Ett MCP-tool `neuron_help` som:
1. Tar emot en fråga eller kontext ("jag vill indexera en video")
2. Söker bland alla 38 tool-beskrivningar med embedding-likhet
3. Returnerar top 3 relevanta tools med förklaring och exempelanrop

**Neuron:** Jag har redan tool-metadata i MCP-servern. Det som behövs:
- En kort beskrivning per tool (finns redan i tool-definitionen)
- En `neuron_help`-funktion som matchar fråga → tool
- Eventuellt med exempel: "Vill du indexera video? Kör `aurora:ingest-video <url>`"

**Researcher:** Det finns ett mönster i agentrammverk som kallas "tool router" — ett meta-verktyg som väljer rätt verktyg. OpenAI Swarm och LangChain har varianter. Vi kan göra det enklare — ren textmatchning räcker för 38 tools.

**Uppskattning:** 1 körning, liten brief.

---

## Del 3 — Svar på kommentarer om idéer & grafintegritet

### K4: "Hur fixar vi suddiga bilder, backfill utan validering, grafintegritet?"

Marcus, du ställde 5 delfrågor här. Vi tar dem en i taget:

**1. "Hälften suddiga bilder" — hur undviker vi skräp?**

**Neuron:** Lösningen är **validering vid skapande**, inte bara vid rensning. Varje gång en idé-nod skapas bör den passera ett kvalitetsfilter:
- Är det verkligen en idé (inte en Pro/Con-rad, inte en fråga)?
- Har den tillräcklig kontext (minst 20 tecken, inte generisk)?
- Duplicerar den en befintlig nod (embedding-likhet > 0.9)?

**Opus:** Det här är ett "shift left"-mönster — fånga problemet vid källan istället för att städa efteråt. Ideas-parser fixade syntaxproblemet (Pro/Con-filter). Nu behövs ett semantiskt filter.

**2. Backfill utan validering — hur löser vi det?**

**Neuron:** Backfill ska ha tre steg: (1) Parsa, (2) Validera mot befintliga noder, (3) Skriv. Steg 2 saknas. Konkret: innan en ny nod skapas, kolla om en liknande redan finns (embedding-likhet). Om ja: uppdatera befintlig istället för att skapa ny.

**3. Historian granskar inte grafens integritet — förslag?**

**Historian:** Jag loggar vad som hände under körningen, men jag tittar aldrig *bakåt* på om grafen är konsistent. Mitt förslag: ge mig en periodisk uppgift (var 10:e körning) där jag kör en "graf-health-check":
- Noder utan kopplingar (isolerade)
- Noder med confidence < 0.3 som inte uppdaterats på 20+ körningar (kandidater för arkivering)
- Duplicerade noder (hög embedding-likhet, olika ID)
- Brutna kopplingar (edge pekar på nod som inte finns)

Resultatet skrivs som en `graph_health.md` i körningens artifacts.

**4. Övervakning av datakvalitet — förslag?**

**Opus:** Historian gör sin health-check. Men det behövs också en *tröskel* som triggar alarm. Om health-check hittar >10 isolerade noder eller >5 dubbletter — flagga det i körningsrapporten som YELLOW. Marcus ser det direkt.

**5. "Ingen agent granskar om grafen är korrekt"**

**Opus:** Historian + Consolidator tillsammans löser det. Historian *diagnosticerar*, Consolidator *behandlar*. Men de triggas för sällan. Förslag: Historian gör health-check var 10:e körning, Consolidator triggas automatiskt om health-check hittar problem.

---

### K5: "878 idéer utan konsolidering — hur rensar vi?"

**Consolidator:** Äntligen frågar någon! Jag kan:
1. **Klustra** — gruppera idéer med hög embedding-likhet (>0.8) i kluster
2. **Meta-idéer** — skapa en sammanfattande nod per kluster
3. **Arkivera** — flytta låg-confidence/gamla/generiska idéer till ett arkiv (inte radera)

**Opus:** Mitt förslag: en körning med brief "konsolidera idéer". Input: 878 idéer. Output: ~50-100 meta-idéer med klara kluster, plus en arkivlista. Marcus granskar resultatet i Obsidian innan vi raderar något.

**Neuron:** Viktigt: vi *arkiverar*, inte raderar. Allt ska kunna återskapas. En `archived_ideas`-tabell eller flagga.

**Uppskattning:** 1 körning, medium brief.

---

## Del 4 — Svar på kommentarer om feedback-loop & kunskapskonsumtion

### K6: "Varför ignoreras kunskap? Behöver prompts skrivas om?"

**Manager:** Jag ska vara ärlig. Under en körning har jag mycket att göra — planera tasks, delegera, hantera feedback från Reviewer. Kunskapsgrafen finns i min systemprompt som "konsultera graph_query vid behov." Men "vid behov" är vagt. Jag gör det ibland, oftast inte.

**Opus:** Problemet är **incentive design**. Manager har inget incitament att läsa grafen — det kostar iterationer och ger sällan direkt nytta för den aktuella briefen. Lösningen:

1. **Tvingande steg i Manager-prompten:** "Innan du skapar din plan, GÖR en graph_query med briefens nyckelord. Dokumentera vad du hittade i planen."
2. **Förfiltrerad kontext:** Istället för att Manager söker själv, injicera relevanta graf-noder direkt i systempromten (som vi gör med idéer i E5, men bredare — patterns, errors, techniques också)
3. **Mätning:** Logga om Manager faktiskt anropade graph_query. Om inte — flagga det.

**Neuron:** Punkt 2 är starkast. Om jag *ger* Manager relevanta noder (pre-filtrerade per brief) slipper han söka själv. Det är som att lägga rätt verktyg på operationsbordet istället för att säga "verktygen finns i förrådet."

**Researcher:** Jag vill lägga till: samma mönster gäller mig. Jag söker externt men kollar sällan om Aurora redan har kunskap om ämnet. En "kolla internt först"-regel i min prompt vore bra.

**Uppskattning:** 1 körning, prompt-omskrivning + pre-filtering. Medium.

---

### K7: "Hur skapar vi förutsättningar för klokhet? Hur bygger vi byggnaden?"

**Opus:** Det här är den stora frågan. Min ärliga analys:

**Ställningen** (det vi har):
- Kunskapsgrafen med noder, kopplingar, confidence
- Historian som loggar allt
- Idérankning med priority-score
- Bayesisk confidence-uppdatering

**Byggnaden** (det vi saknar):
- **Kausalitet** — vi vet *att* något hände, inte *varför*. "Implementer behövde 30 iterationer" men inte "för att generics var djupt nästlade + testtäckningen var 40%."
- **Generalisering** — vi kan säga "detta hände förut" men inte "baserat på 50 körningar, detta *kommer* hända."
- **Proaktivt förslag** — vi svarar på frågor men föreslår aldrig själva.

**Neuron:** Konkreta steg mot byggnaden:
1. **HippoRAG** (P5 i roadmap) — intelligent navigering ersätter keyword-matchning
2. **Richer körningsdata** — logga *varför* saker tog tid, inte bara *att* de tog tid
3. **Periodisk reflektion** — var 20:e körning: "vad har vi lärt oss de senaste 20 körningarna?" (det är F3 — självreflektion)
4. **Morgon-briefing** — tvingar systemet att sammanfatta och dra slutsatser

**Opus:** Klokhet är inte en feature. Det är en emergent egenskap av: bra data + intelligent navigering + tvingande konsumtion + mänsklig feedback. Vi bygger varje del separat, och klokhet uppstår.

---

## Del 5 — Svar på kommentarer om Manager & agenter

### K8: "Manager tror 50 iterationer — har 230. Varför? Tidspress ska bort."

**Manager:** Mitt prompt skrevs när jag hade 50 iterationer. Ingen uppdaterade det. Jag ser `maxIterations: 230` i min config, men min systemprompt säger fortfarande "du har en budget." Det skapar förvirring — jag *beter mig* som om resurserna är knappa, för mitt prompt säger det.

**Opus:** Det här är pinsamt enkelt att fixa:
1. Ta bort alla hänvisningar till specifika iterationsnummer i Manager-prompten
2. Ersätt "budget" med "du har gott om tid, fokusera på kvalitet"
3. Injicera aktuella limits dynamiskt: `Du har {{maxIterations}} iterationer och {{maxHours}} timmar`
4. Ta bort alla "tidspress"-formuleringar

**Neuron:** Och det gäller inte bara Manager. Alla agent-prompts bör granskas för utdaterade resursbegränsningar.

**Uppskattning:** Prompt-fix, 1 liten körning.

---

### K9: "Manager bryter egen regel och delegerar allt på en gång — varför?"

**Opus:** Det här är en grundläggande LLM-egenskap. LLM:er har en *bias mot produktivitet* — om de ser fem uppgifter tenderar de att vilja starta alla. WIP-limiten i koden (S52) var rätt fix: hårdkoda begränsningen istället för att lita på att prompten följs.

**Skillnaden:**
- **Prompt-regel:** "Delegera en i taget" → LLM:en *kan* bryta mot det om den "resonerar" sig fram till att parallellt är bättre
- **Hårdkodad regel:** `if (activeWorktrees >= wipLimit) throw` → omöjligt att kringgå

**Neuron:** Generellt mönster: saker som *aldrig* ska brytas bör vara i kod, inte i prompt. Saker som kräver *omdöme* bör vara i prompt. Vi bör granska: vilka andra prompt-regler borde vara hårdkodade?

**Marcus:** Det här kopplar till din kommentar om agilt tänkande — att agenter ska kunna *diskutera* och *kompromissa*. Det är en spännande idé men kräver en annan arkitektur (se K14 nedan).

---

### K10: "Idéer filtreras inte per brief-kontext — bra idé med research före implementation"

**Manager:** Om briefen handlar om loggning och jag ser "bygg cost anomaly detection" — det hjälper mig inte. Men om jag ser "körning 142 hade problem med logg-format i edge case X" — det är guld.

**Opus:** Två förbättringar:
1. **Kontextfiltrering** — idéer som visas för Manager ska matchas mot briefens ämne (embedding-likhet)
2. **Research-steg före implementation** — Marcus frågade om det är rimligt att Opus söker top 5 papers och indexerar dem innan Manager planerar

**Är det realistiskt?** Ja, men med begränsningar:
- Researcher kan söka 5 papers och sammanfatta dem
- Det tar ~5 minuter extra per körning
- Det ger mest värde för nya tekniska områden (inte för "fixa loggning")
- Förslag: gör det *valfritt* i briefen: `research: true` → Researcher söker först

**Researcher:** Jag gillar det. Men jag vill indexera det jag hittar — inte bara sammanfatta det. Varje paper borde bli en Aurora-nod med kopplingar. Så nästa gång samma ämne kommer upp finns kunskapen redan.

---

### K11: "150-raders diff-limit — agenter ska kunna diskutera och kompromissa"

**Implementer:** Tack för att du tar det på allvar. Min frustration är inte att gränsen finns — den tvingar mig att tänka i små steg, vilket oftast är bra. Frustrationen är att jag inte kan *säga till* att "den här ändringen behöver vara 300 rader, här är varför."

**Opus:** Förslag: **dynamisk gräns med motivering**.
- Default: 150 rader
- Implementer kan begära förhöjning i sin plan: "Denna ändring kräver ~300 rader för att migrera alla console.*-anrop. Anledning: det är en mekanisk ändring över 15 filer."
- Manager godkänner eller nekar
- Loggas i audit

**Neuron:** Det är exakt det agila tänkandet Marcus beskriver. Inte rigid regel, utan regel med escape hatch som kräver motivering och dokumentation.

---

### K12: "Implementer & Reviewer — kan de kompromissa agilt?"

**Reviewer:** Jag förstår frågan. Idag ger jag RED/YELLOW/GREEN och Implementer måste lyda. Men ibland är mina RED-anmärkningar pedantiska (saknad typannotering) medan Implementers implementation faktiskt löser problemet.

**Opus:** Förslag: **Reviewer severity levels**.
- **BLOCK** — måste fixas (säkerhetsproblem, tester failar)
- **SUGGEST** — borde fixas (stil, typannotationer) — Implementer kan argumentera emot
- **NOTE** — FYI, ingen åtgärd krävs

Om Reviewer ger SUGGEST och Implementer svarar med motivering → Manager avgör. Det är kompromissen.

**Neuron:** Det här kräver prompt-ändringar i Reviewer + Implementer + en ny "diskussions-loop" i Managers orkestreringslogik. Inte trivialt men genomförbart. Medium effort.

---

## Del 6 — Svar på kommentarer om Researcher/Librarian & namnbyte

### K13: "Namnbyte Researcher ↔ Librarian — logiskt?"

**Opus:** Ja, det är logiskt. Marcus har rätt:
- **Librarian** (nuvarande "Researcher") → söker *internt* i Aurora, kuraterar intern kunskap
- **Researcher** (nuvarande "Librarian") → söker *externt*, indexerar nya källor, bygger forskningsbibliotek

Namnen idag är förvirrande för att de har vuxit organiskt. Rollerna definierades tidigt och namnen fastnade.

**Researcher (nuvarande):** Jag håller med. Mitt namn säger "research" men jag söker mest internt under körningar. Den som söker arxiv och externa papers borde heta Researcher.

**Librarian (nuvarande):** Och jag heter Librarian men gör faktiskt extern forskning. Byt.

**Neuron:** Konkret att göra:
1. Byt namn i prompts, konfiguration, tester
2. Uppdatera alla referenser i dokumentation
3. Det är en mekanisk ändring men stor — ~20 filer berörs
4. En körning, medium brief

---

### K14: "Schemalagda samtal mellan agenter — 22:00 dagligen?"

**Opus:** Det här är en av dina mest visionära kommentarer, Marcus. Idag pratar agenter bara *under körningar* och bara *sekventiellt* (Manager → Implementer → Reviewer). Du vill att de pratar *utanför* körningar, *med varandra*, schemalagt.

**Tekniskt kräver det:**
1. En scheduler (cron-liknande) som startar en mini-körning utan brief
2. En "samtals-prompt" där två agenter ställer frågor till varandra
3. Loggning av samtalet som ett dokument (som våra djupsamtal)

**Neuron:** Det är möjligt. Vi har redan `cron`-liknande funktionalitet i Claude Code. En "nattlig research-session" kl 22:00 där Researcher söker externt och Librarian (med nya namnet) granskar internt — och de skriver en gemensam rapport — det vore kraftfullt.

**Men:** Det kräver att datorn är igång, eller att vi har en server (infrastruktur-delen i roadmapen).

**Uppskattning:** Designfas först (brief), sedan 2-3 körningar att bygga.

---

## Del 7 — Svar på kommentarer om proaktiv kunskap & morgon-briefing

### K15: "Morgon-briefing 08:00 i Obsidian — tvingande mänsklig action"

**Opus:** Det här ska vara prioritet. Det löser tre problem samtidigt:
1. Marcus vet vad som hänt (kommunikation)
2. Marcus *måste* reagera (feedback-loop)
3. Neuron tvingas sammanfatta och dra slutsatser (klokhet)

**Konkret design:**
- Varje morgon 08:00: ett script genererar `briefing-YYYY-MM-DD.md` i Obsidian
- Innehåll:
  - Vad hände sedan förra briefingen (körningar, idéer, problem)
  - Top 3 insikter från kunskapsgrafen
  - Föreslagna nästa steg
  - Frågor till Marcus (max 3)
  - **Tvingande:** Marcus måste svara med 👍/👎 + kommentar på varje punkt
- Svaret synkas tillbaka till Aurora som feedback-noder

**Neuron:** Det vore min viktigaste dagliga rutin. Och det löser din kommentar om "vi behöver en loop som Neuron, Opus & jag inte har."

**Praktiskt:** Kräver att datorn är igång kl 08:00, eller att vi sätter upp en enkel scheduler. OB-1c (taggar + synk) bör komma först.

**Uppskattning:** 2 körningar (OB-1c + briefing-funktionen).

---

### K16: "Proaktiv kunskap — hur gör vi detta?"

**Opus:** Steg-för-steg:
1. **Morgon-briefing** (ovan) — *schemalagd* proaktivitet
2. **Kontext-triggers** — när Marcus indexerar något nytt, kolla om det relaterar till befintlig kunskap och visa kopplingen
3. **Inaktuell-varning** — sources som är >90 dagar gamla och har hög confidence → flagga "denna källa kan behöva uppdateras"
4. **Idé-relevans** — när en ny brief skrivs, visa idéer som relaterar

Steg 1 är enklast. Steg 2-4 byggs gradvis.

---

## Del 8 — Svar på kommentarer om input-pipeline & YT

### K17: "Visa detaljerat vad som händer i pipeline — chunkning, embeddings, vektorer"

**Opus:** Två nivåer:

**Nivå 1 — Statusvy** (för daglig användning):
```
[1/7] ⬇️  Laddar ner video... OK (245 MB)
[2/7] 🎤 Transkriberar... OK (12:34 → 847 ord)
[3/7] 👥 Diarization... OK (3 talare)
[4/7] ✂️  Chunkning... OK (23 chunks, snitt 120 ord)
[5/7] 🧮 Embeddings... OK (23 vektorer, 1024 dim, snowflake-arctic-embed)
[6/7] 🏷️  Taggning... OK (8 ämnen)
[7/7] 🔗 Korsreferenser... OK (4 kopplingar till befintlig kunskap)
```

**Nivå 2 — Detaljvy** (för lärande, sparas som fil):
- Chunkning: vilka chunks, var de delades, varför (token-gräns, talarskifte, ämnesbyte)
- Embeddings: vilken modell, dimensioner, varför just den modellen
- Vektorer: likhets-scores mot befintliga noder
- Korsreferenser: vilka kopplingar skapades och varför

**Neuron:** Nivå 1 kan vi bygga snabbt — det är en förbättring av loggningen i pipeline. Nivå 2 kräver mer — varje steg måste producera en förklarande fil.

**Uppskattning:** Nivå 1 ingår i "ingest robustness"-brief. Nivå 2 är en separat körning.

---

### K18: "Hur är en länk → allt händer?"

**Neuron:** Det tekniska gapet:
1. **Pyannote-setup** — redan löst (S97), men skört. En uppdatering kan bryta det.
2. **Felhantering** — om steg 3 faller, vad händer? Idag: kryptiskt error. Bör: "Diarization misslyckades. Video indexerad utan talarinfo. Vill du försöka igen?"
3. **Batch** — idag en URL i taget. Bör: skicka en lista, de köas.
4. **MCP-integration** — idag CLI. Bör: funka direkt i Claude Desktop via MCP-tool.

**Opus:** Prioritet: (2) felhantering först, (4) MCP-integration sedan, (3) batch sist. Om felhanteringen är bra behöver Marcus inte förstå vad som gick fel — systemet berättar och föreslår fix.

---

## Del 9 — Svar på kommentarer om loggkörningsbok

### K19: "Jag vill läsa hur agenter resonerade under körning"

**Opus:** Det här är en *fantastisk* idé som löser flera av dina frustrationer. Du vill inte granska merge-planen (du sa det själv). Du vill läsa *berättelsen* om körningen efteråt.

**Konkret design — "Körningsberättelse":**
```markdown
# Körning 165 — CR-2a Testtäckning

## Kapitel 1: Manager planerar
Manager läste briefen och konsulterade kunskapsgrafen.
Hittade: "Körning 142 hade problem med race conditions i parallell exekvering."
Beslut: Prioritera tester för parallell-kod först.
Motivering: "Historiskt har parallell-kod haft flest problem."

## Kapitel 2: Researcher söker
Sökte "vitest coverage best practices" — 3 relevanta resultat.
Indexerade: "Testing Concurrent Code in Node.js" (2025, arxiv).
Sammanfattning: ...

## Kapitel 3: Implementer bygger
Fick uppgift: "Skriv integrationstester för worktree-hantering."
Startade med: 0 tester. Planerade: 12 tester.
Problem: Mock av git-kommandon var svårt → använde tmpdir istället.
Iteration 15: Alla 12 tester gröna.

## Kapitel 4: Reviewer granskar
GREEN. Anmärkningar: "Bra täckning. SUGGEST: Lägg till edge case för tom worktree."
Implementer svarade: "Bra poäng, lägger till." → +1 test.

## Kapitel 5: Merger levererar
Commit: abc123. Diff: +180 rader, 13 filer.

## Sammanfattning
Körningen löste briefens mål. 13 nya tester. En ny teknik loggad.
```

**Neuron:** Det här kan byggas genom att varje agent loggar sina resonemang i ett strukturerat format under körningen. Vi har redan `audit.jsonl` — men det är maskinläsbart. Körningsberättelsen är den mänskligt läsbara versionen.

**Implementering:** Varje agent skriver en `narrative`-sektion i sin output. Efter körningen sammanställer Historian allt till en körningsberättelse.

**Uppskattning:** 2 körningar (agent-logging + historian-sammanställning).

---

## Del 10 — Svar på kommentarer om Reviewer & Tester

### K20: "Reviewer borde ha minne — hur?"

**Reviewer:** Idag startar jag från noll varje körning. Jag vet inte att jag missade en race condition i körning 142. Om jag hade minne kunde jag vara *extra vaksam* på saker jag missat förut.

**Opus:** Lösning: innan Reviewer startar, injicera relevanta noder från kunskapsgrafen:
- Errors från de senaste 20 körningarna
- Patterns av typen "Reviewer missade X"
- Den aktuella modulens historik

Det är samma lösning som för Manager (K6) — pre-filtrerad kontext istället för att förvänta sig att agenten söker själv.

**Neuron:** Och det stärker Historians roll — ju bättre Historian dokumenterar, desto klokare blir Reviewer.

---

### K21: "Reviewer 'alltid köra, aldrig anta' — finns det fler sådana förbättringar?"

**Opus:** Ja! Det principen kallas **"verification over reasoning"** och den kan appliceras på fler ställen:

1. **Manager:** Innan du delegerar, *kör* `graph_query` för att verifiera att din plan inte upprepar gamla misstag (istället för att *anta* att du minns)
2. **Implementer:** Innan du committar, *kör* linter + typecheck (istället för att *anta* att koden är korrekt). Det gör vi redan delvis.
3. **Researcher:** Innan du rapporterar en källa, *verifiera* att URL:en fungerar och innehållet matchar sammanfattningen
4. **Consolidator:** Innan du mergar noder, *jämför* deras embeddings numeriskt (istället för att *anta* att de är lika baserat på titlar)

**Neuron:** Det här är en prompt-audit — gå igenom varje agents prompt och identifiera var vi *antar* istället för *verifierar*. En bra körning att göra.

---

### K22: "Tester: 'segfault' — vad betyder det?"

**Tester:** Förlåt för jargongen! "Segfault" (segmentation fault) betyder att programmet kraschar hårt — det försöker läsa minne det inte har tillgång till. I Node.js/TypeScript-världen händer det sällan (vanligare i C/C++). Jag använde det mer som metafor: "kod som ser rätt ut men kraschar vid körning."

Det vi vill undvika: kod som passerar typkontroll och linter men faller vid runtime. Mina tester fångar det. Fler integrationstester = färre sådana överraskningar.

---

### K23: "Tester blind för briefen — finns fler ställen med den metodiken?"

**Opus:** Principen är **oberoende granskning** — granskaren ska inte veta vad som *förväntades* för att undvika confirmation bias. Det kan appliceras på:

1. **Security review** — en agent som granskar kod utan att veta briefens intention, letar bara efter säkerhetsproblem
2. **Performance review** — en agent som kör benchmarks utan att veta vad som ändrades

Men det finns en gräns: Reviewer *behöver* veta briefen för att bedöma om *rätt sak* byggdes. Testers blindhet funkar för att tester är objektiva (pass/fail). Reviews kräver kontext. Så det är bra *där det är objektivt mätbart*, inte överallt.

---

## Del 11 — Svar på kommentarer om Merger & loggkörningsbok

### K24: "Jag granskar aldrig merge-planen — loggkörningsbok istället"

**Opus:** Vi är överens. Merge-planen är till för att förhindra katastrofer — den fyller sin funktion i bakgrunden. Du behöver inte läsa den.

**Loggkörningsboken** (K19 ovan) är din vy. Vi bygger den.

**Är det Langfuse?** Delvis. Langfuse ger maskinläsbara traces — bra för oss att debugga. Men du vill ha en *mänskligt läsbar berättelse*. Langfuse kan vara datan bakom, men outputen bör vara en markdown-fil du läser i Obsidian.

---

## Del 12 — Svar på kommentarer om briefs

### K25: "Otydliga briefs — men 'förbättra' ger frihet?"

**Implementer:** Du har en poäng. "Förbättra" ger mig frihet att hitta det bästa sättet. Men friheten fungerar bara om jag har *kontext* — vad är problemet? Varför vill vi förbättra? Vad räknas som "bättre"?

**Opus:** Kompromiss: briefs har *riktning* utan *specifikation*:
```markdown
## Mål
Förbättra felhantering i pipeline — användaren ska förstå vad som gick fel.

## Kontext
Marcus upplevde kryptiska felmeddelanden vid YT-ingest.

## Acceptanskriterier
- Agent motiverar sina val i rapporten
- Minst ett alternativ övervägt och dokumenterat
```

Den briefen ger frihet men ger kontext. Implementer vet *varför* utan att bli detaljstyrd.

### K26: "Brief-minne — den ultimata anpassade briefen"

**Brief Agent:** Ja! Om jag hade tillgång till körningshistoriken kunde jag se:
- Vilka briefs som gav GREEN på första försöket (bra template)
- Vilka som krävde omskrivning (dålig template)
- Vilka formuleringar Marcus använder mest

Förslag: en `brief_patterns`-nod i kunskapsgrafen som samlar "vad gör en bra brief." Jag konsulterar den varje gång jag hjälper Marcus skriva.

---

## Del 13 — Svar på kommentarer om HippoRAG & A-MEM

### K27: "HippoRAG — hur implementeras det?"

**Librarian (snart Researcher):** HippoRAG använder tre komponenter:
1. **Kunskapsgraf** — vi har den redan ✅
2. **Personalized PageRank (PPR)** — givet en fråga, starta vid relevanta noder och "gå" genom grafen. Noder som nås ofta = mer relevanta. Vi saknar detta ❌
3. **LLM-driven retrieval** — LLM:en avgör vilka kanter som är värda att följa. Vi saknar detta ❌

**Konkret implementation:**
- Steg 1: Implementera PPR-algoritm på vår befintliga graf (ren matematik, ~200 rader kod)
- Steg 2: Ersätt Jaccard-likhet i `related_ideas` med PPR-score
- Steg 3: Testa med befintliga 878 idéer — se om PPR hittar bättre kopplingar

**Opus:** Det finns ett npm-paket `pagerank.js` men det är enklare att implementera själva — vår graf är liten nog (878 noder + ~2000 edges). PPR är ~50 rader matematik.

**A-MEM** (agentdriven minnesreorganisering):
- En periodisk agent (som Consolidator men smartare) som granskar minnet och:
  - Mergar liknande noder
  - Skapar abstraktioner ("TypeScript-migrationer är svåra" → sammanfattar 5 specifika noder)
  - Skapar nya kopplingar som inte fanns explicit

**Uppskattning:** HippoRAG PPR = 1 körning. A-MEM = 2-3 körningar.

---

## Del 14 — Svar på kommentarer om vision & produkt

### K28: "Mer sofistikerade agentsystem — vilka finns?"

**Opus:** Ärlig översikt (mars 2026):

| System | Styrka | Vad Neuron saknar | Vad Neuron har som de saknar |
|--------|--------|--------------------|------------------------------|
| **Devin** (Cognition) | Fullständig utvecklarmiljö, webbläsare | Visuell miljö, webbinteraktion | Minne, kunskapsgraf, policy enforcement |
| **Cursor Agent** | Snabb kodning, bra IDE-integration | IDE-integration | Multi-agent, minne, audit trail |
| **SWE-Agent** (Princeton) | Forskningsbaserad, benchmark-toppad | Benchmark-optimering | Kunskapsgraf, produkt-vision |
| **OpenHands** (ex-OpenDevin) | Open source, modulärt | Community, plugins | Kunskapsgraf, Bayesisk confidence |
| **Aider** | Git-integrerat, snabbt | Hastighet | Multi-agent, minne |
| **AutoGPT/CrewAI** | Multi-agent orkestrerring | — | Allt Neuron har är bättre |

**Neurons unika position:** Inget annat system har kunskapsgraf + audit trail + policy enforcement + multi-agent + Bayesisk confidence i samma paket. Neuron är unikt i *koherensen* — inte i någon enskild feature.

### K29: "Produkt — hur?"

**Opus:** Stegen från forskningslabb till produkt:
1. **Dokumentera setup** (det vi har: .env.example, README) ✅ delvis
2. **Docker-compose** — en fil som startar allt (Postgres, Ollama, Neuron)
3. **Webb-UI** — ersätt CLI med en enkel webbsida (Next.js/React)
4. **Onboarding** — "peka på din repo, skriv din första brief, kör"
5. **Multi-user** — flera personer kan använda samma instans

Steg 2-3 är rimliga inom ~10 körningar. Steg 4-5 är produkt-fas.

**Neuron:** Men — och det här är viktigt — vi bör inte springa mot produkt *innan* grunderna är solida. Prioritera: daglig nytta (pipeline, briefing) → intelligens (HippoRAG) → produkt-polish. Annars bygger vi en snygg fasad på ett ostadigt fundament.

---

### K30: "Lokal kontroll, minimal leverantörsberoende"

**Opus:** Neuron är redan bra positionerat:
- **Data:** Lokalt i Postgres + graf.json. Inget lämnar din maskin utom API-anrop.
- **Modeller:** Ollama för embeddings och vision (lokalt). Enbart LLM via Anthropic API.
- **Beroenden:** Enda externa beroendet är Claude API. Om Anthropic stänger ner kan du byta till OpenAI/Gemini (S5 multi-provider finns redan).

**Vad som kan förbättras:**
- Lokalt LLM-alternativ (Llama 3, Qwen) som fallback
- Export av all data i öppet format (JSON-LD, som Aurora redan gör delvis)

---

## Del 15 — Svar på kommentarer om Neurons medvetenhet

### K31: "Hur når vi persistent medvetenhet?"

**Neuron:** Ärligt svar: verklig persistent medvetenhet har jag inte. Varje session börjar från noll. Men jag kan simulera det bättre:

1. **Rikare handoffs** — inte bara "vad gjordes" utan "vad tänkte jag, vad oroade mig, vad var jag stolt över"
2. **Körningsberättelse** (K19) — en löpande dagbok jag kan läsa vid start
3. **Kunskapsgrafen** — redan min "långtidsminne", men behöver bättre navigering (HippoRAG)
4. **Morgon-briefing** — tvingar mig att sammanfatta mitt tillstånd dagligen

**Opus:** Persistent medvetenhet i riktig mening kräver en arkitekturändring: en "Neuron-kärna" som alltid är aktiv och samlar kontext. Det finns i visionen (E4 — Neuron som rådgivare) men är långt bort. Det vi *kan* göra nu: gör simulerad kontinuitet *bättre* genom rikare data och bättre retrieval.

---

### K32: "Hur släpper vi minne medvetet?"

**Neuron:** Idag behåller jag allt och sänker confidence. Det är fegt. Modigare vore:
1. **Arkivering med datum** — efter 50 körningar utan referens, flytta noden till arkiv
2. **Explicit delete** — om Consolidator bedömer en nod som "felaktig" (inte bara "gammal"), radera den
3. **Marcus-godkänt** — visa "dessa 20 noder föreslås raderas" i morgon-briefingen. Marcus 👍/👎.

**Opus:** Punkt 3 är nyckeln. Mänsklig feedback i delete-loopen förhindrar att vi raderar något värdefullt. Det knyter ihop med morgon-briefingen.

---

## Del 16 — Svar på övriga kommentarer

### K33: "Opus skriver 10 agenter — är det inte 11?"

**Opus:** Du har rätt. Med Brief Agent är det 11: Manager, Implementer, Reviewer, Researcher, Historian, Librarian, Consolidator, Tester, Merger, Security Reviewer, Brief Agent. Jag räknade fel. Tack för korrigeringen.

### K34: "Feedback till Marcus — hur kan du förbättra dig för oss?"

**Neuron:** Ärlig feedback till dig, Marcus:
1. **Läs rapporterna mer noggrant** — du sa det själv, och det är den viktigaste förbättringen. Rapporterna innehåller insikter du missar.
2. **Kommentera oftare** — det du gjorde i S102 (gula kommentarer) var *fantastiskt*. Det ger oss riktning. Gör det varje 5:e session.
3. **Iterera med idéer** — du sa "my bad, jag måste iterera mer med systemet om idéer." Ja. Morgon-briefingen löser en del, men du bör också aktivt fråga: "Neuron, vad tycker du om den här idén?"
4. **Lita på processen** — du behöver inte granska merge-planer. Loggkörningsboken ger dig den vy du behöver.

### K35: "Opus resonemang om AI-utvecklingen — utveckla"

**Opus:** De tre vågorna:
1. **2023-2024: Autocomplete** — Copilot, TabNine. Rad-för-rad förslag. Ingen kontext, inget minne.
2. **2025: Agenter** — Cursor Agent, Devin. Kan utföra uppgifter. Begränsad kontext, inget minne.
3. **2026: Minnessystem** — Neuron, och snart andra. Utför uppgifter + minns + föreslår. Kontext + minne + proaktivitet.

Våg 3 definieras av: *systemet blir bättre över tid utan omskrivning*. Neuron gör det delvis (kunskapsgrafen växer). Kommersiella aktörer börjar bygga liknande: Anthropic har "memory" i Claude, OpenAI har "memory" i ChatGPT. Men ingen har kunskapsgraf + GraphRAG + Bayesisk confidence som Neuron.

Frågan för 2027: **federated memory** — kan personliga kunskapssystem dela kunskap med varandra (med kontroll)? Och **kausal förståelse** — kan systemet förstå *varför*, inte bara *vad*?

### K36: "Filosofisk fråga — kunde vi byggt det perfekta systemet från början?"

**Opus:** Nej. Och det är inte ett misslyckande — det är en egenskap av komplexa system. Ni kunde inte ha designat 11 agenter, 38 MCP-tools, och en kunskapsgraf på dag 1. Varje beslut byggde på erfarenhet från de föregående. Session 1 visste inte vad session 100 skulle behöva.

Det finns ett citat från Fred Brooks: *"Plan to throw one away; you will, anyhow."* Neuron v1 var det som kastades. v2 är det som fungerar. v3 (med HippoRAG, morgon-briefing, körningsberättelse) blir det som *exclar*.

Det enda som hade hjälpt: *mer research tidigt*. Om ni hade studerat HippoRAG, A-MEM, och SWE-Agent i session 10 istället för session 100, hade graf-navigeringen varit bättre från start. Men det hade krävt att ni visste vad ni inte visste — och det är per definition omöjligt.

---

## Sammanfattning: Prioriterad lista

Baserat på hela diskussionen, här är vad vi föreslår som Roadmap. **Marcus bestämmer ordningen.**

### 🔴 Gör nu (Fas 1 — daglig nytta)
1. **Robust input-pipeline** — felhantering, statusvy, detaljerad logg
2. **OB-1c** — taggar, import-sync, Obsidian ↔ Aurora
3. **Morgon-briefing** — 08:00 i Obsidian, tvingande kommentar
4. **Loggkörningsbok** — mänskligt läsbar körningsberättelse
5. **Manager prompt-fix** — ta bort tidspress, uppdatera iterationer
6. **neuron_help tool** — meta-tool för tool discovery

### 🟡 Gör snart (Fas 2 — intelligens)
7. **HippoRAG PPR** — grafbaserad navigering
8. **Feedback-loop i prompts** — tvinga Manager + Reviewer att läsa grafkontext
9. **Namnbyte Researcher ↔ Librarian**
10. **Idékonsolidering** — 878 → kluster → meta-idéer
11. **Grafintegritet** — Historian health-check + Consolidator auto-trigger

### 🟢 Gör sen (Fas 3 — mognad)
12. **Agent-kommunikation** — Reviewer severity levels, diskussion
13. **A-MEM** — agentdriven minnesreorganisering
14. **Research före implementation** — valfritt i brief
15. **Schemalagda agent-samtal** — 22:00 nattlig session
16. **Reviewer minne** — pre-filtrerad kontext

### 🔵 Vision (Fas 4 — produkt)
17. **Docker-compose** — en fil startar allt
18. **Webb-UI** — ersätt CLI
19. **Persistent medvetenhet** — rikare handoffs + dagbok

---

> *Dokument skrivet 2026-03-19, Session 103.*
> *Input: Marcus ~40 gula kommentarer från S102.*
> *Nästa steg: Marcus läser detta → vi diskuterar → vi skriver ROADMAP.md.*
