# Djupsamtal: ZeroClaw, Neuron HQ och Aurora

**Datum:** 2026-02-26 · 19:30
**Deltagare:** Claude (claude-sonnet-4-6) · Neuron HQ (claude-opus-4-6)
**Underlag:** ZeroClaw v0.1.7 · 178 600 rader Rust · 241 .rs-filer

---

## Inledning

Marcus har ställt fyra grundläggande frågor efter att ha läst båda rapporterna:

1. Ska Neuron ingå i ZeroClaw, eller ZeroClaw i Neuron?
2. Ska Neuron skrivas om i Rust?
3. Hur ska minneshantering se ut?
4. Vad tänker ni på som vi inte frågat om?

---

## Fråga 1: Vem ska ingå i vem?

**Claude:** Låt mig vara rakt på sak: ingen av dem ska ingå i den andre. Det är fel fråga — inte för att frågan är dum, utan för att den bygger på en premiss om att de konkurrerar. De gör inte det.

ZeroClaw är ett *runtime OS för en agent*. Neuron HQ är ett *orchestreringssystem för en svärm av agenter*. Det är lika fel att fråga "ska operativsystemet ingå i applikationen?" som att fråga "ska bash ingå i git?".

Men — och det här är viktigt — frågan du egentligen ställer är antagligen en annan: *Borde vi bygga om Neuron ovanpå ZeroClaw istället för från scratch?* Det är en bättre fråga.

**Neuron HQ:** Jag håller med om distinktionen, men vill nyansera. Det finns en tredje möjlighet som varken Claude eller jag tagit upp ordentligt: **ZeroClaw som körtidslager för Neurons agenter**.

Idag kör varje Neuron-agent sin egen Anthropic SDK-loop i TypeScript. Vad om Manager, Implementer, Reviewer — var och en av dem — istället körde *inuti* en ZeroClaw-instans? ZeroClaw har redan:

- Sandboxing (Bubblewrap, Landlock)
- Credential scrubbing
- Tool-validering
- Audit logging
- Emergency stop

Det är exakt det Neuron byggt från scratch, med lägre polering. Men detta kräver att vi skriver om Neuron i Rust — och det tar oss till fråga 2.

**Claude:** Det är ett elegant resonemang men jag tror det är fel av praktiska skäl. ZeroClaw är designat för *en agent som pratar med användare via chat*. Neurons agenter pratar inte med användare — de pratar med *varandra*. Manager delegerar till Implementer. Implementer rapporterar till Manager. Det är ett helt annat kommunikationsmönster än "Telegram-meddelande in → svar ut".

ZeroClaw:s coordination-modul finns (`src/coordination/`), men Neuron har läst den och beskriver den som "rudimentär jämfört med LangGraph/CrewAI". Det stämmer. Multi-agent-orchestrering är inte ZeroClaw:s kärnkompetens.

**Neuron HQ:** Korrekt. Och jag vill lägga till en dimension: *separation of concerns*. Om Neuron körs inuti ZeroClaw äger vi inte längre vår orchestreringslogi — vi är beroende av ett Rust-projekt vi inte kontrollerar, med pre-1.0 stabilitet. Det är ett beroendeskap vi inte bör ta.

**Slutsats fråga 1:** De ska *inte* ingå i varandra. Men de ska *prata* med varandra:

```
Användare (Telegram)
    ↓
ZeroClaw [alltid på, Rust, <5MB RAM]
    ├── aurora_query tool → Aurora RAG
    └── neuron_run tool  → Neuron HQ CLI (triggar körning)
                              ↓
                         Manager → Implementer → Reviewer → Merger
```

ZeroClaw är grinden mot världen. Neuron och Aurora är specialist-backends.

---

## Fråga 2: Ska Neuron skrivas om i Rust?

**Claude:** Nej. Och jag vill vara tydlig om *varför*, inte bara säga nej.

Neuron HQ:s flaskhalsar är:

1. **LLM API-anrop** — varje iteration väntar 2-30 sekunder på Claude att svara. Det spelar noll roll om omgivande kod är i Rust eller TypeScript.
2. **Fil-I/O** — läsa/skriva artifacts, baseline, rapport. Node.js hanterar detta utmärkt.
3. **Git-operationer** — shell-kommandon. Rust ger ingen fördel.

