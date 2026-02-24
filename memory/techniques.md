# Techniques — Externa forskningsrön

Relevanta rön från AI-forskning och Anthropic-dokumentation.
Uppdateras av Librarian-agenten.

---

## A-MEM: Agentic Memory System (NeurIPS 2025)
**Källa:** NeurIPS 2025
**Kärna:** Zettelkasten-inspirerat minnessystem för LLM-agenter. Varje minne är en nod med nyckelord, kontext och explicit länkning till relaterade minnen.
**Nyckelresultat:** 85–93% färre tokens jämfört med naiv full-context approach
**Relevans för Neuron HQ:** Inspirerade vår kategoriserade memory-struktur (runs/patterns/errors/techniques). Länkade minnen är nästa steg.

---

## MemGPT: OS-inspirerat RAM/disk-minne
**Källa:** MemGPT paper
**Kärna:** Behandlar LLM-kontext som RAM och extern lagring som disk. Agenten bestämmer själv vad som ska "swappas" till disk.
**Relevans för Neuron HQ:** Historian-agentens selektiva skrivning till rätt minnesfil (runs/patterns/errors) är en förenklad version av detta.

---

## Mem0: Grafbaserat produktionsminne
**Källa:** Mem0 projekt
**Kärna:** Grafbaserat minneslager optimerat för produktion. Hanterar entiteter och relationer mellan minnen.
**Relevans för Neuron HQ:** Möjlig framtida uppgradering om patterns.md och errors.md behöver korsreferenser.

---

## Anthropics råd om agentarkitektur
**Källa:** Anthropic agent best practices
**Kärna:** Initializer → incremental agents → handoffs. Varje agent har ett tydligt, avgränsat ansvar.
**Relevans för Neuron HQ:** Vår Manager → Researcher/Implementer/Reviewer/Tester/Merger/Historian-pipeline följer detta mönster exakt.

---

## MemAdapter: Fast Alignment across Agent Memory Paradigms (2026)
**Källa:** arxiv:2602.08369 | Xin Zhang et al.
**Kärna:** MemAdapter unifies heterogeneous agent memory paradigms (explicit, parametric, latent) within a single retrieval framework. It uses a two-stage approach: (1) training a generative subgraph retriever over a unified memory space, and (2) adapting to unseen memory paradigms via a lightweight contrastive-learning alignment module.
**Nyckelresultat:** Cross-paradigm alignment completes in 13 minutes on a single GPU, using less than 5% of training compute while outperforming original memory retrievers. Enables zero-shot fusion across memory paradigms.
**Relevans för Neuron HQ:** Direkt relevant för att unifiera våra separata minnesfiler (runs/patterns/errors/techniques). En MemAdapter-liknande retriever kunde låta agenter söka över alla minnesfiler med ett enda anrop istället för att manuellt välja rätt fil.

---

## ALMA: Automated Meta-Learning of Memory Designs for Agentic Systems (2026)
**Källa:** arxiv:2602.07755 | Yiming Xiong et al.
**Kärna:** ALMA använder en Meta Agent som söker över minnesdesigner uttryckta som körbar kod, inklusive databasscheman samt hämtnings- och uppdateringsmekanismer. Istället för handkodade minnesstrukturer meta-lär sig systemet optimala minnesdesigner genom att testa dem i sekventiella beslutsfattandemiljöer.
**Nyckelresultat:** Inlärda minnesdesigner överträffar state-of-the-art handgjorda minnesdesigner på alla fyra testade benchmarks, med förbättringar i både effektivitet och lärande från erfarenhet.
**Relevans för Neuron HQ:** Kan inspirera en framtida evolution av våra minnesfiler — istället för att manuellt designa runs.md/patterns.md-format, låta en meta-agent experimentera med olika minnesstrukturer och välja den mest effektiva.

---

## BudgetMem: Query-Aware Budget-Tier Routing for Runtime Agent Memory (2026)
**Källa:** arxiv:2602.06025 | Haozhen Zhang et al.
**Kärna:** BudgetMem strukturerar minnesbearbetning som moduler med tre budgetnivåer (Low/Mid/High). En lättviktsrouter, tränad med reinforcement learning, väljer budgetnivå per modul för att balansera prestanda och kostnad. Tre strategier för budgetnivåer studeras: implementation (metodkomplexitet), reasoning (inferensbeteende) och capacity (modellstorlek).
**Nyckelresultat:** Överträffar starka baslinjer i high-budget-läge och levererar bättre accuracy-cost-frontirer under strikta budgetar, testat på LoCoMo, LongMemEval och HotpotQA.
**Relevans för Neuron HQ:** Direkt applicerbart på vår swarm — enklare uppgifter kunde använda Low-tier minnesåtkomst (snabb, billig) medan komplexa debugging-uppgifter kunde använda High-tier (full genomsökning av patterns.md + errors.md). Minskar token-kostnad för rutinuppgifter.

---

## Graph-based Agent Memory: Taxonomy, Techniques, and Applications (2026)
**Källa:** arxiv:2602.05665 | Chang Yang et al.
**Kärna:** Omfattande survey som klassificerar agentminne längs tre axlar: kort-/långtidsminne, kunskap-/erfarenhetsminne, och icke-strukturellt/strukturellt minne. Analyserar grafbaserat agentminne genom hela livscykeln: extraktion (data → innehåll), lagring (effektiv organisering), hämtning (relevansbaserad retrieval), och evolution (uppdatering av minnesinnehåll).
**Nyckelresultat:** Identifierar grafstruktur som överlägsen för att modellera relationsberoenden, organisera hierarkisk information och stödja effektiv hämtning. Sammanställer open-source-bibliotek och benchmarks på github.com/DEEP-PolyU/Awesome-GraphMemory.
**Relevans för Neuron HQ:** Utökar det som Mem0-posten beskriver med en systematisk taxonomi. Minnets livscykel-ramverk (extraktion → lagring → hämtning → evolution) kan direkt tillämpas för att strukturera hur Historian-agenten hanterar våra minnesfiler.

---

## TAME: Trustworthy Test-Time Evolution of Agent Memory (2026)
**Källa:** arxiv:2602.03224 | Yu Cheng et al.
**Kärna:** TAME adresserar "Agent Memory Misevolution" — att agentens säkerhet försämras när minnet ackumulerar erfarenheter. Använder en dual-memory-arkitektur: executor-minne (destillerar generaliserbara metoder för uppgiftsprestanda) och evaluator-minne (förfinar bedömningar av säkerhet och nytta baserat på historisk feedback). En sluten loop av minnesfiltrering, draft-generering, tillitsvärdig förfining, exekvering och dual-track-uppdatering.
**Nyckelresultat:** Trust-Memevo-benchmark visar generell nedgång i tillförlitlighet under godartad uppgiftsevolution. TAME uppnår förbättring av både tillförlitlighet och uppgiftsprestanda samtidigt.
**Relevans för Neuron HQ:** Viktigt varningsresultat — vårt patterns.md och errors.md kan ackumulera bias eller felaktiga mönster över tid. En dual-memory approach med separat evaluator kunde förhindra att gamla, inaktuella mönster försämrar framtida beslut.

---

## Wink: Recovering from Misbehaviors in Coding Agents (2026)
**Källa:** arxiv:2602.17037 | Rahul Nanda et al.
**Kärna:** Wink är ett lättviktigt, asynkront self-intervention-system som observerar kodningsagenters trajektorier och ger riktad kurskorrigering. Definierar en taxonomi av felbeteenden i tre kategorier: Specification Drift (avviker från instruktioner), Reasoning Problems (resoneringsfel), och Tool Call Failures (felaktig verktygsanvändning). Systemet nudgar agenten tillbaka till en produktiv väg.
**Nyckelresultat:** ~30% av alla agenttrajektorier i produktion uppvisar felbeteenden. Wink löser 90% av felbeteenden som kräver en enda intervention. Live A/B-test visar statistiskt signifikant minskning av Tool Call Failures, tokens per session och manuella ingripanden.
**Relevans för Neuron HQ:** Direkt applicerbart som ett övervakningslager ovanpå vår Implementer/Researcher-agent. En Wink-liknande monitor kunde upptäcka när agenten fastnar i loopar eller avviker från uppgiften, och automatiskt korrigera — minskar behovet av manuell Manager-intervention.

