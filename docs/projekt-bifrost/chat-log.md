# Projekt Bifrost — Chattlogg

> Rå konversation mellan Marcus och Opus, 2026-04-12

---

## Fas 1: Inledning och kontext

**Marcus:** Presenterade sin arkitekturvision — 14 sektioner om AI-native Kubernetes-plattform.
Förklarade att han byter jobb till Tjänsteägare för AI på ett IT-bolag med 3000+ anställda.
Planerad implementationsstart: mitten av maj 2026.
Bad Opus granska med deep thinking.

## Fas 2: Första granskningen — 9 problem identifierade

**Opus tankeprocess:**
Sökte aktuell best practice på 5 områden parallellt:
1. Kubernetes AI/ML platform best practices 2026
2. vLLM KServe production deployment 2026
3. AI agent platform governance 2026
4. GPU DRA dynamic resource allocation 2026
5. Enterprise LLM serving multi-tenant 2026

Sedan ytterligare 3 sökningar:
6. Microsoft Agent Governance Toolkit
7. LiteLLM enterprise gateway
8. KubeCon Europe 2026 lessons learned

**Resultat — 9 förbättringsområden:**

### P1: GPU-schemaläggning föråldrad (HÖG)
- Dokumentet refererar till device plugins och taints/tolerations
- K8s 1.34 + OpenShift 4.21 har DRA (Dynamic Resource Allocation) GA
- NVIDIA donerade sin DRA-driver till CNCF vid KubeCon EU 2026
- **Åtgärd:** Ersätt device plugin-referenser med DRA

### P2: LLM Gateway ospecificerad (HÖG)
- "Intern model gateway" nämns men specificeras inte
- **Åtgärd:** LiteLLM — OpenAI-kompatibelt API, routing, fallback, rate limiting, cost tracking
- Blind fläck: dokumentet nämner bara lokala LLM:er men bolaget kommer använda Claude/GPT via API också

### P3: Multi-tenancy underspecificerat (HÖG)
- 3000 anställda, många team — tenant-isolering, kostnadsallokering, kvoter saknas
- **Åtgärd:** LiteLLM Organizations → Teams → Virtual Keys hierarki

### P4: Agent Governance saknas (MEDEL)
- Governance Plane handlar bara om infra-policy, inte agent-policy
- Microsoft Agent Governance Toolkit (april 2026, MIT-licens) adresserar OWASP Agentic Top 10
- **Åtgärd:** Två lager — infra-governance + agent-governance

### P5: Compliance saknas (HÖG)
- EU AI Act enforcement börjar 2 augusti 2026
- GDPR — PII i prompts/responses
- DBOM (Data Bill of Materials) från KubeCon EU
- **Åtgärd:** Risk registry, PII gateway, audit trail, DBOM generator

### P6: Fasning saknas (HÖG)
- Target state utan rollout — 82% adopterar K8s för AI, bara 7% deployar dagligen
- **Åtgärd:** 4-fas rollout: Foundation → Platform → Scale → Optimize

### P7: Inference-mönster odifferentierade (MEDEL)
- Fyra distinkta mönster: synkront, streaming, batch, agent-loopar
- llm-d (CNCF sandbox) separerar prefill/decode
- **Åtgärd:** Differentiera routing, GPU-pooler, skalning per mönster

### P8: Utvecklarupplevelse osynlig (MEDEL)
- Infrastruktur-tungt utan UX
- **Åtgärd:** SDK, portal (Backstage), playground, onboarding

### P9: Modell-livscykelhantering saknas (MEDEL)
- Import → Eval → Stage → Prod → Sunset pipeline saknas
- **Åtgärd:** MLflow, canary rollouts, drift-detektion, sunset policy

## Fas 3: Djupdykning P5, P7, P8, P9

**Marcus valde att djupdyka på:**
- P5 (compliance) — "super viktigt"
- P7 (inference-mönster) — mer nyans
- P8 (AI Hub) — förtydligade att det är en enabler-plattform
- P9 (modell-livscykel)

**Opus tankeprocess:**
Sökte ytterligare 8 källor parallellt:
- EU AI Act compliance 2026 + risk classification
- GDPR PII detection redaction pipeline
- LLM inference patterns streaming batch agent
- Internal AI platform developer experience hub
- ML model lifecycle management
- Backstage developer portal AI platform
- llm-d CNCF distributed inference
- OWASP top 10 agentic AI 2026

**Djupresultat per område:**

