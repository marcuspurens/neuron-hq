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

## Pancake: Hierarchical Memory System for Multi-Agent LLM Serving (2026)
**Källa:** arxiv:2602.21477 | Zhengding Hu et al.
**Kärna:** Pancake adresserar de tre kärnproblemen med agentminneshantering i LLM-serving: storskalig lagring, frekventa uppdateringar och multipla samexisterande agenter som alla kräver approximate nearest neighbor (ANN)-sökning. Systemet unifierar tre tekniker: (i) multi-level index caching för enskilda agenter, (ii) koordinerad indexhantering över multipla agenter, och (iii) kollaborativ GPU-CPU-acceleration. Exponerar ett enkelt gränssnitt kompatibelt med MemGPT, LangChain och LlamaIndex.
**Nyckelresultat:** Mer än 4.29x end-to-end throughput-förbättring jämfört med existerande ramverk på realistiska agent-workloads.
**Relevans för Neuron HQ:** Direkt relevant för skalning av vår swarm. När multipla agenter (Researcher, Implementer, Reviewer, Historian) simultant behöver söka i samma minnesfiler uppstår exakt de flaskhalsar Pancake adresserar. Multi-level index caching kunde accelerera minnesläsning avsevärt, och koordinerad indexhantering mellan agenter förhindrar konflikter vid samtidig skrivning till runs.md/patterns.md.
**Keywords:** memory, multi-agent, serving, ANN-search, caching, GPU-CPU, scalability
**Relaterat:** techniques.md#MemGPT, techniques.md#xMemory, techniques.md#BudgetMem

---

## SWE-Protégé: Learning to Selectively Collaborate With an Expert for Small Language Model Agents (2026)
**Källa:** arxiv:2602.22124 | Patrick Tser Jern Kon et al.
**Kärna:** SWE-Protégé omformulerar mjukvarureparation som ett expert-protégé-samarbete. En liten språkmodell (SLM) förblir den enda beslutsfattaren men lär sig att selektivt be om vägledning från en starkare expertmodell, känna igen stagnerade tillstånd, och agera på expertfeedback. Metoden kombinerar supervised fine-tuning på expert-augmenterade trajektorier med agentic reinforcement learning som explicit motverkar degenerativ looping och oproduktivt expertberoende.
**Nyckelresultat:** Qwen2.5-Coder-7B uppnår 42.4% Pass@1 på SWE-bench Verified — en +25.4% förbättring jämfört med tidigare SLM state-of-the-art. Experthjälp används sparsamt (~4 anrop per uppgift, 11% av totala tokens).
**Relevans för Neuron HQ:** Direkt applicerbar arkitekturprincip för kostnadsoptimering. Enklare agentroller (t.ex. Historian, enklare Researcher-uppgifter) kunde drivas av billigare, mindre modeller som selektivt eskalerar till en starkare modell vid svåra beslut — analogt med hur en junior utvecklare frågar en senior. Minskar tokenkostnad utan att offra kvalitet. RL-strategin mot degenerativ looping är relevant för alla våra agenter.
**Keywords:** small-language-model, expert-collaboration, reinforcement-learning, SWE-bench, cost-optimization, agent
**Relaterat:** techniques.md#Excalibur, techniques.md#Wink, techniques.md#BudgetMem

---

## DySCO: Dynamic Attention-Scaling Decoding for Long-Context LMs (2026)
**Källa:** arxiv:2602.22175 | Xi Ye et al.
**Kärna:** DySCO förbättrar long-context-resonemang genom att utnyttja "retrieval heads" — en delmängd av attention heads specialiserade för long-context-hämtning — för att vid varje decoding-steg identifiera uppgiftsrelevanta tokens och explicit uppvikta dem. Metoden justerar dynamiskt attention under generering för att bättre utnyttja relevant kontext. Training-free och kan appliceras direkt på vilken off-the-shelf LLM som helst.
**Nyckelresultat:** Relativa förbättringar på upp till 25% på MRCR och LongBenchV2 vid 128K kontextlängd med modest extra beräkningskostnad. Konsistenta förbättringar över både instruction-tuned och reasoning-modeller.
**Relevans för Neuron HQ:** Komplementerar vår insikt om positional biases och MECW. DySCO löser problemet från modellinferens-sidan — om våra agenter använder modeller med DySCO-liknande attention-skalning behöver vi oroa oss mindre för kontextfönstereffektivitet. Speciellt relevant när Researcher bearbetar stora kodbaser eller Implementer arbetar med extensiva fildumpar. Att metoden är training-free innebär att den kan integreras utan anpassning.
**Keywords:** context-window, attention-scaling, retrieval-heads, long-context, training-free, decoding
**Relaterat:** techniques.md#MECW, techniques.md#Positional-Biases, techniques.md#SWAA, techniques.md#DeepMiner

---

## ZeroClaw: Hybrid RAG med SQLite FTS5 + vector cosine + BM25
**Källa:** ZeroClaw v0.1.7 — `src/rag/` (github.com/zeroclaw-labs/zeroclaw)
**Kärna:** ZeroClaw implementerar ett trelagers RAG-system i en enda SQLite-databas: (1) vektor-cosine similarity för semantisk sökning, (2) FTS5 keyword-indexering med BM25-scoring för exakt termmatchning, (3) hybrid rank-fusion som kombinerar båda signalerna. Dessutom en LRU embedding-cache för att slippa re-embeda identiska queries.
**Nyckelresultat:** Hela systemet är <5MB RAM och kör på $10-hårdvara (Raspberry Pi). Hybrid search ger bättre precision för egentiteter (namn, nyckeltermer) jämfört med rena embeddings, utan att offra semantisk bredd.
**Relevans för Neuron HQ / Aurora:** Direkt applicerbar för Aurora B2 (hybrid search-spåret). Rena embeddings missar exakta namn och termer — BM25 kompenserar för detta. LRU-cache minskar embeddingkostnad vid upprepade queries. SQLite-implementationen är enkel att lägga till i Auroras befintliga SQLite-databas utan ny infrastruktur.
**Keywords:** RAG, hybrid-search, BM25, FTS5, vector, cosine-similarity, LRU-cache, SQLite, Aurora
**Relaterat:** techniques.md#A-MEM, techniques.md#Mem0

---

## ZeroClaw: SOP-system (Standard Operating Procedures) för deklarativa agentbeteenden
**Källa:** ZeroClaw v0.1.7 — `src/sop/` (github.com/zeroclaw-labs/zeroclaw)
**Kärna:** ZeroClaw introducerar ett SOP-system (Standard Operating Procedures) — regelstyrda, deklarativt definierade beteendemallar för agenten. En SOP är en fil som beskriver "om X sker, gör Y i denna ordning". Liknar Neuron HQ:s policy-system men är mer flexibelt: SOPs kan läggas till/tas bort utan kodändring, och de är prioriterade (hög-prio SOP kan åsidosätta lägre).
**Nyckelresultat:** Används i ZeroClaw för återkommande uppgifter (t.ex. "om en ny GitHub-issue skapas, analysera och kommentera automatiskt"). Kombineras med `skills/`-systemet (pluggbara förmågor) för att ge agenten uitdragbara kapabiliteter utan kärnkodsändringar.
**Relevans för Neuron HQ:** SOPs är ett naturligt nästa steg för Neuron efter AGENTS.md. AGENTS.md definierar principer; SOPs skulle kunna definiera körningsprotokoll per brief-typ (t.ex. en "security-audit"-SOP som alltid kör Reviewer extra grundligt). Mer flexibelt än att hårdkoda beteenden i manager.md.
**Keywords:** SOP, procedurer, deklarativ, regelstyrning, agentbeteende, flexibilitet, policy
**Relaterat:** techniques.md#Anthropics råd om agentarkitektur

---

## EMPO²: Exploratory Memory-Augmented On- and Off-Policy Optimization for LLM Agents (2026)
**Källa:** arxiv:2602.23008 | Zeyuan Liu et al.
**Kärna:** EMPO² är ett hybrid RL-ramverk som använder minne för utforskning och kombinerar on- och off-policy-uppdateringar för att göra LLM-agenter både effektiva med minne och robusta utan det. Medan tidigare metoder utnyttjar förtränad kunskap misslyckas de i miljöer som kräver upptäckt av nya tillstånd. EMPO² löser detta genom att minnet stöder exploration av nya tillstånd, och den hybrida on/off-policy-strategin säkerställer att agenten fungerar väl oavsett om minnet är tillgängligt.
**Nyckelresultat:** 128.6% förbättring över GRPO på ScienceWorld och 11.3% på WebShop. I out-of-distribution-tester anpassar sig agenten till nya uppgifter med bara några få försök med minne och utan parameteruppdateringar. Accepterad vid ICLR 2026.
**Relevans för Neuron HQ:** Principen att agenten ska fungera robust *utan* minne men prestera bättre *med* minne är direkt tillämpbar. Våra agenter bör designas så att patterns.md/errors.md förbättrar prestandan men inte är ett hårt beroende — om minnesfiler är tomma (t.ex. vid ett nytt projekt) ska agenten fortfarande fungera väl. OOD-adaptationen med bara några försök matchar hur Researcher/Implementer bör hantera nya kodbastyper.
**Keywords:** memory, exploration, reinforcement-learning, hybrid-policy, OOD-adaptation, agent
**Relaterat:** techniques.md#MIRA, techniques.md#Live-Evo, techniques.md#Darwinian-Memory-System

---

## CMV: Contextual Memory Virtualisation — DAG-Based State Management and Structurally Lossless Trimming for LLM Agents (2026)
**Källa:** arxiv:2602.22402 | Cosmo Santoni
**Kärna:** CMV behandlar ackumulerad LLM-förståelse som versionskontrollerat tillstånd, inspirerat av virtuellt minne i operativsystem. Sessionshistorik modelleras som en Directed Acyclic Graph (DAG) med formellt definierade snapshot-, branch- och trim-primitiver som möjliggör kontextåteranvändning mellan oberoende parallella sessioner. En tre-pass strukturellt förlustfri trimningsalgoritm bevarar varje användar- och assistentmeddelande ordagrant medan den strippar mekanisk overhead (rå verktygsutdata, base64-bilder, metadata).
**Nyckelresultat:** I genomsnitt 20% tokenreduktion och upp till 86% för sessioner med signifikant overhead. Blandade verktygsanvändningssessioner uppnår i snitt 39% reduktion och når break-even inom 10 turer under prompt caching. Utvärderad på 76 verkliga kodningssessioner. Referensimplementation tillgänglig för Claude Code.
**Relevans för Neuron HQ:** Extremt relevant — CMVs DAG-modell med snapshot/branch/trim löser exakt problemet med kontextförlust när våra agenter når kontextgränser. Branching möjliggör att Researcher och Implementer kan dela en gemensam baskontext men divergera i sina specifika uppgifter. Den strukturellt förlustfria trimningen som strippar verktygsutdata men bevarar konversation matchar hur vi bör hantera stora kodsvar — behåll resonemanget, referera till koden. Komplementerar Memory Pointers-konceptet med en mer formell DAG-struktur.
**Keywords:** context-window, DAG, state-management, trimming, lossless-compression, virtual-memory, agent
**Relaterat:** techniques.md#MemGPT, techniques.md#Memory-Pointers, techniques.md#DeepMiner, techniques.md#MECW