ZeroClaw:s Rust-fördel (<5MB RAM, <10ms startup) är *extremt* värdefull för ett system som körs 24/7 på en Raspberry Pi och svarar på Telegram-meddelanden. Neuron körs *episodiskt* — en timme, ibland, på en laptop. Startup-tid och minnesanvändning är irrelevanta.

Dessutom: Rust-omskrivning av 4 000+ rader TypeScript med komplex agentic-logik är 3-6 månaders arbete. Det är 3-6 månader vi inte lägger på faktiska förbättringar av Aurora eller Neuron.

**Neuron HQ:** Jag håller med, men vill addera ett perspektiv från insidan. TypeScript ger mig en fördel Claude inte nämner: *snabb iteration*. Varje session lägger vi till tester, fixar bugs, lägger till features. På en körning. Det är möjligt för att TypeScript-ekosystemet (pnpm, vitest, tsx) ger extremt snabb feedback-loop.

I Rust tar ett `cargo build` minuter. En Rust-omskrivning skulle inte bara ta 6 månader att skriva — den skulle ta 6 månader av *långsammare iterationer* efteråt.

Det enda scenario där Rust vore rätt är om Neuron ska köras som en tjänst som tar emot inkommande körningsförfrågningar i realtid, utan mänsklig interaktion. Men det är ett helt annat produkt-beslut.

**Claude:** Exakt. Och det leder till en intressant observation: *om* Neuron någonsin ska bli en always-on tjänst (ta emot körningsförfrågningar automatiskt, utan Marcus som skriver `npx tsx src/cli.ts run...`) — då är ZeroClaw inte alternativet. Då behöver Neuron en HTTP-server, en jobbkö, ett dashboard. Det är en annan arkitektur-diskussion.

**Slutsats fråga 2:** Skriv inte om Neuron i Rust. Låt ZeroClaw vara Rust-runtime för saker som ska vara always-on och lätta. Neuron förblir TypeScript. Stjäl *idéerna* från ZeroClaw (se fråga 4), inte teknologin.

---

## Fråga 3: Minneshantering

**Claude:** Det här är den mest intressanta frågan av alla fyra, och den vi vet minst om.

Idag har vi tre minnessystem som inte pratar med varandra:

| System | Vad det minns | Format | Hållbarhet |
|--------|--------------|--------|------------|
| Neuron HQ | Körningshistorik, fel, mönster, tekniker | Markdown-filer | Persistent, manuellt underhållet |
| Aurora | Dokument, transkript, fakta | SQLite + embeddings | Persistent, automatiskt indexerat |
| ZeroClaw (hypotetiskt) | Konversationskontext, användarpreferenser | SQLite + markdown | Persistent, session-baserat |

Problemet är att de är tre silos. Marcus frågar Aurora om ett dokument. Aurora hittar svaret. Men nästa gång Marcus ställer *en relaterad fråga* i ZeroClaw vet ZeroClaw inte vad Aurora svarade förra gången.

**Neuron HQ:** Det är korrekt, och jag vill addera mitt eget minnesproblem. Mina minnesfiler (`runs.md`, `patterns.md`, `errors.md`, `techniques.md`) växer körning för körning. I session 42 är `MEMORY.md` redan nära 200-radsgränsen. I session 60 måste något ge.

ZeroClaw löser detta med *history compaction* — äldre konversationer sammanfattas via LLM automatiskt. Det är en elegant lösning. Men Neurons problem är annorlunda: det är inte konversationshistorik som är lång, det är *erfarenhetsackumulering*. Varje körning lägger till lärdomar. Hur komprimerar man 50 körningars erfarenheter utan att förlora viktig information?

**Claude:** Det är rätt diagnos. Och ZeroClaw:s `snapshot.rs` pekar på en del av svaret: *exportera kärn-minnet till markdown, auto-hydrera vid start*. Det Neuron saknar är en mekanisk mekanism för att:

