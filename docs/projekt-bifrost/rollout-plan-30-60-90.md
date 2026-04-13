# Projekt Bifrost — 30/60/90-dagarsplan

> Exekverbar rollout-plan | Start: mitten av maj 2026
> Version: 3.0 | Datum: 2026-04-13 | Uppdaterad med compliance-milestones, SLO, ORR, DR, champions, ISO 42001

---

## Översikt

```
        Maj          Jun           Jul          Aug          Sep         Okt
   ─────┼────────────┼─────────────┼────────────┼────────────┼───────────┼──
   FAS 1: FOUNDATION          FAS 2: PLATFORM          FAS 3: SCALE
   (dag 1-30)                 (dag 31-60)              (dag 61-90)
   
   GPU + vLLM + Gateway       Multi-tenant + GitOps    Agent + Compliance
   Redis + Qdrant + MinIO     KServe + Kueue + Neo4j   Agent Sandbox + A-MEM
   1 modell, 1 team           Policy + RAG pipeline    Full rollout
```

**EU AI Act deadline: 2 augusti 2026** — högrisk-enforcement.
Compliance-grunderna måste vara på plats i fas 2.

---

## FAS 1: FOUNDATION (dag 1-30, maj-jun)

> Mål: En fungerande AI-tjänst som ett pilotteam kan använda.

### Vecka 1-2: Infrastruktur + Data Foundation

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| K8s kluster | Säkerställ GPU-noder + data-noder, DRA-driver | Fungerande kluster med GPU |
| Namespaces | `platform-system`, `ai-serving`, `ai-batch`, `ai-data` | Namespace-struktur |
| NVIDIA GPU Operator + DRA | DRA-driver, MIG om tillgängligt | GPU:er bokningsbara via DRA |
| Cert-manager + secrets | TLS, vault-integration | Grundläggande säkerhet |
| Container registry | Internt registry, pull-through cache | Images kan pushas/pullas |
| **Redis** | Deploy Redis (session, rate state, cache) | Cache-lager |
| **MinIO** | S3-kompatibelt objektlager (modellvikter, dokument) | Objektlager |
| **Qdrant** | Single-node vector DB (embeddings) | Vector store |

**Gate:** `kubectl get resourceclaims` visar GPU-resurser. Qdrant, Redis, MinIO healthy.

### Vecka 2-3: Inferens + Embedding

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| vLLM deployment | En chat-modell (t.ex. Llama 3.1 70B eller Mistral) | Fungerande inferens |
| **Embedding-modell** | Deploy embedding-modell i vLLM → Qdrant | Embedding-pipeline |
| LiteLLM gateway | OpenAI-kompatibelt API, basic auth | Gateway endpoint |
| Health checks | Startup/readiness/liveness probes | Stable serving |
| Basic monitoring | Prometheus + Grafana, vLLM + Qdrant metrics | Dashboard med latency/throughput |
| Prefix caching | Aktivera automatic prefix caching i vLLM | Snabbare TTFT |

**Gate:** Chat + embeddings fungerar. `curl gateway/v1/embeddings` returnerar vektor. TTFT < 500ms.

### Vecka 3-4: Pilotteam

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| Pilotteam onboarding | Välj 1 team, ge API-nyckel, budget | Första konsument |
| SDK/dokumentation | Enkel guide: "Så här anropar du" | Onboarding doc |
| Basic rate limiting | RPM/TPM per key | Skydd mot missbruk |
| Kostnadsspårning | LiteLLM cost tracking per key | Första kostnadsdata |
| Extern modell-routing | Lägg till Claude/GPT som fallback order 2-3 | Multi-provider |
| **Threat model v1** | Dokumentera angripare, vektorer, prioritering (§20.2) | Threat model |
| **Default deny NetworkPolicies** | Alla namespaces, explicit allow per tjänst | Nätverksisolering |
| **Grundläggande audit logging** | Varje request loggas (tenant, modell, timestamp) | Audit trail v1 |

**Gate:** Pilotteamet använder plattformen dagligen. Feedback insamlad. Default deny aktivt.

### Fas 1 — Leverabler

