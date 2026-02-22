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