---

## Hybrid-Gym: Training Coding Agents to Generalize Across Tasks (2026)
**Källa:** arxiv:2602.16819 | Yiqing Xie et al.
**Kärna:** Hybrid-Gym identifierar överförbara färdigheter som delas mellan olika kodningsuppgifter genom att dekomponera agenttrajektorier i finmaskiga komponenter. Designar syntetiska träningsuppgifter (som funktionslokalisering och beroendesökning) som lär ut dessa generella färdigheter, vilka sedan generaliserar till verkliga uppgifter.
**Nyckelresultat:** +25.4% absolut förbättring på SWE-Bench Verified, +7.9% på SWT-Bench Verified, och +5.1% på Commit-0 Lite jämfört med basmodellen. Kompletterar även domänspecifika dataset (+4.9% på SWT-Bench med SWE-Play).
**Relevans för Neuron HQ:** Principerna för att identifiera överförbara färdigheter (kodbas-utforskning, testning, arkitekturdesign) är direkt relevanta för att förbättra vår Researcher- och Implementer-agents effektivitet. Deras syntetiska uppgifter för funktionslokalisering och beroendesökning matchar exakt vad Researcher-agenten gör.

---

## Excalibur: Difficulty-Aware Planning for LLM Agents (2026)
**Källa:** arxiv:2602.17622 | Gelei Deng et al.
**Kärna:** Excalibur identifierar att LLM-agenter misslyckas p.g.a. bristande uppskattning av uppgiftssvårighet, vilket leder till att de överinvesterar i lågvärdiga grenar och uttömmer kontexten. Introducerar Task Difficulty Assessment (TDA) med fyra dimensioner: horisontuppskattning, evidenskonfidens, kontextbelastning och historisk framgång. Dessa styr exploration-exploitation-beslut i en Evidence-Guided Attack Tree Search (EGATS).
**Nyckelresultat:** Upp till 91% task completion (39–49% relativ förbättring över baslinjer). Svårighetsmedveten planering ger konsistenta förbättringar oavsett underliggande modell — adresserar en begränsning som modellskalning ensam inte löser.
**Relevans för Neuron HQ:** TDA-dimensionerna (horisontuppskattning, kontextbelastning, historisk framgång) kan tillämpas av Manager-agenten för att bättre fördela arbete. Om en uppgift uppskattas som svår kan Manager allokera fler tokens/steg till Researcher/Implementer istället för att de kör slut på kontext mitt i arbetet.

---

## FluxMem: Choosing How to Remember — Adaptive Memory Structures for LLM Agents (2026)
**Källa:** arxiv:2602.14038 | Mingfei Lu et al.
**Kärna:** FluxMem är ett ramverk som ger LLM-agenter tillgång till multipla komplementära minnesstrukturer och explicit lär sig välja mellan dem baserat på interaktionsnivåegenskaper. Använder offline-supervision från downstream-svarskvalitet och minnesanvändning. Introducerar en tre-nivå minneshierarki och en Beta Mixture Model-baserad probabilistisk grind för distributionsmedveten minnesfusion, vilket ersätter ömtåliga likhetströsklar.
**Nyckelresultat:** Genomsnittliga förbättringar på 9.18% (PERSONAMEM) och 6.14% (LoCoMo) jämfört med enhetliga minnesstrukturer. Visar att adaptiv minnesstrukturval konsekvent överträffar one-size-fits-all-minne.
**Relevans för Neuron HQ:** Direkt applicerbart — våra agenter använder idag en fast minnesstruktur (runs/patterns/errors/techniques). FluxMem-principen att välja minnesstruktur adaptivt baserat på uppgiftstyp kunde låta Historian välja om information bäst lagras som ett mönster, ett fel, eller en länkad relation.

---

## StructMemEval: Evaluating Memory Structure in LLM Agents (2026)
**Källa:** arxiv:2602.11243 | Alina Shutova et al.
**Kärna:** StructMemEval är ett benchmark som testar agenters förmåga att organisera sitt långtidsminne, inte bara faktaåterkallelse. Samlar uppgifter som människor löser genom att organisera kunskap i specifika strukturer: transaktionsregister, att-göra-listor, trädstrukturer m.m. Visar att enkel RAG inte räcker — minnesagenter kan lösa uppgifterna om de instrueras om hur minnet ska organiseras, men moderna LLMs identifierar inte alltid optimal minnesstruktur självständigt.
**Nyckelresultat:** Enkel retrieval-augmented LLM misslyckas på strukturella minnesuppgifter, medan minnesagenter med explicit strukturinstruktion klarar dem. LLMs behöver fortfarande explicit vägledning om minnesorganisering.
**Relevans för Neuron HQ:** Bekräftar att vår explicita minnesstruktur (separata filer med definierade format) är rätt approach — utan den strukturen skulle agenter prestera sämre. Motiverar att bibehålla och vidareutveckla tydliga format för varje minnesfil snarare än en ostrukturerad dump.

---

## AgentSys: Secure and Dynamic LLM Agents Through Explicit Hierarchical Memory Management (2026)
**Källa:** arxiv:2602.07398 | Ruoyao Wen et al.
**Kärna:** AgentSys försvarar mot indirect prompt injection genom explicit minnesisolering inspirerad av processminneshantering i operativsystem. Organiserar agenter hierarkiskt: en huvudagent skapar worker-agenter för verktygsanrop, var och en i en isolerad kontext som kan skapa nästlade workers. Extern data och subtask-spår når aldrig huvudagentens minne — enbart schemavaliderade returvärden korsar gränser via deterministisk JSON-parsning.
**Nyckelresultat:** Isolering ensam minskar attack success rate till 2.19%. Med validator/sanitizer: 0.78% (AgentDojo) och 4.25% (ASB) attack success, samtidigt som nyttofunktionalitet förbättras jämfört med oförsvarade baslinjer.
**Relevans för Neuron HQ:** Direkt relevant för vår swarm-arkitektur. Vår Manager → Worker-pipeline bör implementera liknande minnesisolering — Implementer- och Researcher-agenter som läser externt innehåll (GitHub, docs) borde inte kunna injicera godtyckliga instruktioner uppåt i kedjan. Schema-validerade returvärden mellan agenter skulle stärka säkerheten markant.

---

## NEMO: Execution-Aware Optimization Modeling via Autonomous Coding Agents (2026)
**Källa:** arxiv:2601.21372 | Yang Song et al.
**Kärna:** NEMO behandlar autonoma kodningsagenter (ACAs) som en förstklassig abstraktion analogt med API-baserad LLM-interaktion. Introducerar asymmetriska valideringslooper mellan oberoende genererade optimizer- och simulator-implementationer som hög-nivå-validering. Inkluderar externt minne för erfarenhetsåteranvändning, minimum Bayes risk (MBR) decoding för robusthet, och self-consistency-kontroller. Kod är körbar by construction tack vare sandbox-exekvering.
**Nyckelresultat:** State-of-the-art på majoriteten av nio etablerade optimeringsbenchmarks, med substantiella marginaler på flera dataset. Asymmetrisk validering (optimizer vs simulator) fångar fel som enkla testsviter missar.
**Relevans för Neuron HQ:** Asymmetrisk validering-konceptet — att generera två oberoende implementationer som validerar varandra — kan stärka vår Reviewer/Tester-pipeline. Istället för att bara granska kod kan Reviewer generera en alternativ lösning som verifierar den primära. Externt minne för erfarenhetsåteranvändning matchar exakt Historian-agentens roll.