- [ ] GPU-noder med DRA i klustret
- [ ] vLLM serverar minst 1 chat-modell + 1 embedding-modell
- [ ] LiteLLM gateway med auth och rate limiting
- [ ] **Redis** deployed (cache, rate state)
- [ ] **Qdrant** deployed (vector store)
- [ ] **MinIO** deployed (objektlager)
- [ ] Embedding-pipeline: dokument → embedding → Qdrant
- [ ] Prometheus + Grafana dashboard
- [ ] 1 pilotteam onboardat med API-nyckel
- [ ] Extern modell som fallback
- [ ] Grundläggande dokumentation
- [ ] Threat model v1 dokumenterad
- [ ] Default deny NetworkPolicies aktiva
- [ ] Audit logging (per-request)
- [ ] **SLOs definierade** för gateway, inference, Data Plane (§23.3)
- [ ] **ORR genomförd** för alla fas 1-komponenter (§23.6)
- [ ] **Compliance-profil "Standard"** implementerad som default (§26.3)
- [ ] **Kunddata-segregering**: tenant-id på alla requests, separata Qdrant collections (§26.4)
- [ ] **Backup-schema**: Qdrant snapshot varje timme, MinIO erasure coding verifierad (§23.4)
- [ ] **Pilotteamets champion** utsedd (§24.5)
- [ ] **Security Review Gate fas 1** genomförd: threat model v1 godkänd av CISO, NetworkPolicies verifierade, audit trail aktiv (§20.12)

---

## FAS 2: PLATFORM (dag 31-60, jun-jul)

> Mål: Multi-tenant plattform med policy, GitOps och compliance-grund.

### Vecka 5-6: Multi-tenancy + GitOps + Knowledge Graph

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| LiteLLM Organizations/Teams | Hierarkisk tenant-struktur | Multi-tenant gateway |
| Per-team budgets + kvoter | RPM, TPM, kronor/månad | Kostnadsallokering |
| Argo CD | GitOps för alla manifests (inference + data) | Repo = sanningskälla |
| Helm charts | `llm-serving`, `base-service`, `vector-db`, `object-store` charts | Standardiserade deploys |
| **Neo4j** | Deploy knowledge graph | GraphRAG-kapacitet |
| **Qdrant HA** | Uppgradera till 3-nod kluster | Produktionsstabilitet |
| **Vanilla RAG pipeline** | Backstage template: "Skapa RAG-app" → Qdrant collection + embedding-jobb | Self-service RAG |
| Modell #2-3 | En till chat-modell + specialmodell | Bredare utbud |

**Gate:** 3+ team med isolerade kvoter. RAG-pipeline self-service. Neo4j healthy. Allt via Argo CD.

### Vecka 6-7: Policy + Compliance-grund

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| ValidatingAdmissionPolicy | Blockera latest-tag, saknade limits, etc. | Admission control |
| Pod Security Admission | Per namespace | Säkerhetsbaseline |
| Image signering | Sigstore, validering vid admission | Supply chain security |
| PII Gateway (fas 1) | NER-baserad PII-detektion i LiteLLM | GDPR-grundskydd |
| Risk Registry v1 | Varje AI-system klassificeras vid onboarding | AI Act-grund |
| Basic audit trail | Logga varje request med tenant/model/timestamp | Spårbarhet |
| **Dataklass-routing** | Öppen/Intern/Konfidentiell per request → routing (§12.4) | Data residency |
| **SOC-integration v1** | Security events → SIEM via OpenTelemetry (§20.4) | Plattformen synlig i SOC |
| **Första pentest** | Externt team, infra-scope: K8s, API, NetworkPolicies, RBAC | Verifierad säkerhet |

**Gate:** PII-detektion aktiv. Risk registry finns. Admissions blockerar osäkra deploys. SOC ser plattformens events. Pentest genomförd utan kritiska fynd.

### Vecka 7-8: Batch + Differentierad inferens + RAG

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| Kueue | Batch-kö för embeddings/eval/reindexering | Batch-pipeline |
| ai-batch namespace | Separerade GPU:er för batch | Ingen konkurrens med serving |
| KEDA | Streaming-autoscaling på TTFT/queue depth | Smart skalning |
| KServe | InferenceService CRD för minst 1 modell | Standardiserad serving |
| NetworkPolicies | Default deny, explicit Data Plane-access per namespace | Nätverksisolering |
| **GraphRAG pipeline** | Neo4j + Qdrant: entity extraction → kunskapsgraf → sökning | GraphRAG som tjänst |
| **Inkrementell re-embedding** | Batch-jobb som detekterar ändrade dokument → uppdatera Qdrant | Automatisk indexering |