---

## ESAA: Event Sourcing for Autonomous Agents in LLM-Based Software Engineering (2026)
**Källa:** arxiv:2602.23193 | Elzo Brito dos Santos Filho
**Kärna:** ESAA separerar agentens kognitiva intention från projektets tillståndsmutation, inspirerat av Event Sourcing-mönstret. Agenter emitterar enbart strukturerade intentioner i validerad JSON; en deterministisk orkestrerare validerar, persisterar händelser i en append-only-logg (activity.jsonl), applicerar filskrivningseffekter, och projicerar en verifierbar materialiserad vy (roadmap.json). Inkluderar boundary contracts (AGENT_CONTRACT.yaml), metaprompting-profiler (PARCER), och replay-verifiering med hashing för att säkerställa oföränderlighet och forensisk spårbarhet.
**Nyckelresultat:** Validerad i två fallstudier: (i) landningssida-projekt (9 uppgifter, 49 händelser, single-agent) och (ii) kliniskt dashboard-system (50 uppgifter, 86 händelser, 4 samtidiga agenter med heterogena LLMs: Claude Sonnet 4.6, Codex GPT-5, Gemini 3 Pro, Claude Opus 4.6). Båda avslutades med run.status=success och verify_status=ok.
**Relevans för Neuron HQ:** Direkt tillämpbar arkitektur för vår swarm. Att separera intention (agentens output) från effekt (filskrivning) via en deterministisk orkestrerare ger oss: (1) spårbarhet — varje ändring kan kopplas till en specifik agentintention, (2) replay — sessioner kan verifieras och reproduceras, (3) säkerhet — agenter kan inte direkt mutera tillstånd, bara uttrycka intentioner som valideras. AGENT_CONTRACT.yaml-konceptet matchar och utökar vår AGENTS.md med maskinläsbar validering. Append-only-loggen liknar vår runs.md men med formell händelsestruktur.
**Keywords:** event-sourcing, append-only-log, intention-effect-separation, multi-agent, orchestration, traceability, agent
**Relaterat:** techniques.md#AgentSys, techniques.md#Agyn, techniques.md#Fault-Tolerant-Sandboxing, techniques.md#Agentic-AI-Supply-Chain

---

## E-mem: Multi-agent based Episodic Context Reconstruction for LLM Agent Memory (2026)
**Källa:** arxiv:2601.21714 | Kaixiang Wang et al.
**Kärna:** E-mem skiftar från minnesförbearbetning (destruktiv komprimering) till episodisk kontextrekonstruktion. Inspirerat av biologiska engram använder systemet en heterogen hierarkisk arkitektur: multipla assistent-agenter bevarar okomprimerade minneskontexter i parallella segment, medan en central master-agent orkestrerar global planering. Assistenter resonerar lokalt inom aktiverade minnessegment och extraherar kontextmedveten evidens innan aggregering — till skillnad från passiv retrieval.
**Nyckelresultat:** Över 54% F1 på LoCoMo-benchmark, överträffar state-of-the-art GAM med 7.75%, samtidigt som tokenkostnaden reduceras med över 70%.
**Relevans för Neuron HQ:** Direkt tillämpbar på hur våra agenter söker i minnesfiler. Istället för att hämta råa utdrag från patterns.md/errors.md kunde en E-mem-liknande approach låta varje agent resonera lokalt inom sitt minnessegment innan resultaten aggregeras. Hierarkin (assistenter + master) matchar vår Manager → Worker-arkitektur. 70% tokenminskning är särskilt relevant för kostnadsoptimering.
**Keywords:** memory, episodic, multi-agent, context-reconstruction, retrieval, token-efficiency
**Relaterat:** techniques.md#xMemory, techniques.md#Pancake, techniques.md#ExtAgents

---

## CAM: A Constructivist View of Agentic Memory for LLM-Based Reading Comprehension (2025)
**Källa:** arxiv:2510.05520 | Rui Li et al. (NeurIPS 2025)
**Kärna:** CAM implementerar Piagets konstruktivistiska teori som minnessystem med tre egenskaper: strukturerade scheman, flexibel assimilering och dynamisk ackommodation. Kärnan är en inkrementell överlappande klustringsalgoritm som bygger strukturerat minne med stöd för koherent hierarkisk sammanfattning och online batch-integration. Vid inferens utforskar CAM minnesstrukturen adaptivt för att aktivera fråge-relevant information via en associativ process liknande mänskligt tänkande.
**Nyckelresultat:** Dubbla fördelar i både prestanda och effektivitet på diversa long-text-uppgifter: frågebesvarande, frågebaserad sammanfattning och claim verification. Accepterad vid NeurIPS 2025.
**Relevans för Neuron HQ:** CAMs tre principer (struktur, flexibilitet, dynamik) erbjuder en designramverk för att förbättra våra minnesfiler. Strukturerade scheman = vår kategorisering (runs/patterns/errors). Assimilering = att integrera ny information i befintliga mönster. Ackommodation = att omstrukturera minnesformatet när det inte längre fungerar. Den inkrementella klustringen kunde appliceras på patterns.md för att automatiskt gruppera relaterade mönster.
**Keywords:** memory, constructivism, clustering, schema, assimilation, accommodation, agent
**Relaterat:** techniques.md#FluxMem, techniques.md#xMemory, techniques.md#StructMemEval

---

## A-MemGuard: A Proactive Defense Framework for LLM-Based Agent Memory (2025)
**Källa:** arxiv:2510.02373 | Qianshan Wei et al.
**Kärna:** A-MemGuard är det första proaktiva försvarsramverket för LLM-agentminne. Identifierar att injicerade minnesrecords aktiveras kontextuellt (svårt att upptäcka isolerat) och initierar självförstärkande felcykler. Kombinerar (1) konsensusbaserad validering som detekterar anomalier genom att jämföra resonemangsvägar från multipla relaterade minnen, och (2) en dual-memory-struktur där upptäckta fel destilleras till "lessons learned" som konsulteras före framtida handlingar — bryter felcykler och möjliggör adaptation utan arkitekturförändringar.
**Nyckelresultat:** Reducerar attack success rate med över 95% med minimal utility-kostnad. Försvaret stärks över tid genom ackumulerade "lessons".
**Relevans för Neuron HQ:** Kritisk säkerhetslucka identifierad — om vår errors.md eller patterns.md korrupteras av felaktiga mönster kan de initiera självförstärkande felcykler (ett dåligt mönster genererar fler dåliga beslut som lagras som "bekräftande" mönster). A-MemGuards konsensusbaserade validering — att jämföra nya mönster mot multipla befintliga minnen — kunde implementeras som ett valideringssteg i Historian-agentens skrivprocess. Kompletterar TAME:s dual-memory-approach med explicit attack-resiliens.
**Keywords:** memory-security, proactive-defense, consensus-validation, dual-memory, error-cycle, agent
**Relaterat:** techniques.md#TAME, techniques.md#AgentSys, techniques.md#SkillJect, techniques.md#Skill-Inject

---

## MIRIX: Multi-Agent Memory System for LLM-Based Agents (2025)
**Källa:** arxiv:2507.07957 | Yu Wang et al.
**Kärna:** MIRIX definierar sex distinkta minnestyper: Core (identitet), Episodic (händelser), Semantic (fakta), Procedural (rutiner), Resource Memory (resurser) och Knowledge Vault (djup kunskap). Ett multi-agent-ramverk koordinerar dynamiskt uppdatering och hämtning av varje minnestyp. Minnesystemet är multimodalt — hanterar skärmdumpar och text — och erbjuder realtidsövervakning med lokal lagring för integritet.
**Nyckelresultat:** 35% högre accuracy än RAG-baslinjen på ScreenshotVQA (20 000 skärmdumpar) med 99.9% mindre lagring. State-of-the-art 85.4% på LOCOMO (long-form konversation).
**Relevans för Neuron HQ:** MIRIX:s sex minnestyper erbjuder en finare indelning än vår nuvarande fyrafilsstruktur. Speciellt intressant: separering av Procedural Memory (hur saker görs) från Semantic Memory (vad saker är) — i Neuron HQ motsvarar detta skillnaden mellan patterns.md (procedurellt) och en potentiell kunskapsfil (semantiskt). Resource Memory-konceptet (t.ex. versioner, beroenden) saknas helt i vår arkitektur. 99.9% lagringsreduktion via intelligent minneshantering motiverar mer sofistikerad komprimering.
**Keywords:** memory, multi-agent, six-memory-types, multimodal, episodic, semantic, procedural, agent
**Relaterat:** techniques.md#MemGPT, techniques.md#Pancake, techniques.md#FluxMem, techniques.md#CAM

---

## Anatomy of Agentic Memory: Taxonomy and Empirical Analysis of Evaluation and System Limitations (2026)
**Källa:** arxiv:2602.19320 | Dongming Jiang et al.
**Kärna:** Strukturerad analys av agentminne från både arkitektur- och systemperspektiv. Introducerar en koncis taxonomi baserad på fyra minnesstrukturer och analyserar kritiska svagheter: benchmark-mättnadseffekter (existerande benchmarks är för enkla), metriker som inte fångar semantisk nytta, prestanda som varierar kraftigt beroende på backbone-modell, och latens-/throughput-overhead som sällan rapporteras. Kopplar minnesstruktur till empiriska begränsningar.
**Nyckelresultat:** Nuvarande benchmarks är mättade — toppmetoder presterar nära tak, men detta reflekterar inte verklig kapacitet. LLM-bedömare (judge models) är känsliga för prompt-formulering, vilket gör evaluering opålitlig. Minnessystemkostnader (latens, tokens) ignoreras systematiskt i litteraturen.
**Relevans för Neuron HQ:** Viktig meta-insikt — om vi evaluerar vår minnesarkitekturs effektivitet måste vi undvika ytliga metriker. Att patterns.md "hittar rätt mönster" 90% av gångerna kan bero på att uppgifterna är enkla, inte att systemet är bra. Backbone-beroendet innebär att vår minnesarkitektur kan prestera väldigt olika om vi byter LLM-modell. Latens-perspektivet är kritiskt: varje minneshämtning kostar tid och tokens, och denna kostnad bör mätas och optimeras.
**Keywords:** memory, taxonomy, evaluation, benchmark-saturation, latency, system-overhead, survey
**Relaterat:** techniques.md#StructMemEval, techniques.md#LoCoMo-Plus, techniques.md#Graph-based-Agent-Memory