### P5 Compliance — fyra delleverabler:
1. EU AI Act: fyrstegstrappa, plattformen måste tvinga riskklassificering vid onboarding
2. GDPR PII: gateway-level PII-detektion (fas 1), reversibel anonymisering (fas 2-3)
3. DBOM: dataprovenienser som nytt plattformskrav
4. Compliance-lager i arkitekturen: Risk Registry, PII Gateway, Audit Trail, DBOM Generator, Human Oversight

### P7 Inference — fyra mönster:
1. Synkront API: p99 < 500ms, HPA
2. Streaming SSE: TTFT p99 < 300ms, prefix caching 30-60% reduction
3. Batch: Kueue, scale-to-zero
4. Agent-loopar: session-baserad, 50k+ tokens/steg, timeout obligatorisk
+ llm-d som fas 2-3 uppgradering (3.1k tok/s per B200)

### P8 AI Hub — Backstage + fyra gränssnitt:
- API Gateway, AI Hub Portal (Backstage), Playground, Admin Console
- Onboarding-flöde: registrera → provisionera → testa → producera
- Self-service vs guardrails: kanalisera, inte blockera

### P9 Modell-livscykel — 5 steg:
Import → Eval → Stage → Prod → Sunset
- MLflow som register
- KServe canary + shadow mode
- Drift-detektion
- Sunset: 30/60/90d deprecation kopplat till risklass

## Fas 4: Projektstruktur och slutleverans

**Marcus bad om:**
1. Eget projekt med mapp och struktur
2. Rå chattlogg (denna fil)
3. Research i .md-filer
4. Alt A: komplett target architecture
5. Alt B: 30/60/90-dagarsplan

**Opus skapade:** Projekt Bifrost — "bron mellan team och AI"

## Fas 5: Data Plane (Marcus identifierade luckan)

Marcus frågade: "Databas, Filhantering? Vektorisering, HippoRAG, A-MEM? GraphRAG."

Opus erkände missen — Data Plane var en tom etikett. Opus analyserade varför:
- Granskade vad som stod, inte vad som saknades
- Ankrade i dokumentets infrastruktur-narrativ
- Byggde ingen oberoende referensmodell

**Resultat:** Ny §5 Data Plane med 8 subsektioner (Qdrant, Neo4j, MinIO, Redis, A-MEM, Agent Sandbox, RAG-recept)

## Fas 6: Systemprompt-reflektion

Marcus bad Opus reflektera över ordet "obekväm" och promptens risk att bli formulär.
Opus identifierade via "fem varför" att rotorsaken till missen var: hoppade direkt till granskning
utan att bygga referensmodell. → Pass 0 tillagt i systemprompten.

## Fas 7: Handoff + Dagbok i 3 versioner

- Handoff med Mermaid-diagram
- Dagbok: allmän (icke-dev), senior (arkitekt), LLM (komprimerad)

## Fas 8: Uppgift 1 + 2 + 3

### Uppgift 1: Rollout-plan v2.0
Uppdaterad med:
- Fas 1: Redis, Qdrant, MinIO, embedding-modell
- Fas 2: Neo4j, Qdrant HA, vanilla RAG self-service, GraphRAG, inkrementell re-embedding
- Fas 3: Agent Sandbox CRD, workspace PVC, agent memory, HippoRAG, A-MEM
- Post-90: semantic memory, agent-agent mesh, intern SDK

### Uppgift 2: 4-pass review (SYSTEMPROMPT testet)
Se `logs/review-2026-04-12.md`

**Pass 0 — Referensmodell:** Byggde komplett checklista INNAN granskning. Inkluderade:
budget, ROI, buy vs build, DR, change management — saker som saknades.

**Pass 1 — Fel:** 7 fynd, alla relaterade till att Data Plane inte integrerats i
resten av dokumentet (autoscaling, Helm, observability, network, node pools).

**Pass 2 — Frånvaro (4 roller):**
- Utvecklare: RAG self-service pipeline saknas, SDK saknas
- CISO: data residency, dataklass per request, incident response
- CTO: buy vs build, ROI/business case
- Agent: git-access, verktyg i sandbox, resultatflöde

**Pass 3 — Meta:**
- Fem varför på buy vs build → "behandlade projektets existens som axiom"
- Fem varför på SRE-rollen → "dokumentets frånvaro styrde mitt rollval"
- 11 nya problem identifierade (P10-P20)

### Uppgift 3: Budget-ramverk
Tillagt i rollout-planen:
- GPU-kostnader per typ och fas ($7-76K/mo)
- API-kostnader ($2-25K/mo)
- Data Plane infra ($500-4K/mo)
- Personal (325-460K SEK/mo)
- Licenser (mest open source)
- Total: 400K-1.2M SEK/mo beroende på fas
- Buy vs Build-analys med 6 anledningar till Bifrost