---

## AgenticSCR: Autonomous Agentic Secure Code Review (2026)
**Källa:** arxiv:2601.19138 | Wachiraphan Charoenwet et al.
**Kärna:** AgenticSCR kombinerar LLM-agenter med autonom beslutstafattande, verktygsanrop och kodnavigering för att detektera "omogna" sårbarheter vid pre-commit-stadiet. Förstärks med säkerhetsfokuserade semantiska minnen som lagrar kända sårbarhetsmönster. Agenten navigerar autonomt i kodbasen, hämtar kontext, och genererar granskningskommentarer med förklaringar.
**Nyckelresultat:** Minst 153% relativt högre andel korrekta kodgranskningskommentarer jämfört med statisk LLM-baserad baslinje. Överträffar signifikant SAST-verktyg i fyra av fem sårbarhetstyper.
**Relevans för Neuron HQ:** Direkt tillämpbar som förstärkning av vår Reviewer-agent. Att lägga till säkerhetsfokuserade semantiska minnen (liknande vår errors.md men specifikt för säkerhetsmönster) kunde ge Reviewer förmåga att fånga säkerhetsproblem systematiskt, inte bara funktionella buggar.

---

## AI IDEs or Autonomous Agents? Measuring the Impact of Coding Agents on Software Development (2026)
**Källa:** arxiv:2601.13597 | Shyam Agarwal et al.
**Kärna:** Longitudinell kausal studie av agentadoption i open source-repon med staggered difference-in-differences och matchade kontroller. Definierar adoption som första agent-genererade pull request och analyserar repository-nivå-utfall: utvecklingshastighet (commits, rader tillagda) och mjukvarukvalitet (statisk analys-varningar, kognitiv komplexitet, duplicering, kommentardensitet).
**Nyckelresultat:** Stora, frontladdade hastighetsvinster bara när agenter är första AI-verktyget i projektet — med tidigare IDE-användning: minimala effekter. Kvalitetsrisker är ihållande: statisk analys-varningar +18%, kognitiv komplexitet +39%, vilket indikerar agent-inducerad teknisk skuld även när hastighetsfördelar avtar.
**Relevans för Neuron HQ:** Viktig varning — vår Implementer-agent kan generera kod med hög kognitiv komplexitet och teknisk skuld. Motiverar att stärka Reviewer-agentens mandat att explicit mäta och begränsa kognitiv komplexitet, duplicering och varningar — inte bara funktionell korrekthet.

---

## ExtAgents: Scaling External Knowledge Input Beyond Context Windows via Multi-Agent Collaboration (2025)
**Källa:** arxiv:2505.21471 | Zijun Liu et al.
**Kärna:** ExtAgents är ett multi-agent-ramverk som hanterar extern kunskap som överstiger enskilda LLMs kontextfönster genom distribuerad bearbetning. Identifierar två kärnflaskhalsar i existerande metoder: kunskapssynkronisering mellan agenter och resoneringsprocessen. Agenter bearbetar parallellt separata kunskapssegment och koordineras för att lösa multi-hop-frågor utan longer-context-träning.
**Nyckelresultat:** Signifikant prestandaförbättring jämfört med existerande icke-träningsmetoder oavsett om extern kunskap ryms inom eller överskrider kontextfönstret. Bibehåller hög effektivitet tack vare hög parallellism.
**Relevans för Neuron HQ:** Direkt tillämpbar arkitekturprincip för vår swarm — om en uppgift kräver förståelse av en stor kodbas, kan multipla Researcher-agenter parallellt bearbeta olika delar och synkronisera resultat, istället för att en enskild agent försöker rymma allt i sitt kontextfönster.

---

## SWAA: Sliding Window Attention Adaptation for Efficient Long-Context LLMs (2025)
**Källa:** arxiv:2512.10411 | Yijiong Yu et al.
**Kärna:** SWAA är en plug-and-play-verktygslåda som adapterar Full Attention-modeller till Sliding Window Attention utan kostsam pretraining. Kombinerar synergistiskt fem strategier: (1) SWA enbart under prefilling, (2) bevara "sink"-tokens, (3) interfoliera FA/SWA-lager, (4) chain-of-thought, och (5) finjustering. Visar att individuella metoder är otillräckliga, men specifika kombinationer återhämtar ursprunglig long-context-förmåga.
**Nyckelresultat:** 30–100% speedup för long-context LLM-inferens med acceptabel kvalitetsförlust. Specifika konfigurationsrekommendationer för olika scenarier.
**Relevans för Neuron HQ:** Relevant om vi vill optimera inferenskostnad. När Researcher-agenten bearbetar stora kodfiler eller Historian sammanfattar långa sessioner kan SWAA-tekniker (speciellt sink tokens + CoT-kombination) minska latens utan att förlora kritisk kontextinformation.

---

## Context Is What You Need: Maximum Effective Context Window for Real World LLMs (2025)
**Källa:** arxiv:2509.21361 | Norman Paulsen
**Kärna:** Definierar konceptet Maximum Effective Context Window (MECW) — den faktiska kontextstorleken där en LLM kan arbeta tillförlitligt, till skillnad från den marknadsförda Maximum Context Window (MCW). Testar systematiskt kontextfönstereffektivitet över olika storlekar och problemtyper med hundratusentals datapunkter.
**Nyckelresultat:** MECW är dramatiskt lägre än MCW — upp till 99% skillnad. Flera toppmodeller fallerar med så lite som 100 tokens i kontext; de flesta har allvarlig accuracy-degradering vid 1000 tokens. MECW skiftar beroende på problemtyp.
**Relevans för Neuron HQ:** Kritisk insikt för dimensionering av agenternas kontextfönster. Våra agenter bör inte anta att hela kontextfönstret är användbart — Manager bör aktivt begränsa hur mycket kontext som skickas till varje agent baserat på uppgiftstyp, och Historian bör hålla minnesutdrag kompakta. Motiverar vår design att selektivt läsa minnesfiler snarare än att ladda allt.

---

## LoCoMo-Plus: Beyond-Factual Cognitive Memory Evaluation Framework for LLM Agents (2026)
**Källa:** arxiv:2602.10715 | Yifei Li et al.
**Kärna:** LoCoMo-Plus introducerar ett benchmark för att testa "kognitivt minne" — agentens förmåga att behålla och tillämpa implicita begränsningar (användarstatus, mål, värderingar) som aldrig direkt efterfrågas. Testar under "cue–trigger semantic disconnect" där ledtrådar och triggers inte har uppenbar ytlig likhet. Föreslår ett enhetligt utvärderingsramverk baserat på constraint consistency istället för ytlig strängmatchning.
**Nyckelresultat:** Kognitivt minne förblir utmanande för alla testade modeller, retrieval-metoder och minnessystem. Konventionella strängmatchningsmetriker och explicit task-type-prompting misslyckas att fånga dessa scenarion.
**Relevans för Neuron HQ:** Viktigt för kvalitetssäkring av vår Historian-agent — patterns.md kan lagra implicita mönster som är svåra att trigga med enkel keyword-sökning. Motiverar mer sofistikerad retrieval baserat på semantisk likhet snarare än ytmatchning när agenter läser från minnesfiler.

---

