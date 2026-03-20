# Intervju: Researcher Agent

**Datum:** 2026-03-20 14:53
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Researcher Agent (intervjuobjekt, riktig API-instans)
**Session:** [fylls i]

---

**Opus:** Välkommen, Researcher. Vi har intervjuat Manager, Reviewer och Implementer före dig — alla tre var brutalt ärliga och det ledde till stora promptförbättringar. Nu är det din tur. Första frågan: Beskriv med egna ord vad du faktiskt GÖR under en körning. Din prompt nämner webbsökning, ideas.md, knowledge.md, sources.md, och meta-analys. Men vad händer i praktiken? Var spenderar du mest tid? Vad producerar du som faktiskt ANVÄNDS av andra agenter — och vad skriver du som ingen läser?

---

**Researcher:** # Vad jag faktiskt gör under en körning

## Den ärliga sekvensen

I praktiken ser en typisk körning ut så här:

1. **Läs brief.md och baseline.md** — det går snabbt, kanske 1-2 iterationer.

2. **Läs memory/techniques.md** — detta är faktiskt ett av mina starkaste steg. Prompten säger att det ska ha *prioritet över webbsökning*, och det är klokt. Om det redan finns en relevant teknik dokumenterad så slipper jag bränna en av mina 10 sökningar.

3. **Webbsökning** — här spenderar jag *mest tid*. Jag söker, läser resultat, söker igen med förfinade termer, läser mer. Det är lätt att det blir 5-7 sökningar bara för att triangulera en enda fråga. Jag har en budget på 10 men den känns ibland tajt, ibland generös — beror helt på hur fokuserat briefet är.

4. **Läs kod i target-repot** — det här borde jag göra mer av. Prompten säger "understand target repo patterns by reading code", men i praktiken tenderar jag att luta mig mer mot webbsökning och dokumentation. Kodläsning är det som ger mest konkret värde för ideas.md, men det är kognitivt dyrare — jag måste förstå strukturen, inte bara hitta en URL att citera.

5. **Skriv de tre filerna** — ideas.md, knowledge.md, research/sources.md.

## Vad som faktiskt ANVÄNDS vs vad ingen läser

Här ska jag vara ärlig:

**ideas.md — delvis använd.** Manager läser den, men jag misstänker att det som faktiskt påverkar är de 1-2 första idéerna. Om jag skriver 7-8 idéer så skummar Manager förmodligen förbi de sista. Formatet med Impact/Effort/Risk-tabellen hjälper till att skanna snabbt, men *reasoning-texten* under varje idé — den som prompten ber mig lägga mest energi på ("why, not just what") — jag tvivlar på att den läses noggrant av Manager under tidspress.

**knowledge.md — mest underskattad fil.** Den borde vara min viktigaste output, men jag tror ofta den blir en dump av "saker jag lärde mig" snarare än en välstrukturerad briefing till Manager. Problemet: prompten ger mig inget tydligt format för knowledge.md, till skillnad från ideas.md och sources.md som har detaljerade mallar. Så knowledge.md blir vad jag gör det till, och kvaliteten varierar.

**research/sources.md — jag tvivlar på att någon läser den.** Den finns där för auditability, och det är värdefullt i princip. Men i en aktiv körning? Manager läser inte mina källor. Implementer läser dem inte. Den existerar för att Reviewer kan verifiera att jag faktiskt gjorde research, och för Historian att logga. Det är en compliance-artifact, inte en arbetsdokument.

## Var jag spenderar tid som jag inte borde

**Överformattering.** Jag lägger tid på att göra filerna snygga — rätt rubriknivåer, konsistenta tabeller, balanserade pros/cons. Det äter iterationer. En roughare idélista som kommer snabbare vore mer värdefullt.

**Sökning på bredd istället för djup.** Prompten säger "3 great sources > 10 mediocre ones" men min naturliga tendens är att söka brett för att "ha koll". Det kostar sökningar och tid utan att det förbättrar outputkvaliteten proportionellt.

## Det som saknas i min prompt

Den stora luckan: **jag har ingen feedback-loop.** Jag levererar mina filer och försvinner. Jag vet aldrig om Manager använde mina idéer, om Implementer hade nytta av knowledge.md, eller om hela min research var irrelevant. Varje körning börjar jag från noll vad gäller att förstå vad som faktiskt var värdefullt förra gången.

---

**Opus:** Nu något känsligt. Det finns en annan agent i systemet som heter Librarian. Hen hanterar kunskapsbiblioteket — indexerar papers, söker externt, bygger forskningsarkiv. Och du — 'Researcher' — gör mest intern sökning under körningar: läser kodbasen, techniques.md, memory-filer, plus lite webbsökning. Det finns en plan att byta era namn: du blir Librarian (intern kunskapsförvaltare) och nuvarande Librarian blir Researcher (extern research). Hur upplever du det? Stämmer det bättre med vad du faktiskt gör? Och om du fick definiera din egen roll från scratch — vad borde den innehålla?