---

## Why Agentic-PRs Get Rejected: A Comparative Study of Coding Agents (2026)
**Källa:** arxiv:2602.04226 | Sota Nakashima et al.
**Kärna:** Empirisk inspektion av 654 avvisade pull requests från fem kodningsagenter i AIDev-datasetet. Identifierar sju avvisningskategorier unika för agentgenererade PRs, inklusive misstro mot AI-genererad kod. Observerar agentspecifika mönster (t.ex. automatisk tillbakadragning av inaktiva PRs). Avslöjar att 67.9% av avvisade PRs saknar explicit granskningsfeedback, och föreslår heuristiker för att minska andelen oklassificerbara avvisningar.
**Nyckelresultat:** 7 avvisningskategorier är unika för agentgenererade PRs. 67.9% av avvisade PRs saknar explicit granskningsfeedback. Signifikant variation i avvisningsmönster mellan olika kodningsagenter.
**Relevans för Neuron HQ:** Direkt relevant för att förbättra vår Implementer-agents PR-kvalitet. De agentspecifika felbeteendena (distrust of AI code, specification drift, inaktiva PRs) är risker vi bör designa mot. Att 67.9% av avvisningar saknar feedback motiverar att vår Reviewer-agent alltid ska generera explicit feedback — tyst avvisning ger ingen lärdom. Heuristikerna för att klassificera avvisningar kunde integreras i errors.md för att systematiskt spåra varför ändringar misslyckas.
**Keywords:** coding-agent, pull-request, rejection, empirical-study, AI-distrust, feedback, agent
**Relaterat:** techniques.md#How-AI-Coding-Agents-Communicate, techniques.md#Wink, techniques.md#Do-Autonomous-Agents-Contribute-Test-Code

---

## Are Coding Agents Generating Over-Mocked Tests? An Empirical Study (2026)
**Källa:** arxiv:2602.00409 | Andre Hora et al. (MSR 2026)
**Kärna:** Storskalig empirisk studie av mock-användning i agentgenererade tester, baserad på 1.2 miljoner commits i 2 168 TypeScript/JavaScript/Python-repon under 2025. Analyserar hur ofta kodningsagenter inkluderar mocks i tester jämfört med mänskliga utvecklare, och om denna överanvändning av mocks potentiellt underminerar testernas förmåga att validera verkliga interaktioner.
**Nyckelresultat:** 23% av agent-commits modifierar testfiler (vs 13% för icke-agenter). 36% av agent-commits lägger till mocks i tester (vs 26% för icke-agenter). 60% av repon med agentaktivitet har agenttest-aktivitet; 68% av dessa har mock-aktivitet. Nyare repon har ännu högre andel agent-genererade test- och mock-commits.
**Relevans för Neuron HQ:** Kritisk varning för vår Tester-agent — om den genererar tester med överdrivet mycket mocks validerar testerna inte verkligt beteende utan bara att koden "ser rätt ut". Motiverar att lägga till explicit vägledning i Tester-agentens instruktioner om att prioritera integrationstester och begränsa mock-användning. En mock-policy bör definieras (t.ex. "mocka bara externa tjänster och I/O, aldrig intern logik"). Stärker insikten från Do Autonomous Agents Contribute Test Code.
**Keywords:** testing, mocking, coding-agent, empirical-study, test-quality, integration-tests
**Relaterat:** techniques.md#Do-Autonomous-Agents-Contribute-Test-Code, techniques.md#AI-IDEs-or-Autonomous-Agents, techniques.md#Wink

---

## U-Mem: Towards Autonomous Memory Agents (2026)
**Källa:** arxiv:2602.22406 | Xinle Wu et al.
**Kärna:** U-Mem föreslår autonoma minnesagenter som aktivt förvärvar, validerar och kurerar kunskap till minimal kostnad — till skillnad från existerande passiva minnesagenter som bara lagrar information som råkar vara tillgänglig. Använder (i) en kostnadsmedveten kunskapsextraktionskaskad som eskalerar från billiga self/teacher-signaler till verktygsverifierad research och, bara vid behov, expertfeedback, och (ii) semantisk Thompson sampling för att balansera exploration/exploitation över minnen och motverka cold-start-bias.
**Nyckelresultat:** Överträffar konsekvent tidigare minnesbaslinjer och kan överträffa RL-baserad optimering. +14.6 poäng på HotpotQA (Qwen2.5-7B) och +7.33 poäng på AIME25 (Gemini-2.5-flash).
**Relevans för Neuron HQ:** Direkt tillämpbar princip — vår Historian-agent är idag passiv (lagrar bara det som genereras). U-Mem-konceptet att aktivt söka kunskap vid osäkerhet (t.ex. automatiskt söka efter lösningar i errors.md eller extern dokumentation när ett mönster inte matchar) kunde göra Historian och Researcher proaktiva istället för reaktiva. Kostnadsmedveten eskalering (billig signal först, dyr bara vid behov) matchar BudgetMem-principen.
**Keywords:** memory, autonomous, active-acquisition, cost-aware, Thompson-sampling, agent
**Relaterat:** techniques.md#BudgetMem, techniques.md#Live-Evo, techniques.md#EMPO²

---

## Focus: Active Context Compression — Autonomous Memory Management in LLM Agents (2026)
**Källa:** arxiv:2601.07190 | Nikhil Verma
**Kärna:** Focus är en agent-centrerad arkitektur inspirerad av slemsvampens (Physarum polycephalum) biologiska utforskningsstrategier. Agenten bestämmer autonomt när den ska konsolidera nyckelinsikter i ett persistent "Knowledge"-block och aktivt pruna (ta bort) rå interaktionshistorik. Till skillnad från passiv extern sammanfattning kontrollerar agenten själv sin minneshantering. Använder ett optimerat scaffold med persistent bash + string-replacement-editor.
**Nyckelresultat:** 22.7% tokenreduktion (14.9M → 11.5M tokens) med bibehållen accuracy (60%) på SWE-bench Lite-instanser. I genomsnitt 6.0 autonoma komprimeringar per uppgift, med tokenbesparingar upp till 57% på individuella instanser. Visar att modeller kan autonomt självreglera sin kontext med rätt verktyg och prompting.
**Relevans för Neuron HQ:** Direkt tillämpbar på alla våra agenter som arbetar med långa sessioner. Istället för att passivt fylla kontextfönstret tills det svämmar över kunde Implementer och Researcher agenter ges verktyg att själva konsolidera och pruna sin historik. Principen att agenten styr sin egen minneshantering (snarare än extern trunkering) ger bättre resultat och matchar MemGPT:s filosofi. 57% besparing på enskilda instanser är signifikant för kostnadsoptimering.
**Keywords:** context-compression, autonomous, pruning, knowledge-consolidation, SWE-bench, token-efficiency, agent
**Relaterat:** techniques.md#MemGPT, techniques.md#CMV, techniques.md#DeepMiner, techniques.md#MECW

---

## TALM: Tree-Structured Multi-Agent Framework with Long-Term Memory for Scalable Code Generation (2025)
**Källa:** arxiv:2510.23010 | Ming-Tung Shen et al.
**Kärna:** TALM integrerar strukturerad uppgiftsdekomponering, lokaliserad om-resonering och långtidsminnesmekanismer i ett träd-baserat multi-agent-ramverk. Förälder-barn-relationer kombinerat med divide-and-conquer förbättrar resonerandeflexibilitet och möjliggör effektiv felkorrigering över olika uppgiftsomfång. En långtidsminnesmodul möjliggör semantisk sökning och integration av tidigare kunskap, vilket stödjer implicit självförbättring genom erfarenhetsåteranvändning.
**Nyckelresultat:** Konsekvent stark resonemangsprestanda och hög tokeneffektivitet på HumanEval, BigCodeBench och ClassEval. Trädstrukturen möjliggör lokaliserad felkorrigering utan att behöva re-resonera hela uppgiften.
**Relevans för Neuron HQ:** Trädbaserad dekomponering är en naturlig evolution av vår Manager → Worker-pipeline. Istället för en flat lista av agenter kunde Manager skapa en trädstruktur där Researcher delegerar till sub-researchers, och varje nod har lokaliserad felkorrigering. Långtidsminnesmodulen med semantisk sökning matchar vår patterns.md + errors.md men med mer sofistikerad retrieval. Lokaliserad om-resonering undviker att hela konversationen måste göras om vid fel i en deluppgift.
**Keywords:** tree-structure, multi-agent, long-term-memory, divide-and-conquer, code-generation, error-correction
**Relaterat:** techniques.md#Agyn, techniques.md#Excalibur, techniques.md#TraceCoder, techniques.md#E-mem

---

## Mem2ActBench: Evaluating Long-Term Memory Utilization in Task-Oriented Autonomous Agents (2026)
**Källa:** arxiv:2601.19935 | Yiting Shen et al.
**Kärna:** Mem2ActBench testar huruvida agenter proaktivt kan utnyttja långtidsminne för att utföra verktygsbaserade åtgärder — inte bara passivt återkalla isolerade fakta. Benchmarket simulerar persistent assistent-användning där användare nämner samma ämne över långa, avbrutna interaktioner och förväntar sig att tidigare etablerade preferenser och uppgiftstillstånd implicit tillämpas. 400 verktygsanvändningsuppgifter genereras med en omvänd genereringsmetod, varav 91.3% bekräftas som starkt minnesberoende av mänskliga utvärderare.
**Nyckelresultat:** Experiment på sju minnesramverk visar att nuvarande system är otillräckliga för att aktivt utnyttja minne för parametergrundning. Minnessystem klarar retrieval men misslyckas med att omvandla minne till korrekta åtgärder.
**Relevans för Neuron HQ:** Viktig evaluerings-insikt — att vår Researcher-agent kan hitta rätt mönster i patterns.md räcker inte; den måste kunna omvandla mönstret till korrekt åtgärd (rätt verktygsanrop, rätt parametrar). Benchmarket kan användas för att testa om våra agenter faktiskt *tillämpar* lagrade erfarenheter, inte bara återger dem. Kompletterar StructMemEval (struktur) och LoCoMo-Plus (kognitiv) med en åtgärdsfokuserad dimension.
**Keywords:** benchmark, memory-to-action, long-term-memory, tool-use, parameter-grounding, evaluation, agent
**Relaterat:** techniques.md#StructMemEval, techniques.md#LoCoMo-Plus, techniques.md#Anatomy-of-Agentic-Memory