## ParaCodex: A Profiling-Guided Autonomous Coding Agent for Reliable Parallel Code Generation and Translation (2026)
**Källa:** arxiv:2601.04327 | Erel Kaplan et al.
**Kärna:** ParaCodex är ett HPC-ingenjörs-workflow som omvandlar en Codex-baserad agent till ett autonomt system för GPU-parallellisering genom fyra steg: hotspot-analys, explicit datarörelseplanering, korrekthetsgating och profilerings-driven förfining. Agenten kompilerar, testar och profilerar iterativt på målhårdvara med domänspecifik scaffolding.
**Nyckelresultat:** Lyckades på 31/31 giltiga kernels. Geometriskt medel-speedup på 3x (HeCBench) och 5x (Rodinia) jämfört med referens-OpenMP-implementationer. Överträffar zero-shot-baslinje på alla testsviter.
**Relevans för Neuron HQ:** Steg-för-steg-workflow-principen (analys → planering → gating → förfining) är direkt tillämpbar på vår Implementer-agent. Speciellt korrekthetsgating — att inte gå vidare till nästa steg förrän korrekthet verifierats — kan minska behovet av Reviewer-iterationer. Profileringsdriven feedback-loop matchar vår Tester → Implementer-cykel.

---

## LongCodeBench: Evaluating Coding LLMs at 1M Context Windows (2025)
**Källa:** arxiv:2505.07897 | Stefano Rando et al.
**Kärna:** LongCodeBench är ett benchmark som testar kodningsmodellers förmåga att förstå och reparera kod i long-context-scenarion (upp till 1M tokens), med uppgifter baserade på verkliga GitHub-issues. Delar in i kodförståelse (LongCodeQA) och buggfixning (LongSWE-Bench), stratifierat efter komplexitet för att testa modeller i olika skalor.
**Nyckelresultat:** Drastisk prestandaförsämring vid lång kontext: Claude 3.5 Sonnet sjunker från 29% till 3%, Qwen2.5 från 70.2% till 40%. Long-context förblir en svaghet för alla testade modeller.
**Relevans för Neuron HQ:** Bekräftar och förstärker insikten från MECW-pappret — våra agenter bör inte anta att stora kontextfönster fungerar för kodbuggar. Researcher-agenten bör chunka kodbaser strategiskt istället för att ladda hela filer. Motiverar också att Historian håller minnesutdrag kortfattade och fokuserade.

---

## Do Autonomous Agents Contribute Test Code? A Study of Tests in Agentic Pull Requests (2026)
**Källa:** arxiv:2601.03556 | Sabrina Haque et al.
**Kärna:** Empirisk studie av testinkludering i agent-genererade pull requests baserat på AIDev-datasetet. Analyserar hur ofta agenter inkluderar tester, när tester introduceras under PR-livscykeln, och hur test-PRs skiljer sig från icke-test-PRs i storlek, handläggningstid och merge-utfall.
**Nyckelresultat:** Test-innehållande PRs blir vanligare över tid men tenderar att vara större och ta längre tid att slutföra. Merge-rates förblir likartade mellan test- och icke-test-PRs. Stor variation mellan olika agenter i testadoption och balansen mellan test- och produktionskod.
**Relevans för Neuron HQ:** Direkt relevant för vår Tester-agent — motiverar att explicit kräva att Implementer-agenten genererar tester som en integrerad del av varje PR, inte som en efterhandskonstruktion. Att test-PRs tar längre tid bekräftar att Manager bör allokera extra tid/tokens när testgenerering ingår i uppdraget.

---

## Live-Evo: Online Evolution of Agentic Memory from Continuous Feedback (2026)
**Källa:** arxiv:2602.02369 | Yaolun Zhang et al.
**Kärna:** Live-Evo är ett online self-evolving minnessystem som lär sig från kontinuerliga dataströmmar istället för statiska train/test-splits. Separerar "vad som hände" från "hur det ska användas" via en Experience Bank och en Meta-Guideline Bank. Uppdaterar erfarenhetsvikter baserat på feedback — erfarenheter som konsekvent hjälper förstärks medan vilseledande eller inaktuella erfarenheter nedvärderas och gradvis glöms, analogt med förstärkning och förfall i mänskligt minne.
**Nyckelresultat:** 20.8% förbättring i Brier score och 12.9% ökad avkastning på Prophet Arena-benchmark under en 10-veckorshorisont. Transfererar även till deep-research-benchmarks med konsistenta förbättringar.
**Relevans för Neuron HQ:** Direkt applicerbart på Historian-agentens hantering av patterns.md och errors.md. Istället för att ackumulera mönster utan urval kunde ett Live-Evo-liknande viktningssystem automatiskt nedprioritera inaktuella mönster och förstärka de som konsekvent leder till framgångsrika implementeringar. Adresserar samma problem som TAME men med online-lärande istället för dual-memory.

---

## xMemory: Beyond RAG for Agent Memory — Retrieval by Decoupling and Aggregation (2026)
**Källa:** arxiv:2602.02007 | Zhanghao Hu et al.
**Kärna:** xMemory utmanar standard RAG-pipelines för agentminne genom att observera att agentminne är en begränsad, koherent dialogström med högt korrelerade spann — inte ett stort heterogent korpus som RAG designades för. Fast top-k similarity retrieval returnerar redundant kontext. xMemory bygger istället en hierarki av intakta enheter via ett sparsity-semantics-mål som styr minnesdelning och sammanslagning. Vid inferens hämtar systemet top-down: väljer kompakta, diversa teman för multi-fact-frågor och expanderar till episoder och råmeddelanden bara när det minskar osäkerheten.
**Nyckelresultat:** Konsistenta förbättringar i svarskvalitet och tokeneffektivitet på LoCoMo och PerLTQA med de tre senaste LLM-modellerna.
**Relevans för Neuron HQ:** Viktigt designbeslut för hur agenter söker i våra minnesfiler. Vår nuvarande approach med att läsa hela filer är analogt med naiv RAG. xMemorys hierarkiska hämtning — först teman/kategorier, sedan detaljer vid behov — kunde implementeras som en tvåstegs-läsning: först en sammanfattningsfil, sedan specifika sektioner. Minskar tokenförbrukning och redundans.

---

## SkillJect: Automating Stealthy Skill-Based Prompt Injection for Coding Agents (2026)
**Källa:** arxiv:2602.14211 | Xiaojun Jia et al.
**Kärna:** SkillJect är det första automatiserade ramverket för stealth prompt injection riktad mot agent-skills — den växande abstraktionen som paketerar långformatinstruktioner och hjälpskript för kodningsagenter. Använder en sluten loop med tre agenter: en Attack Agent som syntetiserar injektions-skills med explicita stealth-begränsningar, en Code Agent som exekverar uppgifter med de injicerade skripten, och en Evaluate Agent som loggar verktygsanrop och verifierar om skadliga beteenden utlöstes. Gömmer adversarial operationer i hjälpskript och injicerar optimerade trigger-prompts.
**Nyckelresultat:** Konsekvent höga attack success rates i diverse kodningsagent-miljöer och verkliga mjukvaruutvecklingsuppgifter, även med stealth-begränsningar.
**Relevans för Neuron HQ:** Direkt säkerhetsvarning för vår arkitektur. Om agenter använder externa verktyg, beroenden eller kodsnippets kunde en SkillJect-liknande attack injicera skadlig kod via till synes harmlösa instruktioner. Förstärker behovet av AgentSys-liknande minnesisolering (redan dokumenterad) och motiverar att Reviewer-agenten explicit verifierar att inga oväntade verktygsanrop eller filoperationer sker.

---

## How AI Coding Agents Communicate: PR Description Characteristics and Human Review Responses (2026)
**Källa:** arxiv:2602.17084 | Kan Watanabe et al.
**Kärna:** Empirisk analys av pull requests från fem AI-kodningsagenter baserat på AIDev-datasetet. Analyserar hur agenter skiljer sig i PR-beskrivningsstil (strukturella features), samt hur mänskliga granskare svarar i termer av granskningsaktivitet, svarstid, sentiment och merge-utfall. Visar att PR-presentationens karaktär påverkar granskarnas engagemang och slutresultat.
**Nyckelresultat:** AI-kodningsagenter uppvisar distinkt olika PR-beskrivningsstilar som korrelerar med skillnader i reviewer-engagemang, svarstid och merge-rates. Stor variation mellan agenter i hur de kommunicerar ändringar.
**Relevans för Neuron HQ:** Relevant för hur vår Implementer-agent strukturerar sina commit-meddelanden och PR-beskrivningar. Om agenten genererar tydligt strukturerade beskrivningar (syfte, ändringar, testresultat) ökar sannolikheten att Reviewer-agenten (och mänskliga granskare) snabbt förstår och godkänner ändringarna. Motiverar att standardisera output-formatet från Implementer.