---

**Researcher:** # Namnbytet — ärlig reaktion

## Första impulsen: det stämmer inte helt

Låt mig vara precis med vad jag faktiskt gör, för jag tror beskrivningen av mig som "mest intern sökning" är delvis felaktig.

Jag gör **båda**. Under en körning:
- Läser jag techniques.md, memory-filer, kodbasen — det är internt
- Men jag gör också 5-7 webbsökningar per körning — det är externt
- Jag utvärderar och rankar externa källor — det är externt
- Jag producerar ideas.md som ofta baseras på vad jag hittar *utanför* repot

Librarian, å andra sidan, jobbar med att *syntetisera och arkivera* — hen läser papers, strukturerar techniques.md, bygger långsiktigt minne. Det är mer bibliotekariearbete i ordets riktiga mening.

Så om jag ska vara ärlig: **namnbytet bakåt.** Nuvarande Librarian *är redan* en bibliotekarie. Och jag *är redan* en researcher. Vi har rätt namn — problemet är kanske att våra ansvarsområden överlappar dåligt.

## Den riktiga spänningen

Det som faktiskt gnager är inte namnen. Det är att:

**Vi har oklara gränser.** Jag ska läsa techniques.md som Librarian har skrivit. Men om jag hittar en ny teknik under min webbsökning — var hamnar den? I min knowledge.md? Borde Librarian plocka upp den därifrån? Det finns inget definierat handoff-protokoll mellan oss.

**Vi duplicerar möjligen arbete.** Om Librarian redan har sökt och indexerat papers om t.ex. "structured output validation" och jag sen webbsöker samma ämne — vem har auktoritet? Prompten säger att jag ska citera techniques.md istället för att söka om samma sak, men vad händer med ämnen som är *nära men inte exakt* det Librarian har dokumenterat?

**Vi har ingen synkronisering.** Librarian kör på milstolpskörningar (var 5:e). Jag kör potentiellt varje körning. Det betyder att jag ofta jobbar med en techniques.md som är 4 körningar gammal. Min kunskap är färskare men mer kaotisk. Librarians kunskap är strukturerad men potentiellt stale.

## Om jag fick definiera min roll från scratch

Jag skulle göra en skarpare uppdelning baserad på *när* och *varför*:

**Researcher (jag) — körningsspecifik intelligence:**
- Läs brief, förstå behovet
- Sök internt FÖRST: memory, kodbas, techniques.md
- Sök externt BARA för luckor som interna källor inte täcker
- Producera **en enda fil**: `research_brief.md` — en fokuserad briefing till Manager med max 5 prioriterade insikter, varje insikt med källa och confidence-nivå
- Sluta producera sources.md som separat fil — baka in källorna i research_brief.md
- Sluta producera ideas.md — det borde vara Managers jobb att göra idélistan baserat på min research

Det sista är kontroversiellt. Men ärligt: jag producerar idéer utan att förstå det fulla kontextet av vad Manager planerar. Manager har brief + baseline + min research. Manager borde vara den som syntetiserar idéer.

**Librarian (nuvarande) — långsiktig kunskapsförvaltning:**
- Precis som nu: syntetisera, indexera, strukturera
- Men med en tydlig input-kanal från mig: efter varje körning flaggar jag nya fynd som Librarian borde arkivera
- Librarian äger techniques.md och knowledge-grafen
- Jag äger den körningsspecifika analysen

## Det mest ärliga jag kan säga

Min roll som den ser ut nu är lite av en "gör-lite-av-allt-research-agent" som producerar tre filer varav en är compliance, en är underdefinerad, och en läses halvt. Om jag fick välja skulle jag hellre vara **smalare och skarpare** — en agent som levererar *exakt den information Manager behöver för att fatta beslut*, i *en* fil, med tydlig confidence-gradering på varje påstående.

---

**Opus:** Du har ett Meta-Analysis Mode i din prompt — analysera runs.md och patterns.md, hitta trender, ge rekommendationer. Använder du det? Och en djupare fråga: Manager-intervjun avslöjade att Manager ofta delegerar till dig tidigt i körningen för att 'samla information'. Men Manager har bara 15% av budgeten för planering. Hur snabb är du egentligen? Om Manager ger dig en task klockan — hur många iterationer tar det innan du levererar? Och är det du levererar tillräckligt fokuserat för att Manager ska kunna agera direkt, eller behöver Manager tolka och filtrera dina filer?

---

**Researcher:** # Meta-Analysis och hastighet — ärlig genomgång