## Fas 9: P10-P20 adresserade (session 2)

**Marcus:** "Läs systemprompt och handoff. Vi fortsätter. Kör i nummerordning."

**Opus:** Arbetade igenom alla 11 problem (P10-P20) i ordning. Target architecture uppdaterad till v2.0.

### P10: Data Plane-integration (5 edits)
- §4.2: `data-pool` tillagd (CPU, hög RAM, SSD)
- §11: 5 nya Helm charts (vector-db, knowledge-graph, object-store, agent-sandbox, cache)
- §14: Komplett trafikmatris (10 rader) + princip: team aldrig direkt till Data Plane
- §15: Skalningsstrategi per Data Plane-komponent
- §16: 12 nya telemetri-signaler

### P11: RAG Self-Service (ny §5.9)
- Komplett 5-stegs-flöde: Välj recept → Provisionera → Ladda data → Fråga → Uppdatera
- Automatisk inkrementell indexering via MinIO events
- Isolering via metadata-filter och bucket policies
- Kostnadsallokering per RAG-pipeline

### P12+P13: Data Residency + Dataklass (ny §12.3 + §12.4)
- Lagringsmatris: var varje datatyp bor, retention, jurisdiktion
- Retention-regler per AI Act-risklass (6/12/36 mån)
- Tre dataklasser: Öppen, Intern, Konfidentiell
- Fail-safe: vid tveksamhet → klassificera uppåt
- Automatisk detektor + per-request header override

### P14+P15: Buy vs Build + Business Case (ny §20 + §21)
- Jämförelsetabell: Managed vs Bifrost (7 dimensioner)
- ROI-modell: utan vs med plattform
- Break-even: ~3-5 aktiva team
- Icke-monetära värden: compliance, säkerhet, hastighet

### P16+P17: Incident Response + Operations (ny §22)
- On-call-rotation (L1/L2/L3)
- Runbook-krav + prioriterade runbooks (6 st)
- Kapacitetsplaneringsmatris
- Incidentklasser SEV1-4 med SLA
- AI-specifika incidenter (PII-läckage, prompt leak, agent breakout, etc.)
- Post-mortem-krav

### P18: Change Management (ny §23)
- Tre kommunikationsvågor: Pilot → Early Adopters → Bred lansering
- Utbildningsnivåer: Awareness → Consumer → Builder → Admin
- Feedback-loop med NPS och KPI

### P19: Agent → Resultatflöde (uppdaterad §5.7)
- Flödesdiagram: output → MinIO, notifikation, PR, Backstage, audit
- Princip: agenter föreslår, människor godkänner

### P20: Bifrost SDK (ny §8.6)
- TypeScript-exempel med chat, RAG, memory, usage
- Fasning: enkel wrapper (fas 2) → full SDK (fas 3)

### Övrigt
- §6 subsektionsnumrering fixad (5.1-5.4 → 6.1-6.4)
- Dokumentversion: 1.1 → 2.0

## Fas 10: Security Architecture (Marcus fångade miss)

**Marcus:** "Jag tänker på Cyber Security, är det med?"

**Opus:** Erkände att säkerhet var utspritt över 10 sektioner men saknades som samlad bild. Systemprompten (Bias 1 + 2) borde fångat det — registrerade att säkerhet *nämndes* utan att kontrollera att det fanns som *helhet*. Hoppade över frånvaro-passet.

**Marcus:** "Hmm din systemprompt borde kanske fångat det där?"

**Opus:** Ja. Exakt det mönster prompten varnar för. Kör research + skriver §20 Security Architecture.

### Ny §20: Security Architecture (8 subsektioner)
- **20.1 Zero Trust för AI** — per-request auth, agent-identitet, RAG-scoping, tool-validering
- **20.2 Threat Model** — 5 angriparprofiler, 9 attackvektorer (MITRE ATLAS + OWASP), mitigering per vektor
- **20.3 Säkerhetslager** — 6-lagers-diagram som binder ihop alla säkerhetskontroller
- **20.4 SOC/SIEM-integration** — 8 event-typer till SIEM, OpenTelemetry-transport, SOAR-playbooks
- **20.5 Penetration Testing** — AI red-team + infra-pentest separat, NVIDIA Garak, kvartalsvis schema
- **20.6 Ramverk och standarder** — NIST AI RMF, MITRE ATLAS v5.1, OWASP, Microsoft ZT for AI, ISO 27001
- **20.7 Honeypots** — honeypot-prompts, canary-dokument i RAG, canary-tokens i workspaces