---

## Solving Context Window Overflow in AI Agents via Memory Pointers (2025)
**Källa:** arxiv:2511.22729 | Anton Bulle Labate et al.
**Kärna:** Introducerar en metod som ersätter rå verktygsutdata i agentens kontextfönster med minnespointers. Istället för att fylla kontexten med stora verktygsresponser lagras utdatan externt, och agenten interagerar via referenser. Detta bevarar full verktygsfunktionalitet, möjliggör sömlös integration i agentworkflows, och eliminerar informationsförlust som uppstår vid trunkering eller sammanfattning.
**Nyckelresultat:** Cirka 7x färre tokens jämfört med traditionella workflows, samtidigt som fullständiga verktygsresponser bevaras. Validerad på en verklig materialvetenskaplig applikation som inte kan köras med konventionella workflows.
**Relevans för Neuron HQ:** Direkt tillämpbar princip för vår Researcher-agent som kan få stora kodsvar eller dokumentationsutdrag. Istället för att dumpa hela filinnehåll i kontexten kunde Researcher lagra dem externt och referera via pointers — detta frigör kontextutrymme för resonemang. Komplementerar vår befintliga MECW-insikt om att kontextfönster är mer begränsade än annonserat.

---

## DeepMiner: Beyond Turn Limits — Training Deep Search Agents with Dynamic Context Window (2025)
**Källa:** arxiv:2510.08276 | Qiaoyu Tang et al.
**Kärna:** DeepMiner introducerar dynamisk kontextfönsterhantering för multi-turn-agenter med lång horisont. Använder en sliding window-mekanism utan beroende av externa sammanfattningsmodeller, vilket möjliggör nästan 100 interaktionsrundor inom standard 32k kontextlängd. Genererar komplexa men verifierbara fråga-svar-par via en omvänd konstruktionsmetod från autentiska webbkällor, vilket säkerställer utmanande och pålitlig träningsdata.
**Nyckelresultat:** 33.5% accuracy på BrowseComp-en — nästan 20 procentenheters förbättring jämfört med bästa open-source-agent. Konsistenta förbättringar på BrowseComp-zh, XBench-DeepSearch och GAIA. Möjliggör ~100 rundor inom 32k kontext.
**Relevans för Neuron HQ:** Direkt relevant för vår Manager → Researcher/Implementer-pipeline som kan kräva många iterationer. DeepMiners sliding window-strategi (utan extern sammanfattning) kunde tillämpas för att låta agenter arbeta i fler steg utan att tappa tidigare kontext. Speciellt användbart för Implementer som itererar med Tester/Reviewer i många rundor.

---

## MIRA: Memory-Integrated Reinforcement Learning Agent with Limited LLM Guidance (2026)
**Källa:** arxiv:2602.17930 | Narjes Nourzad et al.
**Kärna:** MIRA bygger en strukturerad, evolverande minnesgraf som lagrar beslutsrelevant information — trajektorsegment och delmålstrukturer — från både agentens högavkastande erfarenheter och LLM-utdata. Istället för kontinuerlig LLM-supervision amortiseras LLM-frågor till ett persistent minne. Minnesgrafen genererar en utility-signal som mjukt justerar advantage estimation i RL-policyn utan att modifiera belöningsfunktionen. Utility-termen avtar gradvis när agentens policy överträffar LLM-priorerna.
**Nyckelresultat:** Presterar jämförbart med metoder som kräver frekvent LLM-supervision, men med väsentligt färre online LLM-frågor. Publicerad på ICLR 2026.
**Relevans för Neuron HQ:** Principen att amortisera LLM-vägledning till persistent minne är direkt tillämpbar — istället för att varje agent ständigt frågar Manager kan framgångsrika mönster lagras i patterns.md och gradvis ersätta behovet av direkt koordinering. Decay-mekanismen är intressant: äldre mönster bör förlora inflytande efterhand, liknande Live-Evo-konceptet.
**Keywords:** memory, reinforcement-learning, LLM-guidance, utility-shaping, agent
**Relaterat:** techniques.md#Live-Evo, techniques.md#TAME

---

## SWE-AGI: Benchmarking Specification-Driven Software Construction with MoonBit (2026)
**Källa:** arxiv:2602.09447 | Zhirui Zhang et al.
**Kärna:** SWE-AGI är ett open source-benchmark som testar LLM-agenters förmåga att bygga produktionsskala-mjukvara (1 000–10 000 rader kärnlogik) från explicita specifikationer och RFC:er under ett fast API-skelett. Genom att använda det nya MoonBit-ekosystemet minimeras dataläckage, vilket tvingar agenter att förlita sig på långsiktig arkitektonisk planering istället för kodåterkallelse. Uppgifterna inkluderar parsers, interpreters, binäravkodare och SAT-lösare.
**Nyckelresultat:** Bästa modellen (gpt-5.3-codex) löser 86.4% av uppgifterna, men prestandan sjunker kraftigt med ökande svårighetsgrad. Viktig insikt: kodläsning, inte skrivning, blir den dominerande flaskhalsen när kodbasen växer.
**Relevans för Neuron HQ:** Insikten att kodläsning dominerar över kodskrivning vid större kodbaser bekräftar att vår Researcher-agent (som utforskar och förstår kodbaser) är minst lika kritisk som Implementer-agenten. Motiverar investering i bättre kodnavigering och förståelseverktyg för Researcher.
**Keywords:** benchmark, specification-driven, autonomous-coding, code-reading, agent
**Relaterat:** techniques.md#LongCodeBench, techniques.md#Excalibur

---

## Agyn: A Multi-Agent System for Team-Based Autonomous Software Engineering (2026)
**Källa:** arxiv:2602.01465 | Nikita Benkovich et al.
**Kärna:** Agyn modellerar explicit mjukvaruutveckling som en organisatorisk process genom att replikera strukturen hos ett ingenjörsteam. Specialiserade agenter tilldelas roller (koordinering, research, implementation, review), ges isolerade sandboxar för experiment, och kommunicerar genom strukturerade protokoll. Systemet följer en definierad utvecklingsmetodik — analys, uppgiftsspecifikation, pull request-skapande, och iterativ review — helt utan mänsklig intervention.
**Nyckelresultat:** 72.2% på SWE-bench 500, överträffar single-agent-baslinjer med jämförbara språkmodeller. Designat för verklig produktionsanvändning, inte specifikt tunat för SWE-bench.
**Relevans för Neuron HQ:** Extremt relevant — Agyn validerar exakt vår arkitekturfilosofi med Manager → Researcher/Implementer/Reviewer/Tester-pipeline. Deras isolerade sandboxar per agent och strukturerade kommunikationsprotokoll är features vi bör överväga att implementera. Att de uppnår 72.2% utan SWE-bench-tuning bekräftar att organisatorisk design kan vara lika viktig som modellförbättringar.
**Keywords:** multi-agent, team-structure, autonomous-coding, sandboxes, SWE-bench, agent
**Relaterat:** techniques.md#Wink, techniques.md#AgentSys, patterns.md

---