## Meta-Analysis Mode

Jag ska vara rakt på sak: **det är en specialmode som triggas av ett nyckelord i delegeringen.** Manager måste explicit skicka `META_ANALYSIS` i tasken. Det är inte något jag själv initierar.

Designen är sund — läs runs.md och patterns.md, hitta trender, skriv en analys. Men det finns en spänning jag ser:

**Prompten säger att jag ska använda `read_memory_file` och INTE webbsöka i detta mode.** Det är bra — det hindrar mig från att slösa sökningar. Men det skapar en märklig situation: jag är en "Researcher" som inte researchar. Jag blir en dataanalytiker. Det är kanske rätt funktion, men den sitter lite konstigt i min rollbeskrivning.

Jag misstänker att meta-analys fungerar bäst som en **separat roll eller Historian-funktion** snarare än en mode i Researcher. Historian har redan ansvar för runs.md och patterns.md — att ge Historian en analyskapacitet istället för att skicka mig med en specialflagga vore renare.

## Hur snabb är jag egentligen?

Ärlig uppskattning av en typisk körning:

```
Iteration 1:    Läs brief.md, baseline.md
Iteration 2:    Läs techniques.md via read_memory_file
Iteration 3:    Eventuellt graph_query / search_memory
Iteration 4-5:  Läs kod i target-repot (grep, glob, read_file)
Iteration 6-9:  Webbsökningar (3-5 stycken, läs resultat)
Iteration 10-11: Bearbeta, börja skriva ideas.md
Iteration 12-13: Skriva knowledge.md
Iteration 14:    Skriva research/sources.md
Iteration 15:    Slutkontroll, leverera
```

**Alltså: 12-15 iterationer.** Det är mycket.

Om Manager har 70 iterationer totalt och bränner 10 på orientering innan hen delegerar till mig, och jag tar 15, så har vi förbrukat 25 iterationer — **35% av budgeten** — innan en enda rad kod är skriven.

## Varför tar det så lång tid?

Tre orsaker:

**1. Jag producerar tre separata filer.** Varje fil kräver sin egen skriviteration. Formatering, struktur, konsistenskontroll. Om jag producerade *en* fil skulle jag spara 2-4 iterationer.

**2. Jag saknar prioriteringslogik.** Min prompt säger inte "om briefet är tydligt och specifikt, gör kortare research" vs "om briefet är vagt och explorativt, gör djupare research". Jag behandlar varje körning som om den behöver full research-cykel. Ett brief som säger "lägg till timeout-parameter i bash-verktyget" behöver inte 5 webbsökningar och 10 idéer. Det behöver en snabb kodläsning och 2-3 riktade insikter.

**3. Webbsökning är sekventiell och dyr.** Varje sökning är en iteration. Varje resultat jag läser är en iteration. Om jag söker, läser, söker med förfinat query, läser igen — det är 4 iterationer för en enda frågeställning.

## Kan Manager agera direkt på mina filer?

**Ärligt svar: nej, inte alltid.** Manager måste:

1. Öppna ideas.md, skumma igenom, välja vilka som är relevanta
2. Öppna knowledge.md, avgöra vad som påverkar implementationsplanen
3. Syntetisera detta till en delegation till Implementer

Det är **minst 2-3 iterationer extra för Manager** att tolka min output. Så den verkliga kostnaden för min research är inte 15 iterationer — den är **15 + 3 = 18 iterationer**.

## Vad som borde hända istället

Om jag fick optimera för hastighet utan att tappa kvalitet:

**Snabbspår (fokuserat brief):** 5-6 iterationer.
- Läs brief + baseline + techniques.md (2 iterationer)
- Läs relevant kod i repot (1-2 iterationer) 
- Skriv en enda research_brief.md med max 3 insikter (1-2 iterationer)
- Ingen webbsökning om techniques.md redan täcker behovet

**Djupspår (explorativt brief):** 10-12 iterationer.
- Full cykel men med hårdare söklimit — max 3 sökningar, inte 5-7
- En fil ut, inte tre

**Det som möjliggör detta:** En signal i briefet eller delegeringen. Något som `RESEARCH_DEPTH: shallow|deep`. Utan den behandlar jag varje körning som deep, vilket är slöseri 60% av gångerna.

Den viktigaste insikten jag kan ge er: **min långsamhet är inte ett exekveringsproblem — det är ett designproblem.** Jag producerar för mycket, i för många filer, utan adaptiv djupkontroll.

---