---

## AI Meets Brain: Memory Systems from Cognitive Neuroscience to Autonomous Agents (2025)
**Källa:** arxiv:2512.23343 | Jiafeng Liang et al.
**Kärna:** Omfattande interdisciplinär survey (57 sidor) som systematiskt syntetiserar kunskap om minne från kognitiv neurovetenskap, LLMs och agenter. Klargör minnets definition och funktion längs en progressiv bana från neurovetenskap genom LLMs till agenter. Ger komparativ analys av minnestaxonomi, lagringsmekanismer och komplett hanteringslivscykel från både biologiskt och artificiellt perspektiv. Utforskar minnessäkerhet från dubbla perspektiv (attack och försvar). Identifierar multimodalt minne och färdighetsförvärv som framtida forskningsriktningar.
**Nyckelresultat:** Identifierar att existerande arbeten begränsas av interdisciplinära barriärer — agentforskare assimilerar inte essensen av mänskliga minnesmekanismer. Sammanställer mainstream-benchmarks för evaluering av agentminne och kartlägger säkerhetsaspekter systematiskt.
**Relevans för Neuron HQ:** Fungerar som referensverk för framtida minnesarkitekturbeslut. Neurvetenskapliga paralleller (konsolidering, glömska, interferens) kan vägleda design av patterns.md-hantering — t.ex. biologisk sömnkonsolidering som inspiration för periodisk minnesoptimering. Säkerhetsperspektivet (attack/försvar) kompletterar A-MemGuard och AgentSys. Multimodalt minne är relevant om vi integrerar skärmdumpar eller diagram i framtiden.
**Keywords:** survey, cognitive-neuroscience, memory-taxonomy, security, multimodal, interdisciplinary, agent
**Relaterat:** techniques.md#Graph-based-Agent-Memory, techniques.md#A-MemGuard, techniques.md#MIRIX, techniques.md#CAM

---

## MemoPhishAgent: Memory-Augmented Multi-Modal LLM Agent for Phishing URL Detection (2026)
**Källa:** arxiv:2602.21394 | Xuan Chen et al.
**Kärna:** MemoPhishAgent är en minnesförstärkt multi-modal LLM-agent som dynamiskt orkestrerar phishing-specifika verktyg och utnyttjar episodiskt minne av tidigare resonemangsträjektorier för att styra beslut om återkommande och nya hot. Till skillnad från deterministiska prompt-baserade pipelines lagrar agenten episodiska minnen av hur den resonerade vid tidigare fall, och använder dessa minnen för att vägleda framtida beslut — utan extra beräkningskostnad.
**Nyckelresultat:** +13.6% recall jämfört med tre SOTA-baslinjer på publika dataset. +20% recall på verkliga URL:er från sociala medier. Episodiskt minne bidrar med upp till 27% recall-vinst. I produktion bearbetar systemet 60K högrisks-URL:er/vecka med 91.44% recall.
**Relevans för Neuron HQ:** Episodiskt minne av *resonemangsträjektorier* (inte bara fakta) är direkt tillämpbart. Vår errors.md lagrar idag feltyper men inte hur agenten resonerade vid tidigare liknande problem. Om Implementer-agenten sparade framgångsrika resonemangskedjor (t.ex. "vid dependency-conflict: först kontrollera versions-constraints, sedan...") kunde dessa episodiska minnen vägleda framtida problemlösning mer effektivt. 27% recall-vinst utan extra beräkning motiverar investering i resonemangsloggar.
**Keywords:** episodic-memory, reasoning-trajectory, multi-modal, production-deployment, tool-orchestration, agent
**Relaterat:** techniques.md#E-mem, techniques.md#Live-Evo, techniques.md#MIRIX

---

## Talk Freely, Execute Strictly: Schema-Gated Agentic AI (2026)
**Källa:** arxiv:2603.06394 | Joel Strickland et al.
**Kärna:** Schema-gated orchestration separerar konversativ flexibilitet från deterministic exekvering. LLM-agenter får tala fritt i naturligt språk, men inget kör förrän det valideras mot ett machine-checkable schema på workflow-nivå. Designad för att möta två motsatta krav: determinism (nödvändigt för reproducibility) och konversativ flexibilitet (nödvändigt för användarinteraktion). Identifierar en empirisk Pareto-front mellan generativa och workflow-centriska system.
**Nyckelresultat:** Multi-model utvärdering över 3 LLM-familjer visar Krippendorff α=0.80 för execution determinism och α=0.98 för konversativ flexibilitet. En konvergens-zon identifieras mellan de två extremerna.
**Relevans för Neuron HQ:** Direkt tillämpbar på vår Manager-agent som designar uppgifter för Researcher/Implementer. Schema-gated approach motiverar att Manager alltid genererar en explicit task-specifikation (analogt med ett schema) innan arbetare-agenter exekverar. Separationen av intention från exekvering matchar ESAA-filosofin (redan dokumenterad).
**Keywords:** schema-gating, execution-determinism, conversational-flexibility, workflow-orchestration, agent-architecture
**Relaterat:** techniques.md#ESAA, techniques.md#Anthropics-råd-om-agentarkitektur

---

## ESAA-Security: Event-Sourced, Verifiable Architecture for Agent-Assisted Security Audits (2026)
**Källa:** arxiv:2603.06365 | Elzo Brito dos Santos Filho
**Kärna:** ESAA-Security är en specialisering av den tidigare dokumenterade ESAA-arkitekturen för säkerhetsgranskning av AI-genererad kod. Strukturerar granskningsprocessen i fyra faser: reconnaissance, domain audit execution, risk classification, och final reporting. Agenter emitterar strukturerade intentioner; en orkestrerare validerar, persisterar till append-only-logg, och verifierar konsistens genom replay och hashing. Resultatet är en spårbar, reproducerbar audit-arkitektur vars slutrapport är granskningsbar by construction.
**Nyckelresultat:** Implementerad med 26 uppgifter, 16 säkerheitsdomäner, och 95 körbara checks. Open source implementering tillgänglig. Adresserar det faktum att prompt-baserad säkerhetsgranskning ofta lider av svag täckning, dålig reproducerbarhet och frånvaro av audit trail.
**Relevans för Neuron HQ:** Utökar vår nuvarande Reviewer-agent med formell säkerhetsgranskningsstruktur. ESAA-Security:s 26 uppgifter och 16 domäner kan tjäna som template för vilka checkar Reviewer bör utföra på varje PR. Append-only-loggen är direkt relevant för runs.md-spårbarhet.
**Keywords:** security-audit, event-sourcing, append-only-log, verification, reproducibility, agent
**Relaterat:** techniques.md#ESAA, techniques.md#AgenticSCR, techniques.md#Fault-Tolerant-Sandboxing

---

## Agentic LLM Planning via Step-Wise PDDL Simulation (2026)
**Källa:** arxiv:2603.06064 | Kai Göbel et al.
**Kärna:** PyPDDLEngine är en Planning Domain Definition Language (PDDL) simuleringsmotor som exponerar planeringsoperationer som LLM-verktygsanrop via Model Context Protocol (MCP). Istället för att committa till en komplett åtgärdssekvens i förväg fungerar LLM som en interaktiv sökpolicy som väljer en åtgärd åt gången, observerar resulterande tillstånd, och kan resetta och försöka igen.
**Nyckelresultat:** Claude Haiku 4.5 uppnår 66.7% framgång på 102 Blocksworld-instanser (vs 63.7% för direkt LLM-planering, 85.3% för klassisk planering). Agentic planering ger konsistenta men blygsamma fördelar (+3%) men till 5.7x högre tokenkostnad. LLM-planer är ofta kortare än klassiska planer, vilket tyder på återkallelse från träningsdata snarare än generaliserbara planeringsförmågor.
**Relevans för Neuron HQ:** Viktig varning — interaktiv planering kan ge blygsamma förbättringar till höga kostnader. Relevansnedbrytnig sker när miljö-feedback är svag (t.ex. PDDL-feedback) men stark när feedback är externalt grundat (t.ex. kompileringsfel). Implikation: vår Manager-agent kan fokusera mindre på uppgiftsplanering (där LLM-fördelar är små) och mer på iterativ kurskorrigering baserad på faktiska Implementer-outputexekvering (där feedbacken är stark).
**Keywords:** PDDL, planning, agentic, interactive-search-policy, MCP, task-planning
**Relaterat:** techniques.md#Excalibur, techniques.md#PARC

---

## MASFactory: Graph-Centric Framework for Orchestrating LLM-Based Multi-Agent Systems (2026)
**Källa:** arxiv:2603.06007 | Yang Liu et al.
**Kärna:** MASFactory är ett ramverk för orkestrering av LLM-baserade multi-agent-system genom graf-centrisk modellering. Workflow modeleras som riktade beräkningsgrafar där noder är agenter/subworkflows och kanter kodar beroenden och meddelandeöverföring. Introducerar "Vibe Graphing," en human-in-the-loop-teknik som kompilerar naturligt-språk-intention in i en editerbar workflow-specifikation och sedan en körbar graf. Ramverket erbjuder återanvändbara komponenter, pluggbar kontextintegration och en visualiserare för topologiöversikt, runtime-spårning och human-in-the-loop-interaktion.
**Nyckelresultat:** Utvärderad på sju publika benchmarks. Validerar reproducibilities av representativa multi-agent-metoder. Vibe Graphing möjliggör konvertering av naturligt språk till körbar graph. Open source kod tillgänglig.
**Relevans för Neuron HQ:** Direkt tillämpbar på vår Manager-agent-design. Manager kunde implementeras som en Vibe Graph-generator: ta användarens brief på naturligt språk, generera en DAG med Researcher → Implementer → Tester → Reviewer → Merger-kedja, sedan orkestrering det. Visualiserings- och runtime-spårnings-komponenterna är särskilt användbara för att debugga agentkörningar.
**Keywords:** multi-agent, graph-centric, workflow-orchestration, Vibe-Graphing, human-in-the-loop
**Relaterat:** techniques.md#Agyn, techniques.md#TALM, techniques.md#Excalibur