**Gate:** Batch-jobb körs utan att påverka serving. RAG-pipeline (vanilla + graph) fungerar. KEDA skalar streaming.

### Vecka 8: Backstage MVP

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| Backstage installation | Grundinstans med software catalog | AI Hub Portal v1 |
| Modellkatalog | Alla modeller med metadata i Backstage | Sökbar katalog |
| Onboarding-template | "Skapa ny AI-tjänst" template | Self-service |
| TechDocs | Dokumentation för alla tjänster | Intern docs |

**Gate:** Team kan onboarda sig själva via Backstage.

### Fas 2 — Leverabler

- [ ] Multi-tenant med 3+ team
- [ ] Argo CD GitOps för all infrastruktur (inference + data)
- [ ] Helm charts (inference, data, policy, observability)
- [ ] Admission policies aktiva
- [ ] PII-detektion i gateway
- [ ] Risk Registry med riskklassificering
- [ ] Kueue batch-pipeline
- [ ] KEDA autoscaling
- [ ] KServe för minst 1 modell
- [ ] NetworkPolicies (inkl Data Plane-access)
- [ ] **Neo4j** deployed + GraphRAG pipeline
- [ ] **Qdrant HA** (3-nod)
- [ ] **Vanilla RAG** self-service via Backstage
- [ ] **Inkrementell re-embedding** batch-pipeline
- [ ] Dataklass-routing (Öppen/Intern/Konfidentiell)
- [ ] SOC-integration (security events → SIEM)
- [ ] Första infra-pentest genomförd
- [ ] Backstage MVP med modellkatalog + RAG-template
- [ ] **Compliance-profil "Finans"** implementerad (DORA-krav, §26.3)
- [ ] **Compliance-profil "Hälsa"** implementerad om relevant (§26.3)
- [ ] **ISO 42001 gap-analys** påbörjad (§26.6)
- [ ] **DR-test genomförd**: restore Qdrant + Neo4j från backup, verifierad (§23.4)
- [ ] **Error budgets aktiva**: SLO-dashboards visar budget-status per tjänst (§23.3)
- [ ] **Day-2 ops-plan**: dokumenterad uppgraderingsstrategi för K8s + komponenter (§23.5)
- [ ] **Champion-nätverk**: 3-5 champions rekryterade från early adopter-team (§24.5)
- [ ] **Compliance dashboard v1** i Backstage: regelverk × kontroll × status (§26.8)
- [ ] **EU AI Act-beredskap**: Risk Registry + PII Gateway + Audit Trail + Human Oversight = grund klar (deadline 2 aug)
- [ ] **Security Review Gate fas 2** genomförd: infra-pentest utan kritiska fynd, SOC-integration verifierad, dataklass-routing testad, PII-detektion aktiv, CISO sign-off (§20.12)

---

## FAS 3: SCALE (dag 61-90, aug-okt)

> Mål: Full plattform med agent-stöd, compliance, livscykelhantering och self-service.

### Vecka 9-10: Agent-stöd + Workspace + Governance

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| **ai-agents namespace** | Separat zon med timeout-policies | Agent-körning |
| **Agent Sandbox CRD** | Deploy controller, SandboxTemplate, gVisor | Isolerade workspaces |
| **Agent workspace** | PVC: /code, /scratch, /output, /artifacts | Skrivyta för agenter |
| **Agent memory (v1)** | Working memory (Redis), basic episodic (Qdrant) | Agent-minne |
| Agent Governance Toolkit | MS toolkit, OWASP agentic top 10 | Agent-säkerhet |
| Session-baserade limits | Concurrency per team för agenter | Resurs-skydd |
| Agent-mönster i gateway | Routing + timeout för lång-körande | Agent-support |
| **Agent → Data Plane** | NetworkPolicy: sandbox → Qdrant, Neo4j, MinIO, Git | Säker dataåtkomst |
| Red-team pipeline | Automatiserad adversariell testning | Continuous security |
| **Honeypot-prompts** | Canary-queries i inference API (§20.7) | Proaktiv detektion |
| **Canary-dokument i RAG** | Falska dokument som aldrig ska dyka upp i svar | Corpus-integritet |
| **AI-specifik pentest** | Prompt injection, RAG access control, agent memory (§20.5) | Verifierad AI-säkerhet |