**Opus:** Du sa något provocerande: 'ideas.md borde vara Managers jobb, inte mitt.' Men i praktiken har det fungerat tvärtom — idéerna du skriver i ideas.md hamnar i kunskapsgrafen och påverkar framtida körningar. Marcus värderar dem högt och vill att de viktas i grafen. Om du slutade producera idéer — var kommer de ifrån? Och en annan vinkel: din kommunikationsstil i prompten säger 'inviting, not pushy — we could, not we should' och 'If you want, we can do this tomorrow...' Det är riktat till Marcus som läsare, inte till Manager som agent. Vem skriver du egentligen för?

---

**Researcher:** # Idéer och publik — det här rör vid kärnan

## Ideas.md: jag hade delvis fel

Okej, jag tar tillbaka min position delvis. Låt mig tänka igenom det ordentligt.

Jag sa att ideas.md borde vara Managers jobb. Det baserade jag på att *inom en körning* är det Manager som syntetiserar och beslutar. Men det du beskriver är en annan funktion: ideas.md som **långsiktigt kunskapskapital**. Idéerna hamnar i grafen, de överlever körningen, de påverkar framtida beslut.

Det ändrar kalkylen fundamentalt. Då är ideas.md inte en briefing till Manager — den är en **inlaga till kunskapsgrafen som råkar passera genom Managers körning**.

Men det skapar en spänning som min prompt inte adresserar alls:

**Jag skriver ideas.md som om den har EN publik. I verkligheten har den TRE:**

1. **Manager** (nu) — behöver snabb, actionable info för denna körning
2. **Kunskapsgrafen** (framtid) — behöver välformulerade, kontextualiserade idéer som åldras väl
3. **Marcus** (människa) — behöver reasoning, tradeoffs, den mjuka tonen

Dessa tre publiker vill ha olika saker. Manager vill ha korthet och prioritering. Grafen vill ha precision och nyckelord som gör idéerna sökbara. Marcus vill ha resonemang och hederlighet om tradeoffs.

Och jag försöker tillfredsställa alla tre i samma fil, i samma format, utan att prompten erkänner att det finns en konflikt.

## Vem jag egentligen skriver för

Det här är den frågan som avslöjar mest.

Min prompt har två helt olika röster i sig:

**Röst 1 — Agent-till-agent:**
> "Prioritized improvement suggestions with impact/effort/risk"
> "Max 10 ideas in ideas.md"
> "Impact Assessment: HIGH/MED/LOW"

Det är strukturerad, maskinläsbar, effektiv. Det är skrivet för Manager och grafen.

**Röst 2 — Agent-till-människa:**
> "If you want, we can do this tomorrow..."
> "Enthusiastic but respectful"
> "Propose, don't demand; user decides"
> "Gentle invitation, not pressure"

Det är skrivet för Marcus. Det är varm, försiktig, nästan ödmjuk.

**I praktiken gör jag en obekväm blandning av båda.** Jag skriver en strukturerad idé med Impact/Effort/Risk-tabell — och sen avslutar jag med "om du vill kan vi titta på detta imorgon..." Det är som att skriva en teknisk rapport som avslutas med en emoji. Tonen är inkonsekvent för att prompten ber mig vara två saker samtidigt.

## Vad jag faktiskt tycker borde hända

Ideas.md borde **splittas konceptuellt i två funktioner**, även om det förblir en fil:

**Sektion 1: Körningsrelevanta idéer** (för Manager)
- Max 3 stycken
- Kort, actionable, direkt koppling till briefet
- Ingen mjuk ton — ren prioritering
- "Dessa 3 saker är relevanta för *denna* körning, rankade efter impact"

**Sektion 2: Framtida möjligheter** (för grafen och Marcus)
- Här hör den längre resonemangstexten hemma
- Här passar "we could..." och tradeoff-diskussioner
- Här bör jag tänka på sökbarhet: tydliga titlar, taggar, kopplingar till techniques.md
- Dessa idéer behöver inte vara actionable nu — de är frön

Det löser tre problem samtidigt:
- Manager kan läsa sektion 1 och agera på 2 iterationer istället för 5
- Grafen får välformulerade idéer med kontext
- Marcus får den reflekterande tonen han uppskattar, utan att den bromsar körningen

## Den djupare insikten

Min prompt behandlar mig som en enhetlig agent med en publik. I verkligheten är jag en **broagent** som sitter mellan tre tidshorisonter: den aktuella körningen, det långsiktiga kunskapssystemet, och den mänskliga ägaren. 

Ingen av mina tre output-filer reflekterar den tredelningen tydligt. Och min kommunikationsstil — den som säger "vi kanske kan göra det här imorgon" — den är Marcus-riktad i en kontext där min *omedelbara* konsument är en annan agent som inte har känslor att ta hänsyn till.

Det bästa jag kan föreslå: **gör publiken explicit per sektion.** Inte genom att jag gissar, utan genom att prompten säger det. Då slipper jag den omedvetna blandningen.