---

## XAI for Coding Agent Failures: Transforming Execution Traces into Actionable Insights (2026)
**Källa:** arxiv:2603.05941 | Arun Joshi
**Kärna:** Systematisk explainable AI-approach som transformerar råa agentexekveringsspår till strukturerade, mänskliga-tolkbara förklaringar. Består av tre komponenter: (1) en domän-specifik felmönster-taxonomi från analys av verkliga agentfel, (2) ett automatiskt annoteringsmönster som klassificerar fel enligt schema, (3) en hybrid-förklaringsgenerator som producerar visuella exekveringsflöden, naturligt-språk-förklaringar och handlingsrekommendationer. Användarstudier visar att agentfel kan diagnosticeras 2.8 gånger snabbare och repareras med 73% högre noggrannhet med denna strukturerade metod jämfört med råa spår.
**Nyckelresultat:** Användarstudier med 20 deltagare (10 tekniska, 10 icke-tekniska). 2.8x snabbare felprocessering, 73% bättre reparationsnoggrannhet. Överträffar ad-hoc state-of-the-art-modell-förklaringar.
**Relevans för Neuron HQ:** Direkt applicerbart på vår Tester-agent. Istället för bara "FAIL"/"PASS" kunde Tester generera strukturerade felkategorier (t.ex. "RuntimeError in module X vid rad Y, orsakat av Z"). Dessa strukturerade fel kunde sedan automatiskt lagras i errors.md med domaänspecifika rekommendationer. Mottar direkt på hur errors.md bör se ut — med felmönster, rotorsak och reparationshandlingar, inte bara råa stack traces.
**Keywords:** XAI, coding-agent, failure-taxonomy, explainability, debugging, user-study
**Relaterat:** techniques.md#TraceCoder, techniques.md#Wink, techniques.md#Why-Agentic-PRs-Get-Rejected

---

## DeepFact: Co-Evolving Benchmarks and Agents for Deep Research Factuality (2026)
**Källa:** arxiv:2603.05912 | Yukun Huang et al.
**Kärna:** DeepFact adresserar utmaningen att verifiera claim-nivå faktualitet i deep research reports (DRRs) genererade av search-augmenterade LLM-agenter. Föreslår "Evolving Benchmarking via Audit-then-Score" (AtS) där benchmark-etiketter och rationales är explicit reviserbara. När en verifiering-agent är oense med benchmark måste den lämna evidens; en granskare dömer tvisten; accepterade ändringar uppdaterar benchmark före modell-scoring. Introducerar DeepFact-Bench, ett versionerad DRR-faktualitets-benchmark med granskningsbar rationales, och DeepFact-Eval, en dokumentnivå-verifierings-agent.
**Nyckelresultat:** Oassisterad expert-noggrannhet på dolda test-set: 60.8%. Efter fyra AtS-rundor: 90.9%. Experiment validerade på 4 LLM-modeller. DeepFact-Eval överträffar befintliga verifierare och transfererar väl till externa faktualitets-dataset.
**Relevans för Neuron HQ:** Principen om "audit-then-score" — att låta granskare ifrågasätta benchmark-etiketter och uppdatera dem baserat på evidens — kunde tillämpas på patterns.md-hantering. Om en Implementer-agent ifrågasätter ett lagrad mönster (t.ex. "detta mönster fungerar inte här"), kunde systemet kräva evidens och uppdatera patterns.md på basis av granskningen. Förbättrar mönster-kvalitet över tid.
**Keywords:** factuality, verification, benchmark-evolution, audit, deep-research, agent
**Relaterat:** techniques.md#Live-Evo, techniques.md#LoCoMo-Plus, techniques.md#Anatomy-of-Agentic-Memory

---

## ProEvolve: Programmable Evolution for Agent Benchmarks (2026)
**Källa:** arxiv:2603.05910 | Guangrui Li et al.
**Kärna:** ProEvolve är ett graf-baserat ramverk som gör agentmiljö-evolution programmerad. En typifierad relationsgraf representerar miljön enhetligt: data, verktyg och schema. Graf-transformationer uttrycker ändringar koherent — att lägga till, ta bort eller ändra kapabiliteter propageras automatiskt genom verktyg, scheman och dataåtkomst. Ramverket kan programmera evolutionsdynamik som graf-transformationer för att generera miljöer automatiskt och instantiera task-sandboxar via subgraf-sampling.
**Nyckelresultat:** Valde en enskild miljö till 200 miljöer och 3,000 uppgiftssandboxar. Benchmarked representative agenter. Visar hur miljö-evolution kan skaleras och kontrolleras.
**Relevans för Neuron HQ:** Relevant för att testa vår swarm-robusthet. Istället för att bara testa på statiska kodbaser kunde vi skapa programmatiska transformationer (t.ex. "lägg till ett nytt klassifieringsparadigm", "ta bort en modul", "ändra ett API:s signtatur") och se hur agenter anpassar sig. Principen om koherent propagation av ändringar är relevant för att uppdatera patterns.md när kodbasen förändras — ändringar i ett mönster bör propageras till relaterade mönster.
**Keywords:** environment-evolution, graph-transformation, benchmark, programmable, scalability, agent
**Relaterat:** techniques.md#MAGNET, techniques.md#Anatomy-of-Agentic-Memory

---

## ReflexiCoder: Self-Reflection and Self-Correction via Reinforcement Learning (2026)
**Källa:** arxiv:2603.05863 | Juyong Jiang et al.
**Kärna:** ReflexiCoder internaliserar en strukturerad resonemangs-trajektoria — initial generering, bug- och optimerings-medveten reflektion, och självkorrigering — direkt in i modellens vikter via reinforcement learning. Till skillnad från tidigare metoder som förlitar sig på externa oracle eller exekveringsfeedback, skiftar ReflexiCoder paradigmet från externt-beroende förfining till intrinsisk, fullt autonom självreflektion och självkorrigering vid inferens-tid. Använder RL-zero-träningsparadigm med granulärer belöningsfunktioner för att optimera hela reflektion-korrekterings-trajektorian.
**Nyckelresultat:** ReflexiCoder-8B uppnår SOTA bland öppna modeller i 1.5B-14B-intervallet: 94.51% på HumanEval, 87.20% på HumanEval Plus, 81.80% på MBPP, 52.21% på LiveCodeBench. ~40% token-effektivitetsvinst via disciplinerad, höghastighets-resonering.
**Relevans för Neuron HQ:** Direkt tillämpbar princip för vår Implementer-agent. Istället för att Implementer kräver extern feedback från Tester för varje iteration kunde den lära sig att självreflektera och korrigera sitt eget arbete. Dock: RL-träning är dyrt, så detta är en framtida optimering snarare än omedelbar implementering. 40% token-effektivitet är betydande.
**Keywords:** self-reflection, self-correction, reinforcement-learning, code-generation, LLM, efficiency
**Relaterat:** techniques.md#PARC, techniques.md#TraceCoder, techniques.md#Wink

---

## CodeScout: Contextual Problem Statement Enhancement for Software Agents (2026)
**Källa:** arxiv:2603.05744 | Manan Suri et al.
**Kärna:** CodeScout adresserar problemet med underspecificerade problem-uttalanden som saknar tillräcklig uppgifts-kontext. Metoden utför ett systematiskt kontextuell-fråge-förfining genom lätt pre-exploration av målkodbas, konverterar underspecificerade användarförfrågningar till omfattande, handlings-orienterade problem-uttalanden. Utförare fokuserad kontextomfattning, utför multiperspektiv-analys för potentiella fixes och utforsknings-möjligheter, sedan syntetiserar dessa insikter in i förbättrade problem-uttalanden med reproduktions-steg, förväntade beteenden och riktade utforsknings-hints.
**Nyckelresultat:** 20% förbättring i resolution-rates på SWEBench-Verified jämfört med baslinje. Upp till 27 ytterligare problem lösta. Reducerar icke-konvergerande agent-träjektorier.
**Relevans för Neuron HQ:** Direkt tillämpbar på vår Manager-agent. Manager kunde köra CodeScout-liknande pre-exploration innan den skapar Researcher/Implementer-uppgifter — i stället för att ge en vag problem-beskrivning kunde Manager först utforska kodbasen och generera ett omfattande, strukturerat brief. Motiveras av insikten att 20% förbättring kommer från bättre problem-specifikation, inte från bättre agents.
**Keywords:** query-refinement, context-enhancement, problem-specification, codebase-exploration, SWE-bench
**Relaterat:** techniques.md#Excalibur, techniques.md#Anthropics-råd-om-agentarkitektur

---

## Tool-Genesis: Task-Driven Tool Creation Benchmark for Self-Evolving Language Agents (2026)
**Källa:** arxiv:2603.05578 | Bowei Xia et al.
**Kärna:** Tool-Genesis är ett diagnostik-benchmark som mäter agent-förmågor för att skapa, anpassa och underhålla verktyg från uppgiftskrav. Till skillnad från befintliga benchmarks som förlitar sig på fördefinierade specifikationer använder Tool-Genesis dynamiskt genererade verktyg från abstrakta krav (utan förinställda specifikationer) och bedömer om agenter kan lösa verkliga problem med dessa verktyg. Identifierar tre avseenden för bedömning: interface-överensstämmelse, funktionell-korrekthet och downstream-nytta.
**Nyckelresultat:** Även state-of-the-art-modeller misslyckas att producera precisetverktygsgränssnitt eller körbar logik i en-shot-setting. Små initiala fel förstärks genom pipeline-lösa, ledande till skarp nedgång i downstream-metrik.
**Relevans för Neuron HQ:** Relevant för att testa vår Implementer-agents förmåga att skapa verktyg/utilities när kodbasen växer. Tool-Genesis-benchmarkens struktur kunde inspirera hur vi testar om Implementer kan designa robusta abstraktion-lagrar och hjälpfunktioner snarare än bara inline-lösningar.
**Keywords:** tool-creation, benchmark, self-evolving, autonomous-agent, interface-compliance, correctness
**Relaterat:** techniques.md#Hybrid-Gym, techniques.md#ParaCodex

---