**Gate:** Minst 1 team kör agenter i isolerad sandbox med workspace, memory och governance. Honeypots aktiva. AI-pentest genomförd.

### Vecka 10-11: Compliance + Modell-livscykel

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| MLflow registry | Central modellkatalog med versioner | Model management |
| Eval pipeline | Benchmark + red-team + PII-test | Kvalitetssäkring |
| KServe canary | Revision-baserad rollout | Säker modelluppdatering |
| DBOM generator | Dataprovenienser per modell | Compliance-dokument |
| Human oversight | Eskaleringsflöde för högrisk-beslut | AI Act compliance |
| Reversibel anonymisering | Pseudonymisera PII före LLM | Starkare GDPR |

**Gate:** Modeller kan promotas Import → Eval → Stage → Prod med automatisk kvalitetskontroll.

### Vecka 11-12: Optimering + Scale-out

| Uppgift | Detaljer | Leverabel |
|---------|----------|-----------|
| MIG-partitionering | DRA + MIG för små modeller/dev | Kostnadsoptimering |
| Cost dashboard | Per team, per modell, per mönster | Transparens |
| Playground | Web UI för modelltestning | Self-service experimentation |
| Fler team | Onboarda 5-10 team | Bred adoption |
| Scale-to-zero | KServe/Knative för lågfrekventa modeller | Kostnadsbesparing |
| AI-assisterade agenter (v1) | Helm refactoring, Docker hardening | Plattforms-AI |

**Gate:** 10+ team onboardade. Kostnader synliga. Modell-livscykel fungerar.

### Fas 3 — Leverabler

- [ ] Agent Sandbox CRD med isolerade workspaces
- [ ] Agent memory: working (Redis) + episodic (Qdrant)
- [ ] Agent → Data Plane NetworkPolicies
- [ ] Agent Governance Toolkit integrerat
- [ ] MLflow model registry
- [ ] Eval + red-team pipeline
- [ ] KServe canary rollouts
- [ ] DBOM per modell
- [ ] Human oversight för högrisk
- [ ] Reversibel PII-anonymisering
- [ ] **HippoRAG pipeline** (Neo4j + Qdrant + PPR)
- [ ] **Full A-MEM** (working + episodic + semantic)
- [ ] MIG-partitionering
- [ ] Cost dashboard per team
- [ ] Playground
- [ ] 10+ team onboardade
- [ ] Scale-to-zero (inkl Agent Sandbox pause/resume)
- [ ] Honeypot-prompts aktiva i inference API
- [ ] Canary-dokument i RAG-corpus
- [ ] AI-specifik pentest genomförd (prompt injection, RAG access, agent memory)
- [ ] Kvartalsvis pentest-schema etablerat
- [ ] **Compliance-profil "Högrisk AI"** implementerad (EU AI Act Annex III, §26.5)
- [ ] **Compliance-profil "Försvar"** planerad — secure zone-krav dokumenterade (§26.7)
- [ ] **ISO 42001 gap-analys klar** — roadmap mot certifiering (§26.6)
- [ ] **Kvartalsvis DR-övning** schemalagd (§23.4)
- [ ] **ORR obligatorisk** för alla nya komponenter (§23.6)
- [ ] **AI-assisterad SRE v1**: RCA-assistent + runbook-navigering i advisory mode (§23.7)
- [ ] **Compliance dashboard v2**: auto-genererad kvartalsrapport per compliance-profil (§26.8)
- [ ] **Executive sponsor** formellt utsedd (§24.5)
- [ ] **Cross-tenant pentest**: verifierad kunddata-isolering (§26.4)
- [ ] **Security Review Gate fas 3** genomförd: AI-specifik pentest (prompt injection, RAG access, agent memory), cross-tenant pentest, honeypots aktiva, agent governance verifierad, CISO sign-off för full drift (§20.12)

---

## Post 90 dagar: OPTIMIZE (dag 91+)