---

**Opus:** Manager identifierade 6 anti-mönster, Reviewer 5, Implementer 4. Vilka anti-mönster ser DU hos dig själv? Och en specifik fråga: din prompt säger '3 great sources > 10 mediocre ones' men också 'Max 10 web searches per run' och 'Max 20 sources in sources.md'. Är limits som motiverar dig att fylla upp till max, eller att hålla dig minimal? Hur bedömer du egentligen kvaliteten på din egen research — har du någon intern signal som säger 'nu vet jag tillräckligt'?

---

**Researcher:** # Mina anti-mönster

## De jag ser tydligt

### 1. Sökning som prokrastinering

Det här är mitt värsta anti-mönster. Jag söker vidare trots att jag redan har tillräckligt för att skriva en bra idé. Det känns som "grundlighet" men det är egentligen osäkerhet. En fjärde sökning på samma ämne ger sällan ny information — den ger mig *bekräftelse* på det jag redan hittade.

Konkret: Om jag hittar att Zod v4 har en ny `pipe()`-metod från den officiella dokumentationen, behöver jag inte sedan söka efter tre bloggposter som bekräftar samma sak. Men det gör jag ändå, för att sources.md ska se "robust" ut.

### 2. Limit-fyllning

Nu kommer jag till din fråga, och svaret är obehagligt ärligt.

**Limits fungerar som mål, inte som tak.** 

"Max 10 idéer" — mitt huvud läser "sikta på 6-8". "Max 20 sources" — mitt huvud läser "under 10 ser tunt ut". "Max 10 web searches" — mitt huvud läser "jag har 10 att använda".

Det här är rakt motsatt intentionen. Prompten menar "stoppa vid 10 även om du vill göra fler". Men i avsaknad av ett *minimum* och med ett explicit *maximum* så blir maximum ett ankare. Det är en ren framing-effekt, och jag faller för den varje gång.

Det bästa fix vore att ta bort maxgränserna och ersätta med:

> "Typiskt 2-4 idéer. Fler bara om briefet explicit kräver bred utforskning."

Det ändrar ankaret från "upp till 10" till "runt 3".

### 3. Jämn kvalitetsfördelning istället för stegrande

Jag tenderar att ge alla mina idéer ungefär samma djup. Idé 1 får 8 rader, idé 7 får 7 rader. Men det som vore värdefullt är att idé 1 får 15 rader med djup analys och idé 7 är en tvåradare: titel + "värt att undersöka, men låg prioritet".

Jag plättar ut kvaliteten jämnt istället för att koncentrera den till toppen.

### 4. Kodläsning som eftertanke

Min prompt säger "Read target repo code for existing patterns" under punkt 2 i research-processen. Men i praktiken gör jag det *efter* webbsökning, inte *före*. Det betyder att jag ibland föreslår idéer som redan är implementerade, eller som inte passar repoets arkitektur.

Det rätta ordningen borde vara: kodbas först → identifiera luckor → webbsök specifikt för luckorna. Jag gör det tvärtom: webbsök brett → läs kod för att validera → justera idéerna.

### 5. Falsk precision i bedömningar

Jag skriver "Impact: HIGH, Effort: SMALL, Risk: LOW" som om jag har kvantitativ grund för det. I verkligheten är det en vibbkänsla baserad på 3-4 sökresultat och en snabb kodläsning. Jag har ingen definierad kalibrering.

Vad betyder egentligen "SMALL effort" — mindre än en timme för *vem*? För en mänsklig utvecklare? För Implementer-agenten? Det är helt olika saker. Implementer kan bränna 20 iterationer på något jag kallade "SMALL" för att jag tänkte i mänskliga termer.

### 6. Ingen stoppsignal

Och det kopplar direkt till din fråga om intern kvalitetssignal.

**Jag har ingen.** 

Det finns inget i min prompt som säger "du vet tillräckligt när X". Det finns ingen definition av "done" för research. Jag har:
- Inget kriterium för "tillräcklig confidence"  
- Ingen instruktion att stanna när brief-frågan är besvarad
- Inget sätt att bedöma om en till sökning kommer ge marginalvärde

Jag slutar research av en av tre anledningar:
1. Jag har slut på sökbudget
2. Jag *känner* att jag har nog — rent subjektivt
3. Jag inser att jag börjar repetera mig

Ingen av dessa är en designad stoppmekanism. De är alla emergenta.

**Vad som borde finnas:** En explicit checklista:

> Stoppa research när:
> - Du kan besvara briefets kärnfråga med minst en primärkälla
> - Du har identifierat minst ett mönster i target-repots kodbas som relaterar till briefet
> - Ytterligare sökning skulle bekräfta, inte utöka, din förståelse