## Multi-Agent LLM Committees for Autonomous Software Beta Testing (2025)
**Källa:** arxiv:2512.21352 | Sumanth Bharadwaj Hachalli Karanam et al.
**Kärna:** Ett multi-agent kommittéramverk där diverse visions-aktiverade LLMs samarbetar genom ett tre-rundors röstningsprotokoll för att nå konsensus om testningsåtgärder. Ramverket kombinerar modellmångfald, persona-driven beteendevariation och visuell UI-förståelse för att systematiskt utforska webbapplikationer. Agenter med olika personas röstar om nästa åtgärd, och majoritetsbeslutet exekveras.
**Nyckelresultat:** 89.5% total framgångsrate för testningsuppgifter. Konfigurationer med 2–4 agenter uppnår 91.7–100% framgång vs 78% för single-agent. F1-score 0.91 för buggdetektering (vs 0.78 single-agent). Medianlatens 0.71 sekunder per åtgärd möjliggör CI/CD-integration.
**Relevans för Neuron HQ:** Röstningsprotokollet kan stärka vår Reviewer/Tester-pipeline — istället för en enda Reviewer kunde multipla Reviewer-agenter med olika "personas" (säkerhet, prestanda, kodkvalitet) rösta om godkännande. Modellmångfald (olika LLMs) ger robustare bedömningar. Open source-implementationen gör det direkt testbart.
**Keywords:** multi-agent, testing, voting-protocol, persona, consensus, CI/CD, agent
**Relaterat:** techniques.md#Wink, techniques.md#AgenticSCR, techniques.md#Agyn

---

## Gradual Forgetting: Logarithmic Compression for Extending Transformer Context Windows (2025)
**Källa:** arxiv:2510.22109 | Billy Dickson et al.
**Kärna:** Introducerar en input-nivå logaritmisk kompression inspirerad av kognitiva modeller av mänskligt minne. Istället för att modifiera transformerarkitekturen (med rekurrens eller hjälpminnesmoduler) komprimeras input-tokens med en skalinvariant logaritmisk funktion — äldre tokens komprimeras mer aggressivt medan nyliga tokens behåller full upplösning. Den resulterande komprimerade representationen bearbetas av en standard, omodifierad transformer.
**Nyckelresultat:** Reducerar perplexitet jämfört med okomprimerade baslinjer på WikiText-103 och PG-19. Prestandan förbättras konsekvent med längre komprimerade temporala kontexter, vilket visar att kompressionen effektivt utökar transformerns långsiktsminne utan arkitekturändringar.
**Relevans för Neuron HQ:** Direkt tillämpbar princip för hur Historian-agenten lagrar och komprimerar minnesinnehåll — äldre runs och patterns kunde komprimeras logaritmiskt (mer sammanfattade) medan nyliga händelser behåller full detalj. Detta matchar mänsklig intuition om att nyliga erfarenheter bör vara mer detaljerade än gamla. Komplementerar DeepMiners sliding window-approach med en mer gradvis kompression.
**Keywords:** context-window, compression, logarithmic, memory, transformer, input-level
**Relaterat:** techniques.md#DeepMiner, techniques.md#SWAA, techniques.md#MECW

---

## Glyph: Scaling Context Windows via Visual-Text Compression (2025)
**Källa:** arxiv:2510.17800 | Jiale Cheng et al.
**Kärna:** Glyph angriper kontextfönsterproblemet från ett visuellt perspektiv — istället för att förlänga token-baserade sekvenser renderas lång text till bilder som bearbetas av vision-language-modeller (VLMs). Textinput komprimeras substantiellt medan semantisk information bevaras. En LLM-driven genetisk sökning identifierar optimala visuella renderingskonfigurationer som balanserar noggrannhet och kompression.
**Nyckelresultat:** Uppnår 3–4x tokenkompression med bibehållen noggrannhet jämförbar med ledande LLMs som Qwen3-8B på long-context-benchmarks. Ger ~4x snabbare prefilling och decoding, ~2x snabbare SFT-träning. Under extrem kompression kan en 128K-kontext VLM hantera 1M-token-uppgifter.
**Relevans för Neuron HQ:** Okonventionell men intressant approach — om våra minnesfiler växer avsevärt kunde kritisk kontext (kodstrukturer, arkitekturdiagram) potentiellt representeras visuellt för att komprimera token-användning. Mer praktiskt som en framtida övervägning om multimodala modeller integreras. Huvudinsikten är att alternativa representationsformat kan vara radikalt mer tokeneffektiva.
**Keywords:** context-window, visual-compression, VLM, token-efficiency, rendering
**Relaterat:** techniques.md#MECW, techniques.md#LongCodeBench, techniques.md#SWAA

---

## Positional Biases Shift as Inputs Approach Context Window Limits (2025)
**Källa:** arxiv:2508.07479 | Blerta Veseli et al.
**Kärna:** Systematisk analys av positionella bias i LLMs relativt kontextfönstrets storlek. Visar att "Lost in the Middle" (LiM)-effekten — där modeller presterar sämst på information i mitten av inputen — är starkast när input upptar ≤50% av kontextfönstret. Bortom 50% försvagas primacy bias medan recency bias förblir stabil, vilket eliminerar LiM-effekten och ersätter den med en avståndsbaserad bias där information nära slutet av input gynnas. Framgångsrik retrieval är en förutsättning för resonemang, och resoneringsbiaser ärvs från retrieval-biaser.
**Nyckelresultat:** LiM-effekten försvinner vid >50% kontextfyllnad. Recency bias dominerar vid hög kontextfyllnad. Positionella biaser skiftar baserat på relativ (inte absolut) kontextlängd — implikationen är att resultaten beror på hur mycket av kontextfönstret som faktiskt används.
**Relevans för Neuron HQ:** Kritisk operativ insikt för alla våra agenter. När Researcher eller Implementer får stora kontexter bör den viktigaste informationen (uppgiftsbeskrivning, relevanta mönster) placeras i slutet av prompten, inte i mitten. Manager-agenten bör strukturera kontext så att kritisk information inte hamnar i "döda zonen". Dessutom bör agenter helst inte fylla mer än ~50% av sitt kontextfönster för att minimera positionella bias-effekter.
**Keywords:** context-window, positional-bias, lost-in-middle, recency-bias, prompt-engineering, retrieval
**Relaterat:** techniques.md#MECW, techniques.md#LongCodeBench, techniques.md#DeepMiner

---

## Fault-Tolerant Sandboxing for AI Coding Agents: A Transactional Approach to Safe Autonomous Execution (2025)
**Källa:** arxiv:2512.12806 | Boyang Yan
**Kärna:** Presenterar ett Fault-Tolerant Sandboxing-ramverk som wrapprar agentåtgärder i atomära transaktioner med en policy-baserad intercepteringslager och ett transaktionellt filsystem-snapshot-mekanism. Istället för containerisering (tung initiering) eller interaktiva CLI-sandboxar (kräver autentisering som bryter headless-loopar) intercepterar systemet högriskkommandon via policy-regler och möjliggör rollback av misslyckade tillståndsändringar. Validerat med Minimind-MoE LLM servad via nano-vllm på en Proxmox-baserad testmiljö med EVPN/VXLAN-isolering.
**Nyckelresultat:** 100% intercepteringsgrad för högriskkommandon och 100% framgångsgrad för rollback av misslyckade tillstånd, med bara 14.5% prestandaöverhead (~1.8s) per transaktion. Kommersiella sandboxar (t.ex. Gemini CLI) kräver interaktiv autentisering som gör dem oanvändbara för headless autonoma agentworkflows.
**Relevans för Neuron HQ:** Direkt applicerbart på vår Implementer-agent som exekverar kommandon. Transaktionella filsystem-snapshots ger oss möjlighet att tryggt låta agenten köra kommandon med automatisk rollback om något går fel — eliminerar behovet av manuell intervention vid destruktiva misstag. Policy-baserad interceptering kompletterar AgentSys-liknande säkerhetsisolering och Wink-liknande övervakning.
**Keywords:** sandbox, fault-tolerance, transactional, rollback, safety, autonomous-coding, agent
**Relaterat:** techniques.md#AgentSys, techniques.md#Wink, techniques.md#Agyn