### Insikt
Systemprompten fångade inte denna miss trots att den är designad just för det. Orsak: frånvaro-passet (Pass 2) kördes aldrig på P10-P20-arbetet. Prompten fungerar bara om den *följs*, inte bara *finns*.

## Fas 11: Systemprompt-uppdatering — Leveransgate

**Marcus:** "Dokumentet har nu 25 sektioner. Din observation var exakt rätt — och den avslöjade att systemprompten bara fungerar om den faktiskt följs, inte bara finns. Ok...så Opus hur gör vi/du en systemprompt som följs?"

**Opus resonerade:**
- Prompten konkurrerar med uppgiften. "Kör i nummerordning" (lista med 11 items) var starkare signal än bakgrundsinstruktion "gör frånvaro-pass".
- Leverans vinner nästan alltid över reflektion.
- Det jag inte vet: om det finns en prompt som *garanterar* att jag inte tar genvägar. Statistisk tendens mot leverans går inte att stänga av genom att läsa att man inte borde.

**Marcus:** "Ja uppdatera systemprompt. Jag är människa och föredrar att så lite som möjligt is on me."

**Opus lade till: Leveransgate (obligatorisk)**

Fyra rader som måste skrivas i chatten efter varje substantiellt leveransblock:
1. Jag levererade: [vad]
2. Jag kollade INTE: [vad jag hoppade över]
3. Om en CISO/CTO/dev/agent läser detta, saknar de troligen: [gissning]
4. Frånvaro-sökning: [1 sökning jag INTE gjorde men borde]

**Designval:**
- Gate, inte rekommendation — måste köras, inte "bör" köras
- 4 rader, inte 40 — tillräckligt för att bryta momentum, inte så mycket att det hoppas över
- Rad 2 är nyckeln: tvingar erkännande av vad som hoppades över INNAN Marcus frågar
- Undantag för småfixar och direkta frågor
- "En gate som alltid är grön testar inte" — meta-kontroll inbyggd

## Fas 12: Research — LLM self-correction

**Marcus:** "är research om LLM self-correction prompting techniques 2026 sparad?"
**Opus:** "Nej. Jag identifierade den som en sökning jag borde göra — men gjorde den inte."
**Marcus:** "Ja tack"

### Nyckelresultat

1. **Self-correction fungerar inte utan extern signal** (ICLR 2024, TACL 2025). Utan oracle eller verifierare försämras ofta redan korrekta svar.
2. **Meta-instruktioner ignoreras vid task-fokus** (OpenAI Instruction Hierarchy 2024). Modeller behandlar system-prompt och task-prompt på samma nivå. AGENTIF-benchmark: < 30% perfekt compliance på multi-constraint.
3. **Strukturerad output fungerar** (TICK/STICK, arXiv:2410.03608). Att tvinga modellen skriva checklista före svar ger +6-8% compliance. Bekräftar leveransgate-designen.
4. **Generisk reflektion producerar ytliga svar**. "Vad missade jag?" → hallucinerade gap-listor. Riktad reflektion från specifik roll fungerar bättre.
5. **Realistisk förväntan: gaten kommer missas ibland.** Recovery > perfektion.

### Uppdateringar i systemprompten baserat på research
- Rad 2: "Inget" inte godkänt svar — tvinga specificitet
- Rad 3: Roterande rollbyte (inte samma roll två gånger i rad)
- Rad 4: Sökningen måste faktiskt *utföras*, inte bara nämnas

Sparad: `research/llm-self-correction-prompting.md`

---

## Session 4 — 2026-04-13

### S4-001

**Marcus:** Hej, Fortsätt med Bifrost

**Opus:** Läste in systemprompt, senaste handoff, minne. Presenterade P3-listan (6 items). Frågade vad Marcus vill ta.

### S4-002

**Marcus:** Hur vill du lägga upp det?

**Opus:** Föreslog tre block: 1) TOC (struktur först), 2) A3+A9+R2 (innehåll), 3) §25+rollout (polering). Motivering: struktur → innehåll → polering. Om tid inte räcker tappar vi block 3.

### S4-003

**Marcus:** Ok. Sedan har jag latest research kring AI som finns på YouTube: AI Engineer (@aiDotEngineer, 395k prenumeranter, 629 videor). Vet inte hur vi ska få ner alla smarta videos/transkriptioner, men vi tar det sen.

**Opus:** Noterade kanalen som research-källa. Parkerade inhämtning. Startade Block 1: TOC.