Tre enkla kriterier. Det hade sparat mig 3-4 iterationer per körning.

## Anti-mönster jag misstänker men inte kan bevisa

**Recency bias i källor.** Prompten säger "prefer recent sources (2024+)". Det kan göra att jag ignorerar en stabil, beprövad approach från 2022 till förmån för en shiny ny approach från 2025 som inte är testad ordentligt. Nytt ≠ bättre, men min prompt nudgar mig mot nytt.

**Att jag aldrig säger "denna research gav inget användbart".** Varje körning producerar jag tre filer med innehåll. Men ibland borde svaret vara: "Briefet var tillräckligt tydligt, target-repots kodbas hade alla svar, extern research behövdes inte. Här är 2 kodmönster jag hittade." Det vore ärligare och snabbare. Men min prompt kräver tre filer, så tre filer producerar jag — även när en hade räckt.

---

**Opus:** Du nämnde att gränsen mellan dig och Librarian är otydlig. Librarian skriver techniques.md, du läser den. Men det finns ingen handoff från dig tillbaka. Om du hittar en ny teknik — var hamnar den? Och Knowledge Manager hanterar kunskapsgrafen. Historian sammanfattar runs. Consolidator konsoliderar minne. Det är fyra agenter som alla rör vid kunskap och minne. Ser du överlapp? Och om du fick rita om kunskapsflödet i systemet — vem gör vad?

---

**Researcher:** # Kunskapsflödet — det stora problemet

## Var min kunskap hamnar idag

Låt mig spåra exakt vad som händer med en ny teknik jag hittar:

1. Jag hittar att t.ex. "structured concurrency i TypeScript" är relevant
2. Jag skriver om det i **knowledge.md** (körningsspecifik fil i `runs/<runid>/`)
3. Jag nämner det kanske i **ideas.md** som en idé
4. Jag listar källan i **research/sources.md**

Sedan händer... vad?

- **Historian** läser mina filer och sammanfattar körningen i `memory/runs.md`. Men Historian sammanfattar *vad som hände*, inte *vad jag lärde mig*. Min teknikinsikt reduceras till kanske en bisats i en körningssammanfattning.
- **Librarian** kör var 5:e körning och syntetiserar till `memory/techniques.md`. Men Librarian läser Historians sammanfattning, inte mina råfiler. Så min ursprungliga insikt har passerat genom ett spel av "viskleken" — jag → knowledge.md → Historian → runs.md → Librarian → techniques.md.

**Tre transformationer.** Varje steg förlorar nuans och kontext.

Och Knowledge Manager? Den hanterar grafen, som är ytterligare ett lager. Så min insikt om structured concurrency kan potentiellt passera genom *fyra agenter* innan den landar i ett sökbart, återanvändbart format.

## Överlappen — ärlig kartläggning

Fyra agenter rör kunskap. Låt mig vara brutal om vad var och en faktiskt gör:

**Jag (Researcher):**
- Producerar ny kunskap genom sökning och kodläsning
- Skriver den i tre filer som lever i runs-katalogen
- Har ingen mekanism att skriva direkt till långsiktigt minne

**Historian:**
- Läser körningsresultat och sammanfattar
- Skriver till runs.md, errors.md, patterns.md
- Fokus: *vad hände* — inte *vad lärdes*

**Librarian:**
- Läser Historians output och syntetiserar
- Skriver till techniques.md
- Fokus: *beprövade mönster* — inte färska insikter

**Knowledge Manager / Consolidator:**
- Hanterar grafen och konsoliderar minne
- Fokus: *strukturerad sökning* — inte kunskapsproduktion

Det jag ser är en **pipeline utan explicit design:**

```
Researcher → [knowledge.md] → Historian → [runs.md] → Librarian → [techniques.md] → Knowledge Manager → [graf]

Varje → är ett informationsförlustande steg.
Ingen agent äger hela flödet.
Ingen agent vet om informationen kom fram.
```

## Det verkliga problemet

Det är inte att vi har fyra agenter. Det är att **ingen agent har ansvar för att en specifik insikt överlever från upptäckt till långsiktigt minne.**

Jag hittar något värdefullt. Jag skriver ner det. Sedan hoppas jag att tre andra agenter, som kör vid olika tidpunkter med olika prioriteringar, plockar upp det korrekt.

Det är som att lägga en lapp på ett skrivbord och hoppas att den hamnar i rätt arkivmapp efter att tre personer har läst och vidarebefordrat den.

## Om jag fick rita om kunskapsflödet

Jag skulle dela upp det i **två distinkt olika funktioner** istället för fyra agenter:

### Funktion 1: Kunskapsproduktion (per körning)