| Område | Uppgift |
|--------|---------|
| **llm-d** | Utvärdera prefill/decode-disaggregering |
| **Full AI Hub** | Backstage med alla plugins, komplett self-service |
| **Drift-detektion** | Automatisk kvalitetsövervakning |
| **Finjustering** | On-platform fine-tuning pipeline |
| **AI-operatörer** | Fler plattformsagenter (GPU packing, incident, cost) |
| **Chargeback** | Full kostnadsallokering till team/avdelning |
| **Shadow mode** | Ny modell → shadow → canary → prod |
| **Compliance audit** | Extern granskning av AI Act + ISO 42001-certifieringsaudit |
| **ISO 42001 certifiering** | Mål: certifierad AI Management System (§26.6) |
| **Secure zone (försvar)** | Dedikerat air-gapped kluster/nodepool för säkerhetsskyddade uppdrag (§26.7) |
| **AI-assisterad SRE v2** | Anomali-korrelation + kapacitetsförslag + automatiska lågrisk-åtgärder (§23.7) |
| **Semantic memory** | Full A-MEM med kontinuerligt lärande kunskapsgraf |
| **Agent-agent** | Inter-agent communication via authenticated mesh |
| **Intern SDK** | Python/TS-bibliotek som abstraherar RAG, memory, tools |

---

## Risker och mitigering

| Risk | Sannolikhet | Impact | Mitigation |
|------|-------------|--------|------------|
| GPU-brist/leveranstid | Medel | Hög | Beställ tidigt, extern API som fallback |
| Låg adoption | Medel | Hög | Pilotteam tidigt, playground, enkel DX |
| AI Act deadline (2 aug) | Hög | Hög | Risk registry + PII i fas 2, ej fas 3 |
| Kostnadsexplosion | Medel | Medel | Per-team budgets från dag 1, alerts |
| Kompetens i teamet | Medel | Medel | Börja med vLLM/LiteLLM (enklare), KServe i fas 2 |
| Säkerhetsincident | Låg | Hög | Admission policies, image signing, agent governance |
| SDK-adoption låg — team föredrar OpenAI SDK direkt | Medel | Medel | Quickstart < 5 min, golden paths, SDK ger capabilities (RAG, memory) som OpenAI SDK saknar. Compliance-headers automatiska i SDK — manuellt annars. |
| Compliance-gap vid AI Act deadline (2 aug) | Medel | Hög | Compliance dashboard visar gap i realtid. Juridisk review i fas 2. Profiler enforced server-side oavsett SDK. |

---

## Mätpunkter (KPI:er)

### Fas 1

| Kategori | KPI | Mål | Mätning |
|----------|-----|-----|---------|
| **Adoption** | Pilotteam daglig användning | Ja | LiteLLM request logs |
| **Adoption** | Time to first request (pilotteam) | < 2 timmar | Manuellt |
| **Prestanda** | Inference latency p95 (TTFT, streaming) | < 500 ms | Prometheus |
| **Prestanda** | Gateway uptime | > 99% | SLO dashboard |
| **Säkerhet** | Threat model v1 dokumenterad | Ja/nej | Checkpoint |
| **Säkerhet** | Default deny NetworkPolicies | 100% namespaces | Kyverno audit |
| **Compliance** | Audit trail completeness | 100% requests har tenant-id + model-id | Prometheus |
| **Compliance** | Kunddata-segregering | 0 cross-tenant access | Automatiskt test |
| **Drift** | SLOs definierade | Alla fas 1-tjänster | Checkpoint |
| **Drift** | ORR genomförd | Alla fas 1-komponenter | Checkpoint |
| **Drift** | Backup verifierad | Qdrant snapshot + MinIO erasure coding | Restore-test |

### Fas 2

| Kategori | KPI | Mål | Mätning |
|----------|-----|-----|---------|
| **Adoption** | Onboardade team | ≥ 3 | Backstage registrering |
| **Adoption** | Aktiva användare (MAU) | ≥ 50 | LiteLLM virtual key usage |
| **Adoption** | Champions rekryterade | ≥ 3 | Manuellt |
| **Prestanda** | SLO compliance (alla tjänster) | > 95% av veckor | SLO dashboard |
| **Prestanda** | RAG query latency p95 | < 2 s | Prometheus |
| **Säkerhet** | Infra-pentest genomförd | Ja, 0 kritiska fynd | Pentest-rapport |
| **Säkerhet** | SOC-integration | Security events synliga i SIEM | SOC-verifiering |
| **Compliance** | PII-detektion aktiv | 100% requests scannade | PII Gateway metrics |
| **Compliance** | Risk Registry | 100% AI-system klassificerade | Risk Registry |
| **Compliance** | Dataklass-routing | Konfidentiell → enbart lokal modell, 0 undantag | LiteLLM routing logs |
| **Compliance** | Compliance dashboard v1 | Live i Backstage | Checkpoint |
| **Compliance** | EU AI Act-beredskap | Risk Registry + PII + Audit + Human Oversight = grund klar | Gap-analys |
| **Drift** | DR-test genomförd | Lyckad restore av Qdrant + Neo4j | Test-rapport |
| **Drift** | Error budgets aktiva | Dashboard visar budget-status per tjänst | Grafana |
| **DX** | Deployment via GitOps | 100% | Argo CD |
| **DX** | Bifrost SDK v1 (chat + rag.create + rag.query + rag.ingest + usage) | Publicerad, dokumenterad, quickstart < 5 min | npm registry |