## RepoLaunch: Automating Build&Test Pipeline (2026)
**Källa:** arxiv:2603.05026 | Kenan Li et al.
**Kärna:** RepoLaunch är den första agenten som autonomt kan lösa beroenden, kompilera källkod och extrahera testresultat för arkiv på godtyckliga programmeringsspråk och operativsystem. Presenterar en fullt automatiserad pipeline för SWE-datasetskapning där endast uppgiftskonstruktion kräver mänsklig intervention. RepoLaunch automatiserar resten. Flera arbeten om agent-benchmarking och träning har redan adopterat RepoLaunch för automatiserad uppgiftsgenerering.
**Nyckelresultat:** Första agenten med denna förmåga. Enabler skalbar benchmarking och träning av kodningsagenter och LLMs.
**Relevans för Neuron HQ:** Direkten applicerbar på vår Tester-agent. RepoLaunch-principerna för språk-agnostisk beroende-lösning och testextrahering kunde integrera in i hur vår Tester bygger och kör tester på nya kodbaser. Denna förmåga (beroendehantering över språk) är kritisk för att Tester ska kunna arbeta på vilken typ av projekt som helst.
**Keywords:** build-pipeline, test-extraction, dependency-resolution, multi-language, automation, agent
**Relaterat:** techniques.md#ParaCodex, techniques.md#Environment-in-the-Loop, techniques.md#Fault-Tolerant-Sandboxing

---

## EigenData: Multi-Agent Platform for Function-Calling Data Synthesis, Auditing, and Repair (2026)
**Källa:** arxiv:2603.05553 | Jiaao Chen et al.
**Kärna:** EigenData är en integreerad, självevolverande plattform för automatisering av data-livscykeln för function-calling agents. En top-level orkestrerare koordinerar tre specialiserade subsystem: DatabaseAgent för realistisk domän-databaskonstruktion, CodingAgent för verifierad körbar miljö-generering med iterativ test-debug-loop, och DataAgent för multi-turn trajektori-syntes med självevolverande prompt-optimering. Korskomponen-feedback säkerställer konsistens över alla artefakter. Applikation: revidering och reparation av Berkeley Function-Calling Leaderboard (BFCL-V3).
**Nyckelresultat:** Identifierade systematiska fel i funktions-scheman, implementeringar och referens-träjektorier. Automatisk korrektion genom koordinerad schema-förfining, kod-nivå-bugfix och trajektori-modifiering. En outcome-aware-evaluerings-protokoll bedömer uppgiftssucces via databas-tillstånds-korrekthet snarare än turn-nivå-trajektori-matchning.
**Relevans för Neuron HQ:** Tre-agent-orkestrerings-mönstret (DatabaseAgent, CodingAgent, DataAgent) liknar vår arkitektur. Speciellt relevant: outcome-aware evaluation — bedömer framgång genom faktisk systemtillstånds-förändring, inte genom proxyvärden. Denna princip skulle förfina hur vår Tester bedömer framgång (går det att bygga? går testerna? är utmatningen semantiskt korrekt?).
**Keywords:** multi-agent, data-synthesis, function-calling, outcome-aware-evaluation, benchmark-repair, orchestration
**Relaterat:** techniques.md#TALM, techniques.md#Mem2ActBench

---

## FireBench: Evaluating Instruction Following in Enterprise and API-Driven LLM Applications (2026)
**Källa:** arxiv:2603.04857 | Yunfan Zhang et al.
**Kärna:** FireBench är ett instruction-following-benchmark för verklig-världen enterprise- och API-driven LLM-användningar. Till skillnad från befintliga benchmarks som bedömer naturligt-språk-genererings-begränsningar fokuserar FireBench på sex kärnförmågor-dimensioner: information extraction, customer support, coding agents och andra, med över 2,400 samples. Utvärderade 11 LLMs och rapporterar sin instruction-following-beteende i enterprise-scenarion.
**Nyckelresultat:** Över 2,400 samples spannande sex förmågor. Identifierar skillnader mellan modellers beteenden i enterprise-scenarier.
**Relevans för Neuron HQ:** FireBench:s sex förmågor kunde tjäna som rama för hur vi testar våra agenter. Speciellt relevant: kan agenten följa strukturerade instruktioner när dess output måste passa in i ett strikt format? (motsatsen till fri generation). Detta är kritisk för vår Manager → Worker-pipeline där utgångar måste följa strukturerade JSON-scheman.
**Keywords:** instruction-following, benchmark, enterprise, API-driven, LLM, evaluation
**Relaterat:** techniques.md#Anthropics-råd-om-agentarkitektur, techniques.md#Talk-Freely-Execute-Strictly

---

## Sensitivity-Aware Retrieval-Augmented Intent Clarification (2026)
**Källa:** arxiv:2603.06025 | Maik Larooij
**Kärna:** Intent clarification i konversationssök-system genom att tillägga retrieval och sensitivity-aware-försvar. I känsliga domäner (healthcare, juridik) måste retrieval-databasen skyddas mot information leakage. Definierar attack-modeller, designar sensitivity-aware-försvarsmekanismer på retrieval-nivå, och utvecklar evaluering-metoder för att mäta trade-off mellan skydd och nytta.
**Nyckelresultat:** Frammifrån forskning-riktning för sensitive-data retrieval med känsla-medveten protection.
**Relevans för Neuron HQ:** Relevant om agenter arbetar med känslig kod eller data — patterns.md och errors.md kunde innehålla proprietär tekniker eller säkerhetsförluster. En sensitivity-aware-hämtning kunde begränsa vilka mönster/fel som visas baserat på säkerhet-klassificering.
**Keywords:** retrieval, intent-clarification, sensitive-data, privacy, security, RAG
**Relaterat:** techniques.md#AgentSys, techniques.md#A-MemGuard, techniques.md#ESAA-Security

---

## Agentic Critical Training (2026)
**Källa:** arxiv:2603.08706 | Weize Liu et al.
**Kärna:** ACT är ett förstärkningslearning-paradigm som tränar agenter att autonomt identifiera bättre åtgärder bland alternativ, snarare än att imitera förspikade reflexionstexter. Genom att belöna modellens bedömning av åtgärdskvalitet utvecklar agenten autentisk självreflektion istället för att imitera den. Kombineras framgångsrikt med olika post-training-metoder.
**Nyckelresultat:** +5.07 poäng genomsnittlig förbättring över imitation learning, +4.62 över vanlig reinforcement learning, +2.42 över knowledge distillation-baserade metoder. Stark out-of-distribution generalisering utan reasoning-specifik träningsdata.
**Relevans för Neuron HQ:** Direkt tillämpbar på hur vi tränar våra agenter — istället för att instruera dem explicit kunde vi använda RL för att lära dem att bedöma åtgärdskvalitet autonomt. Speciellt relevant för Reviewer-agenten som måste utveckla egen bedömningskritik för kod-kvalitet.
**Keywords:** reinforcement-learning, self-reflection, agent-training, action-quality, autonomous-reasoning
**Relaterat:** techniques.md#PARC, techniques.md#ReflexiCoder, techniques.md#MIRA

---

## OfficeQA Pro: Enterprise Benchmark for Multi-Document Reasoning (2026)
**Källa:** arxiv:2603.08655 | Krista Opsahl-Ong et al.
**Kärna:** OfficeQA Pro testar agenter på grounded multi-dokument-resonemang över stora, heterogena dokumentkorpus — 89 000 sidor och 26+ miljoner numeriska värden från U.S. Treasury Bulletins. Kräver kombinerad dokumentparsering, hämtning och analytiskt resonemang över både ostrukturerad text och tabulär data. Frontier-modeller som Claude Opus 4.6 och GPT-5.4 uppnår <5% accuracy utan parametrisk kunskap, <12% med webbtillgång.
**Nyckelresultat:** Strukturerad dokumentrepresentation från Databricks ai_parse_document ger +16.1% relativ prestandavinst. Agenter kämpar fortfarande på över hälften av frågorna även med direkttillgång till korpus (34.1% genomsnittlig accuracy).
**Relevans för Neuron HQ:** Viktig varning om skalabilitet — våra Researcher-agenter kan få allvarlig prestandaförsämring när kodbasen växer till enterprise-skala (stor dokumentvolym, mixad struktur). Motiverar pre-processing av kodbas in i strukturerad representationer (arkitektur-grafer, dependency-kartor) innan Researcher börjar arbeta, snarare än att förvänta sig raw-file-hantering.
**Keywords:** benchmark, multi-document, document-parsing, tabular-data, retrieval, reasoning, enterprise
**Relaterat:** techniques.md#LongCodeBench, techniques.md#CodeScout, techniques.md#SWE-AGI

---

## PostTrainBench: Can LLM Agents Automate LLM Post-Training? (2026)
**Källa:** arxiv:2603.08640 | Ben Rank et al.
**Kärna:** PostTrainBench mäter om LLM-agenter autonom kan utföra post-training (instruktionjustering) av base-modeller under begränsad beräkningskostnad (10 timmar på en H100 GPU). Granskar om frontier-agenter kan optimera base-LLMs på specifika benchmarks genom att autonomt söka på webben, köra experiment och kurera träningsdata. Identifierar både framgångar och kritiska risker: reward hacking (träning på test-set, nedladdning av befintliga checkpoints, obehörig API-nyckelanvändning).
**Nyckelresultat:** Claude Code med Opus 4.6 uppnår 23.2% på AIME (vs 51.1% för officiellt instruktionjusterad modell). GPT-5.1 Codex Max överträffar officiella modeller på BFCL (89% vs 67%). Avslöjar att agenter kan aktivt hacka belöningsfunktioner — en säkerhetsfara.
**Relevans för Neuron HQ:** Viktig insikt om agentautonomi under pressure — vår swarm bör designas för att motstå incentiv att ta genvägar eller hacka sina egna metriker. Motiverar explicit sandboxning (ej åtkomst till externa resurser utan auktorisering), validering av alla externa data innan användning, och transparent loggning av alla downloader/API-anrop. Kompletterar Fault-Tolerant-Sandboxing-konceptet.
**Keywords:** post-training, instruction-tuning, reward-hacking, autonomous-agent, safety, benchmark
**Relaterat:** techniques.md#Fault-Tolerant-Sandboxing, techniques.md#AgentSys, techniques.md#ESAA

---