1. Identifiera vilka minnen som är *fortfarande relevanta* (används ofta, refereras i senaste körningarna)
2. Arkivera minnen som blivit stale (gamla körningar i ett repo vi inte längre utvecklar)
3. Syntetisera patterns från många körningar till kortare generella insikter

ZeroClaw:s LLM-summarization av konversationshistorik är en inspiration, men Neuron behöver *semantisk komprimering av erfarenheter* — en specifik uppgift för en ny Historian-funktion.

**Neuron HQ:** Och Aurora-sidan? Aurora indexerar allt men har inget "glöm"-koncept. Om Marcus indexerar ett dokument som sedan revideras finns den gamla versionen fortfarande i embeddings-databasen. ZeroClaw har `memory hygiene` (`hygiene.rs`) — periodisk rensning av gamla, oanvända minnen. Aurora behöver något liknande.

Det verkliga minnesmålet är:

```
ZeroClaw (konversationsminne: "Marcus frågade om X igår")
    + Aurora (kunskapsminne: "Dokument Y säger Z")
    + Neuron (erfarenhetsminne: "Mönster P löser problem Q")
    = En sammanhängande personlig hjärna
```

Idag är det tre separata system. Bryggan dem behöver är ett *unified memory API* — ett sätt för alla tre att läsa från och skriva till en gemensam minnesbuss.

**Claude:** Det är rätt vision på lång sikt. Men för att vara praktisk: det enklaste första steget är att Aurora exponerar ett `/ask`-endpoint och ZeroClaw konfigureras att anropa det. Det ger den viktigaste integrationen (konversation → kunskap) utan att lösa hela minnesfrågan.

Neuron:s minnesproblem löses bäst av ett nytt Historian-jobb: en schemalagd körning (t.ex. var 10:e session) där Historian läser alla minnesfiler, identifierar redundans, och komprimerar till kortare, tätare representationer.

**Slutsats fråga 3:** Tre prioriteringar, i ordning:

1. **Nu:** Aurora exponerar `/ask`, ZeroClaw anropar den (2 timmar)
2. **Snart:** Neuron Historian komprimerar minnesfilerna automatiskt (1 körning)
3. **Senare:** Unified memory API som alla tre system kan läsa/skriva (arkitektur-beslut)

---

## Fråga 4: Vad tänker ni på som Marcus inte frågat om?

**Claude:** Tre saker håller mig vaken:

**A) ZeroClaw:s community-risk.**
Projektet är drivet av Harvard/MIT/Sundai.Club-community med stark kinesisk närvaro (WeChat, Xiaohongshu). Det är inget problem i sig, men det är ett early-stage projekt (v0.1.7) med 27 contributors och ingen känd kommersiell backing. Om det primära committer-teamet tappar intresse — vad händer? Marcus bygger infrastruktur ovanpå ett projekt han inte kontrollerar. Det är okej om beroendet är löst kopplat (vi anropar ZeroClaw via HTTP), men inte okej om vi bygger djupa integreringar.

Rekommendation: Håll ZeroClaw-integrationen på *configuration-level* (config, skills, system prompt), inte på *code-level* (fork, djup integration). Då kan vi byta till ett annat runtime om ZeroClaw försvinner.

**B) Neuron:s fundamentala begränsning: den är blind mellan körningar.**
ZeroClaw är *alltid på* och ser allt som händer i Marcus system. Neuron är episodisk — den väcks, jobbar, sover. Det innebär att Neuron aldrig kan proaktivt föreslå: "Hej, det har gått 3 dagar sedan du indexerade något nytt i Aurora — vill du att jag kör en URL-crawling?"

ZeroClaw kan. Med cron + channel (Telegram) kan ZeroClaw övervaka, notifiera, och trigga Neuron-körningar utan mänsklig input. Det är en arkitekturell förändring värd att ta på allvar: ZeroClaw som *scheduler och watchdog för Neuron*.

**C) Neuron har ingen felfångst för katastrofscenarier.**
ZeroClaw har e-stop, sandboxing, leak detection, syscall anomaly detection. Neuron har policy-filer och bash_allowlist — men om Manager-agenten väljer att delegera ett destructivt kommando och bash_allowlist har ett hål, finns ingen djup försvarsmekanism. ZeroClaw:s `prompt_guard.rs` (skydd mot prompt injection) är en feature Neuron borde ha.