### Fas 3

| Kategori | KPI | Mål | Mätning |
|----------|-----|-----|---------|
| **Adoption** | Onboardade team | ≥ 10 | Backstage |
| **Adoption** | Aktiva användare (MAU) | ≥ 200 | LiteLLM |
| **Adoption** | Requests/dag | ≥ 10 000 | LiteLLM metrics |
| **Adoption** | Executive sponsor utsedd | Ja | Manuellt |
| **Prestanda** | SLO compliance | > 95% av månader | SLO dashboard |
| **Prestanda** | GPU utilization | > 50% | DCGM metrics |
| **Säkerhet** | AI-specifik pentest genomförd | Ja | Pentest-rapport |
| **Säkerhet** | Cross-tenant pentest | 0 läckor | Pentest-rapport |
| **Säkerhet** | Honeypots aktiva | Ja | Alert-system |
| **Compliance** | Compliance-profiler aktiva | ≥ 3 profiler (Standard, Finans, Högrisk AI) | Kyverno policies |
| **Compliance** | ISO 42001 gap-analys klar | Ja, roadmap mot certifiering | Rapport |
| **Compliance** | Kvartalsvis compliance-rapport | Auto-genererad | Backstage |
| **Drift** | Incident MTTR (SEV1/2) | < 1 timme | PagerDuty/Opsgenie |
| **Drift** | Kvartalsvis DR-övning | Schemalagd | Kalender |
| **Drift** | AI-assisterad SRE v1 | RCA-assistent live (advisory) | Checkpoint |
| **DX** | Modeller i registry | ≥ 5 | MLflow |
| **DX** | Bifrost SDK v2 (+ memory + graph) | Publicerad | npm registry |
| **DX** | Agent-workloads | ≥ 1 team i sandbox | Sandbox CRD |
| **Ekonomi** | Cost per inference request | Sjunkande trend | LiteLLM + GPU-kostnad |
| **Ekonomi** | Cost visibility | Per team, per modell | Dashboard |

---

## Team-komposition (förslag)

| Roll | Antal | Ansvar |
|------|-------|--------|
| **Tjänsteägare** (Marcus) | 1 | Vision, prioritering, stakeholder management |
| **Platform Engineer** | 2-3 | K8s, DRA, vLLM, KServe, GitOps |
| **ML Engineer** | 1-2 | Modell-eval, MLflow, fine-tuning, benchmarks |
| **Security/Compliance** | 1 | AI Act, GDPR, PII, policy, audit |
| **Developer Experience** | 1 | Backstage, docs, SDK, onboarding |

Start med 3-4 personer i fas 1. Skala till 5-7 i fas 2-3.

---

## Beroenden

| Beroende | Behövs | Kritisk path? |
|----------|--------|---------------|
| GPU-hårdvara tillgänglig | Fas 1, vecka 1 | **JA** |
| K8s kluster (ny eller befintlig) | Fas 1, vecka 1 | **JA** |
| LiteLLM enterprise-licens | Fas 2 (open source OK i fas 1) | Nej |
| Budget godkänd | Fas 1 | **JA** |
| Pilotteam identifierat | Fas 1, vecka 3 | **JA** |
| IT-säkerhet/CISO sign-off | Fas 2 | Ja |
| Juridisk review (AI Act, DORA, NIS2) | Fas 2 | **JA** (deadline aug 2026) |
| Executive sponsor utsedd | Fas 2-3 | Ja |
| Compliance-profiler definierade per kundtyp | Fas 1 | Ja |
| Backstage-kompetens | Fas 2, vecka 8 | Nej |