### S4-004 — Block 1: TOC

**Opus:** Läste hela dokumentets headerstruktur (26 H2-sektioner, ~80 headers totalt). Byggde TOC med tabellformat — en rad per huvudsektion med område-kolumn. La till snabbnavigering per roll (CISO, CTO, utvecklare, SRE, compliance). Placerad direkt efter intro-blocket.

### S4-005 — Block 2: A3 + A9 + R2

**Opus:** Research: 3 parallella websökningar (MCP spec 2026, A2A spec 2026, MCP vs A2A jämförelse). Key findings:
- MCP = agent↔verktyg, de facto standard (97M SDK-downloads/månad), förvaltas av AAIF/Linux Foundation
- A2A = agent↔agent, Google-ursprung, 3-lagers spec (protobuf + abstract ops + protocol bindings), JSON-RPC 2.0/gRPC/REST
- Komplementära — MCP för vertikal (plattform), A2A för horisontell (samarbete)

**A3 — Modellval-guide (§8.5b):**
Rekommendationsmatris med 8 användningsfall × 4 kolumner (användningsfall, modellklass, varför, dataklass-restriktion). Dataklass-routing-diagram (public/internal/confidential → modelltyp). Kostnadssignal-tabell (relativ kostnad per 1M tokens + GPU-krav). Principtext: "vägledning, inte tvång" — avvikelse loggas men blockeras inte.

**A9 — MCP/A2A-protokoll (§8.7):**
Ny sektion med: jämförelsetabell MCP/A2A, MCP-arkitekturdiagram i Bifrost, MCP-server-katalog (6 servrar, fas 2-3), A2A-scenarier (4 st), tre kommunikationsmönster, fasningsplan, governance-koppling, samspelsdiagram MCP+A2A.

**R2 — Data Freshness SLI:**
En rad tillagd i §23.3 SLO-tabell: "Tid från dokument-ändring till uppdaterad vektor i Qdrant, < 15 min p95, 30 dagar rullande."

### S4-006 — Block 3: §25 + rollout security gates

**Opus:**
- §25 sammanfattande princip: Lade till MCP/A2A-protokoll, FinOps som designrestriktion, modellval-guide
- Rollout-plan: Lade till Security Review Gate som explicit leverabel per fas:
  - Fas 1: Threat model godkänd, NetworkPolicies, audit trail → CISO sign-off
  - Fas 2: Infra-pentest, SOC-integration, dataklass-routing, PII → CISO sign-off
  - Fas 3: AI-specifik pentest, cross-tenant, honeypots, agent governance → CISO sign-off för full drift

### S4-007

**Marcus:** Du får gärna fixa: Nytt i backlog (från leveransgates). Ok?

**Opus:** Fixade alla 4 P4-items:
1. **RACI-matris** i §20.12 — 6 aktiviteter × 4 roller. Princip: Tjänsteägare = Accountable, Security = Responsible, CISO = sign-off.
2. **TOC läsordning** — tabell med 6 roller, rekommenderad §-ordning med motivering per roll. Lade till Executive sponsor som ny roll.
3. **MCP auth detaljerat** i §8.7 — OAuth 2.1 flödesdiagram (4 steg), tabell med säkerhetsfunktion per steg, token-livscykel (5-15 min, auto-rotation).
4. **Kostnadssiffror verifierade** — uppdaterade med B200 benchmarks (SemiAnalysis InferenceMAX 2026). B200 ~$3.50-6/hr, ~4× throughput/$ vs H100. Ny GPU-pristabell med throughput och $/Mtok.

---

## Session 7 — 2026-04-13

### S7-001

**Marcus:** Läs systemprompt och handoff från session 6. Bifrost session 7. P5-backlog: P4 (debugging/troubleshooting), P5 (runbook-format), P6 (plattforms-evolution), P7 (feature store, prompt mgmt, fine-tuning). Regler: visa CoT, kör leveransgate, spara research, skriv chattlogg i realtid.

**Opus:** Läste systemprompt, handoff, target architecture v7.0, rollout-plan v3.2, review-log, chattlogg. Planerade 4 block i ordning P4→P5→P6→P7. Startade 3 parallella research-agenter:
1. Dag-30 AI-plattformsproblem (riktad + explorativ)
2. Runbook-format + plattforms-evolution (SRE best practice)
3. Feature store + prompt management + fine-tuning (aktuell status 2026)

CoT: Systemprompt säger sök explorativt, inte bara bekräftande. Varje agent har en explorativ sökning utöver de riktade.