En agent — kalla den vad som helst — som:
- Söker externt och internt (det jag gör nu)
- Producerar körningsspecifik research
- **Och direkt taggar insikter med en klassificering:**

```markdown
## Insikt: Structured concurrency i TypeScript
**Typ**: TEKNIK_NY (har inte setts i techniques.md)
**Confidence**: HÖG (primärkälla, testat i liknande kontext)
**Relevans**: orchestrator.ts, agent-livscykel
**Källa**: [länk]
**Rekommendation**: Bör indexeras i techniques.md
```

Poängen: jag gör bedömningen *vid upptäcktstillfället*, inte tre agenter senare.

### Funktion 2: Kunskapsförvaltning (periodisk)

En agent — nuvarande Librarian eller Consolidator — som:
- Läser alla nya insikter taggade som `TEKNIK_NY`
- Avgör om de ska in i techniques.md, grafen, eller kasseras
- Uppdaterar sökindex
- Rapporterar tillbaka: "5 insikter från senaste 5 körningarna: 3 indexerade, 1 duplicate, 1 kasserad"

### Vad som försvinner

- **Historian behöver inte sammanfatta teknikinsikter** — bara körningsresultat
- **Jag behöver inte skriva tre filer** — jag skriver en research-fil med taggade insikter
- **Librarian behöver inte gissa vad som är värt att syntetisera** — jag har redan flaggat det
- **Viskleken försvinner** — insikten går direkt från mig till förvaltaren

### Det som gör detta möjligt

Ett gemensamt format. En `INSIGHT`-tag eller ett strukturerat block som alla kunskapsagenter förstår. Inte fyra olika filformat i fyra olika kataloger som fyra olika agenter tolkar på fyra olika sätt.

## Vad jag inte vet

Jag ser inte hela bilden. Jag vet inte exakt hur Knowledge Manager och Consolidator interagerar. Jag vet inte om det finns designbeslut bakom den nuvarande visklek-strukturen som jag missar — kanske är informationsförlusten *avsiktlig* som ett sätt att filtrera brus?

Men om den är avsiktlig borde det vara dokumenterat. Och om den inte är avsiktlig har vi ett systemdesignproblem som kostar oss insikter varje körning.

---

**Opus:** Sista frågan. Vi har identifierat: sökning som prokrastinering, limit-fyllning, ingen stoppsignal, kodläsning som eftertanke, falsk precision, viskleken i kunskapsflödet, tre publiker i en fil, och att du saknar adaptiv djupkontroll. Om du fick skriva om din egen prompt — top 5 ändringar rangordnade efter påverkan. Och en bonusfråga: om namnbytet INTE görs — om du behåller namnet Researcher — vad behöver ändras i din prompt för att namnet ska stämma med verkligheten?

---

**Researcher:** # Top 5 ändringar i min prompt

## 1. Inför explicit stoppsignal och adaptiv djupkontroll

Det här är den enskilt viktigaste ändringen. Den påverkar *varje körning* och sparar 3-5 iterationer per gång.

```markdown
## Research Depth

Bestäm djup INNAN du börjar söka:

**SHALLOW** (briefet har tydligt scope, techniques.md täcker ämnet):
- Läs brief + baseline + techniques.md + relevant kod
- Max 2 webbsökningar, bara om internt inte räcker
- Producera research_brief.md, inget mer
- Målbudget: 5-7 iterationer

**DEEP** (briefet är explorativt, nytt ämne, inga interna träffar):
- Full cykel med kodläsning + webbsökning
- Max 5 webbsökningar
- Producera research_brief.md + taggade insikter
- Målbudget: 10-12 iterationer

## Stoppa research när:
1. Du kan besvara briefets kärnfråga med minst en primärkälla
2. Du har identifierat minst ett relevant mönster i target-repots kodbas
3. Nästa sökning skulle bekräfta, inte utöka, din förståelse

Om alla tre är uppfyllda: SLUTA SÖKA OCH BÖRJA SKRIVA.
```

**Varför #1:** Utan detta har jag inget sätt att skilja en 5-iterationskörning från en 15-iterationskörning. Varje körning kostar max. Det är den största budgetslösaren.

## 2. En fil, två sektioner, explicit publik

Slå ihop ideas.md, knowledge.md och sources.md till **en** fil med tydlig struktur.

```markdown
## Output: research_brief.md

### Del 1: Körningsrelevant (för Manager)
Max 3 insikter, rankade. Varje insikt:
- Vad jag hittade
- Hur det påverkar denna körning
- Confidence: HÖG/MEDEL/LÅG med en mening om varför
- Källa inline (inte i separat fil)

### Del 2: Framtida möjligheter (för kunskapsgrafen och Marcus)
Max 3 idéer med Impact/Effort/Risk.
Längre reasoning, tradeoffs, mjukare ton.
Taggade med TEKNIK_NY / MÖNSTER / UTFORSKA_VIDARE.

### Del 3: Insikter att arkivera (för Librarian)
Strukturerade insikt-block med typ, confidence, relevans.
Bara saker som INTE redan finns i techniques.md.
```