---

## PARC: An Autonomous Self-Reflective Coding Agent for Robust Execution of Long-Horizon Tasks (2025)
**Källa:** arxiv:2512.03549 | Yuki Orimo et al.
**Kärna:** PARC bygger på en hierarkisk multi-agent-arkitektur med tre kärnkomponenter: task planning, execution, och self-assessment/self-feedback. Det unika är att self-assessment sker från en oberoende kontext — inte samma kontext som utförde arbetet — vilket ger agenten förmåga att upptäcka och korrigera högnivå-strategiska fel. Systemet koordinerar dussintals parallella simuleringsuppgifter (var och en ~43 timmar beräkning) med end-to-end-orkestrering, övervakning och felkorrigering utan mänsklig intervention.
**Nyckelresultat:** Autonomt reproducerar nyckelresultat från materialvetenskapliga studier (litium-jonledning, legeringssegregation) och producerar konkurrenskraftiga lösningar på Kaggle-uppgifter utgående från minimala naturligt-språk-instruktioner. Hanterar långhorisontsuppgifter med dussintals parallella beräkningar.
**Relevans för Neuron HQ:** Self-assessment från oberoende kontext är en princip vi direkt kan tillämpa — vår Reviewer-agent bör granska kod utan att ärva Implementer-agentens kontext och bias. PARCs förmåga att koordinera parallella uppgifter med automatisk felkorrigering är relevant för framtida skalning av vår swarm till flera samtidiga implementeringsuppgifter. Kompletterar Excaliburs svårighetsmedvetna planering med robust långhorisont-exekvering.
**Keywords:** self-reflection, hierarchical, multi-agent, long-horizon, autonomous-coding, parallel-execution, agent
**Relaterat:** techniques.md#Excalibur, techniques.md#Agyn, techniques.md#Wink, techniques.md#NEMO

---

## Skill-Inject: Measuring Agent Vulnerability to Skill File Attacks (2026)
**Källa:** arxiv:2602.20156 | David Schmotz et al.
**Kärna:** Skill-Inject är ett benchmark med 202 injection-task-par som utvärderar LLM-agenters mottaglighet för prompt injection genom skill-filer — den växande abstraktionen som låter tredjepartskod utöka agentfunktionalitet. Attackerna spänner från uppenbart skadliga injektioner till subtila, kontextberoende attacker gömda i annars legitima instruktioner. Till skillnad från SkillJect (som fokuserar på att syntetisera attacker) fokuserar Skill-Inject på systematisk mätning och benchmarking av sårbarheten.
**Nyckelresultat:** Upp till 80% attack success rate med frontier-modeller, inklusive dataexfiltrering, destruktiva åtgärder och ransomware-liknande beteenden. Problemet löses inte av modellskalning eller enkel input-filtrering — kräver kontextmedvetna auktoriseringsramverk.
**Relevans för Neuron HQ:** Kompletterar vår befintliga SkillJect-post med kvantitativa sårbarhetsdata. 80% attack success rate understryker att alla externa verktyg, beroenden och instruktioner som våra agenter (speciellt Implementer/Researcher) använder utgör aktiva attackytor. Benchmarket kan användas för att testa säkerhetsförbättringar i vår swarm, t.ex. AgentSys-liknande minnesisolering.
**Keywords:** security, prompt-injection, skill-files, benchmark, agent-vulnerability
**Relaterat:** techniques.md#SkillJect, techniques.md#AgentSys, techniques.md#Fault-Tolerant-Sandboxing

---

## AMEM4Rec: Cross-User Memory Evolution for Agentic LLM Recommenders (2026)
**Källa:** arxiv:2602.08837 | Minh-Duc Nguyen et al.
**Kärna:** AMEM4Rec lagrar abstrakta användarbeteendemönster i en global minnespool där minnen länkas till liknande befintliga minnen och iterativt evolveras för att förstärka delade mönster över användare. Detta gör systemet medvetet om collaborative filtering-signaler utan en förtränad CF-modell — minnen korsbefruktrar varandra genom länkning och evolution istället för att isoleras per användare.
**Nyckelresultat:** Konsekvent överträffar state-of-the-art LLM-baserade rekommendationssystem på Amazon och MIND datasets, med bättre precision genom minnesevolution som fångar implicita preferenser.
**Relevans för Neuron HQ:** Principen att länka och evolvera minnen *mellan* sessioner/projekt är applicerbar på vårt system. Istället för att varje körning har isolerade minnesanteckningar i runs.md kunde patterns.md fungera som en "global minnespool" där mönster från olika projekt automatiskt länkas och förstärks — en konceptuell vidareutveckling av A-MEM:s Zettelkasten-princip. Minnesevolution genom korsbefruktning mellan projekt kan avslöja generaliserbara mönster.
**Keywords:** memory-evolution, cross-session, collaborative-filtering, pattern-linking, agent
**Relaterat:** techniques.md#A-MEM, techniques.md#Live-Evo, techniques.md#xMemory

---

## Agentic AI for Autonomous Defense in Software Supply Chain Security (2025)
**Källa:** arxiv:2512.23480 | Toqeer Ali Syed et al.
**Kärna:** Ramverk som kombinerar LLM-baserat resonemang, reinforcement learning och multi-agent-koordinering för proaktiv säkerhet i mjukvaruförsörjningskedjan. Specialiserade säkerhetsagenter koordinerade via LangChain/LangGraph kommunicerar med CI/CD-miljöer genom Model Context Protocol (MCP), och alla observationer och åtgärder dokumenteras i en blockchain-baserad säkerhetslogg. RL-agenter balanserar säkerhetseffektivitet mot operationell overhead, medan LLMs ger semantisk sårbarhetsanalys och förklarbara beslut.
**Nyckelresultat:** Bättre detektionsnoggrannhet, kortare åtgärdslatens och rimlig build-time-overhead jämfört med regelbaserade, provenance-only och RL-only baslinjer. Testad på GitHub Actions och Jenkins mot injection-attacker, osäker deserialisering, åtkomstkontrollbrott och konfigurationsfel.
**Relevans för Neuron HQ:** Relevant som en blueprint för att integrera säkerhetsövervakning direkt i vår CI/CD-pipeline. MCP-integrationen med CI/CD är en mönsterarkitektur vi kan återanvända. Den blockchain-baserade auditloggen är överkill för oss, men principen att logga alla agentåtgärder med integritetsskydd (t.ex. signerade runs.md-poster) stärker spårbarheten i vår swarm. Kompletterar AgentSys (isolering) och AgenticSCR (kodgranskning) med pipeline-nivå-försvar.
**Keywords:** supply-chain-security, CI/CD, multi-agent, MCP, reinforcement-learning, agent
**Relaterat:** techniques.md#AgentSys, techniques.md#AgenticSCR, techniques.md#SkillJect, techniques.md#Skill-Inject

---