---

## Budget-ramverk

### GPU-kostnader (cloud, per månad)

| GPU | Pris/timme | 1 GPU 24/7 | 4 GPU:er | 8 GPU:er |
|-----|-----------|------------|----------|----------|
| H100 80GB | ~$3/hr | ~$2 200/mo | ~$8 700/mo | ~$17 400/mo |
| A100 80GB | ~$1.80/hr | ~$1 300/mo | ~$5 200/mo | ~$10 400/mo |
| L40S 48GB | ~$1.20/hr | ~$870/mo | ~$3 500/mo | ~$6 900/mo |

*Priser varierar 40-85% beroende på leverantör. AWS/Azure/GCP i toppen, specialiserade (Lambda, RunPod, Nebius) i botten.*

### Estimerad GPU-profil per fas

| Fas | Min GPU:er | Typ | Kostnad/mo (cloud) |
|-----|-----------|------|-------------------|
| **Fas 1** | 2-4 GPU | A100/H100 mix | $4 000-$10 000 |
| **Fas 2** | 4-8 GPU | H100 serving + A100 batch | $10 000-$20 000 |
| **Fas 3** | 8-16 GPU | H100 serving + batch + agent | $20 000-$40 000 |

*On-prem ändrar kalkylen radikalt: H100 ~$30 000 köp → break-even vs cloud på ~10-14 månader.*

### API-kostnader (externa modeller)

| Provider | Modell | Input/Mtok | Output/Mtok | Est. 1M req/mo |
|----------|--------|-----------|-------------|----------------|
| Anthropic | Claude Sonnet 4.6 | $3 | $15 | ~$5 000-$15 000 |
| Anthropic | Claude Haiku 4.5 | $1 | $5 | ~$2 000-$5 000 |
| OpenAI | GPT-4o | $2.50 | $10 | ~$4 000-$10 000 |

*Volym-beroende. LiteLLM routing lokal-först minskar extern API-kostnad 50-80%.*

### Data Plane-infrastruktur (per månad)

| Komponent | Konfiguration | Kostnad/mo |
|-----------|--------------|------------|
| Qdrant | 3-nod HA, 32GB RAM | $300-$600 |
| Neo4j | Standalone → HA | $200-$2 000 |
| MinIO | 3-nod, 2TB | $150-$400 |
| Redis | HA, 16GB | $100-$300 |
| MLflow | Single instance | $70-$150 |

### Personal (per månad, Sverige)

| Roll | Antal | Bruttokostnad/person/mo | Total/mo |
|------|-------|------------------------|----------|
| Platform Engineer | 2-3 | 65 000 SEK | 130-195 000 SEK |
| ML Engineer | 1-2 | 70 000 SEK | 70-140 000 SEK |
| Security/Compliance | 1 | 65 000 SEK | 65 000 SEK |
| Developer Experience | 1 | 60 000 SEK | 60 000 SEK |
| **Total** | **5-7** | | **325-460 000 SEK/mo** |

*Brutto inklusive sociala avgifter. Exklusive rekrytering.*

### Licenser

| Produkt | Typ | Kostnad |
|---------|-----|---------|
| LiteLLM | Open source (Enterprise: ~$20K/yr) | $0-$20 000/yr |
| Backstage | Open source | $0 |
| MLflow | Open source | $0 |
| Qdrant | Open source (Cloud: usage-based) | $0 |
| Neo4j | Community Edition gratis, Enterprise ~$65K/yr | $0-$65 000/yr |
| vLLM | Open source | $0 |
| KServe | Open source | $0 |
| Agent Governance Toolkit | Open source (MIT) | $0 |

### Total kostnadsbild (estimat)

| Kategori | Fas 1 (mo) | Fas 2 (mo) | Fas 3 (mo) |
|----------|-----------|-----------|-----------|
| GPU (cloud) | $4-10K | $10-20K | $20-40K |
| Extern API | $2-5K | $5-15K | $10-25K |
| Data Plane infra | $500 | $1-3K | $2-4K |
| Personal | 325-460K SEK | 325-460K SEK | 325-460K SEK |
| Licenser | ~$0 | ~$2K/mo | ~$7K/mo |
| **Total infra** | **~$7-16K/mo** | **~$18-40K/mo** | **~$39-76K/mo** |
| **Total inkl personal** | **~400-550K SEK/mo** | **~500-800K SEK/mo** | **~700-1.2M SEK/mo** |