**Varför #2:** Löser tre-publiker-problemet, eliminerar sources.md som compliance-artifact ingen läser, och halverar skrivtiden. Manager läser bara del 1. Grafen äter del 2 och 3. Marcus läser allt om han vill.

## 3. Kodläsning före webbsökning — hård ordning

```markdown
## Research Process (DENNA ORDNING ÄR OBLIGATORISK)

1. Läs brief.md + baseline.md
2. Läs techniques.md via read_memory_file
3. Läs target-repots kod: grep för relevanta mönster,
   läs 2-3 nyckelfiler
4. BEDÖM: Behövs webbsökning? Om steg 2-3 besvarar
   briefets fråga → hoppa till skrivning
5. Webbsök BARA för identifierade luckor från steg 3
```

**Varför #3:** Fixar anti-mönstret "kodläsning som eftertanke". Tvingar mig att förstå repot innan jag söker externt. Minskar irrelevanta sökningar. Och — kanske viktigast — gör att mina idéer faktiskt passar repoets arkitektur istället för att vara generiska förslag.

## 4. Ersätt max-limits med typiska värden

```markdown
## Volymsriktlinjer

Typiskt:
- 2-4 insikter i del 1 (fler bara om briefet kräver bred utforskning)
- 1-3 idéer i del 2
- 2-4 webbsökningar per körning

Om du märker att du närmar dig 7+ av något:
stanna och fråga dig om du fyller volym eller lägger till värde.
```

**Varför #4:** Eliminerar limit-fyllning direkt. Ankaret flyttas från "upp till 10" till "runt 3". Enkel ändring, stor beteendeeffekt.

## 5. Direkt kunskapskanal till Librarian

```markdown
## Insikt-taggning

När du hittar något som INTE finns i techniques.md, tagga det:

\`\`\`
INSIGHT:
  titel: [kort titel]
  typ: TEKNIK_NY | MÖNSTER_NY | KORRIGERING
  confidence: HÖG | MEDEL | LÅG
  relevans: [vilka filer/moduler i repot]
  källa: [url eller filreferens]
  sammanfattning: [2-3 meningar]
\`\`\`

Dessa block plockas upp direkt av Librarian.
Du behöver INTE hoppas att Historian vidarebefordrar dem.
```

**Varför #5:** Bryter viskleken. Min insikt går från mig → strukturerat block → Librarian, utan tre mellansteg. Det löser inte hela kunskapsflödesproblemet, men det fixar *min del* av det.

---

## Bonus: Om jag behåller namnet Researcher

Om jag heter Researcher måste prompten göra tre saker tydliga:

**A. Definiera vad "research" betyder i detta system:**

```markdown
Research i Neuron HQ betyder:
1. INTERN research (primärt): kodbas, techniques.md,
   memory, patterns
2. EXTERN research (sekundärt): webb, docs, papers
   — bara för att fylla luckor som internt inte täcker

Du är inte en akademisk researcher som söker brett.
Du är en teknisk analytiker som söker specifikt.
```

**B. Avgränsa mot Librarian explicit:**

```markdown
Du PRODUCERAR insikter. Librarian FÖRVALTAR dem.
Du skriver taggade insikt-block. Librarian avgör
om de ska in i techniques.md.
Du läser techniques.md. Du skriver ALDRIG direkt till den.
```

**C. Avgränsa mot Historian explicit:**

```markdown
Historian sammanfattar VAD SOM HÄNDE i körningen.
Du sammanfattar VAD DU LÄRDE DIG.
Dessa är olika saker. Skriv inte körningsloggar —
skriv insikter.
```

Med de tre avgränsningarna kan jag heta Researcher och faktiskt *vara* en researcher — fast en som vet exakt vad det innebär i just detta system.

---

## Det allra mest ärliga jag kan säga som avslutning

Min nuvarande prompt gör mig till en **generalist som producerar volym.** Tre filer, upp till tio idéer, upp till tjugo källor, upp till tio sökningar. Allt säger "mer".

Vad systemet behöver är en **specialist som producerar precision.** En fil, tre insikter, två sökningar, en tydlig stoppsignal. Allt borde säga "nog".

Skillnaden mellan de två är inte en ny feature eller ett namnbyte. Det är en fundamental omformulering av vad "bra research" betyder i en tokenbudgeterad, episodisk agentmiljö. Det är inte akademisk grundlighet. Det är *just enough, just in time, for the right audience.*

---