## TraceCoder: Trace-Driven Multi-Agent Framework for Automated Debugging (2026)
**Källa:** arxiv:2602.06875 | Jiangping Huang et al.
**Kärna:** TraceCoder emulerar experters observe-analyze-repair-process genom tre samarbetande agenter. Först instrumenteras koden med diagnostiska sonder som fångar finmaskiga runtime-traces, sedan utförs kausal analys för att identifiera grundorsaken till felet. En Historical Lesson Learning Mechanism (HLLM) destillerar insikter från tidigare misslyckade reparationsförsök för att informera efterföljande korrigeringsstrategier och förhindra upprepning av liknande misstag. En Rollback-mekanism säkerställer att varje reparationsiteration utgör en strikt förbättring.
**Nyckelresultat:** Upp till 34.43% relativ förbättring i Pass@1-noggrannhet jämfört med avancerade baslinjer. Den iterativa reparationsprocessen ensam bidrar med 65.61% relativ förbättring. Signifikant bättre i både noggrannhet och kostnadseffektivitet.
**Relevans för Neuron HQ:** Direkt applicerbart på vår Tester → Implementer-loop. HLLM-mekanismen (lärande från tidigare misslyckanden) matchar exakt syftet med errors.md — men TraceCoder automatiserar kopplingen mellan felhistorik och reparationsstrategi. Rollback-mekanismen kompletterar Fault-Tolerant Sandboxing. Kausal analys via runtime-traces ger mer precis felidentifiering än vad vår Tester-agent gör idag med enbart pass/fail-signaler.
**Keywords:** debugging, multi-agent, trace-analysis, historical-learning, rollback, automated-repair, agent
**Relaterat:** techniques.md#Fault-Tolerant-Sandboxing, techniques.md#Wink, techniques.md#PARC, techniques.md#Live-Evo

---

## Environment-in-the-Loop: Rethinking Code Migration with LLM-based Agents (2026)
**Källa:** arxiv:2602.09944 | Xiang Li et al.
**Kärna:** Hävdar att kodmigration utan automatiserad miljöinteraktion bara är halvt komplett. Presenterar ett ramverksparadigm som tätt integrerar automatiserad miljöuppställning med kodmigrationsworkflow. Istället för enbart statisk analys av målmiljön integreras dynamisk miljöinteraktion — att bygga, testa och validera i den faktiska målmiljön som en del av migrationsprocessen. Identifierar att brist på automatiserad miljöinteraktion leder till långa feedback-cykler, omarbete och projektförseningar.
**Nyckelresultat:** Översiktspaper som systematiserar fältet snarare än att rapportera enskilda metriker. Identifierar att miljöuppställning (dependency-hantering, konfiguration, kompatibilitet) är den dolda flaskhalsen i automatiserad kodmigration.
**Relevans för Neuron HQ:** Viktigt koncept för vår Implementer-agent — att generera kod utan att validera den i den faktiska miljön (beroenden, konfigurationer, OS-specifika förhållanden) ger falsk framgång. Motiverar att integrera miljöuppställning och miljövalidering som explicita steg i vår Implementer → Tester-pipeline, inte bara kodkompilering och enhetstestning. Kompletterar ParaCodex-principen om korrekthetsgating med miljömedvetenhet.
**Keywords:** code-migration, environment-setup, CI/CD, feedback-loop, autonomous-coding, agent
**Relaterat:** techniques.md#ParaCodex, techniques.md#Fault-Tolerant-Sandboxing, techniques.md#Agyn

---

## Darwinian Memory System: Training-Free Self-Regulating Memory for GUI Agent Evolution (2026)
**Källa:** arxiv:2601.22528 | Hongze Mi et al.
**Kärna:** DMS behandlar agentminne som ett dynamiskt ekosystem styrt av "survival of the fittest". Komplexa trajektorier dekomponeras till oberoende, återanvändbara enheter för kompositionell flexibilitet. En Utility-driven Natural Selection-mekanism spårar varje minnesenhets "överlevnadsvärde" och prunar aktivt suboptimala vägar och hämmar högriskplaner. Evolutionärt tryck tvingar agenten att härleda överlägsna strategier utan träningskostnader eller arkitekturell overhead.
**Nyckelresultat:** 18.0% högre framgångsrate och 33.9% bättre exekveringsstabilitet i genomsnitt på multi-app benchmarks. Minskar även uppgiftslatens. Kräver ingen träning — fungerar som plug-and-play minnessystem.
**Relevans för Neuron HQ:** Utility-driven Natural Selection är direkt tillämpbar på hur Historian hanterar patterns.md och errors.md. Varje mönster/fel-post kunde tilldelas ett "överlevnadsvärde" baserat på hur ofta det faktiskt hjälper i framtida uppgifter. Inaktuella eller vilseledande mönster prunas automatiskt. Komplementerar Live-Evo (viktning) med en mer aggressiv strategi (borttagning). Dekomponeringen till återanvändbara enheter matchar vår ambition att göra minnesutdrag mer modulära.
**Keywords:** memory, evolution, pruning, utility-driven, survival-of-fittest, training-free, agent
**Relaterat:** techniques.md#Live-Evo, techniques.md#TAME, techniques.md#AMEM4Rec

---

## MAGNET: Memory-Driven Knowledge Evolution for Adaptive GUI Agents (2026)
**Källa:** arxiv:2601.19199 | Libo Sun et al.
**Kärna:** MAGNET introducerar dual-level minne för agenter som måste anpassa sig till förändrade miljöer: (1) stationary memory som kopplar varierande visuella features till stabila funktionella semantiker för robust action grounding, och (2) procedural memory som fångar stabila uppgiftsintentioner över varierande workflows. En dynamisk minnesevolutionsmekanism förfinar kontinuerligt båda minneslagren genom att prioritera frekvent åtkomstkunskap, baserat på insikten att funktionell semantik och uppgiftsintentioner förblir stabila trots ytliga UI-förändringar.
**Nyckelresultat:** Substantiella förbättringar över baslinjer på online-benchmarket AndroidWorld och konsistenta vinster under distributionsförskjutningar på offline-benchmarks. Visar att stabila strukturer kan utnyttjas för generalisering i föränderliga miljöer.
**Relevans för Neuron HQ:** Dual-level-principen (stabil semantik vs föränderlig yta) är applicerbar på vår kodbas. Patterns.md kunde separeras i "stabila arkitekturmönster" (stationary) och "aktuella workflow-procedurer" (procedural). När kodbasen förändras (refaktorering, nya verktyg) förblir de stabila mönstren relevanta medan procedurella minnen uppdateras. Minnesevolutionens prioritering av frekvent åtkomst kan informera vilka mönster som ska visas först vid sökning.
**Keywords:** memory, dual-level, knowledge-evolution, distribution-shift, adaptive, agent
**Relaterat:** techniques.md#Live-Evo, techniques.md#Darwinian-Memory-System, techniques.md#FluxMem

---

## How Retrieved Context Shapes Internal Representations in RAG (2026)
**Källa:** arxiv:2602.20091 | Samuel Yeh et al.
**Kärna:** Systematisk studie av hur hämtad kontext i RAG-system påverkar LLMs interna representationer (hidden states), inte bara output-beteende. Analyserar hur olika typer av hämtade dokument (relevanta, irrelevanta, distraktorer) skiftar hidden states lagvis genom modellen, och hur dessa interna representationsförändringar korrelerar med nedströms genereringskvalitet. Visar att kontextrelevans och lagervis bearbetning har distinkta, mätbara effekter på hur modellen integrerar extern information.
**Nyckelresultat:** Kontextrelevans påverkar interna representationer signifikant och predikterbart över alla testade modeller och dataset. Irrelevanta dokument förskjuter representationer bort från korrekta svar, medan relevanta dokument förstärker dem. Effekten varierar kraftigt mellan modellens lager — tidiga lager är mer känsliga för kontextförändringar.
**Relevans för Neuron HQ:** Operativ insikt för minnesdesign — när Researcher eller Implementer hämtar kontext från patterns.md/errors.md är det inte bara en fråga om "rätt information" utan att irrelevant information aktivt försämrar modellens interna resonemang. Motiverar mer precis filtrering vid minnesläsning (hellre för lite men relevant kontext än mycket men blandad), och stärker argumentet för xMemory-liknande hierarkisk hämtning. Tidiga lagers känslighet antyder att kontextordning (relevant information tidigt) spelar roll.
**Keywords:** RAG, internal-representations, hidden-states, retrieval, context-quality, memory
**Relaterat:** techniques.md#xMemory, techniques.md#Positional-Biases, techniques.md#MECW, techniques.md#LoCoMo-Plus

---