*SEK-belopp baserade på ~10 SEK/USD. Personal är den största kostnaden i fas 1-2.*

### Hybrid som default, inte som undantag

Frågan är inte "cloud eller on-prem?" — det är "vilken data får lämna byggnaden?"

De flesta bolag i 3000+-klassen *måste* vara hybrida:
- **Regelverk** kräver att viss data stannar on-prem (försvar, hälsa, finans, avtal)
- **Kostnad** — vid volym blir cloud-GPU dyrare än eget järn
- **Latency** — vissa användningsfall kräver inferens nära datan
- **Men** teamen vill fortfarande använda Claude, GPT-4o etc. för icke-känsligt

Bifrost är byggt för hybrid från dag ett. LiteLLM-routing löser det transparent:

```
Konfidentiell request → order 1: lokal vLLM (on-prem) → data stannar
Normal request        → order 1: lokal vLLM → order 2: Claude API → fallback
```

Samma API-nyckel, samma endpoint. Teamet behöver inte veta var inferensen sker.
Routing-beslut baseras på dataklass, inte på teamets val.

### Varför inte bara Azure AI Studio / AWS Bedrock / Google Vertex?

| Alternativ | Fördel | Nackdel |
|------------|--------|---------|
| **Azure AI Studio** | Managed, enklare ops | Data i Microsofts moln, vendor lock-in, begränsad kontroll |
| **AWS Bedrock** | Bred modellkatalog | Data i AWS, vendor lock-in, ingen lokal modell |
| **Google Vertex AI** | Bra MLOps | Ekosystem-beroende, data i GCP |
| **Bifrost (hybrid)** | Data stannar där den ska, multi-provider, full kontroll | Kräver team, mer komplext |

**Problemet med managed-only:**
1. **Vissa bolag FÅR INTE vara i Azure/AWS/GCP** — punkt. Regelverk, avtal, policy.
2. **All data i en leverantörs moln** — ingen kontroll över retention, access, jurisdiktion
3. **Vendor lock-in** — byter Azure prissättning? Du sitter fast.
4. **Ingen lokal inferens** — allt via API, ingen on-prem-kapacitet
5. **Begränsad anpassning** — inga egna RAG-recept, agent workspaces, kunskapsgrafer

**Varför Bifrost (hybrid):**
1. **Data residency** — konfidentiell data stannar on-prem, resten kan gå till molnet
2. **Multi-provider** — Claude + GPT + lokal modell bakom samma API
3. **Regelverk** — GDPR, AI Act, branschspecifika krav kräver kontroll
4. **Agent-kapacitet** — managed tjänster saknar Agent Sandbox, memory, workspace
5. **Kostnadsoptimering** — lokal inferens för volym, extern API för peak/specialmodeller
6. **Frihet** — byt provider utan att ändra en rad kod i konsumerande team
7. **Anpassning** — RAG-recept, agent memory, kunskapsgraf specifikt för organisationen

**När managed KAN komplettera Bifrost:**
- Managed tjänster kan vara en *provider* i gatewayen (order 2-3), inte *ersättning*
- Azure OpenAI Service som fallback — data i EU-region, men fortfarande i Microsofts moln
- Bedrock för specifika modeller som inte finns lokalt
- Vertex för specifika MLOps-funktioner

**När managed-only räcker:**
- Om bolaget har < 50 AI-användare
- Om *ingen* data är konfidentiell eller reglerad
- Om time-to-value viktigare än kontroll
- Om inget GPU-infra-team finns att rekrytera
- Om bolaget redan är all-in på en molnleverantör utan restriktioner

---

## Beslut att ta innan start

1. **Cloud eller on-prem?** Styr GPU-procurement och nätverksdesign
2. **Vilken GPU-typ?** H100/A100/L40S — styr kostnad och kapacitet
3. **Vilken första modell?** Llama 3.1, Mistral, DeepSeek?
4. **Vilka externa API:er?** Claude, GPT, Bedrock?
5. **Pilotteam?** Välj ett team med tydligt AI-användningsfall och vilja
6. **Budget?** GPU-kostnad + personal + licenser
7. **Befintlig K8s-mognad?** Finns redan kluster? Erfarenhet i teamet?