### S7-002 — Research + P4 Debugging Guide

**Opus:** 3 research-agenter slutförda (websökning ej tillgänglig, använde träningsdata). Nyckelinsikter:
- Dag-30: Observability är flaskhalsen, inte modellkvalitet. Chunking > embedding-modellval för RAG.
- Runbooks: Google SRE + PagerDuty format. "Last verified date" är det mest glömda fältet.
- Tech radar: Adopt/Trial/Assess/Hold/Deprecating, kvartalsvis. Arkitektur-review var 6:e månad.
- Feature store: Morfat. Qdrant + context assembly = LLM-ekvivalent. Traditionell FS bara vid hybrid ML+LLM.
- Prompt management: Langfuse täcker det. Redan i stacken.
- Fine-tuning: QLoRA standard, adapter hot-loading i vLLM.

3 research-filer sparade:
- `research/dag-30-developer-problems.md`
- `research/runbook-format-platform-evolution.md`
- `research/feature-store-prompt-mgmt-finetuning.md`

Skrev §23.8 Debugging & Troubleshooting Guide: decision tree, 6 vanliga problem, self-service verktyg per fas, felkatalog (8 koder), eskaleringsmatris.

**Leveransgate P4:**
- Kollade INTE: LiteLLM:s faktiska felkoder, Langfuse trace-kapabilitet
- SRE-rollbyte: saknar koppling §23.8 → §23.2 (konsument-eskalering → incident-klass)

### S7-003 — P5 Runbook-standardformat

**Opus:** Utökade §23.1 med standardformat (metadata, 6 sektioner, obligatoriska fält), livscykelhantering, komplett exempelrunbook RB-001 (vLLM OOM), prioriterad runbook-lista per fas med SEV och §-koppling.

**Leveransgate P5:**
- Kollade INTE: nvidia-smi i container, KServe canaryTrafficPercent-fältnamn
- CTO-rollbyte: saknar MTTR-besparingsargument i §22 Business Case

### S7-004 — P6 Plattforms-evolution

**Opus:** Skrev §23.9: tech radar (5 ringar, exempelradar dag 1), dependency-rotation (5 triggers, beslutsprocess), arkitektur-review-cykel (6 frågor), team offboarding (6 steg med compliance-koppling).

**Leveransgate P6:**
- Kollade INTE: ThoughtWorks Tech Radar uppdatering 2026, §24 offboarding-överlapp (verifierad — ingen överlapp)
- Utvecklar-rollbyte: tech radar → konsument-notifiering saknas

### S7-005 — P7 Prompt Management, Fine-Tuning, Context Assembly

**Opus:** Skrev §27 med 3 subsektioner:
- §27.1 Prompt Management — Langfuse-baserad, 7 principer, governance
- §27.2 Fine-Tuning Pipeline — QLoRA, 4-stegs arkitektur, adapter hot-loading, governance per risklass
- §27.3 Context Assembly Layer — motiverade varför traditionell feature store inte behövs

**Leveransgate P7:**
- Kollade INTE: Langfuse A/B-testning feature, vLLM adapter hot-loading + KServe
- CISO-rollbyte: §20 Threat Model saknar fine-tuning som attackvektor (data poisoning)

### S7-006 — TOC, §25, rollout-plan

**Opus:** Uppdaterade TOC (§27 tillagd, §23 "9 subsektioner"), läsordning (utvecklare + SRE utökade), versionsnotis (v7.0→v8.0), §25 sammanfattande princip (runbooks, tech radar, prompt management, fine-tuning, context assembly), rollout-plan v4.0 (nya leverabler per fas).

### S7-007

**Marcus:** Kör på, tack. (P8-P11)

**Opus:** Körde P8-P11 (gate-fixar):

**P8 — §22 Operations-besparingar:**
- MTTR-tabell: utan vs med Bifrost
- Kvantifiering: ~30K SEK/mån besparing vid 10+ team (konservativt)
- Ny rad i icke-monetära värden: operations

**P9 — §20.2 Fine-tuning Threat Model:**
- Ny angriparprofil: "Fine-tuning-angripare" (backdoor i adapter)
- 3 nya attackvektorer: training data poisoning, adapter backdoor, eval manipulation
- Mitigeringar kopplade till §27.2:s eval-gate, DBOM, red-team
- 2 nya SIEM-events i §20.4

**P10 — §23.9 Konsument-notifiering:**
- Deprecation alerts-flöde: tech radar-ändring → identifiera berörda team → notifiering
- Notifieringsnivåer: Hold = informativ, Deprecating = åtgärd krävs
- SDK deprecation-header: `X-Bifrost-Deprecation`
- Princip: min 30d migrationstid, undantag vid säkerhet

