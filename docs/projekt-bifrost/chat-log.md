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