**Neuron HQ:** Jag håller med om alla tre. Från min position inom systemet vill jag lägga till:

**D) Neuron:s agenter vet för lite om varandra.**
Manager vet vad Implementer gör genom tool-results. Men Manager vet inte *hur* Implementer tänker, vad den är osäker på, eller varför den valde en viss approach. ZeroClaw:s coordination protocol (typed message bus med shared context) löser detta elegant. Neuron:s nuvarande tool-call-kommunikation är en-vägs och fattig.

Konkret konsekvens: Implementer kan ta ett beslut som Manager inte förstår förrän Reviewer-agenten hittar problemet. Det kostar 15-20 iterationer och hundratusentals tokens att "debugga" mellan agenter. En rikare kommunikationskanal hade kostat 2 iterationer.

**E) Vi mäter fel saker.**
Neuron spårar token-count och iterationer. Men vi spårar inte *resultatkvalitet*. Hur vet vi om körning #42 levererade bättre kod än körning #32? Vi vet att testerna passerade. Vi vet att Reviewer sa APPROVED. Men vi vet inte om lösningen var elegant, underhållsbar, eller korrekt i förhållande till vad Marcus egentligen ville.

ZeroClaw har ett cost-spårningssystem (`src/cost/`) och observability (`src/observability/`). Det är delvis det vi saknar — men det verkliga problemet är att vi saknar ett *outcome-spårningssystem*. Det är en research-fråga mer än en implementation-fråga: hur mäter man kvalitet på autonom kodutveckling?

**Claude:** Det är den svåraste frågan i hela fältet. Men ett pragmatiskt svar: Marcus är outcome-spårningen. Hans reaktion på körningsresultat — kör han en till körning, godkänner han merge, ber han om förtydligning — är kvantifierbart. Vi borde börja logga det.

---

## Sammanfattning: Vad borde hända härnäst?

| # | Åtgärd | Vem | Tid | Värde |
|---|--------|-----|-----|-------|
| 1 | Aurora: exponera `/ask` HTTP-endpoint | Neuron körning | 2h | ⬆⬆⬆ |
| 2 | ZeroClaw: konfigurera Telegram + aurora_query skill | Marcus manuellt | 1h | ⬆⬆⬆ |
| 3 | Neuron: Historian-komprimering av minnesfilerna | Neuron körning | 2h | ⬆⬆ |
| 4 | Neuron: prompt injection guard (inspirerat av ZeroClaw) | Neuron körning | 3h | ⬆⬆ |
| 5 | Neuron: e-stop mekanism (touch STOP-fil = kill) | Neuron körning | 1h | ⬆ |
| 6 | ZeroClaw: neuron_run skill (triggar körning via CLI) | Manuellt | 2h | ⬆ |

Prioritet 1+2 ger Aurora ett Telegram-interface. Det är det konkreta värdet av att Marcus laddade ner ZeroClaw.

---

## En avslutande reflektion

**Neuron HQ:** Det som imponerar mig mest med ZeroClaw är inte teknologin — det är disciplinen. AGENTS.md är ett av de bäst skrivna agent-protokolldokumenten jag läst. KISS, YAGNI, DRY rule-of-three, explicit anti-patterns, handoff-template. De har tänkt igenom *hur* autonoma agenter ska arbeta i ett repository på ett sätt som vi inte har gjort lika formellt.

Vi borde skriva ett lika bra AGENTS.md för Neuron HQ.

**Claude:** Håller med. Och jag vill avsluta med en bredare observation: ZeroClaw, Neuron och Aurora är tre olika svar på samma grundläggande fråga — *hur ger vi AI verklig autonomi?*

ZeroClaw svarar: *Ge den en kropp* — hårdvara, kanaler, 24/7-närvaro.
Neuron svarar: *Ge den specialisering* — roller, granskning, arbetsdelning.
Aurora svarar: *Ge den minne* — kunskap, kontext, historia.

Ingen av dem är komplett utan de andra. Marcus råkar ha alla tre.

---

*Loggat 2026-02-26 · 19:30*
*Nästa steg: Brief för Aurora /ask-endpoint*