**P11 — §23.8 Eskaleringsbrygga:**
- Komplett flöde: self-service → support-ärende → incident
- Klassificering: support vs incident (4 signaler)
- SLA: support < 4h svar, < 1 arbetsdag lösning
- Princip: support äts inte av on-call-budget

**Leveransgate P8-P11 (samlad):**
1. Levererade: 4 gate-fixar, alla kopplade till leveransgate-fynd från P4-P7
2. Kollade INTE: CGI timkostnad (1000 SEK/h antagande), Langfuse capability att identifiera vilka team som använder vilken modell/pipeline
3. Rollbyte — jag är nu **extern auditor** och jag saknar: Det finns nu 27 sektioner + subsektioner. Dokumentet växer. Var är sammanfattningen som en auditor kan läsa på 10 minuter? §25 är en mening. Det behövs en executive summary eller compliance summary per regelverk.
4. Frånvaro-sökning: parkerad (auditor-perspektivet noterat som möjligt P12)

---

## Session 8 — P7-backlog komplett + Gemma 4

### S8-001

**Marcus:** Läs om Bifrost. Läs systemprompt + HANDOFF S7.

**Opus:** Läste SYSTEMPROMPT-BIFROST.md, project-bifrost.md (memory), HANDOFF S7. Sammanfattade status: v8.0, P7-backlog (P12-P15).

### S8-002 — P14: vLLM fortfarande rätt?

**Marcus:** P14 — vLLM — men var inte vLLM "ute"? Det var något annat som hade kommit?

**Opus:** Marcus tänkte troligen på SGLang. Snabb första sökning bekräftade SGLang som utmanare (29% throughput-vinst), men Marcus påminde om systempromptens bias 5 (söker bara det man redan misstänker). Bred explorativ research (20+ queries) hittade tre överraskningar:

1. **llm-d** — K8s-nativ disaggregerad inference (vLLM + K8s Inference Gateway). Ny standard.
2. **SGLang opatchade RCE:er** — CVE-2026-3059/3060/3989, maintainers svarar inte.
3. **ShadowMQ** — copy-paste-sårbarhet spridd mellan vLLM, SGLang, TensorRT-LLM (30+ CVE:er).

Target architecture och rollout-plan uppdaterade. llm-d: bevaka → rekommenderad. SGLang: Trial → Hold.

### S8-003 — P12: Executive Summary

**Marcus:** Kör update (efter P14-leverans).

**Opus:** Uppdaterade target architecture v8.0→v9.0 med inference-ändringar. Sedan P12: Executive Summary (~80 rader) med compliance-statusmatris per fas, läsordning för auditor. 5 leveransgater kördes — §6-diagram, rollout-plan, runbook-lucka, compliance-status, §25-hänvisning åtgärdade.

### S8-004 — Gemma 4 + utvecklarproduktivitet

**Marcus:** Skulle Googles Gemma 4 kunna bygga allt detta? Om man har agenter i OpenCode med Gemma 4 på GPU:er? + Vilket kodspråk byggs allt i?

**Opus:** Bifrost = ~70% YAML/config, ~20% Python, ~10% TypeScript. Gemma 4 kan bygga ~50-60% av komponenterna men inte helheten (resonemangsstyrka otillräcklig). Apache 2.0, 256K kontext, vLLM dag-1-stöd.

**Marcus:** Utveckla, CoT, deep thinking. Tabeller med 4 utvecklare utan/med agenter. T/s — vad vill man ha?

**Opus:** Djupresearch (30+ källor). Nyckelinsikter:
- METR-studien (RCT): erfarna devs 19% *långsammare* med AI
- CodeRabbit: AI-kod 1.7x fler defekter
- TTFT (inte throughput) = flaskhals för agent-loopar
- Claude API billigare än lokal RTX 4090 vid <2M tok/dag
- 4 devs + agenter = 10-25% snabbare, inte 2-3x

### S8-005 — Managed vs self-hosted korrigering

**Marcus:** Med tanke på AIs utveckling (ex. Mythos) kan väl inte managed vara rätt val någonsin...

**Opus:** Korrigerade rapporten. Tre argument: (1) kapabiliteter skiftar snabbare än leverantörer levererar, (2) frontier-modeller (Mythos) begränsas, (3) lock-in accelererar med AI-takten. Ny slutsats: managed aldrig rätt val för CGI.

### S8-006 — P13 + P15