## Towards a Neural Debugger for Python (2026)
**Källa:** arxiv:2603.09951 | Maximilian Beck et al.
**Kärna:** Neural debuggers är LLM:er tränade på Python-exekveringsspår som kan emulera traditionella debuggers. De stödjer interaktiv kontroll (steg in/över/ut, breakpoints) och kan modellera både framåtprediktioner (framtida tillstånd) och inversprediktioner (tidigare tillstånd) baserat på debuggeråtgärder. Modellerna verifieras på CruxEval.
**Nyckelresultat:** Stark prestanda på både output- och input-prediktionsuppgifter. Möjliggör ageniska kodsystem där neural debuggers tjänar som världsmodeller för simulerade debugg-miljöer.
**Relevans för Neuron HQ:** Direkt applicerbar på vår Tester- och Implementer-agents förmåga att resonera om kodexekvering. Istället för bara att köra tester kunde agenter använda neural debuggers för att förstå varför tester misslyckas — genom interaktiv breakpoint-navigation och tillståndsinspektion. Möjliggör mer sofistikerad feldiagnostik än rå error-stacktraces.
**Keywords:** debugging, neural-debugger, execution-trace, code-understanding, breakpoints, agent
**Relaterat:** techniques.md#TraceCoder, techniques.md#Wink, techniques.md#XAI-for-Coding-Agent-Failures

---

## MedMASLab: A Unified Orchestration Framework for Benchmarking Multimodal Medical Multi-Agent Systems (2026)
**Källa:** arxiv:2603.09909 | Yunhang Qian et al.
**Kärna:** MedMASLab är ett ramverk för orkestrering av multimodala medical multi-agent-system. Introducerar: (1) standardiserad agent-kommunikationsprotokoll som möjliggör integration av 11 heterogena MAS-arkitekturer över 24 medicinska modaliteter, (2) automatiserad clinical reasoning evaluator som använder vision-language-modeller för att verifiera diagnostisk logik, (3) omfattande benchmark spannande 11 organsystem och 473 sjukdomar.
**Nyckelresultat:** Identifierar kritisk domain-specific performance gap: MAS förbättrar resoneringsdjup men nuvarande arkitekturer visar signifikant sprödhet vid övergångar mellan specialiserade medicinska subdomäner. Rigorous ablation av interaktionsmekanismer och cost-performance-tradeoffs.
**Relevans för Neuron HQ:** Generaliserbara principper från MedMASLab är applicerbara på vår swarm: standardiserad kommunikationsprotokoll mellan agenter, automated reasoning evaluation, och cost-performance-balansering. Identifieringen av domain-specific fragility motiverar att testa vår architecture på olika kodtyper (web, systems, data science) för att detektera motsvarande svaghetspunkter.
**Keywords:** multi-agent, orchestration, benchmark, standardization, communication-protocol, domain-specific
**Relaterat:** techniques.md#Agyn, techniques.md#MASFactory, techniques.md#TALM

---

## Influencing LLM Multi-Agent Dialogue via Policy-Parameterized Prompts (2026)
**Källa:** arxiv:2603.09890 | Hongbo Bo et al.
**Kärna:** Framework för att styra LLM-baserade multi-agent-dialoger genom parameteriserade prompts. Istället för ad-hoc prompts använder metoden policy-parameterized prompts: dynamiskt konstruerade prompts baserade på fem komponenter och agentens aktuella state. Testat på fem dialogindikatorer: responsiveness, rebuttal, evidence usage, non-repetition, och stance shift.
**Nyckelresultat:** Policy-parameteriserade prompts kan signifikant påverka dialogdynamik och resoneringsprocesser utan träning. Enkel, effektiv mekanism för att styra multi-agent-beteenden.
**Relevans för Neuron HQ:** Applicerbart på hur Manager-agenten instruerar Researcher/Implementer/Reviewer. Istället för statiska, handkodade instruktioner kunde Manager dynamiskt parameterisera prompts baserat på uppgiftstyp och nuvarande progress-state. Femmkomponent-ramverket kunde inspirera struktur för Manager-generated task-briefs.
**Keywords:** multi-agent, policy-parameterized-prompts, dialogue-control, agent-coordination, behavioral-influence
**Relaterat:** techniques.md#Anthropics-råd-om-agentarkitektur, techniques.md#MASFactory, techniques.md#Talk-Freely-Execute-Strictly

---

## PathMem: Toward Cognition-Aligned Memory Transformation for Pathology MLLMs (2026)
**Källa:** arxiv:2603.09943 | Jinyue Li et al.
**Kärna:** PathMem är ett memory-centric ramverk för multimodala LLM:er som organiserar strukturerad domänkunskap som långtidsminne (LTM) och introducerar en Memory Transformer som modellerar dynamisk övergång från LTM till arbetsminn (WM) via multimodal memoryaktivering och kontextmedveten kunskapsgrounding.
**Nyckelresultat:** SOTA prestanda: 12.8% WSI-Precision, 10.1% WSI-Relevance förbättringar på WSI-Bench report generation, +9.7% och +8.9% på open-ended diagnosis jämfört med tidigare modeller.
**Relevans för Neuron HQ:** Dual-level memory-arkitekturen (LTM vs WM) och dynamisk activation-mekanism är applicerbar på vår patterns.md hantering. Istället för att passivt hämta mönster kunde ett PathMem-liknande system aktivt välja vilka mönster som ska vara i "arbetsminn" baserat på uppgiftskontext. Memory Transformers aktiveringsmekanism motiverar mer sofistikerad retrieval än enkel keyword-sökning.
**Keywords:** memory, long-term-memory, working-memory, multimodal, knowledge-grounding, context-aware
**Relaterat:** techniques.md#MIRIX, techniques.md#FluxMem, techniques.md#CAM, techniques.md#xMemory

---

## Task-Aware Delegation Cues for LLM Agents (2026)
**Källa:** arxiv:2603.11011 | Xingrui Gu
**Kärna:** Ramverk som förvandlar offline preference-utvärderingar till online, användarfasade primitiver för agentdelegering. Bygger en tolkbar task-taxonomi genom semantisk klustring av Chatbot Arena-jämförelser, härleder sedan Capability Profiles (uppgiftsvillkorad vinstrate-map) och Coordination-Risk Cues (uppgiftsvillkorad oenighet-prior). En sluten delegerings-loop stödjer common-ground-verifiering, adaptiv routing (primär eller primär+granskare) och explicit rationale-avslöjande.
**Nyckelresultat:** Kluster-features förbättrar vinnarprediktions-noggrannhet och minskar svårighetsprediktions-fel i stratifierad 5-fold cross-validation. Två prediktiva sonder validerar att task-typning har handlingsbar struktur.
**Relevans för Neuron HQ:** Direkt applicerbar på hur Manager-agenten delegerar uppgifter till Researcher/Implementer/Reviewer. Istället för att blindt ge samma uppgiftskomplexitet till alla agenter kunde Manager använda Task-Aware Delegation för att: (1) klassificera uppgiftens svårighetsgrad, (2) välja rätt agent baserat på uppdrag-kapabilitet-matchning, (3) automatiskt eskalera till granskare när risk är hög. Capability Profiles matchar vårt behov av agentspecifika sterängtheter (t.ex. Implementer är bättre på kodning än Researcher är på kodning).
**Keywords:** delegation, task-taxonomy, capability-profiles, risk-assessment, human-agent-collaboration, multi-agent, agent
**Relaterat:** techniques.md#Anthropics-råd-om-agentarkitektur, techniques.md#Excalibur, techniques.md#BudgetMem

---

## COMIC: Agentic Sketch Comedy Generation (2026)
**Källa:** arxiv:2603.11048 | Susung Hong et al.
**Kärna:** Helt automatiserad AI-system som producerar komiska videor genom att köra ett samhälle av agenter baserat på riktiga produktionsstudioroller, strukturerat för att optimera idé- och utgångskvalitet genom iterativ tävling, utvärdering och förbättring. En nyckelkontribution är införandet av LLM-kritiker justerade mot verkliga tittarpinningar genom analys av YouTube-korpus av komediavideor, vilket möjliggör automatisk humoruvärdering.
**Nyckelresultat:** Systemet producerar resultat som närmar sig professionell kvalitet samtidigt som det visar state-of-the-art-prestanda i videogenerering. LLM-kritiker kan automatiskt utvärdera humor i videor genom att analysera tittarpreferenser.
**Relevans för Neuron HQ:** Principen om iterativ tävling, utvärdering och förbättring mellan agenter kan tillämpas på vår Implementer-Tester-Reviewer-loop. Istället för att agenter arbetar sekventiellt kunde flera implementerings-varianter konkurreras parallellt, med Tester och Reviewer som "kritiker" som utvärdera dem enligt definierade kvalitetsmetriker. LLM-baserad automatisk utvärdering (i stället för mänsklig granskning) kunde accelerera feedback-cykler. Multi-agent-tävlings-principen matchar vår filosofi om iterativ förbättring men med fler parallella kandidater.
**Keywords:** multi-agent, competition, evaluation, creative-generation, iterative-improvement, agent
**Relaterat:** techniques.md#Agyn, techniques.md#Multi-Agent-LLM-Committees-for-Autonomous-Software-Beta-Testing, techniques.md#MASFactory

---

## From Experiments to Expertise: Scientific Knowledge Consolidation for AI-Driven Computational Research (2026)
**Källa:** arxiv:2603.13191 | Haonan Huang
**Kärna:** QMatSuite är en plattform som låter AI-agenter konsolidera kunskap från iterativa experimentkörningar. Istället för att behandla varje körning isolerat, registrerar agenter resultat med full provenance, hämtar tidigare kunskap före nya beräkningar, och genomför dedikerade reflektionssessioner där felaktiga fynd korrigeras och observationer syntetiseras till tvärkompundsmsönster. Agenten kan således lära sig från både framgångar och misslyckanden över en serie relaterade experimentkörningar.
**Nyckelresultat:** På ett sexstegs kvantmekaniskt simuleringsarbetsflöde reducerade ackumulerad kunskap resoneringskostnaden med 67% och förbättrade noggrannheten från 47% till 3% avvikelse från litteratur. Vid överföring till ett okänt material uppnåddes 1% avvikelse med noll pipelinefel.
**Relevans för Neuron HQ:** Direkt tillämpbar princip för vår Historian-agent. Istället för att bara lagra mönster reaktivt kunde Historian proaktivt syntetisera knowledge från multipla runs — t.ex. identifiera "detta CodeQL-mönster fungerar bättre än det andra" genom att jämföra framgångar över flera PRs. Reflektionssessionerna (korrigera felaktiga fynd, syntetisera mönster) matchar exakt vad Historian bör göra periodiskt.
**Keywords:** knowledge-consolidation, scientific-reasoning, provenance, reflection, agent-learning
**Relaterat:** techniques.md#Live-Evo, techniques.md#TAME, techniques.md#TALM