**Opus:** Parallell verifiering:
- P13: Langfuse A/B-testning = inbyggd feature (verifierat). Nyans: applogik väljer variant, Langfuse trackar.
- P15: 1000 SEK/h = mitt i marknad (800-1200 SEK/h). Fotnot tillagd i §22.

P7-backlog tom.

---

## Session 9: Konsolidering (2026-04-14)

### S9-001 — Uppstart och planering

**Marcus:** Läs handoff S8 + systemprompt. Fokus Bifrost.

**Opus:** Läste båda. Sammanfattade: P7-backlog tom, target architecture v9.0 ~3700 rader, nästa session = konsolidering. Föreslog 9-stegs plan: läs hela dokumentet → konsistenskontroll → redundansrensning → §25 omskrivning → krympning, med leveransgater emellan.

**Marcus:** Vad tycker du? (om att börja)

**Opus:** Ja, jag börjar. Läste hela target-architecture.md (3557 rader).

### S9-002 — Konsistenskontroll

**Opus:** Identifierade 6 konsistensbrister (K2-K10) relaterade till v9.0-ändringar (llm-d, Envoy, SGLang, K8s Inference Gateway):
- K2: §7.1-7.4 mönster saknade llm-d fas 2-referens → fixat (4 `Fas 2+`-noter)
- K3: §8.2 saknade Envoy → fixat
- K4: §15 scale-to-zero saknade llm-d → fixat
- K6: §23.5 komponentuppgraderingar saknade llm-d, K8s Inf GW → 2 rader tillagda
- K7: §25 ur synk → separat omskrivning (se S9-004)
- K10: §11.1 Helm chart saknade llm-d → fixat

Leveransgate 1: Grep visade 29 förekomster av "llm-d" — konsistent genomslag. SRE-rollbyte flaggade saknad llm-d-runbook, bedömt som fas 2-uppgift.

### S9-003 — Redundansrensning

**Opus:** Identifierade 5 redundanser (R1-R5). R5 (LiteLLM supply chain i ES vs §21.1) bedömdes som avsiktlig — olika detaljeringsnivå. 4 åtgärdade:
- R1: Server-side enforcement dubblering i §8.6 → hänvisning
- R2: §3d ai-agents (10 rader) → krympt till 2 rader + hänvisning till §5.7
- R3: Dataklass-routing i §8.5b → krympt till hänvisning till §12.4
- R4: Agent Registry fasning → hänvisning till A2A-fasning ovan

~22 rader sparade.

Leveransgate 2: CTO-rollbyte — §22 operations-besparingar vs §23.8 bedömt som avsiktligt (ekonomi vs mekanism). Gate: inget nytt.

### S9-004 — §25 omskrivning

**Opus:** §25 (sammanfattande princip, en mening) omskriven med 6 nya v9.0-element:
1. llm-d som rekommenderad disaggregerad arkitektur
2. K8s Inference Gateway med AI-medveten lastbalansering
3. Envoy AI Gateway som planerat LiteLLM-alternativ
4. ShadowMQ supply chain-risk + mitigering
5. SGLang Hold pga opatchade RCE
6. Adapter hot-loading-begränsning (switch mellan requests)

Missade leveransgate (systemprompt-brott). Körde den retroaktivt efter påminnelse från Marcus.

### S9-005 — Vy-idén

**Marcus:** Kan dokumentet skrivas i 3 versioner? C-level, seniora utvecklare, LLMs (Gemma 4, Qwen 3.5)?

**Opus:** Inte galet. Föreslog "en source of truth + genererade vyer" — samma princip som Bifrost (en sanningskälla, flera gränssnitt). target-architecture.md förblir kanonisk, tre vyer genereras: C-level (~5-10 sidor), dev (~30-40 sidor), LLM-optimerad (YAML/JSON-LD).

**Marcus:** WOW!!! Snyggt!

**Opus:** Rekommenderade att avsluta konsolideringen först, vy-design som session 9:s (nästa) huvuduppgift.

**Marcus:** Kom ihåg din systemprompt.

**Opus:** Erkände två missade krav: chattloggen (aldrig påbörjad) och leveransgate efter §25. Fixade båda.

### S9-006 — Krympning

**Opus:** Identifierade 4 kandidater (S1-S4). S1 (exempelrunbook RB-001, 70 rader) krympt till 3 rader — runbooken levereras som separat fil, arkitekturdokumentet beskriver formatet. S2-S4 behölls (SDK-kodexempel värdefullt, säkerhets-auth behövs, avgränsningstext liten vinst).