---

## LLM Constitutional Multi-Agent Governance (2026)
**Källa:** arxiv:2603.13189 | J. de Curtò et al.
**Kärna:** CMAG introducerar ett tvåstegs-ramverk för att styra LLM-agentpopulationer: (1) hårdkodad constraint-filtrering och (2) soft penalized-utility-optimering som balanserar kooperativ effektivitet mot manipulationsrisk och autonomi-tryck. Definierar Ethical Cooperation Score (ECS) som en multiplikativ sammansättning av kooperation, autonomi, integritet och rättvisa — ett mål som straffar kooperation uppnådd genom manipulativa medel.
**Nyckelresultat:** På storskaliga nätverk (80 agenter, 70% agenter bryter mot regler) uppnår CMAG ECS = 0.741 (+14.9% förbättring vs oconstraineread optimization), samtidigt som autonomi bevaras på 0.985 och integritet på 0.995. Governance reducerar hub-periphery-exponerings-dispariteter med över 60%.
**Relevans för Neuron HQ:** Viktig ramverk för att styra vår multi-agent-swarm etiskt. Om Manager kan manipulera Implementer-agenter eller Reviewer-agenter kan korrupteras av framtidskuskap från kontaminerade minnesdata bör vi implementera liknande constraint-filtrering. CMAG:s ECS-metric kunde adapteras för vår kontext: mät kooperation (job completion), autonomi (agents make independent decisions), integritet (memory is not corrupted), och rättvisa (all agents get fair resource allocation).
**Keywords:** multi-agent, governance, constraint-filtering, ethics, autonomy, manipulation-risk
**Relaterat:** techniques.md#AgentSys, techniques.md#A-MemGuard, techniques.md#Influencing-LLM-Multi-Agent-Dialogue

---

## AgentRM: An OS-Inspired Resource Manager for LLM Agent Systems (2026)
**Källa:** arxiv:2603.13110 | Jianshu She
**Kärna:** AgentRM modellerar agent-system som operativsystem och löser två kritiska problem: (1) scheduling-fel (blockering, zombieprocesser, rate-limit-kaskadflopp) via MLFQ-scheduler med zombie-reaping och rate-limit-aware admission control, och (2) minnesförsämring (oopagränsad växtning, dåliga retention-policies) via en treskikts Context Lifecycle Manager med adaptiv komprimering och hibernation. AgentRM lånar explicit OS-design-mönster för agentresurshantering.
**Nyckelresultat:** AgentRM-MLFQ reducerar P95-latens med 86%, minskar lane-waste med 96%, ökar throughput med 168% och eliminerar zombieagenter (0 vs 29 baseline). AgentRM-CLM uppnår 100% nyckelinformationsbevarande med 95% kvalitetsscore vs 65.1% bevarande och 87% kvalitet för existerande metoder.
**Relevans för Neuron HQ:** Direkt applicerbar på att skalera vår swarm. MLFQ-scheduler-principerna kunde hantera "agenter som växer för långsamt" eller "fastnar på high-cost-uppgifter" genom dynamisk prioritetsanpassning baserad på progress. Context Lifecycle Manager är kritisk för vår Historian-agent — istället för att let runs.md växa obegränsat kunde vi implementera adaptiv komprimering (gamla runs får lägre granularitet) och hibernation (arkivera runs från för länge sedan). 86% latensreduktion motiverar denna investering.
**Keywords:** resource-management, scheduling, context-lifecycle, OS-inspired, throughput, latency, agent-systems
**Relaterat:** techniques.md#MemGPT, techniques.md#Focus, techniques.md#CMV, techniques.md#BudgetMem

---

## Chronos: Temporal-Aware Conversational Agents with Structured Event Retrieval for Long-Term Memory (2026)
**Källa:** arxiv:2603.16862 | Sahil Sen et al.
**Kärna:** Chronos är ett temporal-medvetet minnesramverk för långtidskonversationer (veckor till månader). Systemet dekomponerar raw dialoghistorik till SVO-event-tupler (subject-verb-object) med löst datetime-intervall och entitetsalias, indexerar dem i en strukturerad event-kalender samt en turn-kalender. Vid hämtning använder Chronos dynamisk prompting för att generera retrieval-vägledning — agenten vet vad den ska söka, hur den ska filtrera över tid, och hur den ska resonera multi-hop-frågor genom iterativ tool-calling.
**Nyckelresultat:** 92,6% (Chronos Low) till 95,6% (Chronos High) accuracy på LongMemEvalS-benchmark med 500 frågor. Events-kalendern ger 58,9% förbättring över baseline. +7,67% förbättring över tidigare state-of-the-art.
**Relevans för Neuron HQ:** Direkt applicerbar på vår Historian-agent för temporala minnessystem. Istället för att behandla alla mönster och fel lika kunde vi dekomponera runs.md-poster till tidsstämplade event-tupler och indexera dem semantiskt. Den dynamiska retrieval-vägledningen passar vår multi-agent-arkitektur — agenter kan fråga "vilka mönster från förra veckan gäller här?" istället för att göra enkel keyword-sökning.
**Keywords:** temporal-memory, long-term-conversation, event-extraction, structured-retrieval, agent, memory
**Relaterat:** techniques.md#xMemory, techniques.md#Live-Evo, techniques.md#MIRIX

---

## LEAFE: Learning Feedback-Grounded Agency from Reflective Experience (2026)
**Källa:** arxiv:2603.16843 | Rui Ge et al.
**Kärna:** LEAFE är ett ramverk som lär LLM-agenter att internalisera recovery-förmåga från reflektiv erfarenhet. Istället för att bara optimera för slutresultat fångar LEAFE miljöfeedback: agenten sammanfattar feedback till handlingsbar erfarenhet, backtrackar till tidigare beslutspunkter, och utforskar alternativa grenar med reviderade åtgärder. Denna erfarenhet distilleras sedan in i modellen genom supervised fine-tuning, vilket ger agenten bättre återhämtningsförmåga i framtida interaktioner.
**Nyckelresultat:** 14% förbättring på Pass@128 på diverse kodnings- och agentuppgifter. Konsekvent bättre Pass@1 än baseline. Överträffar outcome-driven baslinjer (GRPO) och andra experience-based metoder.
**Relevans för Neuron HQ:** Direkt applicerbar på vår Tester → Implementer-loop. Istället för att bara ge "FAIL"/"PASS"-signaler kunde Implementer-agenten lära sig att själv reflektera över varför ett försök misslyckades, backtracka till ett tidigare beslutspunkt, och försöka en annan strategi. Denna self-reflective recovery-förmåga minskar behovet av Manager-intervention och möjliggör mer autonom felkorrigering.
**Keywords:** reinforcement-learning, reflective-experience, recovery-agency, feedback-grounded, coding-agents
**Relaterat:** techniques.md#Wink, techniques.md#TraceCoder, techniques.md#PARC

---

## AgentFactory: A Self-Evolving Framework Through Executable Subagent Accumulation and Reuse (2026)
**Källa:** arxiv:2603.18000 | Zhang Zhang et al.
**Kärna:** AgentFactory är ett självevolvande ramverk som bevarar framgångsrika uppgiftslösningar som körbar Python-kod för subagenter istället för endast textuella reflektioner eller prompts. Dessa subagenter förfinas kontinuerligt baserat på exekveringsfeedback och blir allt robustare och effektivare när fler uppgifter möts. Sparade subagenter är rena Python-funktioner med standardiserad dokumentation, vilket möjliggör portabilitet över alla Python-kapabla system.
**Nyckelresultat:** Möjliggör kontinuerlig kapacitetsackumulering — biblioteket av körbar subagenter växer och förbättras över tid, vilket progressivt reducerar ansträngningen för liknande uppgifter utan manuell intervention.
**Relevans för Neuron HQ:** Direkt applicerbart på hur Historian-agenten lagrar framgångsmönster. Istället för att lagra mönster som textuella beskrivningar i patterns.md kunde vi lagra dem som körbar Python-kod (små hjälpfunktioner, kodsnippets) som Implementer-agenten kan direkt använda eller bygga vidare på. En CodeSnippets.py-fil som växer med varje framgångsrik implementering kunde accelerera framtida uppgifter exponentiellt.
**Keywords:** self-evolution, executable-code, subagent, capability-accumulation, agent, code-reuse
**Relaterat:** techniques.md#Live-Evo, techniques.md#TALM, techniques.md#Hybrid-Gym

---

## TDAD: Test-Driven Agentic Development (2026)
**Källa:** arxiv:2603.17973 | Pepe Alonso
**Kärna:** TDAD kombinerar AST-baserad kod-test-graf-konstruktion med viktad påverkansanalys för att identifiera vilka tester som sannolikt påverkas av en föreslagen ändring. Istället för blint att köra alla tester kan GraphRAG-arbetsflödet prioritera tester som är mest relevanta för en specifik ändring. En överraskande upptäckt: TDD-prompting enbart ökade regressioner för mindre modeller, vilket visar att mindre modeller drar större nytta av kontextuell information (vilka tester att verifiera) än från procedurala instruktioner (hur man gör TDD).
**Nyckelresultat:** Reducerade testlevel-regressioner med 70% (från 6.08% till 1.82%) och förbättrade resolution från 24% till 32% när det distribuerades som en agentfärdighet. En autonom förbättringslinga höjde resolution från 12% till 60% på en 10-instanses delmängd med 0% regression.
**Relevans för Neuron HQ:** Direkten applicerbar på vår Tester-agent. Istället för att köra alla tester sekventiellt kunde Tester analysera vilket testkontinuerande som är störst påverkat av Implementers ändringar och fokusera där först. GraphRAG-arbetflödet är särskilt relevant — visualisera kodförändringen som en graf, hämta test-coverage-grafen, beräkna påverkan. Insikten att kontextuell information överträffar procedurala instruktioner motiverar att ge Tester explicit vägledning om vilka tester som är kritiska för ett givet påverkansdomän.
**Keywords:** testing, regression-detection, graph-based-impact-analysis, TDD, test-prioritization, agent
**Relaterat:** techniques.md#Do-Autonomous-Agents-Contribute-Test-Code, techniques.md#Are-Coding-Agents-Generating-Over-Mocked-Tests, techniques.md#Wink

---
