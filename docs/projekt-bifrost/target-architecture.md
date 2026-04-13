# Projekt Bifrost — Target Architecture

> AI-native Kubernetes-plattform för 3000+ anställda
> Version: 7.0 | Datum: 2026-04-13 | Författare: Marcus Purens + Opus
> v6.0→7.0: P4-backlog komplett — §16.4 compliance-signaler, §21.1 dependency risk (Qdrant/Neo4j/LiteLLM supply chain-attack 2026), §22.2 göra-ingenting-scenario, §22.3 organisatorisk beslutshierarki, statussida-design (§23.2), rate limit-transparens (§8.6), agent registry & discovery (§8.7), GraphRAG-källa korrigerad, llm-d fas 3+, gate-fixar (§20.6/§26.2, §5.9/SDK, §26.9 Kyverno Policy Reporter)
> v5.0→6.0: TOC, modellval-guide (§8.5b), MCP/A2A-protokoll (§8.7), data freshness SLI (§23.3), §20.12 RACI security gate, §25 uppdaterad
> v4.0→5.0: 4-pass review — fixat "fem/sex plan", Agent Sandbox alpha-flaggning, §20.12 Security Review Gate, Incident Notification SLA (DORA), §22.1 FinOps Governance, Continuous Compliance Evidence, SDK fördjupning (§8.6), rollout KPI:er (44 st)
> v3.0→4.0: §26 Regulatory & Compliance Framework (CGI-specifikt: GDPR, AI Act, DORA, NIS2, säkerhetsskyddslagen, ISO 42001), kunddata-segregering i §12.4
> v2.0→3.0: Fördjupning av §20 Security, §23 Operations (SLOs, DR/backup, dag-2 ops, ORR), §24 Change Management

---

## Innehållsförteckning

| # | Sektion | Område |
|---|---------|--------|
| [1](#1-vision) | Vision | Strategi |
| [2](#2-sex-plan) | Sex plan | Arkitektur |
| [3](#3-klusterzoner) | Klusterzoner (5 zoner) | Infrastruktur |
| [4](#4-gpu-hantering-via-dynamic-resource-allocation-dra) | GPU-hantering — DRA | Infrastruktur |
| [5](#5-data-plane--lagring-minne-och-agent-workspace) | Data Plane — lagring, minne, agent-workspace | Data |
| [6](#6-llm-gateway--litellm) | LLM Gateway — LiteLLM | Inference |
| [7](#7-inference-plane--fyra-mönster) | Inference Plane — fyra mönster | Inference |
| [8](#8-ai-hub--developer-experience) | AI Hub — DX, SDK, modellval-guide, MCP/A2A | DX |
| [9](#9-modell-livscykelhantering) | Modell-livscykelhantering — MLflow | Governance |
| [10](#10-docker--supply-chain-security) | Docker — Supply Chain Security | Build |
| [11](#11-helm--plattformens-deklarativa-språk) | Helm — deklarativt språk | Build |
| [12](#12-governance-plane--två-lager) | Governance Plane — infra + AI compliance | Governance |
| [13](#13-secrets-och-identiteter) | Secrets och identiteter | Security |
| [14](#14-nätverk) | Nätverk | Infrastruktur |
| [15](#15-autoscaling--differentierat) | Autoscaling — differentierat | Infrastruktur |
| [16](#16-observability--nervsystem) | Observability — nervsystem | Operations |
| [17](#17-gitops--enda-vägen-till-produktion) | GitOps — enda vägen till produktion | Build |
| [18](#18-ai-som-byggare-och-angripare) | AI som byggare och angripare | Security |
| [19](#19-ai-agenter-som-plattformsoperatörer-fas-3-4) | AI-agenter som plattformsoperatörer (fas 3-4) | Operations |
| [20](#20-security-architecture) | Security Architecture (12 subsektioner) | Security |
| [21](#21-buy-vs-build) | Buy vs Build | Strategi |
| [22](#22-business-case) | Business Case & FinOps Governance | Ekonomi |
| [23](#23-operations--sre) | Operations & SRE (7 subsektioner) | Operations |
| [24](#24-change-management) | Change Management (6 subsektioner) | Organisation |
| [25](#25-sammanfattande-princip) | Sammanfattande princip | — |
| [26](#26-regulatory--compliance-framework) | Regulatory & Compliance Framework (9 subsektioner) | Compliance |

**Rekommenderad läsordning per roll:**

| Roll | Läs i denna ordning | Varför |
|------|-------------------|--------|
| **CISO / säkerhet** | §20 → §26 → §13 → §12.2 → §10 → §20.12 | Hotmodell först, sedan compliance-ramverk, secrets, governance, supply chain, och slutligen security review gate |
| **CTO / arkitektur** | §1 → §2 → §21 → §22 → §5 → §7 → §8 | Vision, sex plan, buy vs build, business case — sedan deep dive i data, inference, DX |
| **Utvecklare** | §8 → §8.5b → §6 → §7 → §5.9 → §8.7 | Börja med DX: modellval-guide, gateway, inference-mönster, RAG self-service, MCP/A2A-protokoll |
| **SRE / drift** | §23 → §3 → §15 → §16 → §4 → §17 | SLOs/DR/ops först, sedan klusterzoner, autoscaling, observability, GPU, GitOps |
| **Compliance / juridik** | §26 → §12 → §22.1 → §20.12 → §9.8 | Regulatoriskt ramverk, governance, FinOps, security gate, modell-governance |
| **Executive sponsor** | §1 → §22 → §24 → §26.1 → §25 | Vision, business case, change management, regulatorisk kontext, sammanfattning |

---

## 1. Vision

Bifrost är en intern AI Hub — en plattform där AI-team, utvecklarteam och övriga verksamhetsteam konsumerar AI-tjänster genom ett standardiserat, säkert och observerbart gränssnitt.

**Principen:**

> Bygg inte en plattform där teamet kör AI.
> Bygg en plattform där AI utvecklar, testar, attackerar, optimerar och driftar systemet genom Kubernetes.

Människan är **konstitutionell styrning**: mål, policy, risk och ansvar.
Plattformen är **exekveringssubstratet** som verkställer avsikt.

---

## 2. Sex plan

Plattformen organiseras i sex plan som samverkar:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GOVERNANCE PLANE                               │
│  Infra Policy · AI Compliance · Agent Governance · Audit · DBOM    │
├─────────────────────────────────────────────────────────────────────┤
│                      CONTROL PLANE                                  │
│  Kubernetes · GitOps (Argo CD) · DRA · Scheduling · RBAC           │
├──────────────────────┬──────────────────────────────────────────────┤
│   INFERENCE PLANE    │              DATA PLANE                      │
│  vLLM · KServe       │  Vector Store (Qdrant) · Knowledge Graph    │
│  LiteLLM Gateway     │  Object Store (MinIO) · Cache (Redis)       │
│  llm-d (fas 3+)      │  Agent Memory (A-MEM) · Telemetry           │
│                      │  Model Registry (MLflow) · DBOM Store        │
├──────────────────────┼──────────────────────────────────────────────┤
│   AGENT PLANE        │              BUILD PLANE                     │
│  Agent Sandbox (CRD) │  Docker (signerad) · Helm · CI/CD           │
│  Workspace (PVC)     │  SBOM · Provenance · Sigstore               │
│  gVisor/Kata · A-MEM │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

---

## 3. Klusterzoner

### 3a. platform-system
Ingress/Gateway API, Argo CD, policy controllers, cert-manager, observability stack, registry mirrors, secrets integration.

### 3b. ai-serving
vLLM-instanser, KServe InferenceServices, LiteLLM gateway, tokenizer/cache-lager, guardrails/moderationstjänster, PII-gateway.

### 3c. ai-batch
Embeddings, eval-jobb, finjustering, syntetisk testdata, reindexering, red-team-körningar. Kueue för kö- och kvotstyrning.

### 3d. ai-agents
Agent-loopar, autonoma arbetsflöden. Separerad zon med:
- **Agent Sandbox** (K8s CRD, kubernetes-sigs) — stateful, isolerade workspaces
- gVisor/Kata Containers för säker kodexekvering
- PersistentVolumeClaim per agent-workspace (kod, scratch, artifacts)
- Pause/resume — idle i timmar, vakna och fortsätt
- Scale-to-zero mellan uppgifter
- Session-baserade concurrency limits
- Timeout-policies (obligatoriskt)
- Agent Governance Toolkit integration
- Isolerad RBAC
- Anslutning till Vector DB, Knowledge Graph och Object Store via NetworkPolicy

### 3e. app-teams
Domänapplikationer som konsumerar AI-tjänster via gateway.

---

## 4. GPU-hantering via Dynamic Resource Allocation (DRA)

### 4.1 Varför DRA, inte device plugins
DRA är GA i Kubernetes 1.34 och OpenShift 4.21. Device plugins räknar GPU:er — DRA matchar dem baserat på attribut:

- Produktnamn (A100, H100, L40S)
- VRAM-kapacitet
- Compute capability
- MIG-profil
- Driverversion

NVIDIAs DRA-driver är donerad till CNCF — det är framtidens standard.

### 4.2 Node pools

| Pool | Syfte | GPU-typ | Skalning |
|------|-------|---------|----------|
| **rt-inference** | Real-time serving | H100/L40S | Autoscale på latency |
| **batch-compute** | Batch/eval/embeddings | H100/A100 | Kueue-styrd |
| **agent-pool** | Agent-loopar | H100 | Session-baserad |
| **fine-tune** | Finjustering | H100 (multi-GPU) | Manuell/schemalagd |
| **data-pool** | Qdrant, Neo4j, MinIO, Redis | — (CPU, hög RAM, SSD) | HPA/manuell |
| **cpu-general** | Allt utan GPU | — | HPA |

### 4.3 MIG-partitionering
H100 kan delas i isolerade instanser via MIG + DRA — dynamisk provisionering utan manuella labels. Relevant för:
- Små modeller som inte behöver hel GPU
- Dev/test-workloads
- Kostnadsoptimering

### 4.4 Princip
**En modellserver är inte bara en deployment. Den är en schemalagd kapitalallokering av VRAM.**

Varje modell har ett explicit kontrakt:

| Parameter | Beskrivning |
|-----------|-------------|
| GPU-antal | Min/max GPU:er |
| VRAM-krav | Minne per GPU |
| Repliker | Min/max instanser |
| Max context | Maximal context length |
| Token budget | Tokens/timme per team |
| Concurrency | Max samtida requests |
| Warm pool | Antal alltid-redo repliker |
| Fallback | Modell vid överbelastning |
| Cache policy | Prefix caching on/off |
| Eviction | När och hur frigöra resurser |

---

## 5. Data Plane — lagring, minne och agent-workspace

### 5.1 Princip: tre kunskapsrepresentationer

Enterprise AI-system kräver multipla representationer parallellt — vektorer för "hitta liknande", grafer för "hur hänger saker ihop", objektlager för "lagra stora saker".

```
┌──────────────────────────────────────────────────────────────┐
│                        DATA PLANE                             │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐    │
│  │ Vector Store │ │ Knowledge    │ │ Object Store       │    │
│  │ (Qdrant)     │ │ Graph        │ │ (MinIO)            │    │
│  │              │ │ (Neo4j)      │ │                    │    │
│  │ Embeddings   │ │ GraphRAG     │ │ Dokument, modeller │    │
│  │ Semantic     │ │ HippoRAG    │ │ Artifacts, filer   │    │
│  │ search       │ │ Reasoning    │ │ Backups            │    │
│  └──────────────┘ └──────────────┘ └────────────────────┘    │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐    │
│  │ Agent Memory │ │ Cache        │ │ Telemetry Store    │    │
│  │ (A-MEM)      │ │ (Redis)      │ │ (Prometheus/Loki)  │    │
│  │              │ │              │ │                    │    │
│  │ Working      │ │ KV-cache     │ │ Spans, metrics     │    │
│  │ Episodic     │ │ Session      │ │ Audit trail        │    │
│  │ Semantic     │ │ Rate limit   │ │ Cost tracking      │    │
│  └──────────────┘ └──────────────┘ └────────────────────┘    │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ Agent Sandbox (K8s CRD)                               │     │
│  │ Stateful workspace · gVisor isolation · Pause/Resume  │     │
│  │ PVC för kod/artifacts · Scale-to-zero                 │     │
│  └──────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Vector Store — Qdrant

| Egenskap | Detalj |
|----------|--------|
| Språk | Rust |
| Styrka | Filtrerad sökning, låg resursåtgång |
| Latency | 8ms p50 |
| Skala | Miljoner till tiotals miljoner vektorer |
| K8s deployment | Single binary, enkel Helm chart |

**Varför Qdrant (inte Milvus):** Med 3000 anställda behöver ni inte miljard-skala. Qdrant ger lägst latency, bäst metadata-filtrering (relevant för multi-tenant isolering), och enklast ops. Om skalan kräver det senare: Milvus har disaggregerad arkitektur för hundratals miljoner+.

**Användning:**
- Semantisk sökning i RAG-pipelines
- Embedding-lagring för dokument, kod, samtal
- Similarity search för rekommendationer
- Multi-tenant via collection + metadata-filter per team

### 5.3 Knowledge Graph — Neo4j

| Egenskap | Detalj |
|----------|--------|
| Typ | Property graph |
| Query-språk | Cypher |
| K8s | Helm chart, operator tillgänglig |
| Skala | Miljarder noder/relationer |

**Användning:**
- GraphRAG: extrahera kunskapsgrafer ur text automatiskt. Microsoft Research (arXiv:2404.16130) visar att GraphRAG föredras i 70-80% av parvisa jämförelser för *globala sammanfattningsfrågor* (comprehensiveness). För lokala faktafrågor presterar vanlig vektorsökning jämförbart. Fördelen är alltså starkast för "vad är de övergripande temana?"-frågor, inte enskilda faktauppslag
- HippoRAG: multi-hop reasoning, 10-20x billigare än iterativ retrieval
- Organisationskunskap: vem äger vad, hur hänger system ihop
- Compliance: spåra dataflöden, beroenden, ansvar

**GraphRAG som plattformstjänst:**
Team skickar dokument → plattformen bygger sökbar kunskapsgraf. Inte varje team bygger sin egen pipeline.

### 5.4 Object Store — MinIO

| Egenskap | Detalj |
|----------|--------|
| API | S3-kompatibelt |
| K8s | Operator + Helm chart |
| Styrka | Billigt, skalbart, K8s-native |

**Lagrar:**
- Modellvikter och checkpoints
- Dokument och filer för RAG
- Genererade artifacts (rapporter, kod, bilder)
- Backups och arkivering
- Eval-resultat och benchmark-data

### 5.5 Cache — Redis

- KV-cache för frekventa lookups
- Session state för agent-loopar
- Rate limiting state (LiteLLM)
- Pub/sub för inter-agent communication
- Working memory (kortlivat agentminne)

### 5.6 Agent Memory — A-MEM-inspirerad

Agenter behöver minne som **utvecklas** — inte bara lagrar fakta, utan organiserar, länkar och uppdaterar förståelse. Inspirerat av A-MEM (NeurIPS 2025) och Zettelkasten-metoden.

**Tre minneslager:**

| Lager | Livslängd | Innehåll | Lagring |
|-------|-----------|----------|---------|
| **Working Memory** | Inom session | Aktuell kontext, tool results, pågående resonemang | Redis (in-memory) |
| **Episodic Memory** | Mellan sessioner | Erfarenheter, beslut, utfall, lärdomar | Qdrant (vector) + Neo4j (graph) |
| **Semantic Memory** | Permanent | Fakta, domänkunskap, organisationsförståelse | Neo4j (knowledge graph) |

**Hur det fungerar:**
1. Varje agentinteraktion skapar ett minne (nod med kontext, nyckelord, taggar)
2. Nya minnen triggar uppdateringar av relaterade gamla minnen
3. Episodic memory möjliggör "jag har sett detta problem förut"
4. Semantic memory möjliggör "jag vet hur denna domänen fungerar"
5. Working memory rensar vid session end

### 5.7 Agent Workspace — Kubernetes Agent Sandbox

Agent Sandbox (kubernetes-sigs, mars 2026) är ett CRD specifikt för stateful agent-workloads.

> **Mognadsstatus (april 2026):** v0.2.1, API `v1alpha1`. Projektet är aktivt och backat av kubernetes-sigs, men API:t kan ändras mellan versioner. Bifrost bör pinna Helm chart-version och ha en migrationsplan om API:t bryts. Alternativ om projektet försenats i fas 3: fallback till StatefulSet + gVisor manuellt — mindre elegant men funktionellt.

**Kärnresurser:**
- **Sandbox:** Isolerad agentmiljö med persistent identitet
- **SandboxTemplate:** Blueprint — resource limits, base image, security policies
- **SandboxClaim:** Team begär sandbox, provisionering abstraheras

**Workspace-layout:**
```
Agent Sandbox (PVC)
├── /workspace/code        Git checkout, iterativ kodning
├── /workspace/scratch     Skrivyta, drafts, iteration
├── /workspace/output      Resultat, rapporter
├── /workspace/artifacts   Genererade filer, images
└── /workspace/memory      Lokal memory cache
```

**Säkerhet och livscykel:**
```
┌─────────────────────────────────────────────────┐
│                AGENT SANDBOX (CRD)               │
│                                                   │
│  ┌───────────────┐  ┌─────────────────────────┐ │
│  │  Agent        │  │  Workspace (PVC)         │ │
│  │  Runtime      │  │  ├── /workspace/code     │ │
│  │  ├── LLM call │  │  ├── /workspace/scratch  │ │
│  │  ├── Tools    │  │  ├── /workspace/output   │ │
│  │  ├── Memory   │  │  └── /workspace/artifacts│ │
│  │  └── Guardrail│  │                           │ │
│  └───────┬───────┘  └───────────────────────────┘ │
│          │                                         │
│  ┌───────▼───────────────────────────────────────┐│
│  │  gVisor / Kata (isolation layer)              ││
│  └───────────────────────────────────────────────┘│
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  External Services (via NetworkPolicy)       │  │
│  │  ├── LiteLLM Gateway (inference)             │  │
│  │  ├── Qdrant (memory retrieval)               │  │
│  │  ├── Neo4j (knowledge graph)                 │  │
│  │  ├── MinIO (artifacts)                       │  │
│  │  └── Git (source control)                    │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Livscykel:**
- **Skapa:** Team begär via SandboxClaim, template definierar limits
- **Köra:** Agent itererar: kod → test → fix → kod → ... allt i isolerad workspace
- **Pausa:** Idle i timmar, workspace kvar, compute frigörs
- **Återuppta:** Exakt state, inga cold start-förluster
- **Scale-to-zero:** Sparar GPU/CPU mellan uppgifter
- **Radera:** Artifacts exporteras till MinIO, workspace rensas

**Resultatflöde — hur agenter levererar output:**

```
Agent klar
  │
  ├─→ /workspace/output/  → MinIO (arkivering)
  │
  ├─→ Notifikation → Slack/Teams webhook ELLER Backstage event
  │
  ├─→ Om kodändring: Agent öppnar PR via git push → GitOps review
  │
  ├─→ Om rapport: Publiceras i Backstage TechDocs (länkbar)
  │
  └─→ Metadata → Audit trail (vem, vad, när, kostnad, tokens)
```

**Princip:** Agenter *föreslår* — människor *godkänner*. Ingen agent-output går direkt till produktion. PR:ar, rapporter och artifacts kräver review.

### 5.8 RAG-mönster som plattformstjänst

Plattformen erbjuder RAG som färdiga recept, inte infrastruktur varje team bygger själva:

| Mönster | Teknikstack | Användning |
|---------|-------------|------------|
| **Vanilla RAG** | Qdrant | Enkel semantisk sökning |
| **GraphRAG** | Neo4j + Qdrant | Komplexa relationer, enterprise docs |
| **HippoRAG** | Neo4j + Qdrant + PPR | Multi-hop reasoning, forskningsfrågor |
| **Hybrid RAG** | Qdrant (vector) + BM25 (keyword) | Bäst av båda världar |

Team väljer recept vid onboarding → plattformen provisionerar rätt pipeline.

### 5.9 RAG Self-Service — hur team skapar en RAG-app

**Problem:** §5.8 beskriver *vilka* RAG-mönster som finns, men inte *hur* ett team praktiskt skapar en pipeline. Utan detta bygger varje team eget — exakt vad plattformen ska förhindra.

**Flöde (via Backstage):**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. VÄLJ RECEPT                                                  │
│     Team väljer i Backstage: Vanilla RAG / GraphRAG / HippoRAG  │
│     → Formulär: namn, beskrivning, dataklass, estimerad volym    │
├─────────────────────────────────────────────────────────────────┤
│  2. PROVISIONERA (automatiskt)                                   │
│     → Qdrant collection skapas (isolerad per team via metadata)  │
│     → Neo4j subgraph (om GraphRAG/HippoRAG)                     │
│     → MinIO bucket för källdokument                              │
│     → Embedding-jobb konfigureras (modell, chunk size, overlap)  │
│     → API-endpoint registreras i gateway                         │
├─────────────────────────────────────────────────────────────────┤
│  3. LADDA DATA                                                   │
│     → Team laddar upp dokument till sin MinIO-bucket             │
│       (via Backstage UI, S3 CLI, eller API)                      │
│     → Batch-jobb triggas: dokument → chunking → embedding →      │
│       Qdrant (+ entity extraction → Neo4j om graph-recept)       │
├─────────────────────────────────────────────────────────────────┤
│  4. FRÅGA                                                        │
│     → Team anropar plattformens RAG-endpoint:                    │
│       POST /v1/rag/{pipeline-id}/query                           │
│       { "query": "...", "top_k": 5 }                             │
│     → Plattformen hanterar: retrieval → reranking → augmentation │
│       → LLM-anrop → svar med källor                              │
├─────────────────────────────────────────────────────────────────┤
│  5. UPPDATERA (inkrementellt)                                    │
│     → Nya/ändrade dokument detekteras automatiskt (MinIO events) │
│     → Inkrementellt batch-jobb: bara ändrade chunks re-embedas   │
│     → Borttagna dokument → vektorer tas bort                     │
│     → Manuell full reindexering via Backstage om behov           │
└─────────────────────────────────────────────────────────────────┘
```

**Isolering:** Varje teams data är isolerad via Qdrant metadata-filter och MinIO bucket policies. Team A kan inte söka i Team B:s vektorer.

**Kostnad:** RAG-pipeline-användning mäts och allokeras till teamets budget (embedding-tokens + retrieval-queries + LLM-tokens).

**SDK-mappning (§8.6):** Varje steg i flödet ovan har en motsvarande SDK-metod: `client.rag.create()` (steg 1-2), `client.rag.ingest()` (steg 3), `client.rag.query()` (steg 4), `client.rag.reindex()` (steg 5). Backstage-templates anropar SDK:t under huven. REST-endpoint: `POST /v1/rag/{pipeline-id}/query`. Funktionstestning av SDK ↔ REST-paritet ingår i CI-pipeline (§10).

---

## 6. LLM Gateway — LiteLLM

### 6.1 Varför en gateway
Bolaget kommer använda **både lokala och externa modeller** (Claude, GPT, Bedrock). Gatewayen abstraherar alla bakom ett enhetligt OpenAI-kompatibelt API.

### 6.2 Arkitektur

```
┌──────────────────────────────────────────────────┐
│              LiteLLM Gateway                      │
│                                                    │
│  ┌─────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Auth/RBAC   │  │ PII Gate   │  │ Rate Limit │ │
│  │ (per team)  │  │ (scan/     │  │ (RPM/TPM   │ │
│  │             │  │  redact)   │  │  per key)  │ │
│  └──────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
│         └───────────┬────┘───────────────┘        │
│                     ▼                              │
│  ┌─────────────────────────────────────────────┐  │
│  │              Routing Engine                  │  │
│  │  order 1 → local vLLM                       │  │
│  │  order 2 → Claude API                       │  │
│  │  order 3 → GPT-4o API                       │  │
│  │  fallback → smaller local model             │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐│
│  │Cost Track  │  │ Audit Log  │  │ Guardrails   ││
│  │(per team)  │  │ (per req)  │  │ (content)    ││
│  └────────────┘  └────────────┘  └──────────────┘│
└──────────────────────────────────────────────────┘
```

### 6.3 Multi-tenancy

```
Organization (bolaget)
  └── Team A (AI-teamet)
       ├── Virtual Key 1 (prod)
       ├── Virtual Key 2 (staging)
       └── Virtual Key 3 (sandbox)
  └── Team B (Utvecklarteam X)
       └── Virtual Key 1 (prod)
  └── Team C (Kundtjänst)
       └── Virtual Key 1 (prod, högrisk → extra guardrails)
```

Varje nivå har:
- Budget (kronor/månad)
- Rate limits (RPM, TPM)
- Modellaccess (vilka modeller teamet får använda)
- Guardrail-profil (PII, content filtering)

### 6.4 Routing-logik

| Request-typ | Routing |
|-------------|---------|
| Kodgenerering | Lokal vLLM (CodeLlama/DeepSeek) → fallback Claude |
| Kundtjänst-chat | Claude → fallback lokal |
| Batch-embeddings | Lokal embedding-modell (ej extern API) |
| Agent-loop | Claude/GPT → fallback lokal stor modell |
| Konfidentiell data | **Enbart lokala modeller** (data lämnar inte bolaget) |

---

## 7. Inference Plane — fyra mönster

### 7.1 Synkront API

```
Client → Gateway → vLLM → Response (komplett)
```

| Parameter | Värde |
|-----------|-------|
| SLA | p99 < 500ms |
| Skalning | HPA på concurrency + latency |
| GPU-profil | Liten modell, låg VRAM, hög throughput |
| Kö | Ingen — timeout och reject |
| Användning | Klassificering, extraction, sentiment |

### 7.2 Streaming (SSE)

```
Client → Gateway → vLLM → Token... Token... Token... [DONE]
```

| Parameter | Värde |
|-----------|-------|
| SLA | TTFT p99 < 300ms |
| Skalning | KEDA på connection count + TTFT |
| GPU-profil | Medelstor modell, continuous batching |
| Optimering | Prefix caching (30-60% TTFT-reduktion) |
| Användning | Chat, kodgenerering, assistenter |

### 7.3 Batch

```
Job Queue → Kueue → vLLM (batch) → Results → Storage
```

| Parameter | Värde |
|-----------|-------|
| SLA | Throughput-baserat, timmar OK |
| Skalning | Kueue med kvoter, scale-to-zero |
| GPU-profil | Maximera throughput, latens irrelevant |
| Kö | Ja — Kueue med prioritet och fairness |
| Användning | Embeddings, eval, syntetisk data, reindexering |

### 7.4 Agent-loopar

```
Client → Agent → [LLM ↔ Tool ↔ LLM ↔ Tool ↔ ... ] → Final
```

| Parameter | Värde |
|-----------|-------|
| SLA | End-to-end minuter till timmar |
| Skalning | Pågående sessioner |
| GPU-profil | Stor modell, 50k+ input tokens/steg |
| Concurrency | Session-baserad limit per team |
| Timeout | **Obligatorisk** — agenter kan hålla GPU i timmar |
| Governance | Agent Governance Toolkit |
| Användning | Kodagenter, research, autonoma arbetsflöden |

### 7.5 Routing per mönster

```
┌────────────────────────────────────────────────────┐
│                  AI GATEWAY (LiteLLM)              │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ ┌────────────┐│
│  │ Sync    │ │ Stream  │ │ Batch │ │ Agent      ││
│  │ Router  │ │ Router  │ │ Queue │ │ Scheduler  ││
│  └────┬────┘ └────┬────┘ └───┬───┘ └─────┬──────┘│
│       │           │          │            │       │
│  ┌────▼────┐ ┌────▼────┐ ┌──▼─────┐ ┌────▼────┐ │
│  │ vLLM    │ │ vLLM    │ │ vLLM   │ │ vLLM    │ │
│  │ (small) │ │ (medium │ │ (batch │ │ (large) │ │
│  │         │ │ +cache) │ │  mode) │ │         │ │
│  └─────────┘ └─────────┘ └────────┘ └─────────┘ │
└────────────────────────────────────────────────────┘
```

### 7.6 llm-d — fas 3+ uppgradering

llm-d (CNCF sandbox) separerar prefill och decode i olika pods:
- **Prefill-pods:** compute-bound, processar input parallellt
- **Decode-pods:** memory-bound, genererar output sekventiellt
- Oberoende skalning per fas
- ~3.1k tok/s per B200, storleksordning bättre TTFT

Bevaka och planera in som uppgradering när mönster 2 (streaming) och 4 (agent) skalas.

---

## 8. AI Hub — Developer Experience

### 8.1 Princip
Plattformen är en **produkt** med interna kunder. Adoption rate är det viktigaste KPI:et.
Göra det rätta enkelt, det felaktiga svårt. Kanalisera, inte blockera.

### 8.2 Fyra gränssnitt

| Gränssnitt | Målgrupp | Teknik |
|------------|----------|--------|
| **API Gateway** | Utvecklare | OpenAI-kompatibelt API via LiteLLM |
| **AI Hub Portal** | Alla team | Backstage (CNCF graduated) |
| **Playground** | Alla | Web UI för att testa modeller |
| **Admin Console** | Platform team | Kvoter, GPU, policy, audit, kostnad |

### 8.3 AI Hub Portal (Backstage)

Backstage ger:
- **Modellkatalog:** Alla tillgängliga modeller — capabilities, SLA, kostnad, risklass
- **Software Templates:** "Skapa ny AI-tjänst" → genererar repo, Helm chart, gateway-config, monitoring
- **TechDocs:** Dokumentation lever bredvid tjänsterna
- **AI-plugins:** Modellkatalog, prompt playground, kostnadsdashboard, compliance-status

### 8.4 Onboarding-flöde

```
┌─────────────────────────────────────────────────────────────┐
│  1. REGISTRERA                                               │
│     Team registrerar sig i AI Hub Portal                     │
│     → Väljer risklass för användningsfall (AI Act)           │
│     → Org/Team konfigureras i LiteLLM                        │
├─────────────────────────────────────────────────────────────┤
│  2. PROVISIONERA (automatiskt)                               │
│     → API-nyckel genereras                                   │
│     → Budget/RPM-kvot sätts                                  │
│     → Namespace (om egna workloads)                          │
│     → Monitoring dashboard                                   │
├─────────────────────────────────────────────────────────────┤
│  3. EXPERIMENTERA                                            │
│     → Golden Path-template i Backstage (§8.6)                │
│     → Quickstart: 4 rader → första request på < 5 min       │
│     → Playground för att testa modeller                      │
│     → Sandbox-miljö med lägre kvoter                         │
├─────────────────────────────────────────────────────────────┤
│  4. PRODUKTION                                               │
│     → Review av platform team (högrisk = extra granskning)   │
│     → Produktions-API-nyckel                                 │
│     → Full observability automatiskt                         │
│     → Support-kanal                                          │
└─────────────────────────────────────────────────────────────┘
```

### 8.5 Self-service matris

| Team vill... | Plattformen ger... |
|-------------|-------------------|
| Snabb access | API-nyckel på minuter |
| Välja modell | Kuraterad katalog |
| Egen finjusterad modell | Godkännandeprocess |
| Experimentera | Sandbox med lägre kvoter |
| Inte tänka på infra | Abstraktion av GPU, scaling, failover |
| Förstå kostnaden | Per-request kostnad, team-dashboard |
| Köra konfidentiellt | Lokala modeller, data lämnar inte bolaget |

### 8.5b Modellval-guide

**Problem:** Team som onboardar frågar "vilken modell ska jag använda?" Utan guidance väljer alla den mest kända (GPT-4o) — oavsett om det är rätt val för deras dataklass, latenskrav eller budget.

**Princip:** Modellkatalogen i Backstage (§8.3) listar alla tillgängliga modeller. Denna guide kompletterar med *rekommendationer per användningsfall* — inte tvingande, utan kanal.

#### Rekommendationsmatris

| Användningsfall | Rekommenderad modellklass | Varför | Dataklass-restriktion |
|----------------|--------------------------|--------|----------------------|
| **Chatbot / Q&A** | Llama 3.x 70B (lokal) | Bra kvalitet, låg latens, full datakontroll | Alla klasser — ingen data lämnar bolaget |
| **Kodgenerering** | Claude / GPT-4o (extern) *eller* CodeLlama (lokal) | Extern = bäst kvalitet; lokal = krävs vid konfidentiell kod | Konfidentiell → enbart lokal modell |
| **RAG-query (retrieval + generering)** | Llama 3.x 8B (snabb) → 70B (komplex) | 8B för snabba svar; 70B för komplexa resonemang | Ärvs från pipeline-dataklass |
| **Sammanfattning / rapporter** | Llama 3.x 70B (lokal) | Bra på lång text, lokal = säkert | Matcha källdokumentets klass |
| **Agent-orkestrering (reasoning)** | Claude / GPT-4o (extern) *eller* Llama 405B (lokal) | Kräver starkast reasoning. Trade-off: kvalitet vs. datalokalitet | Konfidentiell → 405B lokal (kräver multi-GPU) |
| **Embedding** | BGE-large / Nomic Embed (lokal) | Alltid lokal — vektorer bör inte lämna bolaget | Alla klasser → lokal |
| **Klassificering / routing** | Llama 3.x 8B / small (lokal) | Latens < 100ms kritiskt, enkel uppgift | Intern — routing-data är metadata |
| **Finjusterad domänmodell** | Team-specifik (via §9 livscykel) | Godkännandeprocess: import → eval → stage → prod | Beroende på träningsdata |

#### Dataklass-routing

```
Dataklass "public"       → alla modeller tillgängliga (lokal + extern)
Dataklass "internal"     → alla modeller tillgängliga (data ej personligt känslig)
Dataklass "confidential" → ENBART lokala modeller (data lämnar inte klustret)
```

LiteLLM gateway (§6) enforcar detta automatiskt. Team behöver inte tänka på routing — de anger dataklass, gateway väljer modell. SDK:ts `DataClassError` (§8.6) triggas om teamet explicit begär extern modell + konfidentiell data.

#### Kostnadssignal

| Modellklass | Relativ kostnad per 1M tokens | GPU-krav | Kommentar |
|-------------|------------------------------|----------|-----------|
| 8B lokal | 1× (baseline) | 1× A100 / 1× B200 | B200: ~4× throughput vs A100 |
| 70B lokal | ~5-8× | 4× A100 / 1× B200 (FP4) | B200 kör 70B på 1 GPU med FP4, A100 kräver 4st |
| 405B lokal | ~15-25× | 8× A100 / 2× B200 | Multi-GPU oavsett |
| GPT-4o extern | ~10-15× (API-pris) | Ingen GPU — extern | $2.50/$10 per Mtok (input/output) |
| Claude extern | ~15-20× (API-pris) | Ingen GPU — extern | $3/$15 per Mtok (Sonnet 4.6) |
| Embedding lokal | ~0.1× | CPU eller 1× GPU | Mest kostnadseffektiv workload |

**GPU-priser (2026, cloud on-demand):**

| GPU | Pris/timme | Throughput (70B, tok/s) | $/Mtok (approx) |
|-----|-----------|------------------------|-----------------|
| A100 80GB | ~$1.80/hr | ~800 | ~$0.60 |
| H100 80GB | ~$3.00/hr | ~2 000 | ~$0.40 |
| B200 192GB | ~$3.50-6/hr | ~8 000 (FP4, vLLM) | ~$0.10-0.20 |

**Not:** Throughput-siffror baserade på SemiAnalysis InferenceMAX-benchmarks (2026) med vLLM. B200 levererar ~4× throughput/$ jämfört med H100 tack vare FP4 och större VRAM. Faktisk kostnad beror på konfiguration, batch-storlek, caching och reservationsmodell. FinOps-dashboarden (§22.1) visar per-request-kostnad i realtid.

**FP4-kvantisering — kvalitetsavvägning:** B200:s kostnadsfördelar kommer delvis från FP4-precision (4-bit floating point). FP4 ger utmärkt throughput men kan försämra output-kvalitet för vissa uppgifter:

| Användningsfall | FP4 OK? | Rekommendation |
|----------------|---------|----------------|
| Chatbot / Q&A | Ja | FP4 default — kvalitetsskillnad minimal |
| Kodgenerering | Testa | Eval per modell — subtila logikfel kan öka med lägre precision |
| Agent-orkestrering (reasoning) | Försiktig | FP8 eller BF16 rekommenderas för komplexa reasoning-kedjor |
| RAG-query | Ja | Retrieval-kvalitet beror mer på embedding än generering |
| Embedding | Ej tillämpligt | Embedding-modeller körs i FP16/BF16 — kvantisering påverkar vektorkvalitet |
| Sammanfattning | Ja | FP4 ger god kvalitet på extractive/abstractive summarization |

**Princip:** Default till FP4 för throughput och kostnad. Erbjud FP8/BF16 som alternativ via modellkatalogen (§8.3) för team som kräver maximal precision. Eval-pipeline (§9.4) ska inkludera FP4 vs FP8-jämförelse vid modellimport.

#### Vägledning, inte tvång

Matrisen är en *default path*. Team kan avvika — men avvikelse loggas (audit) och syns i team-dashboarden. Om många team avviker från en rekommendation är det en signal att matrisen behöver uppdateras, inte att teamen gör fel.

### 8.6 Bifrost SDK (fas 2-3)

**Problem:** OpenAI-kompatibelt API räcker för enkel inference, men team som bygger RAG-appar, agent-flöden eller kunskapsgrafer behöver mer. Utan SDK bygger varje team egna abstraktionslager — och gör samma misstag (felhantering, retry, dataklass-routing, auth).

**Designprincip:** SDK:t ska göra *rätt sak enkelt* och *fel sak svårt*. Dataklass-routing, audit-taggning och tenant-isolering sker automatiskt — teamet behöver inte tänka på compliance för att vara compliant.

#### Förhållande till OpenAI-kompatibelt API

```
Team som bara vill ha inference  →  OpenAI SDK direkt mot LiteLLM  ✅ (fungerar redan)
Team som vill ha RAG/memory/agents  →  Bifrost SDK  ✅ (nya kapabiliteter)
```

SDK:t *ersätter inte* OpenAI-kompatibiliteten. Team som bara anropar `chat/completions` behöver inte byta. SDK:t är för team som vill använda plattformens fulla kapabilitet.

#### Modulstruktur

```
@bifrost/sdk
├── core/          — Auth, config, HTTP-klient, retry, felhantering
├── chat/          — Inference (thin wrapper kring LiteLLM, OpenAI-kompatibel)
├── rag/           — RAG-pipeline: query, ingest, pipeline-hantering
├── memory/        — Agent memory: remember, recall, forget
├── graph/         — Knowledge graph: query, traverse, ingest
├── tools/         — Tool registry: registrera, anropa, validera
├── usage/         — Kostnads- och usage-data per team
└── admin/         — (Platform team) Kvoter, modeller, policies
```

#### Kodexempel

```typescript
import { Bifrost } from '@bifrost/sdk';

// 1. Initiering — API-nyckel bär tenant-id, compliance-profil, dataklass-default
const client = new Bifrost({
  apiKey: process.env.BIFROST_API_KEY,  // = LiteLLM virtual key
  // Allt annat ärvs från nyckelns konfiguration:
  // tenant, default dataklass, compliance-profil, kvoter
});

// 2. Inference — delegerar till LiteLLM, men med SDK-ergonomi
const response = await client.chat({
  model: 'llama-70b',
  messages: [{ role: 'user', content: 'Sammanfatta kvartalsrapporten' }],
  dataClass: 'confidential',  // override default → tvingar lokal modell
});

// 3. RAG — skapa pipeline (matchar §5.9 steg 1-2: välj recept + provisionera)
const pipeline = await client.rag.create({
  name: 'team-x-docs',
  recipe: 'vanilla',                   // 'vanilla' | 'graphrag' | 'hipporag' (§5.8)
  dataClass: 'internal',               // styr vilken modell som används för embedding + query
  embeddingModel: 'default',           // plattformens default, eller specifik
  chunkSize: 512,                      // tokens per chunk
  chunkOverlap: 50,                    // overlap i tokens
});
// Provisionerar: Qdrant collection + MinIO bucket + embedding-jobb + API-endpoint
// pipeline.id = 'rag-pipeline-abc123'
// pipeline.endpoint = '/v1/rag/rag-pipeline-abc123/query'

// 4. RAG ingest — ladda dokument (matchar §5.9 steg 3)
await client.rag.ingest({
  pipelineId: pipeline.id,
  documents: [
    { url: 'https://wiki.internal/deploy-guide', type: 'webpage' },
    { path: '/docs/runbook.md', type: 'markdown' },
  ],
  // Chunking, embedding, indexering sker server-side
  // Inkrementell: bara nya/ändrade dokument processas (§5.9 steg 5)
});

// 5. RAG query (matchar §5.9 steg 4: POST /v1/rag/{pipeline-id}/query)
const answer = await client.rag.query({
  pipelineId: pipeline.id,
  query: 'Hur fungerar vår deploy-process?',
  topK: 10,                           // antal retrieval-resultat
  rerank: true,                        // cross-encoder reranking
});
// answer.text = genererat svar
// answer.sources = [{ docId, chunk, score, url }]

// 6. RAG reindex — manuell full reindexering (matchar §5.9 steg 5)
await client.rag.reindex({ pipelineId: pipeline.id });

// 7. Agent memory — working + episodic
await client.memory.remember({
  content: 'Deploy lyckades kl 14:32, inga fel',
  tags: ['deploy', 'prod'],
  ttl: '7d',  // working memory — försvinner efter 7 dagar
});

const memories = await client.memory.recall({
  query: 'senaste deploy',
  topK: 5,
  filter: { tags: ['deploy'] },
});

// 8. Knowledge graph — traversal och frågor
const entities = await client.graph.query({
  cypher: 'MATCH (t:Team)-[:OWNS]->(s:Service) WHERE t.name = $team RETURN s',
  params: { team: 'alpha' },
});

// 9. Kostnad
const usage = await client.usage.thisMonth();
// { requests: 12400, tokens: { input: 2.1M, output: 450K }, cost: '$340', budget: '$500' }
```

#### Auth & Tenant-isolering

| Lager | Mekanism |
|-------|----------|
| **API-nyckel** | LiteLLM virtual key = 1 team = 1 uppdrag. Bär tenant-id, compliance-profil, kvoter. |
| **SDK auto-header** | Varje request taggas automatiskt med `X-Tenant-Id`, `X-Data-Class`, `X-Request-Id` |
| **Server-side enforcement** | Oavsett vad SDK:t skickar — servern validerar att tenant-id matchar nyckel, dataklass matchar profil |
| **Scope per modul** | `rag.query()` söker *enbart* i teamets Qdrant collection. `graph.query()` enbart i teamets Neo4j-databas. Ingen cross-tenant access möjlig. |

**Princip:** SDK:t är en convenience — inte en säkerhetsbarriär. All enforcement sker server-side. Om någon bygger en egen HTTP-klient gäller samma regler.

#### Felhantering

```typescript
import { BifrostError, RateLimitError, DataClassError } from '@bifrost/sdk';

try {
  const response = await client.chat({ model: 'gpt-4o', dataClass: 'confidential' });
} catch (e) {
  if (e instanceof DataClassError) {
    // "Konfidentiell data kan inte skickas till extern modell (gpt-4o).
    //  Använd en lokal modell eller sänk dataklass."
  }
  if (e instanceof RateLimitError) {
    // e.retryAfter = 2.3 (sekunder)
    // SDK:t har redan gjort 3 retries med exponential backoff
  }
}
```

| Feltyp | SDK-beteende |
|--------|-------------|
| **Rate limit (429)** | Auto-retry med exponential backoff (max 3), sedan kasta `RateLimitError` |
| **Dataklass-konflikt** | Ingen retry — direkt `DataClassError` med tydligt meddelande |
| **Model unavailable (503)** | Auto-fallback till nästa modell i routing-ordningen (om konfigurerat) |
| **Timeout** | Konfigurerbar per anrop. Default: 30s (chat), 120s (RAG), 300s (batch ingest) |
| **Auth-fel (401/403)** | Direkt `AuthError` — ingen retry |
| **Server-fel (500)** | Retry 1 gång, sedan kasta |

#### Rate Limit-transparens

**Problem:** En utvecklare som får `RateLimitError` vet att kvoten är slut — men inte *varför*, hur nära gränsen de var, eller när den återställs. Det leder till frustration och felsöknings-ping till platform team.

**SDK response headers (vidarebefordrade från LiteLLM):**

| Header | Värde | Exempel |
|--------|-------|---------|
| `X-RateLimit-Limit-Requests` | Max requests per minut | `100` |
| `X-RateLimit-Limit-Tokens` | Max tokens per minut | `100000` |
| `X-RateLimit-Remaining-Requests` | Kvar denna minut | `23` |
| `X-RateLimit-Remaining-Tokens` | Kvar denna minut | `45200` |
| `X-RateLimit-Reset` | Sekunder tills reset | `34` |

**SDK-exponering:**

```typescript
const response = await client.chat({ model: 'llama-70b', messages });
console.log(response.rateLimit);
// { limitRequests: 100, limitTokens: 100000,
//   remainingRequests: 23, remainingTokens: 45200,
//   resetSeconds: 34 }
```

**Dashboard (Backstage, fas 2):**

Varje team ser sin kvot-status i AI Hub Portal:
- **Realtidsvy:** Förbrukning vs kvot per modell (RPM, TPM)
- **Historik:** 7-dagars trend — visar om teamet regelmässigt når taket
- **Prognos:** "Vid nuvarande takt når ni kvotgränsen om ~2 timmar"
- **Självbetjäning:** Knapp för att begära kvothöjning (ticket till platform team)

**Princip:** Transparens minskar support-börda. Om utvecklaren kan se "jag har 23 requests kvar och reset om 34 sekunder" behöver hen inte öppna en ticket.

#### Versioning & Backward Compatibility

| Princip | Detalj |
|---------|--------|
| **Semver** | SDK följer semver. Breaking changes = major bump. |
| **API-versioning** | SDK:t skickar `X-Bifrost-API-Version: 2026-08-01`. Server stödjer N-2 versioner. |
| **Deprecation** | Deprecated metoder loggar varning i 2 minor releases, tas bort i nästa major. |
| **Språk** | TypeScript (primary), Python (secondary — fas 3). Båda auto-genererade från OpenAPI-spec. |

#### Fasning

| Fas | Moduler | Effort |
|-----|---------|--------|
| **Fas 2** | `core` + `chat` + `rag` + `usage` | Låg — thin wrapper kring LiteLLM + RAG-endpoint |
| **Fas 3** | + `memory` + `graph` + `tools` | Medel — kräver stabilt Data Plane + agent sandbox |
| **Post 90d** | + `admin` + Python SDK + `@bifrost/sdk-mock` (testkit) | Medel — auto-gen från OpenAPI-spec |

**Build vs Buy:** SDK:t är inget tungt ramverk — det är en typad HTTP-klient med auto-auth, dataklass-routing och retry. ~2000-3000 rader TypeScript i fas 2. Genereras delvis från LiteLLM:s OpenAPI-spec.

**Testbarhet:** Alla moduler exponerar TypeScript-interfaces (`IBifrostClient`, `IRagModule`, etc.) så att team kan mocka med standardverktyg (vi rekommenderar `vitest` mock) från dag ett — utan att vänta på dedikerat testkit. `@bifrost/sdk-mock` med färdiga fixtures och in-memory-backends levereras post 90d när API:t stabiliserats.

#### Quickstart & Golden Paths

**Princip:** Om onboarding tar mer än 5 minuter har SDK:t misslyckats. Första request ska fungera med 4 rader.

**Quickstart (leverabel i SDK-repot):**

```typescript
// 1. npm install @bifrost/sdk
// 2. Kopiera detta:
import { Bifrost } from '@bifrost/sdk';
const client = new Bifrost({ apiKey: 'din-nyckel' });
const answer = await client.chat({ messages: [{ role: 'user', content: 'Hej!' }] });
console.log(answer.content);
// 3. Kör: npx tsx quickstart.ts
```

**Golden Paths (Backstage-templates som genererar färdig kod):**

| Golden Path | Vad genereras | Tid till "det funkar" |
|-------------|--------------|----------------------|
| **"Min första AI-fråga"** | Repo + SDK-setup + chat-anrop + README | < 5 min |
| **"RAG-app"** | Qdrant collection + ingest-jobb + query-endpoint + exempelkod | < 15 min |
| **"Agent med minne"** | Agent sandbox + memory-setup + tool-registrering + loop | < 30 min |
| **"GraphRAG-pipeline"** | Neo4j subgraph + entity extraction + Qdrant + query | < 30 min |

Golden paths *är* SDK-dokumentation i praktiken — de visar inte bara API:t utan hela flödet, inklusive provisionering. Backstage-template kör `client.rag.create()` under huven.

**Test-princip:** Varje golden path testas internt innan release: en ny utvecklare utan Bifrost-erfarenhet ska kunna köra den utan att fråga platform team. Om hen fastnar, fixa guiden — inte teamet.

#### Speed Bumps — högrisk-operationer

**Problem:** Ett SDK som gör allt friktionsfritt riskerar att team skickar konfidentiell data till externa modeller, ingester kunddata i fel pipeline, eller skapar RAG-pipelines utan att tänka på dataklass. Gaten i sökningen flaggade: "ship faster, more bugs".

**Princip:** Rätt sak ska vara enkelt. Farlig sak ska vara *möjligt men explicit*.

| Operation | Speed bump | Varför |
|-----------|-----------|--------|
| **Ingest till konfidentiell pipeline** | `client.rag.ingest()` kräver explicit `dataClass: 'confidential'` — infereras inte tyst | Förhindra att kunddata hamnar i fel klass |
| **Skapa pipeline med extern modell + konfidentiell data** | `DataClassError` — blockeras server-side, SDK ger tydligt felmeddelande | Konfidentiell data får inte lämna bolaget |
| **Radera pipeline** | `client.rag.delete()` kräver `confirm: true` parameter | Destruktiv operation — förhindra oavsiktlig radering |
| **Agent memory med lång TTL** | Memory > 90 dagars TTL loggar varning: "Överväg om detta bör vara persistent knowledge istället" | Förhindra att working memory smyger sig till permanent lagring |
| **Cross-modell datadelning** | `client.graph.query()` med Cypher som refererar annan tenants data | Blockeras server-side + `TenantIsolationError` |
| **Högrisk AI-request utan human oversight** | Om compliance-profilen kräver human-in-the-loop → `HumanOversightRequired` error med instruktion | EU AI Act-krav (§26.5) |

**Server-side enforcement:** Alla speed bumps enforced server-side — SDK:t ger bra felmeddelanden, men säkerheten sitter inte i klienten. Ett team som bygger egen HTTP-klient möter samma regler.

### 8.7 Agent-protokoll — MCP och A2A

**Problem:** Bifrost bygger en plattform där agenter använder verktyg (RAG, grafer, minne, sandboxar) och samarbetar med andra agenter. Utan standardiserade protokoll bygger varje team egna integrationer — och interoperabilitet mellan agenter från olika team eller leverantörer blir omöjlig.

**Lösning:** Bifrost adopterar två komplementära öppna protokoll som båda förvaltas av Agentic AI Foundation (AAIF) under Linux Foundation:

| Protokoll | Syfte | Analogi |
|-----------|-------|---------|
| **MCP** (Model Context Protocol) | Agent ↔ verktyg | USB-C — standardiserad kontakt mellan agent och datakälla/verktyg |
| **A2A** (Agent-to-Agent Protocol) | Agent ↔ agent | HTTP — standardiserat sätt för agenter att upptäcka, delegera till och samarbeta med varandra |

#### MCP — hur agenter pratar med verktyg

MCP, ursprungligen från Anthropic (2024), är de facto-standard för agent-verktyg-kommunikation. Claude, ChatGPT, Copilot och Gemini stödjer MCP nativt.

**Arkitektur i Bifrost:**

```
┌──────────────┐         ┌──────────────────┐         ┌────────────────┐
│  Agent        │  MCP    │  MCP Server       │         │  Bifrost-tjänst│
│  (i sandbox)  │ ──────→ │  (per kapabilitet) │ ──────→ │                │
│               │         │                    │         │  Qdrant        │
│               │         │  tools/            │         │  Neo4j         │
│               │         │  resources/        │         │  MinIO         │
│               │         │  prompts/          │         │  MLflow        │
└──────────────┘         └──────────────────┘         └────────────────┘
```

**MCP-server-katalog (plattformsleverade):**

| MCP-server | Exponerar | Fas |
|------------|----------|-----|
| `bifrost-rag` | RAG-pipelines: query, ingest, reindex | Fas 2 |
| `bifrost-memory` | Agent memory: remember, recall, forget | Fas 3 |
| `bifrost-graph` | Knowledge graph: Cypher-query, traversal | Fas 3 |
| `bifrost-tools` | Tool registry: registrera, anropa, validera | Fas 3 |
| `bifrost-usage` | Kostnads- och usage-data per team | Fas 2 |
| `bifrost-admin` | Kvoter, modeller, policies (platform team) | Post 90d |

**Transport:** Streamable HTTP (MCP 2026-roadmap) för remote-access inifrån agent sandbox. STDIO stöds för lokala integrationer.

**Säkerhet:** MCP-servrar körs *utanför* agent sandbox — agenten har inte direkt access till Qdrant/Neo4j. MCP-servern validerar tenant-id, dataklass och kvoter server-side, identiskt med SDK-enforcement (§8.6).

**MCP Auth-flöde (OAuth 2.1):**

```
┌─────────────┐    1. Token request     ┌──────────────────┐
│  Agent       │ ─────────────────────→  │  Bifrost Identity │
│  (i sandbox) │                         │  Provider (IdP)    │
│              │ ←─────────────────────  │                    │
│              │    2. Access token       │  (Keycloak/OIDC)   │
│              │       + scope            └──────────────────┘
│              │
│              │    3. MCP request + Bearer token
│              │       + resource indicator (RFC 8707)
│              │ ─────────────────────→  ┌──────────────────┐
│              │                         │  MCP Server       │
│              │ ←─────────────────────  │  (bifrost-rag)    │
│              │    4. Response           │                    │
└─────────────┘                          └──────────────────┘
```

| Steg | Vad händer | Säkerhetsfunktion |
|------|-----------|-------------------|
| **1. Token request** | Agent autentiserar med sin sandbox-identitet (SPIFFE SVID, §20.8) mot IdP | Agent-identitet bunden till tenant + sandbox |
| **2. Access token** | IdP utfärdar OAuth 2.1 access token med scope per MCP-server (t.ex. `bifrost-rag:query`, `bifrost-memory:write`) | Minsta privilegium — agenten får bara de scopes den behöver |
| **3. Resource indicator** | Agent skickar token + RFC 8707 resource indicator som pekar på specifik MCP-server | Förhindrar token mis-redemption — en token för `bifrost-rag` kan inte användas mot `bifrost-admin` |
| **4. Server-side validering** | MCP-server validerar token, kontrollerar scope, verifierar tenant-id mot request, loggar i audit trail | Alla fyra kontroller måste passera — misslyckas en returneras 401/403 |

**Token-livscykel:** Kort-livade tokens (5-15 min). Agent sandbox roterar automatiskt. Ingen manuell nyckelhantering för team — sandbox-orkestratorn hanterar token-förnyelse.

**Koppling till SDK:** Bifrost SDK (§8.6) och MCP-servrar exponerar *samma kapabiliteter* via två interfaces:
- **SDK** = för team som skriver applikationskod (TypeScript/Python)
- **MCP** = för agenter som kör i sandbox och behöver verktygsaccess

**Varför olika auth-modeller?** En utvecklare som jämför §8.6 (SDK: API-nyckel) med §8.7 (MCP: OAuth 2.1) kan undra varför auth är annorlunda för samma kapabilitet. Orsaken är att de tjänar olika trust-nivåer:

| Interface | Auth-modell | Varför |
|-----------|------------|--------|
| **SDK** (applikationskod) | API-nyckel (LiteLLM virtual key) | Teamet äger koden, kör i sin egen miljö. DX-prioritet: enkel setup, < 5 min till första request. Nyckeln bär tenant-id + kvoter. |
| **MCP** (agent i sandbox) | OAuth 2.1 + SPIFFE-identitet | Agenten kör autonom kod i en sandbox — starkare isolering krävs. Kort-livade tokens, scope per MCP-server, automatisk rotation. Ingen manuell nyckelhantering. |

Båda enforcar samma regler server-side (tenant-isolering, dataklass-routing, audit). Skillnaden är *hur* anroparen identifieras, inte *vad* som gäller.

#### A2A — hur agenter pratar med varandra

A2A, ursprungligen från Google (2025), hanterar agent-till-agent-kommunikation: upptäckt, delegering och samarbete mellan agenter som kan komma från olika team, ramverk eller leverantörer.

**Användning i Bifrost (fas 3+):**

| Scenario | A2A-funktion |
|----------|-------------|
| **Researchagent delegerar till sammanfattningsagent** | Task delegation via JSON-RPC 2.0 |
| **Team A:s agent frågar Team B:s agent om API-spec** | Agent discovery via Agent Cards |
| **Orkestreringsagent koordinerar 5 specialistagenter** | Streaming (SSE) för progress + push notifications |
| **Extern partner-agent samarbetar med intern agent** | Agent Cards med signerade säkerhetscertifikat |

**Agent Cards:** Varje agent som exponeras via A2A publicerar ett Agent Card — en maskinläsbar beskrivning av agentens kapabiliteter, endpoint, auth-krav och kontaktinfo. Registreras i Backstage-katalogen (§8.3).

**Tre kommunikationsmönster:**

| Mönster | När | Protokoll |
|---------|-----|-----------|
| **Synkront** | Snabba svar (< 30s) | JSON-RPC request/response |
| **Streaming** | Lång bearbetning med progress | SSE (Server-Sent Events) |
| **Asynkront** | Batch-jobb, offline-delegering | Push notifications + callback |

**Fasning:**

| Fas | A2A-kapabilitet |
|-----|----------------|
| **Fas 2** | Ingen A2A — agenter är isolerade, kommunicerar via delade resurser (Qdrant, Neo4j) |
| **Fas 3** | Intern A2A: agenter inom samma tenant kan upptäcka och delegera till varandra |
| **Post 90d** | Cross-tenant A2A: agenter från olika team kan samarbeta (med governance-godkännande). Extern A2A: partner-agenter med signerade Agent Cards |

**Governance-koppling:** A2A-kommunikation loggas i audit trail (§12.2). Cross-tenant-delegering kräver explicit godkännande i governance-ramverket. Agent Cards granskas vid registrering — en agent kan inte exponeras via A2A utan security review (§20.12).

#### Samspel MCP + A2A

```
┌─────────────────────────────────────────────────────────┐
│  Agent A (Team X)                                        │
│                                                          │
│  Använder MCP för att:          Använder A2A för att:    │
│  • Söka i RAG-pipeline          • Delegera till Agent B  │
│  • Spara i agent memory         • Fråga Agent C          │
│  • Traversa kunskapsgraf        • Rapportera progress    │
│                                                          │
│  MCP = vertikal (agent ↔ plattform)                      │
│  A2A = horisontell (agent ↔ agent)                       │
└─────────────────────────────────────────────────────────┘
```

**Princip:** MCP och A2A är komplementära, inte konkurrerande. MCP ger agenter tillgång till plattformens data och verktyg. A2A ger agenter möjlighet att samarbeta. Bifrost levererar MCP-servrar från fas 2 (omedelbart användbart) och A2A-stöd från fas 3 (när multi-agent-mönster mognat).

#### Agent Registry & Discovery (fas 3+)

**Problem:** A2A kräver att agenter kan *hitta* varandra. Agent Cards (ovan) beskriver *vad* en agent kan — men det behövs infrastruktur för *var* de registreras, *hur* discovery fungerar och *vem* som underhåller registret.

**Design:**

```
┌──────────────────────────────────────────────────────────┐
│  AGENT REGISTRY (Backstage-plugin)                        │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Agent Card Catalog                                   │  │
│  │  ───────────────────────────────────────────────────  │  │
│  │  agent-rag-helper    Team Alpha   active   fas 2     │  │
│  │  agent-code-review   Team Beta    active   fas 3     │  │
│  │  agent-data-pipeline Team Gamma   draft    —         │  │
│  │  agent-customer-faq  Team Delta   active   fas 2     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  Discovery API: GET /v1/agents?capability=code-review      │
│  Agent Card:    GET /v1/agents/{agent-id}/.well-known/agent│
└──────────────────────────────────────────────────────────┘
```

**Registry-komponenter:**

| Komponent | Teknik | Ansvar |
|-----------|--------|--------|
| **Catalog** | Backstage Entity (kind: Agent) | Listar alla registrerade agenter med metadata |
| **Agent Card** | JSON-dokument per A2A-spec | Maskinläsbar: capabilities, endpoint, auth, kontakt |
| **Discovery API** | REST-endpoint i gateway | `GET /v1/agents?capability=X` — returnerar matchande Agent Cards |
| **Health monitor** | Prometheus probe | Kontrollerar att registrerade agenter svarar. Markerar "degraded" efter 3 missade probes |

**Registreringsflöde:**

1. Team bygger agent → skapar Agent Card (YAML i repo)
2. PR till agent-catalog-repo → review av platform team
3. Security review (§20.12) om agenten har extern access eller cross-tenant-capability
4. Merge → Backstage synkar Agent Card → Discovery API uppdateras
5. Andra agenter hittar den via `GET /v1/agents?capability=...`

**Inter-agent kommunikationsinfrastruktur:**

| Mönster | Användningsfall | Teknik | Fas |
|---------|----------------|--------|-----|
| **Request-response** | Agent A frågar Agent B om API-spec | A2A HTTP | Fas 3 |
| **Delegering** | Agent A delegerar deluppgift till Agent B | A2A Task | Fas 3 |
| **Pub/sub** | Agent publicerar händelse, intresserade agenter reagerar | NATS/Redis Streams | Fas 3+ |
| **Shared state** | Agenter delar kunskap via gemensam vektor-/grafresurs | Qdrant/Neo4j (§5) | Fas 2 (redan) |

**Governance:**
- Varje A2A-anrop loggas i audit trail (§12.2) med: source-agent, target-agent, capability, timestamp, tenant
- Cross-tenant A2A kräver explicit godkännande i governance-ramverket (§22.3)
- Agent Cards kan inte registreras utan security review
- Kill switch: platform team kan avregistrera en agent omedelbart

**Fasning:**

| Fas | Kapabilitet |
|-----|------------|
| **Fas 2** | Ingen agent-till-agent. Agenter kommunicerar via delade resurser (Qdrant, Neo4j). Agent catalog finns i Backstage (metadata, inte discovery) |
| **Fas 3** | Intern A2A: agenter inom samma tenant kan hitta och delegera. Discovery API live. Agent Cards publicerade |
| **Post 90d** | Cross-tenant A2A med governance. Pub/sub för asynkrona händelser. Partner-agenter med signerade Agent Cards |

---

## 9. Modell-livscykelhantering

### 9.1 MLflow som centralt register

MLflow hanterar:
- Model Registry med versioner, metadata, lineage
- Experiment Tracking (jämför modeller)
- LLM Evaluation (hallucination rate, coherence)
- Deployment: Staging → Production promovering

### 9.2 Livscykelpipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  IMPORT  │ →  │   EVAL   │ →  │  STAGE   │ →  │   PROD   │ →  │  SUNSET  │
│          │    │          │    │          │    │          │    │          │
│ Register │    │ Benchmark│    │ Canary   │    │ Serve    │    │ Deprecate│
│ Scan     │    │ Red-team │    │ A/B test │    │ Monitor  │    │ Migrate  │
│ License  │    │ PII test │    │ Shadow   │    │ Drift    │    │ Archive  │
│ DBOM     │    │ Cost est │    │          │    │ Alert    │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 9.3 Import
- Registrera modell i MLflow med metadata
- Säkerhetsscan av modellvikter (trojaner, backdoors)
- Licensverifiering (kommersiell användning?)
- DBOM: träningsdata, proveniens, bias-analys

### 9.4 Eval
- Standardiserad benchmark-suite (domänrelevant, inte bara akademiska)
- Red-team: prompt injection, jailbreak, PII-läckage
- PII-hanteringstest
- Kostnadsuppskattning: token/s, VRAM, estimerad månadskostnad

### 9.5 Stage
- KServe revision-baserad canary: 5% → 25% → 50% → 100%
- A/B-test med identiska prompts mot gammal och ny modell
- Shadow mode: ny modell processar alla requests, svaren kastas
- Regressionskontroll: ingen konsumerande team får sämre resultat

### 9.6 Prod
- Full observability (tokens, latency, cost, cache hit rate)
- Drift-detektion: förändras output-kvalitet över tid?
- Automatiska alerts vid degradering
- Kostnadsspårning per team

### 9.7 Sunset
- Deprecation notice: 30/60/90 dagar beroende på risklass
- Automatisk fallback till ersättningsmodell i gateway
- Traffic monitoring: vem använder fortfarande gammal modell?
- Arkivering av modell och metadata (compliance-krav)

### 9.8 Governance-koppling

| Risklass | Import | Eval | Stage | Sunset |
|----------|--------|------|-------|--------|
| **Minimal** | Registrera | Bastest | Direkt rollout | Arkivera |
| **Begränsad** | + Licenskontroll | + Red-team | Canary | + 30d deprecation |
| **Högrisk** | + DBOM + juridisk | + Full red-team + PII | Shadow + A/B + human review | + 90d + audit trail |

---

## 10. Docker — Supply Chain Security

### 10.1 Regler
- Alltid multi-stage builds
- Inga build tools i runtime image
- Inga hemligheter i image layers
- Pinna base images via digest
- Icke-root som default
- Separera CPU-image och GPU-image

### 10.2 Attestation
- Generera SBOM (Software Bill of Materials)
- Generera provenance
- Signera image innan deploy
- Sigstore policy-controller validerar vid admission

### 10.3 AI-assisterad hardening
Låt AI:
- Jämföra image size mellan versioner
- Analysera attackyta
- Föreslå borttagning av onödiga paket
- Hitta läckor av cache/artifacts
- Föreslå split mellan build- och runtime-lager

---

## 11. Helm — Plattformens deklarativa språk

### 11.1 Chart-hierarki

| Chart | Syfte |
|-------|-------|
| **base-service** | Alla interna mikrotjänster |
| **llm-serving** | vLLM/KServe inferenstjänster |
| **batch-job** | Eval/reindex/embedding-jobb |
| **vector-db** | Qdrant deployment + collection management |
| **knowledge-graph** | Neo4j deployment + plugin config |
| **object-store** | MinIO deployment + bucket policies |
| **agent-sandbox** | Agent Sandbox CRD, templates, workspace PVC |
| **cache** | Redis deployment (HA, sentinel) |
| **policy** | Admission rules, quotas, network policies |
| **observability** | Tracing/metrics/loggning |
| **ai-hub** | Backstage + Playground + Admin |

### 11.2 Princip
**Inget i produktion skapas för hand. Allt uttrycks som chart + values + policy.**
AI skriver plattformsspråk, inte bara YAML.

---

## 12. Governance Plane — två lager

### 12.1 Infrastruktur-governance

Kubernetes-native:
- ValidatingAdmissionPolicy (CEL-baserad)
- Pod Security Admission per namespace
- Sigstore policy-controller för image-signatur
- RBAC med minimal scope per workload

Blockar:
- `latest`-taggar
- Pods utan resource requests/limits
- Pods utan securityContext
- Privilegierade containers i app-namespaces
- Osignerade images
- Miljövariabler som ser ut som hemligheter

### 12.2 AI Compliance

```
┌────────────────────────────────────────────────────────┐
│                 AI COMPLIANCE LAYER                      │
│                                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Risk Registry  │  │ PII Gateway                  │  │
│  │ - AI system    │  │ - NER-baserad detektion       │  │
│  │   inventering  │  │ - Redact/pseudonymisera       │  │
│  │ - Risklass per │  │ - Per-tenant konfiguration    │  │
│  │   system       │  │ - Reversibel anonymisering    │  │
│  │ - Ansvarig     │  │   (fas 2)                     │  │
│  └────────────────┘  └──────────────────────────────┘  │
│                                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Audit Trail    │  │ DBOM Store                   │  │
│  │ - Varje req    │  │ - Träningsdata proveniens     │  │
│  │ - Beslut       │  │ - RAG-data proveniens         │  │
│  │ - Guardrail    │  │ - Retention policy             │  │
│  │ - Regulatorisk │  │ - Access log                   │  │
│  └────────────────┘  └──────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Human Oversight                                     │ │
│  │ - Högrisk-beslut kräver human-in-the-loop           │ │
│  │ - Eskaleringskedjor per risklass                    │ │
│  │ - Override-loggning                                  │ │
│  └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 12.3 Data Residency och Retention

**Varför:** En CISO kommer fråga "var lagras promptar och svar?" innan plattformen godkänns. Utan svar — inget godkännande.

#### Lagringsplatser

| Data | Var | Retention | Jurisdiktion |
|------|-----|-----------|--------------|
| Promptar + svar (audit) | Audit Trail (Loki/ES) | 12 mån (konfig-bar per risklass) | On-prem / EU |
| Vektorer (embeddings) | Qdrant | Tills team raderar pipeline | On-prem / EU |
| Kunskapsgraf | Neo4j | Tills team raderar | On-prem / EU |
| Dokument (RAG-källa) | MinIO | Teamets ansvar, max 24 mån default | On-prem / EU |
| Modellvikter | MinIO | Permanent (arkivering) | On-prem / EU |
| Agent workspace | PVC (K8s) | Session + 30d arkivering | On-prem / EU |
| Cache/session | Redis | Ephemeral (TTL: timmar) | On-prem / EU |
| Extern API-trafik | Provider (Anthropic/OpenAI) | Enligt providers policy | US/EU beroende på avtal |

**Princip:** All intern data stannar on-prem eller i EU. Extern API-trafik (Claude, GPT) skickas *enbart* för icke-konfidentiell data — routing baseras på dataklass (se §12.4).

#### Retention-regler per risklass

| Risklass (AI Act) | Audit retention | Data deletion | Backup |
|--------------------|----------------|---------------|--------|
| Minimal | 6 mån | På begäran | Daglig |
| Begränsad | 12 mån | 30d efter avslut | Daglig + off-site |
| Högrisk | 36 mån (regulatoriskt) | Kräver godkännande | Daglig + off-site + immutable |

### 12.4 Dataklassificering per request

**Varför:** PII-gateway löser persondata, men inte affärshemligheter, strategiska planer eller kunddata. Alla requests är inte lika känsliga.

#### Tre dataklasser

| Klass | Beskrivning | Routing | Exempel |
|-------|-------------|---------|---------|
| **Öppen** | Allmän information, ej känslig | Lokal → Extern API OK | "Förklara Kubernetes DRA" |
| **Intern** | Intern men ej hemlig | Lokal prioriterad, extern OK med anonymisering | Internkommunikation, processer |
| **Konfidentiell** | Affärshemligheter, strategisk, kunddata | **Enbart lokala modeller** | Finansdata, avtal, kundinfo |

#### Hur klassificering sker

```
Request → PII Gateway (NER) → Dataklass-detektor → Routing

Dataklass-detektor:
  1. Team-default: varje team har en default-klass (sätts vid onboarding)
  2. Per-request override: header X-Data-Class: confidential
  3. Automatisk detektion: mönster för finanstermer, kundnamn, avtalsnummer
  4. Eskalering: om osäker → behandla som konfidentiell (fail-safe)
```

**Fail-safe:** Vid tveksamhet klassificeras data uppåt. En intern request som *kanske* är konfidentiell behandlas som konfidentiell. Bättre att routing går till lokal modell i onödan än att känslig data skickas externt.

#### Kunddata-segregering

CGI arbetar med konkurrerande kunder inom samma bransch. Dataklassificering löser *vad* som är känsligt — men inte *vems* data det är. Utöver dataklass taggas varje request med `tenant-id` (= uppdrag/kund). Tenant-id styr:

- **Vilken Qdrant-collection** som söks (ingen cross-collection)
- **Vilken Neo4j-databas** som frågas
- **Vilken MinIO-bucket** som nås
- **Vilken compliance-profil** som gäller (§26.3)

**Enforcement:** LiteLLM virtual key = 1 team = 1 uppdrag. Kyverno-policy blockerar cross-namespace access. Anomali-detektor larmar vid oväntat cross-tenant-mönster.

Se §26.4 för fullständig isoleringsmodell och incidenthantering vid läcka.

### 12.5 Agent Governance

Microsoft Agent Governance Toolkit (MIT-licens) adresserar alla 10 OWASP Agentic AI-risker:

| Risk | Mitigation |
|------|-----------|
| Goal hijacking | Input sanitization, intention validation |
| Tool misuse | Tool-level policy, allowlists |
| Identity abuse | Per-agent identity, minimal scope |
| Supply chain | Runtime component verification |
| Code execution | Execution sandboxing |
| Memory poisoning | Memory integrity checks |
| Inter-agent spoofing | Authenticated agent mesh |
| Cascading failures | Circuit breakers, blast radius limits |
| Trust exploitation | Confidence scoring, human checkpoints |
| Rogue agents | Behavioral monitoring, kill switches |

---

## 13. Secrets och identiteter

- Kryptera secrets at rest i etcd
- Externa hemligheter via vault-lösning (HashiCorp Vault, AWS Secrets Manager, etc.)
- Service accounts per workload
- Minimal RBAC per workload
- Kortlivade projected tokens
- Förbjud breda ClusterRoles i app-zoner
- AI-driven secret scanning: Dockerfiles, Helm values, CI-loggar, kod

---

## 14. Nätverk

- **Gateway API** för north-south (extern ingress)
- **NetworkPolicies** för east-west (intern isolering)
- Default deny mellan namespaces
- Separata routes: publik, intern, batch
- Explicit egress-policy från modellservrar
- **En LLM-pod ska inte kunna prata med världen bara för att den tekniskt kan**
- Dedikerad väg för modellnedladdning/sync

### 14.1 Data Plane-trafikmönster

| Källa | Mål | Protokoll | Syfte |
|-------|-----|-----------|-------|
| ai-serving → Qdrant | TCP 6333/6334 | gRPC/REST | RAG retrieval |
| ai-serving → Neo4j | TCP 7687 | Bolt | GraphRAG queries |
| ai-serving → Redis | TCP 6379 | Redis | Cache, rate state |
| ai-batch → Qdrant | TCP 6333 | gRPC | Embedding writes, reindexering |
| ai-batch → MinIO | TCP 9000 | S3 API | Dokument, modellvikter |
| ai-batch → Neo4j | TCP 7687 | Bolt | Entity extraction, graph writes |
| ai-agents → Qdrant | TCP 6333 | gRPC | Memory retrieval |
| ai-agents → Neo4j | TCP 7687 | Bolt | Knowledge graph |
| ai-agents → MinIO | TCP 9000 | S3 API | Artifacts, kod |
| ai-agents → Redis | TCP 6379 | Redis | Working memory |
| app-teams → ai-data | **Blockerat** | — | Team går via Gateway, aldrig direkt |

**Princip:** Konsumerande team har aldrig direkt access till Data Plane. All access sker via Gateway (inference) eller Backstage (self-service RAG). Enbart plattformens egna namespaces har NetworkPolicy-tillåtelse.

---

## 15. Autoscaling — differentierat

| Workload | Skalning | Verktyg |
|----------|----------|---------|
| Serving (sync) | Latency/concurrency | HPA |
| Serving (stream) | TTFT/connections | KEDA + Prometheus |
| Batch | Kö-baserad | Kueue |
| Embeddings | Egen worker-klass | HPA |
| Eval-jobb | Restkapacitet/fönster | Kueue |
| Warm replicas | Alltid igång | Manuell min |
| Scale-to-zero | Bara där cold start OK | KServe/Knative |
| **Qdrant** | Collection count, query latency, RAM | HPA (fas 1 manuell, fas 2 HA) |
| **Neo4j** | Query latency, heap usage | Manuell → Read replicas (fas 3) |
| **Redis** | Memory usage, connections | HPA + Sentinel |
| **MinIO** | Disk usage, request rate | Manuell + alerts |
| **Agent Sandbox** | Pågående sessioner | Session-baserad + scale-to-zero |

---

## 16. Observability — nervsystem

### 16.1 Telemetri per request

| Signal | Källa |
|--------|-------|
| request-id | Gateway |
| tenant-id | Auth |
| model-id | Router |
| promptklass | Classifier |
| token in/out | vLLM metrics |
| latency (TTFT + total) | vLLM + gateway |
| cache-hit/miss | vLLM |
| retrieval-latens | RAG pipeline |
| tool-calls | Agent framework |
| guardrail-beslut | PII/content filter |
| fallback-händelser | Router |
| kostnad/request | LiteLLM |
| **qdrant-query-latency** | Qdrant metrics |
| **qdrant-collection-size** | Qdrant metrics |
| **neo4j-query-time** | Neo4j metrics |
| **neo4j-heap-usage** | Neo4j metrics |
| **minio-request-rate** | MinIO metrics |
| **minio-disk-usage** | MinIO metrics |
| **redis-memory-usage** | Redis metrics |
| **redis-connections** | Redis metrics |
| **agent-session-duration** | Agent Sandbox CRD |
| **agent-memory-utilization** | A-MEM (working/episodic/semantic) |
| **rag-pipeline-latency** | RAG service (retrieval + augmentation) |

### 16.2 Stack
- OpenTelemetry Operator: collectors + auto-instrumentation
- Prometheus + Grafana: metrics och dashboards
- Loki eller Elasticsearch: loggar
- Tempo eller Jaeger: distributed tracing

### 16.3 AI-driven observability
Låt AI analysera spans, felkedjor och regressionsmönster. Föreslå ändringar i autoscaling, promptstrategi och modellval.

### 16.4 Compliance-signaler

Utöver teknisk telemetri (§16.1) behöver observability-stacken mata compliance dashboard (§26.9) med regulatoriskt relevanta signaler:

| Signal | Källa | Regelverk | Tröskel / SLI |
|--------|-------|-----------|---------------|
| **Audit trail completeness** | Gateway + OTel | GDPR, DORA, ISO 27001 | 100% requests med fullständig audit-tagg |
| **PII-detektioner/block** | PII Gateway metrics | GDPR | Rate + per-team breakdown |
| **Policy violation count** | Kyverno Policy Reporter | ISO 27001, NIS2 | 0 kritiska violations i produktion |
| **Dataklass-routing-överträdelser** | LiteLLM routing logs | GDPR, Schrems II | 0 (konfidentiell data → extern modell = incident) |
| **Human oversight actions** | Agent Governance logs | EU AI Act | Antal override/stop per högrisk-system |
| **DBOM freshness** | MLflow + DBOM Store | EU AI Act | Alla modeller i drift har DBOM < 90 dagar |
| **Cert/token-expiry** | Vault + cert-manager | ISO 27001 | Inga utgångna certifikat i produktion |
| **Cross-tenant anomalier** | Anomali-detektor | GDPR, kundavtal | False positive rate + true positive rate |
| **Incident notification SLA** | Incident log timestamps | DORA (4h), GDPR (72h) | 100% inom tidsgräns |

**Integration:** Dessa signaler exponeras via Prometheus metrics med label `compliance_domain` (gdpr, dora, ai_act, etc.) och konsumeras av compliance dashboard (§26.9). Grafana-dashboarden (fas 1) visar tekniska metrics; Backstage-plugin (fas 2) aggregerar till regelverk × kontroll-vy.

---

## 17. GitOps — enda vägen till produktion

- Inga manuella `kubectl apply` i produktion
- Repo är sanningskälla
- Argo CD med sync waves för ordnad installation
- AI får öppna PR:ar, föreslå chart-ändringar, generera rollback-planer
- Merge till produktionsbranch kräver policygrind
- Definierade approvers per namespace/resurstyp

---

## 18. AI som byggare och angripare

### 18.1 Fyra roller per release

| Roll | Ansvar |
|------|--------|
| **Builder** | Genererar implementation |
| **Reviewer** | Hittar designbrister |
| **Attacker** | Prompt injection, secrets leakage, RBAC-glapp, bypass |
| **Optimizer** | Latens, GPU-minne, image size, chart complexity |

### 18.2 Gate
Ingen release passerar utan att alla fyra roller har kört.
Prompt injection, tool abuse och dataexfiltration antas som normalläge.

---

## 19. AI-agenter som plattformsoperatörer (fas 3-4)

| Agent | Rätt | Uppgift |
|-------|------|---------|
| Helm-refactoring | Läsa charts, öppna PR | Föreslå chart-optimeringar |
| Docker hardening | Läsa Dockerfiles, öppna PR | Minska attackyta |
| GPU packer | Läsa metrics, föreslå allocation | Optimera GPU-utnyttjande |
| Eval/regression | Köra eval-jobb | Jämföra modellversioner |
| Security policy | Läsa manifests + audit | Hitta policy-glapp |
| Cost/performance | Läsa metrics + billing | Föreslå trade-offs |
| Incident analyst | Läsa spans + alerts | Root cause analysis |

Alla agenter:
- Avgränsad RBAC
- Agent Governance Toolkit
- Kan föreslå — inte exekvera — destruktiva ändringar
- Audit trail på varje åtgärd

---

## 20. Security Architecture

### 20.1 Princip: Zero Trust för AI

Traditionell zero trust antar att en *människa* initierar en session. Agentic AI bryter det — autonoma agenter kör kedjor av verktygsanrop utan mänsklig identitetsankare.

**Zero trust i Bifrost:**

| Lager | Princip | Implementation |
|-------|---------|----------------|
| **Inference endpoints** | Varje request verifieras, inte bara sessionen | Per-request auth via LiteLLM virtual keys |
| **RAG-pipelines** | Hämtad data scopas till frågarens behörighet | Qdrant metadata-filter per team, inte per modell |
| **Agent workspaces** | Varje agent har egen identitet, inte ärvd | Per-agent service account, minimal RBAC |
| **Tool-anrop** | Varje verktygsanrop passerar least-privilege-check | Agent Governance Toolkit allowlists |
| **Sub-agenter** | Spawning av sub-agenter kräver explicit tillåtelse | Session-baserad policy |
| **Nätverk** | Default deny mellan alla namespaces | NetworkPolicies (§14) |
| **Data** | Klassificering styr routing | Dataklass-detektor (§12.4) |

### 20.2 Threat Model

**Angripare:**

| Angripare | Motivation | Kapacitet |
|-----------|-----------|-----------|
| **Extern angripare** | Data, IP, disruption | Prompt injection, API-probing, phishing |
| **Insider (oavsiktlig)** | Misstag | Skickar konfidentiell data till extern modell |
| **Insider (avsiktlig)** | Data, sabotage | Missbrukar API-nyckel, exfiltrerar via prompts |
| **Komprometterad agent** | Eskalering | Tool misuse, memory poisoning, lateral movement |
| **Supply chain** | Bakdörr | Poisoned modellvikter, skadligt RAG-innehåll |

**Attackvektorer (MITRE ATLAS + OWASP):**

| Vektor | Beskrivning | Mitigation i Bifrost |
|--------|-------------|---------------------|
| **Direkt prompt injection** | Manipulera LLM via input | Guardrails i gateway, input sanitization |
| **Indirekt prompt injection** | Skadligt innehåll i RAG-corpus/verktygsoutput | RAG corpus-validering, output-scanning |
| **Modell-extraktion** | Systematisk API-probing för att klona modell | Rate limiting, honeypot-prompts, anomali-detektion |
| **Träningsdata-extraktion** | Tvinga modell att återge memoriserade sekvenser | Output-filter, membership inference-skydd |
| **RAG knowledge base poisoning** | Injicera skadligt innehåll i vektordatabas | Åtkomstkontroll vid ingestion, integritetskontroll |
| **Agent memory poisoning** | Korrumpera agentminne för att styra framtida beteende | Memory integrity checks (Agent Governance) |
| **Model supply chain** | Bakdörrar i nedladdade modellvikter | Säkerhetsscan vid import (§9.3), signerade vikter |
| **GPU side-channel** | Informationsläckage via delad GPU | Isolerade GPU:er per tenant (DRA), överväg TEE |
| **Tool/MCP-missbruk** | Agent anropar verktyg utanför sin behörighet | Per-tool allowlist, parameter-validering |

### 20.3 Säkerhetslager — samlad bild

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  PERIMETER                                            │    │
│  │  Gateway API · TLS · Auth · Rate limiting · WAF       │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  AI FIREWALL                                          │    │
│  │  PII Gateway · Dataklass-detektor · Guardrails        │    │
│  │  Input sanitization · Output scanning                 │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  INFRASTRUCTURE                                       │    │
│  │  NetworkPolicies · Pod Security · RBAC · Secrets      │    │
│  │  Image signering · Admission policies                 │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  AGENT GOVERNANCE                                     │    │
│  │  Identity per agent · Tool allowlists · Kill switch   │    │
│  │  Memory integrity · Behavioral monitoring             │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  SUPPLY CHAIN                                         │    │
│  │  SBOM · DBOM · Sigstore · Model scan · RAG-validering │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  DETECTION & RESPONSE                                 │    │
│  │  SOC-integration · Honeypots · Anomali-detektion      │    │
│  │  Incident response · Post-mortem                      │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 20.4 SOC/SIEM-integration

**Problem:** Bifrost genererar säkerhetshändelser som måste in i bolagets befintliga SOC. Utan integration är plattformen en blind fläck.

**Events som skickas till SIEM:**

| Event | Allvarlighet | Källa |
|-------|-------------|-------|
| Prompt injection-försök detekterat | Hög | AI Firewall |
| PII i request/response | Hög | PII Gateway |
| Anomalt högt API-anrop (potentiell extraktion) | Medel | LiteLLM + anomali-detektor |
| Agent policy-violation (blockerad tool-anrop) | Medel | Agent Governance |
| Misslyckad auth (brute force) | Hög | Gateway |
| Honeypot-prompt triggad | Kritisk | Inference API |
| Okänd modell i registry (supply chain) | Hög | MLflow + admission |
| Agent breakout-försök (NetworkPolicy deny) | Kritisk | K8s audit log |

**Transport:** OpenTelemetry → bolagets SIEM (Splunk/Sentinel/Elastic). Standardformat, ingen custom-integration.

**SOAR-playbooks:** Automatiserade svar — rate limiting, session-avslut, nyckelrevokering — triggade av SIEM-regler.

### 20.5 Penetration Testing

Två separata scope:

| Scope | Vad | Frekvens |
|-------|-----|----------|
| **AI/modell red-team** | Prompt injection, jailbreak, PII-läckage, hallucination | Varje modelluppdatering (§18) |
| **Infrastruktur-pentest** | K8s, API:er, NetworkPolicies, RBAC, secrets, lateral movement | Kvartalsvis (externt team) |

**AI-specifik pentest-checklista:**
- Indirekt prompt injection via RAG-corpus
- MCP/tool-anrop: parameter injection, authorization bypass
- RAG corpus-åtkomstkontroll (kan Team A:s prompt hämta Team B:s data?)
- Model API extraction resistance
- Agent memory persistence-attacker
- Plugin/tool supply chain-verifiering

**Verktyg:** NVIDIA Garak (open source, 100+ attack-kategorier) för automatiserad scanning. Manuell pentest 3-5 dagar per kvartal.

### 20.6 Säkerhetsramverk och hotmodeller

Denna sektion täcker *säkerhetsramverk* — standards och modeller för att identifiera och bemöta hot. Regulatoriska krav (GDPR, DORA, NIS2, EU AI Act etc.) och compliance-profiler finns i §26.

| Ramverk | Typ | Användning i Bifrost |
|---------|-----|---------------------|
| **NIST AI RMF 1.0** | Governance | Struktur: Govern, Map, Measure, Manage |
| **MITRE ATLAS v5.1** | Threat intelligence | TTPs för AI-angripare, threat model-input (§20.2) |
| **OWASP LLM Top 10 2025** | Applikationssäkerhet | Risker i LLM-applikationer, pentest-checklista (§20.5) |
| **OWASP Agentic Top 10** | Agentsäkerhet | Agent-specifika risker, styr Agent Governance (§12.5) |
| **Microsoft Zero Trust for AI** | Arkitektur | Agent-identitet, MCP/A2A-protokoll, zero trust-modell (§20.1) |
| **STRIDE** | Hotmodellering | Per-feature threat modeling i secure SDLC (§20.11) |

**Mapping:** Varje säkerhetskontroll i §20 ska kunna mappas till minst ett ramverk. Varje regulatorisk kontroll i §26 mappas till regelverk. Compliance dashboard (§26.9) visualiserar båda.

**Avgränsning mot §26:** §20.6 täcker *säkerhetsramverk* (hur vi identifierar och bemöter hot). §26.2 täcker *regulatoriska krav* (vad lagen kräver). Ramverken i §20.6 *implementerar* kraven i §26.2. Mappningen är: NIST AI RMF → EU AI Act governance, MITRE ATLAS → DORA threat testing, OWASP → generell applikationssäkerhet, STRIDE → secure SDLC. Undvik dubblering — om en kontroll är regulatorisk, hör den hemma i §26.

### 20.7 Honeypots

Proaktiv detektion — inte bara reaktiv:

- **Honeypot-prompts** inbäddade i inference API:er. Crafted decoy-queries som triggar alert om de träffas — indikerar probing eller extraktion.
- **Canary-dokument** i RAG-corpus. Falska dokument som aldrig ska dyka upp i svar. Om de gör det → corpus-manipulation detekterad.
- **Canary-tokens** i agent workspaces. Falska credentials som triggar alert vid användning.

### 20.8 Identity Lifecycle & Key Management

**Problem:** Agenter är inte människor — de skapas, klonas, pausas och dör. Traditionell IAM (skapa konto → tilldela roll → offboarda) passar inte. En agent kan spawna sub-agenter, som var och en behöver egen identitet.

#### Agent-identitetsmodell

| Fas | Händelse | Identitetsåtgärd |
|-----|----------|------------------|
| **Spawn** | Agent skapas via CRD | Service account + kortlivad token (15 min TTL) |
| **Drift** | Agent kör uppgift | Token förnyas automatiskt via projected volume |
| **Sub-spawn** | Agent startar sub-agent | Ny SA med *reducerad* RBAC (aldrig ärvd, alltid smalare) |
| **Pause** | Agent idle > threshold | Token revokeras, SA behålls |
| **Resume** | Agent väcks | Ny token utfärdas, SA återanvänds |
| **Kill** | Agent termineras | SA raderas, alla tokens revokeras, audit-entry |

**Princip: Identitet dör med agenten.** Ingen återanvändning av service accounts mellan körningar. Varje run = ny identitet. Det kostar lite overhead men eliminerar credential-reuse-attacker.

#### Nyckelhantering

| Nyckeltyp | Lagring | Rotation | Ansvarig |
|-----------|---------|----------|----------|
| **API-nycklar (LiteLLM virtual keys)** | External secrets (Vault/AWS SM) | 90 dagar, automatisk | Platform team |
| **TLS-certifikat (intern)** | cert-manager + Let's Encrypt / intern CA | 30 dagar, automatisk | cert-manager |
| **Agent-tokens** | Projected service account tokens | 15 min TTL | Kubernetes |
| **Krypteringsnycklar (data at rest)** | KMS (cloud) / Vault (on-prem) | 365 dagar | Security team |
| **Sigstore-nycklar (supply chain)** | Keyless (OIDC-baserat) | Per-signering | CI/CD |

**Revokering vid incident:** SOAR-playbook (§20.4) triggar automatisk revokering av alla nycklar i påverkat namespace. Manuell bekräftelse krävs för cluster-wide revokering.

### 20.9 Encryption

| Lager | Skydd | Implementation |
|-------|-------|----------------|
| **In transit** | All trafik krypterad | mTLS mellan alla tjänster (service mesh / cert-manager) |
| **At rest — disk** | Volymkryptering | LUKS (on-prem) / cloud-native encryption (EBS/PD) |
| **At rest — databas** | Fältnivå för känslig data | Qdrant: encrypted collections, Neo4j: TDE, Redis: TLS + no-persist för känslig cache |
| **At rest — objekt** | Objektkryptering | MinIO: SSE-S3 med extern KMS |
| **In use** | Minne under bearbetning | Överväg confidential computing (SEV-SNP / TDX) för högrisk-modeller i fas 3-4 |

**PII-kryptering:** Data klassificerad som Konfidentiell (§12.4) krypteras med tenant-specifik nyckel. Radering av nyckeln = kryptografisk radering av data (crypto-shredding).

### 20.10 Vulnerability Management

**Princip:** En plattform som inte patchar sig själv är en tidsinställd bomb. AI-plattformar har *fler* ytor än traditionella — modellvikter, RAG-corpus, agent-beteende.

#### Skanningspipeline

```
Container images ──→ Trivy (CI/CD + admission) ──→ Block critical/high
K8s manifests ─────→ Checkov / Kyverno ──────────→ Policy violation = block
Modellvikter ──────→ ModelScan (§9.3) ────────────→ Quarantine om flaggad
Dependencies ──────→ Dependabot / Renovate ───────→ Auto-PR, manuell merge
RAG-corpus ────────→ Integrity check (hash) ──────→ Alert vid oväntad ändring
```

#### Patchcykel

| Allvarlighet | SLA (patch applicerad) | Process |
|-------------|----------------------|---------|
| **Kritisk (CVSS ≥ 9)** | 24 timmar | Omedelbar: emergency change, sedan post-mortem |
| **Hög (CVSS 7-8.9)** | 7 dagar | Nästa sprint, prioriterat |
| **Medel (CVSS 4-6.9)** | 30 dagar | Normal backlog |
| **Låg (CVSS < 4)** | 90 dagar | Batchas med nästa uppgradering |

**AI-specifikt:** Modellsårbarheter (t.ex. nya jailbreak-tekniker) har ingen CVSS-poäng. Dessa hanteras via red-team-körningar (§18) — om en ny attack lyckas, eskaleras den som "hög" oavsett.

### 20.11 Secure Development Lifecycle

Bifrost-plattformen själv är en attackyta. Koden som bygger plattformen måste följa samma disciplin som koden den kör.

| Fas | Aktivitet | Verktyg/process |
|-----|-----------|----------------|
| **Design** | Threat modeling för nya features | STRIDE per element |
| **Code** | Pre-commit hooks: secrets scan, lint | gitleaks, ESLint security rules |
| **PR** | Obligatorisk review + SAST | CodeQL / Semgrep |
| **Build** | SBOM-generering, image-signering | Syft, Cosign (Sigstore) |
| **Deploy** | Admission policy: signerad image + scan clean | Kyverno / OPA Gatekeeper |
| **Runtime** | Behavioral monitoring, anomali-detektion | Falco + custom rules för AI-events |

**Princip:** Ingen kod når klustret utan att ha passerats av minst: secrets scan, SAST, image scan, admission policy. Fyra lager — inte för att ett räcker, utan för att inget enskilt lager är tillförlitligt.

### 20.12 Pre-Production Security Review

**Problem:** §20.11 beskriver secure SDLC för *plattformskoden*. Men plattformen *själv* behöver också godkännas innan den levererar till användare. En CISO signerar inte av "vi har bra processer" — hen vill se bevis att processerna *fungerade* på det som nu ska gå live.

#### Security Review Gate — per fas

| Fas | Gate-krav | Vem godkänner | Bevis |
|-----|----------|---------------|-------|
| **Fas 1 → pilot** | Threat model v1 klar, default deny veriferat, audit logging aktivt, secrets i vault, pentest av gateway + auth | Security/Compliance + CISO (sign-off) | Pentest-rapport, Kyverno audit, threat model-dokument |
| **Fas 2 → multi-tenant** | PII Gateway testad, dataklass-routing verifierad, SOC-integration live, infra-pentest utan kritiska fynd, compliance-profiler enforced | Security/Compliance + CISO | Pentest-rapport, SOC-bekräftelse, compliance dashboard |
| **Fas 3 → agents + bred lansering** | AI-specifik pentest klar, cross-tenant isolering verifierad, agent sandbox-säkerhet granskad, honeypots aktiva | Security/Compliance + CISO + extern auditor (rekommenderat) | AI pentest-rapport, cross-tenant test, ORR |

#### Process

```
Bygg → Intern test → Security review → Åtgärda fynd → Re-review → CISO sign-off → Release
```

**Regel:** Ingen fas-övergång utan CISO sign-off. Sign-off dokumenteras i compliance dashboard (§26.9) med datum, granskare och eventuella undantag.

**Undantag:** Om kritiska fynd inte kan åtgärdas innan deadline, kan CISO ge villkorad sign-off med: dokumenterat undantag + åtgärdsplan + deadline + extra monitoring.

#### Ägarskap — RACI per gate-aktivitet

| Aktivitet | R (utför) | A (ansvarar) | C (konsulteras) | I (informeras) |
|-----------|-----------|-------------|-----------------|----------------|
| Förbereda gate-material (bevis, rapporter) | Platform Engineer | Tjänsteägare | Security/Compliance | — |
| Beställa/koordinera pentest | Security/Compliance | Tjänsteägare | Platform Engineer | CISO |
| Genomföra security review | Security/Compliance | CISO | Platform Engineer, ML Engineer | Tjänsteägare |
| Åtgärda fynd | Platform Engineer | Tjänsteägare | Security/Compliance | — |
| Sign-off (godkänna/villkora/avslå) | CISO | CISO | Security/Compliance | Tjänsteägare, Executive Sponsor |
| Dokumentera i compliance dashboard | Security/Compliance | Tjänsteägare | — | CISO |

**Princip:** Tjänsteägaren *äger* att gaten genomförs (Accountable). Security/Compliance *utför* granskningen (Responsible). CISO *beslutar* (sign-off). Utan tydlig ägare dör gates — de blir "någon annans ansvar" och skjuts framåt.

---

## 21. Buy vs Build

**Frågan varje CTO ställer:** Varför bygga eget istället för Azure AI Studio, AWS Bedrock eller Google Vertex?

**Kort svar:** Managed-tjänster är en *provider* i gatewayen — inte en ersättning för plattformen. Bifrost är hybrid by design.

| Dimension | Managed (Azure/AWS/GCP) | Bifrost (hybrid) |
|-----------|------------------------|-------------------|
| Data residency | Leverantörens moln | On-prem + EU + extern fallback |
| Vendor lock-in | Hög | Ingen (byt provider utan kodändring) |
| Lokala modeller | Nej | Ja (vLLM, self-hosted) |
| Agent workspace | Begränsat | Full sandbox, memory, tools |
| RAG-anpassning | Standardrecept | GraphRAG, HippoRAG, custom |
| Compliance-kontroll | Leverantörens villkor | Full kontroll |
| Kostnad vid volym | Skalande per-token | GPU break-even ~10-14 mån |

**Detaljerad analys med kostnader:** Se [rollout-plan-30-60-90.md](rollout-plan-30-60-90.md#varför-inte-bara-azure-ai-studio--aws-bedrock--google-vertex)

**När managed-only räcker:** < 50 AI-användare, ingen konfidentiell data, ingen lokal inferens behövs, redan all-in på en molnleverantör utan restriktioner.

### 21.1 Third-party dependency risk

**Problem:** Bifrost bygger på open source-komponenter. Varje komponent har sin egen licens, underhållssituation och riskprofil. Tre förtjänar explicit riskbedömning:

#### Qdrant (Vector Database) — RISK: LÅG-MEDEL

| Faktor | Bedömning |
|--------|-----------|
| **Licens** | Apache 2.0. Ingen förändring 2025-2026. Permissiv, ingen copyleft-risk |
| **Finansiering** | VC-backed (Series A, $28M, Unusual Ventures + Spark Capital). Inte lönsamt ännu |
| **Enterprise-adoption** | Växande. Disney, Deloitte. Managed cloud finns |
| **Huvudrisk** | VC-finansiering → relicensiering möjlig (Elastic/Redis-mönstret). Rust-kodbasen gör det dock svårare — ingen "Commercial source" att skydda |
| **Alternativ** | Weaviate (Apache 2.0, större community), pgvector (om redan på PostgreSQL — noll ny infra) |
| **Mitigering** | Abstrahera bakom interface (redan designat i §5). Pinna version. Evaluera pgvector för enklare use cases |

#### Neo4j (Graph Database) — RISK: HÖG

| Faktor | Bedömning |
|--------|-----------|
| **Licens** | **Community: GPL v3 + Commons Clause-modifikation** (begränsar kommersiell användning). **Enterprise: kommersiell licens** (ej öppen källa sedan v3.5). AGPL med tillägg har dömts i domstol — PureThink fick $597K i skadestånd 2024 för att ha tagit bort Commons Clause. Rättstvisten pågår i överklagande |
| **Finansiering** | Välfinansierat ($600M+ totalt). Stabil bolagsstruktur |
| **Enterprise-adoption** | Mogen (10+ år). NASA, UBS, Walmart |
| **Huvudrisk** | **Licenslåsning.** GPL/AGPL + Commons Clause gör Community Edition riskabel i kommersiell kontext. Cypher-frågespråk är proprietärt (GQL-standard under utveckling). Enterprise-licens = kostnad + leverantörsberoende |
| **Alternativ** | Apache AGE (PostgreSQL-extension, Apache 2.0), FalkorDB (Redis-baserad, permissiv), Kuzu (embedded, MIT — lovande för GraphRAG) |
| **Mitigering** | Använd Bolt-protokoll + tunn query-adapter. Undvik djupa Cypher-beroenden. Utvärdera om grafbehoven motiverar dedikerad DB eller om PostgreSQL + rekursiva CTEs räcker |

#### LiteLLM (LLM Gateway) — RISK: HÖG

| Faktor | Bedömning |
|--------|-----------|
| **Licens** | MIT. Permissiv, ingen licensrisk |
| **Finansiering** | VC-backed (BerriAI, liten runda). Startup, inte foundation |
| **Enterprise-adoption** | Bred användning men mestadels startups/mid-size. Få Fortune 500-case studies |
| **Huvudrisk** | **Supply chain-attack mars 2026.** Komprometterade PyPI-versioner (1.82.7, 1.82.8) installerades av 40 000+ användare. Malware stal SSL/SSH-nycklar, cloud credentials, K8s-konfigurationer, API-nycklar. Angripare (TeamPCP) komprometterade LiteLLMs CI/CD via en trojaniserad Trivy GitHub Action. Dessutom: 800+ öppna issues, PostgreSQL-loggning degraderar vid 1M+ poster, OOM-problem i K8s rapporterade sept 2025 |
| **Alternativ** | Portkey (kommersiell, mer enterprise-redo), Kong AI Gateway (enterprise-grade, API-fokus), Cloudflare AI Gateway (managed edge), egenbyggd tunn adapter (~500 rader för 2-3 providers) |
| **Mitigering** | **Omedelbart:** Pinna versioner, verifiera signaturer, blockera automatiska PyPI-uppdateringar. **Långsiktigt:** Utvärdera Portkey eller Kong som alternativ. Designen i §6 abstraherar redan bakom OpenAI-kompatibelt API — providerbyte kräver inte SDK-ändring |

#### Sammanfattande riskmatris

| Komponent | Risknivå | Primär risk | Exit-kostnad |
|-----------|----------|------------|-------------|
| **Qdrant** | 🟡 Låg-medel | VC-relicensiering | Låg (interface abstraherat) |
| **Neo4j** | 🔴 Hög | Licens-låsning + proprietärt frågespråk | Medel (Cypher-beroende) |
| **LiteLLM** | 🔴 Hög | Supply chain-attack 2026 + bus factor | Låg (OpenAI-API-kompatibelt) |

**Princip:** Varje OSS-komponent i §21.1 ska ha en namngiven alternativkandidat och en dokumenterad exit-plan. Abstract → interface → swap. Leverantörslåsning är acceptabel bara om exit-kostnaden är kvantifierad.

**Rekommendation:** Neo4j och LiteLLM kräver aktiv bevakning. Neo4j: planera för Apache AGE-migration om rättsläget försämras. LiteLLM: utvärdera Portkey under fas 2. Supply chain-incidenten gör det svårt att motivera LiteLLM utan strikta pinning- och signaturkontroller.

---

## 22. Business Case

### Varför investera?

**Utan plattform:** Varje team bygger eget → duplicerat arbete, ingen governance, ingen kostnadsöversikt, compliance-risk.

**Med plattform:** Centraliserad infrastruktur → team fokuserar på domänvärde, inte GPU:er.

### ROI-modell

| Faktor | Utan Bifrost | Med Bifrost |
|--------|-------------|-------------|
| Time to first AI-app | 2-4 månader per team | 1-2 veckor (self-service) |
| Infra-kostnad per team | Duplicerad (egna GPU:er, egna DBs) | Delad (multi-tenant) |
| Compliance-arbete | Per team, ad hoc | Centralt, automatiserat |
| Säkerhetsincident-risk | Hög (ingen governance) | Lägre (PII gateway, agent governance) |
| Modell-kvalitet | Ingen eval-pipeline | Standardiserad eval + red-team |
| Kostnadsöversikt | Ingen | Per-team, per-modell, per-request |

### Break-even-estimat

- **Plattformskostnad fas 1-2:** ~500-800K SEK/månad (personal + infra)
- **Alternativkostnad utan plattform:** Om 10 team spenderar 0.5 FTE vardera på AI-infra = 5 FTE × 65K = 325K SEK/månad + duplicerad GPU-kostnad
- **Break-even:** ~3-5 team som aktivt använder plattformen
- **Vid 10+ team:** Plattformen sparar mer än den kostar

### Icke-monetära värden

- **Compliance:** AI Act deadline 2 augusti 2026 — centralt register vs 30 ad hoc-system
- **Säkerhet:** En attackyta istället för 10-30
- **Hastighet:** Organisationen accelererar AI-adoption
- **Kontroll:** Tjänsteägare har översikt och kan styra

### 22.1 FinOps Governance

**Problem:** GPU-kostnad är 2026 inte bara en mätpunkt — det är en *designrestriktion*. En H100 kostar ~$3/timme. 16 GPU:er dygnet runt = ~$35 000/månad. Utan beslutstruktur skalas kostnaden okontrollerat.

§22 ovan visar *vad det kostar*. Denna sektion beskriver *vem som bestämmer vad vi får spendera*.

#### Beslutshierarki

| Beslut | Gräns | Beslutsfattare | Process |
|--------|-------|----------------|---------|
| **Ny API-nyckel / team onboarding** | Inom befintlig budget | Platform team | Self-service via Backstage |
| **Höjd kvot per team** | < 10% av teamets budget | Platform team | Ticket, godkänns samma dag |
| **Ny modell i katalogen** | Inom befintlig GPU-kapacitet | Platform team + ML Engineer | Eval-pipeline (§9) → godkännande |
| **GPU-skalning (t.ex. 8 → 12)** | < 50K SEK/månad ökning | Tjänsteägare (Marcus) | Business case: vilka team, vilken last, ROI |
| **Stor GPU-investering (t.ex. 12 → 24)** | > 50K SEK/månad ökning | Executive sponsor + Tjänsteägare | Budget-godkännande, kapacitetsplan, lead time |
| **On-prem GPU-inköp** | Investeringsbeslut (CAPEX) | CIO/CTO + Executive sponsor | Investeringsunderlag, break-even vs cloud |
| **Ny extern API-provider** | Juridisk + kostnad | Tjänsteägare + juridik | Avtalsgranskning, dataresidency-bedömning |

#### Kostnadsanomali-detektion

| Signal | Tröskel | Åtgärd |
|--------|---------|--------|
| Teamets dagskostnad > 3× genomsnitt | Automatisk alert | Notifiering till teamets champion + platform team |
| GPU utilization < 30% i 7 dagar | Veckorapport | Föreslå nerdskalning eller MIG-partitionering |
| Extern API-kostnad > 50% av total | Månadsrapport | Utvärdera om fler workloads kan köras lokalt |
| Totalkostnad > 90% av månadsbudget | Automatisk alert | Eskalering till Tjänsteägare |

#### Chargeback-modell (fas 2+)

| Fas | Modell | Detalj |
|-----|--------|--------|
| **Fas 1** | Showback | Platform team bär all kostnad. Team *ser* sin förbrukning, men debiteras inte. |
| **Fas 2** | Soft chargeback | Kostnad allokeras per team i rapportering. Avdelning informeras. Inget internt faktureringsflöde. |
| **Fas 3+** | Full chargeback | Kostnad debiteras teamets kostnadsställe. Kräver integration med ekonomisystem. |

**Princip:** Kostnad som designrestriktion, inte efterhandsinformation. Varje arkitekturbeslut (ny modell, ny pipeline, ny agent-typ) ska inkludera en kostnadsbedömning *innan* det går live. GPU-tid är kapitalallokering — inte gratis infrastruktur.

### 22.2 "Göra ingenting"-scenario

**Varför denna sektion finns:** Varje investeringsbeslut behöver jämföras mot alternativet att inte investera. §22 ovan visar ROI — men vad händer *konkret* om vi väljer att inte bygga Bifrost?

#### Status quo: 0-6 månader utan plattform

| Område | Vad som händer | Konsekvens |
|--------|---------------|------------|
| **Team-AI** | Varje team köper egna API-nycklar (OpenAI, Azure) | Ingen kostnadsöversikt, ingen governance. Uppskattad spridning: 5-15 team inom 6 månader |
| **Data** | Känslig data skickas till externa API:er utan PII-kontroll | GDPR-risk. Ingen vet vilken data som lämnat organisationen |
| **Modeller** | Team väljer modell efter vad de hört talas om | Ingen eval, ingen red-teaming, ingen kvalitetssäkring |
| **Kostnad** | Varje team betalar separat → ingen volymrabatt, ingen budget-kontroll | Uppskattad totalkostnad 2-3× högre än centraliserad plattform |
| **Säkerhet** | Ingen gemensam threat model, ingen pentest-pipeline | Attackytan växer okontrollerat med varje nytt team |

#### Kritisk tidslinje: 6-12 månader utan plattform

| Händelse | Tidpunkt | Konsekvens av inaction |
|----------|----------|----------------------|
| **EU AI Act full enforcement** | Augusti 2026 | Utan centralt riskregister: potentiell sanktion upp till 7% global omsättning. Varje team med högrisk-AI behöver eget compliance-system |
| **10+ team med egna AI-lösningar** | ~Q4 2026 | Konsolidering blir progressivt svårare. Varje team har byggt egna integrationer, egna datapipelines, egna vanor |
| **Första incidenten** | Oförutsägbart | Utan centralt SOC/SIEM: ingen detektion, ingen playbook, ingen audit trail. Incident response = ad hoc |
| **Extern audit (ISO 27001)** | Löpande | "Hur kontrollerar ni AI-användningen?" → Inget svar. Risk: avvikelse i befintlig certifiering |

#### Kostnaden av "göra ingenting"

| Kostnadstyp | Uppskattning (12 mån) | Kommentar |
|-------------|----------------------|-----------|
| Duplicerad GPU/API-kostnad | 600K-1.5M SEK | 10 team × egna resurser vs delad plattform |
| Förlorad produktivitet | 3-5 FTE | Team bygger infra istället för domänvärde |
| Compliance-arbete (ad hoc) | 200-500K SEK | Varje team hanterar AI Act separat |
| Incidentkostnad (förväntat värde) | Svåruppskattad | En GDPR-incident kan kosta mångfalt mer |
| **Total estimerad merkostnad** | **1-3M SEK/år** | Utöver vad Bifrost kostar att bygga |

**Slutsats:** "Göra ingenting" är inte gratis — det är det dyraste alternativet. Skillnaden är att kostnaden är utspridd, osynlig och svår att spåra. Bifrost centraliserar kostnaden och gör den synlig.

### 22.3 Organisatorisk beslutshierarki

**Problem:** §22.1 täcker FinOps-beslut (GPU, budgetar). Men en AI-plattform kräver beslut i fler dimensioner: modeller, policy, agenter, compliance-profiler, onboarding. Utan tydlig ägare fastnar beslut i konsensus-loopar eller tas ad hoc.

| Beslutskategori | Beslut | Beslutsfattare | Rådgivare | Process |
|-----------------|--------|----------------|-----------|---------|
| **Modeller** | Lägg till ny modell i katalogen | Platform team + ML Engineer | Security (red-team), FinOps | Eval-pipeline (§9) + kostnadsbedömning → godkännande |
| **Modeller** | Ta bort / sunset modell | Tjänsteägare | Berörda team (30 dagars varsel) | Deprecation notice → migrationsguide → removal |
| **Policy** | Ny Kyverno-policy (blockerar deploy) | Platform team | Security, berörda team | PR-review + test i staging + 7 dagars audit mode |
| **Policy** | Policy-undantag för specifikt team | Tjänsteägare + Security | Compliance | Tidsbegränsat undantag med audit trail |
| **Agenter** | Ny agent-typ i plattformen | Platform team + Tjänsteägare | Security (sandbox-review) | Governance-checklista (§12.5) + pentest om extern-access |
| **Compliance** | Ny compliance-profil | Tjänsteägare + juridik | Security, berörd kund | Regelverk-mappning → Kyverno-policy → funktionstestning |
| **Onboarding** | Nytt team onboarding | Platform team | Champion Network (§24.5) | Self-service via Backstage (inom befintlig profil) |
| **Data** | Ny datakälla till RAG-plattformen | Teamet själva | Platform team (kapacitet) | Self-service (§5.9) inom teamets budget |
| **Infrastruktur** | GPU-skalning, ny provider | Se §22.1 | — | Se §22.1 |
| **Eskalering** | Konflikt mellan team/roller | Tjänsteägare | Executive sponsor | Möte inom 48h, dokumenterat beslut |

**Princip:** Varje beslut har *en* beslutsfattare — inte en kommitté. Rådgivare ger input, men blockar inte. Tjänsteägare (Marcus) är eskaleringsinstans för allt som inte löses på nivån under.

---

## 23. Operations & SRE

### 23.1 Vem vaknar klockan 3?

**Princip:** En plattform utan on-call är en plattform utan SLA.

#### On-call-rotation

| Skikt | Ansvar | Eskalering |
|-------|--------|------------|
| **L1: Plattform on-call** | K8s, GPU, nätverk, Data Plane health | Automatiska alerts → PagerDuty/Opsgenie |
| **L2: ML/Inference** | vLLM, KServe, modell-drift, gateway | Eskalering från L1 om modellrelaterat |
| **L3: Security** | PII-läckage, agent breakout, intrusion | Eskalering vid säkerhetsincident |

Start: L1 räcker i fas 1 (2-3 platform engineers roterar). L2 och L3 tillkommer i fas 2-3.

#### Runbook-krav

Varje komponent i plattformen ska ha en runbook med:
- **Symptom:** Vad ser du? (alert, dashboard, logg)
- **Diagnos:** Hur bekräftar du? (3-5 kommandon)
- **Åtgärd:** Steg-för-steg fix
- **Rollback:** Hur återställer du?
- **Eskalering:** När och till vem?

Prioriterade runbooks (fas 1):
1. vLLM svarar inte / OOM
2. GPU-nod tappad
3. LiteLLM gateway down
4. Qdrant disk full / query timeout
5. Redis OOM
6. Extern API-provider nere (fallback)

#### Kapacitetsplanering

| Resurs | Mätning | Tröskel → Åtgärd |
|--------|---------|-------------------|
| GPU VRAM | Prometheus | > 85% → skala eller flytta modell |
| Qdrant RAM | Qdrant metrics | > 80% → skala noder |
| MinIO disk | MinIO metrics | > 70% → utöka / retention cleanup |
| Redis minne | Redis INFO | > 75% → eviction policy / skala |
| K8s noder | Node metrics | > 80% CPU → autoscaler / nya noder |

**GPU lead time:** Beställ GPU:er 4-8 veckor innan behov. Cloud burst som bridge.

### 23.2 Incident Response

#### Incidentklasser

| Klass | Beskrivning | SLA (response) | Exempel |
|-------|-------------|----------------|---------|
| **SEV1** | Plattformen nere, inget team kan använda AI | 15 min | Gateway down, alla GPU:er nere |
| **SEV2** | Degraderad, delar påverkade | 1 timme | En modell nere, batch-kö full |
| **SEV3** | Enskilt team påverkat | 4 timmar | Teamets RAG-pipeline trasig |
| **SEV4** | Kosmetiskt / icke-brådskande | Nästa arbetsdag | Dashboard visar fel data |

#### AI-specifika incidenter

| Incident | Åtgärd |
|----------|--------|
| **PII-läckage** | Stoppa gateway → identifiera scope → notifiera DPO → audit → fix → post-mortem |
| **Prompt leak** | Isolera modell → analysera loggar → rotera nycklar → patch |
| **Hallucination i högrisk** | Human oversight eskalering → stoppa automatiskt svar → manuell review |
| **Agent breakout** | Kill switch → NetworkPolicy block → forensisk analys → patch sandbox |
| **Modell-drift** | Alert → eval-jobb → canary rollback om degradering bekräftas |
| **GPU-brand/termisk** | Automatisk eviction → omplacera workloads → hardware-ticket |

#### Post-mortem

Varje SEV1/SEV2 kräver post-mortem inom 48 timmar:
- Timeline
- Root cause (5 varför)
- Action items med ägare och deadline
- Vad systemet lärde sig (→ runbook-uppdatering)

#### Incident Notification SLA

Utöver *responstid* (hur snabbt teamet agerar) behövs *notifieringstid* (hur snabbt intressenter informeras). DORA kräver rapportering av allvarliga ICT-incidenter inom 4 timmar till tillsynsmyndighet, och slutrapport inom 1 månad.

| Mottagare | SEV1 | SEV2 | SEV3+ |
|-----------|------|------|-------|
| **On-call team** | Omedelbart (PagerDuty) | Omedelbart | Nästa arbetsdag |
| **CISO / Security** | < 30 min | < 2 timmar | Veckorapport |
| **Tjänsteägare** | < 30 min | < 2 timmar | Veckorapport |
| **Berörda team** | < 1 timme (statusuppdatering) | < 4 timmar | Vid behov |
| **Tillsynsmyndighet (DORA)** | < 4 timmar (initial notifiering) | < 24 timmar (om ICT-incident) | Ej tillämpligt |
| **Berörd kund (GDPR)** | < 72 timmar (om persondata) | < 72 timmar (om persondata) | Ej tillämpligt |
| **Executive sponsor** | < 1 timme | Daglig sammanfattning | Ej tillämpligt |

#### Statussida — `status.bifrost.internal`

**Syfte:** En enda URL där alla konsumerande team kan se plattformens hälsa i realtid. Inte en teknisk dashboard (det är Grafana) — utan en användarriktad statusvy.

**Verktyg:** Atlassian Statuspage (hosted) eller Cachet/Upptime Kuma (self-hosted). Val i fas 1.

**Komponenter som visas:**

| Komponent | Källa | Granularitet |
|-----------|-------|-------------|
| **LLM Gateway** | LiteLLM health endpoint | Operational / Degraded / Down |
| **Lokala modeller** | Per modell-familj (Llama, Mistral, etc.) | Per modell |
| **Externa providers** | Per provider (OpenAI, Anthropic, Bedrock) | Per provider |
| **RAG-pipeline** | Qdrant + embedding-service health | Operational / Degraded |
| **Agent Sandbox** | CRD controller health + spawn-success-rate | Operational / Degraded |
| **AI Hub Portal** | Backstage health endpoint | Operational / Down |
| **Data Plane** | Qdrant, Neo4j, MinIO, Redis individuellt | Per tjänst |

**Automatisk uppdatering:**

```
Prometheus alert → PagerDuty incident → Statuspage API → status uppdateras
     (§16)            (§23.1)              (webhook)       (< 2 min)
```

- SEV1/SEV2: Statuspage uppdateras automatiskt via PagerDuty-webhook
- SEV3+: Manuell uppdatering av on-call
- Planerat underhåll: Schemalagt via Statuspage med 48h varsel

**Prenumeration:**
- RSS/Atom-feed
- E-post-prenumeration (per komponent)
- Webhook → Slack/Teams-kanal
- SDK: `client.status()` returnerar komponentstatus (polling-baserat)

**Fasning:**

| Fas | Kapabilitet |
|-----|------------|
| **Fas 1** | Grundläggande statussida med gateway + inference. Manuell + PagerDuty-webhook |
| **Fas 2** | Alla komponenter. SDK-integration. Historik (uptime %) synlig |
| **Fas 3** | Per-team statusvy (filtrat på komponenter teamet använder). SLA-rapporter |

### 23.3 SLOs & Error Budgets

**Princip:** Utan mätbara mål är "plattformen fungerar" en känsla, inte ett faktum. SLOs definierar vad "fungerar" betyder — i siffror.

#### Plattforms-SLOs

| Tjänst | SLI (vad mäts) | SLO | Mätperiod |
|--------|----------------|-----|-----------|
| **LiteLLM Gateway** | Andel requests med HTTP 2xx | 99.5% | 30 dagar rullande |
| **Inference latency (streaming)** | p95 time-to-first-token | < 500 ms | 30 dagar |
| **Inference latency (batch)** | p95 total latency | < 30 s | 30 dagar |
| **RAG-pipeline** | Andel queries som returnerar resultat | 99.0% | 30 dagar |
| **Agent Sandbox** | Andel spawn-requests som lyckas inom 60s | 98.0% | 30 dagar |
| **Data Plane (Qdrant)** | Andel queries under 200ms | 99.0% | 30 dagar |
| **Data Plane (MinIO)** | Andel GET/PUT under 1s | 99.5% | 30 dagar |
| **Data Freshness (RAG)** | Tid från dokument-ändring till uppdaterad vektor i Qdrant | < 15 min (p95) | 30 dagar |

#### Error Budgets

Varje SLO har en error budget = 100% - SLO. Exempel: 99.5% SLO = 0.5% error budget = ~3.6 timmar nertid per månad.

**Regler:**
- **Budget > 50% kvar:** Normal utvecklingstakt. Feature-arbete prioriteras.
- **Budget 20-50%:** Varning. Nya deploys kräver extra validering.
- **Budget < 20%:** Frys. Inga nya features. Allt fokus på stabilitet.
- **Budget 0%:** Alla icke-kritiska deploys stoppas. Incident review obligatorisk.

**Start:** Fas 1 sätter SLOs baserat på antaganden. Fas 2 justerar baserat på faktisk data. SLOs ska vara ambitiösa men realistiska — en SLO som aldrig bryts är satt för lågt.

### 23.4 Disaster Recovery & Backup

#### Vad skyddas

| Komponent | RPO (max dataförlust) | RTO (max nertid) | Backup-metod |
|-----------|----------------------|-------------------|--------------|
| **Qdrant (vektorer)** | 1 timme | 4 timmar | Snapshot till MinIO, schemalagd varje timme |
| **Neo4j (kunskapsgraf)** | 1 timme | 4 timmar | Online backup till MinIO |
| **MinIO (objekt)** | 24 timmar | 8 timmar | Erasure coding (inbyggd) + off-site replikering |
| **Redis (cache)** | Ingen (cache) | 15 min | Ingen backup — återbyggs från källa |
| **MLflow (modellregistry)** | 24 timmar | 4 timmar | PostgreSQL-backup + artifact-snapshot |
| **GitOps-state (Argo CD)** | 0 (git är källan) | 30 min | Git repo = backup. Argo CD återställs från manifest |
| **Agent workspaces (PVC)** | Per körning | Ingen restore | Ephemeral — körningen kan göras om |
| **Platform secrets** | 0 | 1 timme | Vault/extern secrets manager = source of truth |
| **Audit logs** | 1 timme | 4 timmar | Append-only → SIEM + långtidslagring (S3/MinIO) |

#### DR-scenarier

| Scenario | Åtgärd |
|----------|--------|
| **GPU-nod dör** | DRA omplacerar workloads automatiskt. Ingen manuell åtgärd om kapacitet finns. |
| **Data Plane-nod dör** | Qdrant/Neo4j har replicas — automatisk failover. MinIO erasure coding hanterar nodförlust. |
| **Helt kluster nere** | Återställ från backup + GitOps. Prioritetsordning: secrets → platform-system → Data Plane → Inference → Agents |
| **Ransomware/korruption** | Isolera klustret. Återställ från immutable backups (off-site). Forensisk analys innan reconnect. |

**Test:** DR-övning kvartalsvis. Minst en faktisk restore-test per kvartal — inte bara "backup körs". Om restore aldrig testats existerar ingen backup.

### 23.5 Day-2 Operations

#### Kubernetes-uppgraderingar

| Steg | Vad | Ansvarig |
|------|-----|----------|
| 1 | Läs release notes, identifiera breaking changes | Platform team |
| 2 | Testa i staging-kluster (spegling av prod) | Platform team |
| 3 | Uppgradera control plane | Platform team (blue-green om möjligt) |
| 4 | Uppgradera node pools en åt gången (drain → upgrade → uncordon) | Platform team |
| 5 | Verifiera alla workloads, SLOs, observability | Platform team + on-call |
| 6 | Dokumentera i runbook | Platform team |

**Frekvens:** Kubernetes: minor-version var 4:e månad (följ upstream). Patch: inom 14 dagar.

#### Komponentuppgraderingar

| Komponent | Uppgraderingsfrekvens | Strategi |
|-----------|----------------------|----------|
| **vLLM** | Varje minor release | Canary: ny version på 10% trafik → observera → rulla ut |
| **Qdrant** | Varje minor release | Rolling upgrade (replicas) |
| **LiteLLM** | Varje release | Blue-green (snabb rollback) |
| **Argo CD** | Varje minor release | In-place (namespace-isolerad) |
| **GPU-drivers** | Kvartalsvis | Drain node → uppgradera → uncordon. Aldrig alla noder samtidigt. |
| **Modellvikter** | Vid behov (ny modell) | Canary med eval-jobb (§9) innan full utrullning |

#### Certifikatrotation

cert-manager hanterar automatiskt. Men: **övervaka cert-expiry som SLI**. Ett utgånget cert klockan 3 på natten = SEV1.

### 23.6 Operational Readiness Review

**Innan en ny komponent går i produktion** ska den passera en ORR-checklista:

| Krav | Fråga | Godkänt om |
|------|-------|------------|
| **Observability** | Har komponenten dashboards, alerts, logs? | Minst: health-check, error rate, latency |
| **Runbook** | Finns runbook med symptom/diagnos/åtgärd/rollback? | Ja, testad av on-call |
| **Backup** | Finns backup-strategi? Testad? | Ja, restore verifierad |
| **Skalning** | Hur skalar den? Vad händer vid 10x last? | Dokumenterad skalningsstrategi |
| **Säkerhet** | NetworkPolicy, RBAC, secrets, image-signering? | Kyverno-policy passerar |
| **Dependencies** | Vad händer om en dependency går ner? | Degraderad funktion, inte total krasch |
| **Rollback** | Kan vi rulla tillbaka inom 15 minuter? | Ja, verifierat |
| **On-call** | Vet on-call-teamet att den finns? | Ja, genomgång genomförd |

**Princip:** Ingen komponent i produktion utan ORR. Det är frestande att hoppa över — "det är bara en liten tjänst". Varje SEV1 började som "en liten tjänst".

### 23.7 AI-assisterad SRE (fas 3+)

**Problem:** §23.1-23.6 beskriver operations som en mänsklig process. Det stämmer för fas 1-2 — teamet är litet, systemen nya, förtroende måste byggas. Men i fas 3+ med 15+ team, 50 000+ requests/dag och ett växande antal komponenter skalar inte manuell incident response.

Bifrost är en AI-plattform. Den bör använda sin egen kapabilitet för att drifta sig själv.

#### Kapabiliteter (fas 3+)

| Kapabilitet | Vad | Hur |
|-------------|-----|-----|
| **RCA-assistent** | Vid incident: samla loggar, metrics, recent deploys, korrelera → föreslå trolig rotorsak | Agent med läsåtkomst till observability-stack. Output = RCA-förslag, inte åtgärd. |
| **Runbook-navigering** | On-call frågar "vad gör jag?" → agent hittar rätt runbook och guider steg-för-steg | RAG över runbook-corpus. Agent svarar med kontext, inte generiskt. |
| **Anomali-korrelation** | Korrelera alerts från olika källor (K8s, vLLM, Qdrant, LiteLLM) till en samlad bild | Agent konsumerar alert-feed, grupperar relaterade events, minskar alert fatigue. |
| **Kapacitetsförslag** | "GPU-pool når 85% inom 3 dagar baserat på trend" → föreslå skalning | Trendanalys på Prometheus-data. Förslag, inte automatisk skalning. |
| **Post-mortem-draft** | Efter incident: generera timeline + draft post-mortem från loggar och Slack | Agent samlar data, människa granskar och kompletterar. |

#### Explainability — spårbarhet för AI-driftbeslut

**Princip:** Om en AI-agent föreslår, rekommenderar eller i framtiden fattar ett driftbeslut, måste beslutet vara spårbart. Annars blir AI-assisterad SRE en svart låda som on-call inte litar på.

| Krav | Implementation |
|------|----------------|
| **Varje rekommendation loggas** | Strukturerad logg: input (vilken data), resonemang (varför denna slutsats), output (rekommendation), confidence |
| **Människa i loopen (fas 3)** | AI föreslår, människa godkänner. Ingen automatisk åtgärd utan explicit approval. |
| **Automatisk åtgärd (fas 4+)** | Begränsad till lågrisk: skala upp (aldrig ner), skapa ticket, skicka notifiering. Alla loggas med full audit trail. |
| **Feedback-loop** | On-call markerar rekommendation som "hjälpte" / "fel" / "irrelevant". Aggregeras kvartalsvis → förbättra agenten. |
| **Audit-kompatibilitet** | Alla AI-driftbeslut exporteras till SIEM (§20.4) med taggen `ai-ops-decision` för compliance-granskning. |

#### Varför inte från dag ett?

Tre skäl:
1. **Förtroende.** Teamet måste först förstå systemet manuellt innan de litar på AI-assistans.
2. **Data.** AI-assisterad RCA kräver historisk data — loggar, incidentmönster, runbooks. I fas 1 finns ingen historik.
3. **Risk.** En AI som ger fel RCA-förslag under en SEV1 klockan 3 på natten gör mer skada än nytta. Bättre att börja med förslag i lugna lägen och bygga track record.

**Utrullning:**
- Fas 3: RCA-assistent + runbook-navigering (read-only, advisory)
- Fas 4: Anomali-korrelation + kapacitetsförslag + automatiska lågrisk-åtgärder

---

## 24. Change Management

### 24.1 Kommunikation till 3000 anställda

**Problemet:** Om ingen vet att plattformen finns, adopterar ingen den. Om alla vet men ingen förstår, blir det kaos.

#### Tre vågor

| Våg | Timing | Målgrupp | Kanal | Budskap |
|-----|--------|----------|-------|---------|
| **1. Pilotteam** | Fas 1, vecka 3 | 1 team (5-15 pers) | Direkt kontakt | "Vi bygger, ni testar, ge feedback" |
| **2. Early adopters** | Fas 2 | 3-5 team | Teams/Slack + demo | "AI Hub finns — så här kommer du igång" |
| **3. Bred lansering** | Fas 3 | Alla team | Intranät + townhall + video | "AI Hub är öppen — registrera dig" |

#### Per våg

**Våg 1 (Pilot):**
- Personlig onboarding med platform team
- Slack-kanal: `#bifrost-pilot`
- Veckovisa feedback-sessioner
- Pilotteamets erfarenhet blir case study för våg 2

**Våg 2 (Early Adopters):**
- 30-min live demo (inspelad)
- Backstage self-service med dokumentation
- Sprechstunde/drop-in 1h/vecka
- "Getting Started"-guide

**Våg 3 (Bred lansering):**
- Townhall-presentation av Tjänsteägare
- Video: "Vad är AI Hub och vad kan jag göra med den?" (3 min)
- Intranät-sida med FAQ
- Template: "Min första AI-app" i Backstage

### 24.2 Utbildning

| Nivå | Målgrupp | Format | Innehåll |
|------|----------|--------|----------|
| **Awareness** | Alla anställda | Video 3 min | Vad är AI Hub? Vad kan jag göra? |
| **Consumer** | Utvecklarteam | Workshop 2h | API, Playground, RAG self-service |
| **Builder** | AI-team | Workshop 4h | Agent sandbox, GraphRAG, eval, MLflow |
| **Admin** | Platform team | Intern doc | Runbooks, on-call, kapacitet |

### 24.3 Feedback-loop

```
Team feedback → Bifrost backlog → Prioritering → Sprint → Release → Kommunikation
```

- Backstage: feedback-knapp på varje sida
- Slack: `#bifrost-feedback`
- Kvartalsvis NPS bland konsumerande team
- KPI: Time to first successful request (mäts per team)

### 24.4 Migrationsväg — befintliga AI-lösningar

**Problem:** Bifrost lanseras inte i vakuum. Team har redan egna AI-lösningar — lokala modeller, OpenAI API-nycklar, egna RAG-pipelines, Jupyter-notebooks med hårdkodade endpoints. Om Bifrost ignorerar dessa, uppstår skugg-AI vid sidan av plattformen.

#### Migrationsmodell

| Fas | Vad händer | Team gör | Plattform gör |
|-----|-----------|----------|---------------|
| **Discover** | Kartlägg befintliga AI-lösningar per team | Fyller i self-assessment-formulär | Sammanställer landscape |
| **Coexist** | Befintlig lösning + Bifrost körs parallellt | Pekar nya projekt mot Bifrost | Erbjuder gateway-kompatibla endpoints |
| **Migrate** | Flytta workloads till Bifrost | Byter endpoint, validerar output | Erbjuder migrationsguide + support |
| **Decommission** | Stäng ner gammal lösning | Avregistrerar gamla API-nycklar | Verifierar ingen kvarvarande trafik |

**Incitament, inte tvång:** Team migrerar för att Bifrost är *bättre* — lägre latency, bättre modeller, inbyggd compliance. Inte för att de tvingas. Tvångsmigration skapar motstånd och skugg-IT.

**Undantag:** Team med regulatoriska krav som Bifrost inte stödjer i fas 1 får behålla sin lösning med documented exception. Undantaget granskas kvartalsvis.

### 24.5 Champion Network & Executive Sponsorship

#### Champions

Varje konsumerande team utser en **Bifrost Champion** — en person som:
- Deltar i månatlig champion-sync (30 min)
- Är första kontaktpunkt för sitt team
- Testar nya features före bred utrullning
- Eskalerar blockers direkt till platform team

Champions är inte extra arbete — de är teamets röst in i plattformen. Utan dem flödar feedback bara uppåt via chefer, och de faktiska problemen filtreras bort.

**Antal:** 1 champion per team. Start med pilotteamets champion i fas 1, skala till 5-10 i fas 2.

#### Executive Sponsor

| Roll | Ansvar |
|------|--------|
| **Executive Sponsor (CTO/CIO-nivå)** | Budgetbeslut, eskalering, strategisk förankring i ledningsgrupp |
| **Tjänsteägare (Marcus)** | Daglig styrning, roadmap, prioritering, teamkontakt |
| **Platform Lead (teknisk)** | Arkitekturbeslut, on-call-eskalering, teknisk roadmap |

**Varför executive sponsor?** En plattform för 3000 anställda kräver budgetbeslut, organisatorisk förankring och ibland makt att säga "ni ska använda detta". Utan executive sponsor dör plattformen i prioriteringskonflikt med varje teams egna roadmap.

### 24.6 Success Metrics

#### Adoptionsmetrics

| Metrik | Mål (fas 1) | Mål (fas 3) | Mätning |
|--------|-------------|-------------|---------|
| **Team onboardade** | 1 pilotteam | 15+ team | Backstage registrering |
| **Aktiva användare (MAU)** | 15 | 500+ | LiteLLM virtual key usage |
| **Requests/dag** | 1 000 | 50 000+ | LiteLLM metrics |
| **Time to first request** | < 2 timmar | < 30 min | Mäts från onboarding-start |
| **RAG-pipelines aktiva** | 1 | 20+ | Qdrant collections |

#### Plattformsmetrics

| Metrik | Mål | Mätning |
|--------|-----|---------|
| **SLO compliance** | > 95% av månader inom SLO | Prometheus + SLO dashboards (§23.3) |
| **Incident MTTR (SEV1/2)** | < 1 timme | PagerDuty/Opsgenie |
| **Cost per inference request** | Sjunkande trend | LiteLLM + GPU-kostnad / requests |
| **GPU utilization** | > 60% | DCGM metrics |

#### Värde-metrics

| Metrik | Mätning |
|--------|---------|
| **Undvikta kostnader** | Jämför mot extern API-kostnad (OpenAI/Azure) för samma volym |
| **Time-to-market för AI-features** | Mät från idé till produktion, per team (enkät) |
| **Compliance-incidenter** | Antal PII-läckage, policy-violations per kvartal (mål: 0) |
| **Skugg-AI-minskning** | Antal team med egna API-nycklar utanför plattformen (mål: sjunkande) |

**Princip:** Mät adoption, inte bara tillgänglighet. En plattform med 99.9% uptime men 5 användare är inte framgångsrik. En plattform med 98% uptime och 500 aktiva användare är det.

---

## 25. Sammanfattande princip

> Teamet bygger en AI-native Kubernetes-plattform där Docker producerar signerade och attesterade artefakter, Helm uttrycker plattformsavsikt, Kubernetes verkställer policy och resursdisciplin, lokala LLM:er serveras som kontrakterade inferenstjänster med observability, kvotstyrning och adversariell testning, agenter arbetar i isolerade sandboxes med egna identiteter, persistent minne och iterativa workspaces — och kommunicerar via standardiserade protokoll (MCP för verktygsaccess, A2A för agent-samarbete med discovery via Agent Registry), data lever i tre parallella representationer (vektor, graf, objekt) med kryptering och backup — där varje third-party dependency (Qdrant, Neo4j, LiteLLM) har en dokumenterad riskprofil, namngiven alternativkandidat och exit-plan — säkerhet genomsyrar alla lager — från zero trust med agent-identitetslivscykel och nyckelrotation till SOC-integration, vulnerability management och honeypots, observability inkluderar compliance-specifika signaler som matar CISO-dashboarden — drift styrs av SLOs med error budgets, DR-planer, operational readiness reviews och en publik statussida, FinOps säkerställer att kostnad behandlas som designrestriktion med organisatorisk beslutshierarki för alla beslutskategorier (modeller, policy, agenter, compliance, onboarding), SDK:t exponerar rate limit-kvot i realtid — regulatorisk compliance mappar GDPR, EU AI Act, DORA, NIS2 och säkerhetsskyddslagen till konkreta plattformskontroller med kunddata-segregering per uppdrag, en modellval-guide kanaliserar team mot rätt modell per användningsfall och dataklass, en "göra ingenting"-analys visar att avsaknad av plattform kostar 1-3M SEK/år mer — och allt exponeras som en AI Hub med self-service, compliance, modell-livscykelhantering, champion-nätverk och migrationsväg för befintliga lösningar från dag ett.

---

## 26. Regulatory & Compliance Framework

### 26.1 Kontext: CGI och regulatoriskt landskap

CGI är ett börsnoterat globalt IT-konsultbolag med ~90 000 anställda. Kunder verkar inom offentlig sektor, försvar, bank/finans, hälso- och sjukvård, energi och telekom. Det innebär att Bifrost inte hanterar *en* typ av känslig data — utan potentiellt *alla* typer, ofta under olika regelverk samtidigt.

**Konsekvens för Bifrost:** Plattformen måste kunna hantera att Team A arbetar under DORA (bank), Team B under säkerhetsskyddslagen (försvar), och Team C under patientdatalagen (vård) — på samma infrastruktur, med strikt isolering.

### 26.2 Regulatorisk matris

| Regelverk | Scope | Bifrost-relevans | Ikraftträdande | Sanktion |
|-----------|-------|------------------|----------------|----------|
| **GDPR** | All persondata i EU | PII Gateway, data residency, rätt till radering (crypto-shredding §20.9) | 2018 (gäller nu) | 4% global omsättning |
| **EU AI Act** | AI-system, riskklassificering | Riskregistry (§12.2), human oversight, audit trail, DBOM | Full tillämpning aug 2026 | 7% global omsättning |
| **DORA** | Finanssektorn — ICT-risker | Incident response (§23.2), vulnerability mgmt (§20.10), pentest (§20.5), DR (§23.4) | Jan 2025 (gäller nu) | €10M eller 2% omsättning |
| **NIS2** | Kritisk infrastruktur, ICT-leverantörer | Supply chain security (§10), incident reporting, risk mgmt | Okt 2024 (gäller nu) | €10M eller 2% omsättning |
| **Säkerhetsskyddslagen** | Svenskt försvar/rikets säkerhet | Fysisk isolering, säkerhetsprövad personal, svensk jurisdiktion | Gäller nu | Straffrättsligt |
| **ISO 27001** | Informationssäkerhet (ISMS) | CGI redan certifierat — Bifrost måste passa in i befintligt ISMS | Certifiering | Kundkrav |
| **ISO/IEC 42001** | AI Management System (AIMS) | Nytt — enda certifierbara AI-standarden. Strategiskt för CGI:s marknadsposition | 2023 (certifierbar nu) | Kundkrav/differentiering |
| **SOC 2 Type II** | Tjänstesäkerhet (US-kunder) | Audit trail, access control, availability | Löpande | Kundkrav |
| **PCI-DSS** | Betalningsdata | Nätverkssegmentering, kryptering, access log | v4.0.1 (gäller nu) | Avtalsmässigt |
| **Patientdatalagen** | Svensk sjukvård | Strikt åtkomstkontroll, loggning, datalagring i Sverige | Gäller nu | Straffrättsligt |
| **Schrems II** | EU→icke-EU datatransfer | Routing: konfidentiell data → enbart lokala modeller (§12.4) | Gäller nu | GDPR-sanktioner |

### 26.3 Compliance-per-uppdrag-modell

**Problem:** En one-size-fits-all compliance-nivå är antingen för strikt (alla team behandlas som försvar) eller för slapp (försvarsteam behandlas som alla andra). Ingendera fungerar.

**Lösning:** Varje team/uppdrag tilldelas en **compliance-profil** vid onboarding:

| Profil | Regelverk som gäller | Bifrost-begränsningar | Exempel |
|--------|---------------------|----------------------|---------|
| **Standard** | GDPR, ISO 27001 | PII Gateway, dataklass-routing, audit trail | Intern tjänsteutveckling |
| **Finans** | + DORA, PCI-DSS | + Obligatorisk lokal modell för all kunddata, DORA-incident-rapportering, kvartalsvis pentest-verifiering | Bankkundprojekt |
| **Försvar** | + Säkerhetsskyddslagen | + Fysiskt isolerad nod-pool, säkerhetsprövad on-call, ingen extern API-trafik, enhanced audit | Försvarsmakten-uppdrag |
| **Hälsa** | + Patientdatalagen | + Strikt åtkomstkontroll (loggas per individ), data i Sverige, extra PII-regler | Regionuppdrag |
| **Högrisk AI** | + EU AI Act Annex III | + Human oversight obligatorisk, DBOM per modell, riskbedömning, bias-testning | AI som påverkar individer |

**Implementation:** Compliance-profil = Kubernetes namespace-label + Kyverno-policies + LiteLLM routing-regler. Profilen styr automatiskt:
- Vilka modeller teamet får använda (lokala vs externa)
- Vilken data residency som gäller
- Vilken audit-nivå som loggas
- Vilka pentest-krav som appliceras
- Om human oversight krävs

### 26.4 Kunddata-segregering

**Princip:** CGI arbetar med konkurrerande kunder inom samma bransch. Customer A:s data får *aldrig* vara åtkomlig för Customer B:s team — varken via RAG, vektorsökning, kunskapsgraf eller agentminne.

#### Isoleringsmodell

| Lager | Segregeringsmetod | Verifiering |
|-------|-------------------|-------------|
| **Qdrant (vektorer)** | Separata collections per uppdrag. Ingen cross-collection sökning. | Automatiskt test: query från Team A returnerar 0 resultat från Team B:s collection |
| **Neo4j (kunskapsgraf)** | Separata databaser eller label-baserad isolering med query-rewrite | Kvartalsvis audit: traversal-test bekräftar isolering |
| **MinIO (objekt)** | Separata buckets per uppdrag. Bucket policy = deny all cross-access | IAM-policy + automatisk scanning |
| **Redis (cache)** | Key-prefix per uppdrag + ACL | Automatiskt test vid deploy |
| **Agent workspaces** | Separata PVC:er, separata service accounts, NetworkPolicy-isolering | ORR-checklista (§23.6) |
| **LLM-kontext** | Ingen delad kontext mellan uppdrag. Ingen few-shot från annan kunds data | Gateway-enforced: virtual key = 1 uppdrag |
| **Audit trail** | Per-uppdrag audit, exporterbar för kundrevision | Audit-filtrering per tenant-id |

#### Vad händer vid läcka?

| Steg | Åtgärd |
|------|--------|
| 1 | Automatisk alert: cross-tenant access detected (anomali-detektor) |
| 2 | Omedelbar isolering av berörda namespaces |
| 3 | Forensisk analys: omfattning, orsak, vilken data |
| 4 | Notifiering: DPO + berörd kund (inom 72h per GDPR) |
| 5 | Root cause + fix + post-mortem |
| 6 | Verifiering: penetration test av fix |

### 26.5 EU AI Act — konkret påverkan

EU AI Act når full tillämpning **augusti 2026**. För CGI är detta strategiskt — kunderna kommer kräva att deras AI-leverantör uppfyller kraven.

#### Riskklassificering i Bifrost

| AI Act-klass | Bifrost-exempel | Krav |
|-------------|----------------|------|
| **Förbjudna** | Social scoring, biometrisk massövervakning | Blockeras i policy. Får inte deployas. |
| **Högrisk (Annex III)** | AI i anställningsbeslut, kreditbedömning, medicinsk diagnos | Risk mgmt system, data governance, human oversight, transparens, accuracy, cybersecurity |
| **Begränsad risk** | Chatbotar, AI-genererad text | Transparenskrav: användaren måste veta att det är AI |
| **Minimal risk** | Intern kodassistans, textsammanfattning | Inga specifika krav (men god praxis gäller) |

#### Vad Bifrost måste leverera för högrisk

| AI Act-krav | Bifrost-implementation |
|-------------|----------------------|
| **Risk management system** | Risk Registry (§12.2) — per system, uppdateras löpande |
| **Data governance** | DBOM Store (§12.2) — proveniens för tränings- och RAG-data |
| **Technical documentation** | Automatgenererad: modellkort, dataset-beskrivning, eval-resultat (MLflow §9) |
| **Record-keeping** | Audit Trail — varje request, beslut, guardrail-triggning |
| **Transparency** | Disclosure: alla AI-genererade svar märks som AI-genererade |
| **Human oversight** | Human-in-the-loop per risklass (§12.2). Eskaleringskedja. Override-loggning. |
| **Accuracy & robustness** | Eval-pipeline (§18), red-team, bias-testning, drift-detektion |
| **Cybersecurity** | §20 Security Architecture i sin helhet |

### 26.6 ISO/IEC 42001 — strategisk möjlighet

ISO 42001 är den enda certifierbara AI-standarden. CGI är redan ISO 27001-certifierat — att lägga till 42001 ger:

1. **Marknadsdifferentiering:** "Vår AI-plattform är certifierad mot ISO 42001" — få konkurrenter kan säga det 2026
2. **Kundförtroende:** Offentlig sektor och finans kräver alltmer AI-governance-bevis
3. **Strukturerad AI-hantering:** AIMS (AI Management System) ger ramverk för livscykelhantering

**Bifrost-koppling:**
- §12.2 AI Compliance = AIMS risk-behandling
- §9 Modell-livscykelhantering = AIMS system lifecycle
- §20.5 Pentest + §18 Red-team = AIMS performance evaluation
- §26.3 Compliance-profiler = AIMS context of the organization

**Rekommendation:** Inled 42001-gap-analys i fas 2. Certifiering som mål i fas 3.

### 26.7 Säkerhetsskyddslagen — isolerad zon

**Kontext:** Om CGI:s kunder inkluderar Försvarsmakten, MSB, FRA eller andra myndigheter under säkerhetsskyddslagen gäller särskilda krav som *inte kan lösas med mjukvara ensam*.

| Krav | Konsekvens för Bifrost |
|------|----------------------|
| **Säkerhetsprövad personal** | On-call för försvarsteam = säkerhetsprövade individer. Inte hela platform team. |
| **Fysisk isolering** | Egna noder (node pool), eget nätverk, eventuellt eget kluster. Inte bara namespace-isolering. |
| **Ingen extern anslutning** | Ingen trafik till internet. Inga externa API:er. Inga externa modeller. |
| **Kryptokrav** | Godkänd kryptering (kan kräva svenskt godkänd krypto, inte bara TLS) |
| **Loggning till MUST/FRA** | Säkerhetslogg kan behöva levereras till tillsynsmyndighet |
| **Drift i Sverige** | All infrastruktur fysiskt i Sverige. Ingen cloud burst. |

**Bifrost-implementation:** Dedikerad **secure zone** — ett separat node pool (eller separat kluster) med:
- Air-gapped nätverk
- Egna GPU:er (inte delade med övriga zoner)
- Lokala modeller only
- Säkerhetsprövad drift
- Separat audit trail med export till tillsynsmyndighet

**Fas:** Inte i fas 1-2 om det inte är kundkrav från dag ett. Planera infrastrukturen så att secure zone kan läggas till i fas 3 utan omskrivning.

### 26.8 Compliance-automatisering

Manuell compliance-verifiering skalar inte till 15+ team med olika profiler. Bifrost bör automatisera:

| Kontroll | Automatisering |
|----------|----------------|
| **Dataklass-routing** | LiteLLM enforces: konfidentiell → lokal modell, automatiskt |
| **Kunddata-isolering** | Kyverno-policy: cross-namespace access = deny |
| **Audit trail completeness** | Alert om request saknar tenant-id, data-class eller model-id |
| **Retention enforcement** | CronJob: radera data äldre än profil-retention |
| **Pentest-compliance** | Dashboard: senaste pentest per profil, flagga om utgånget |
| **Human oversight-krav** | Gateway: högrisk-request utan human-in-the-loop approval = block |
| **Regulatorisk rapportering** | Kvartalsvis auto-genererad rapport per compliance-profil |

**Princip:** Compliance ska vara default, inte opt-in. Ett team som glömmer att konfigurera sin profil ska falla tillbaka på den striktaste applicerbara profilen, inte den slappaste.

#### Continuous Compliance Evidence

**Problem:** En auditor (intern eller extern) vill inte bara se att kontroller *finns* — hen vill se bevis att de *fungerat över tid*. "Vi har PII Gateway" är ett påstående. "PII Gateway blockerade 347 requests denna månad, 0 requests med PII nådde extern modell" är bevis.

Skillnaden: point-in-time kontroll (finns det?) vs continuous evidence (fungerar det?).

| Kontroll | Bevis (continuous) | Lagring | Exportformat |
|----------|-------------------|---------|-------------|
| **PII Gateway** | Antal blockerade requests per dag/vecka/månad. 0 PII till extern modell. | Prometheus metrics → SIEM | Kvartalsrapport (auto) |
| **Dataklass-routing** | Antal konfidentiella requests routade lokalt. 0 konfidentiella till extern. | LiteLLM logs → Prometheus | Kvartalsrapport (auto) |
| **Cross-tenant isolering** | 0 cross-tenant access events. Anomali-detektor-resultat. | SIEM alerts | Kvartalsrapport + pentest |
| **Audit trail completeness** | % requests med fullständig taggning (tenant-id, model-id, data-class). Mål: 100%. | Prometheus gauge | Realtid dashboard |
| **Vulnerability patching** | Tid från CVE-publicering till patch applicerad, per allvarlighet. | Jira/ticket-system | Kvartalsrapport |
| **Admission policy** | Antal blockerade deploys (osignerade images, saknade limits, etc.) | Kyverno Policy Reports | Realtid + kvartalsrapport |
| **Key rotation** | Alla nycklar inom rotationsschema. 0 utgångna certifikat. | cert-manager metrics + Vault audit | Realtid dashboard |
| **CISO sign-off (§20.12)** | Signatur + datum per fas-övergång. | Compliance dashboard | Vid audit |
| **Human oversight (högrisk)** | Antal eskaleringar, antal overrides, override-motiveringar. | Audit Trail | Kvartalsrapport |

**Beviskedja per regelverk:**

| Regelverk | Auditor frågar | Bifrost svarar med |
|-----------|---------------|-------------------|
| **GDPR** | "Visa att persondata inte läckt till extern part" | PII Gateway metrics + dataklass-routing logs |
| **EU AI Act** | "Visa risk management system, data governance, human oversight" | Risk Registry + DBOM Store + Human Oversight logs |
| **DORA** | "Visa incident response, vulnerability testing, recovery test" | Incident log + pentest-rapport + DR-test-rapport |
| **NIS2** | "Visa supply chain security, incident reporting" | SBOM + Sigstore + incident notification log |
| **ISO 27001** | "Visa ISMS-kontroller fungerar" | Kyverno Policy Reports + compliance dashboard snapshot |

**Ägarskap:** Security/Compliance-rollen (se team-komposition i rollout-plan) äger compliance-matrisen (YAML i Git) och kvartalsrapporten. Platform team äger de tekniska metrics. Tjänsteägare godkänner rapporten innan extern delning.

### 26.9 Compliance Dashboard — CISO-vy

**Problem:** En CISO godkänner inte en plattform genom att läsa 26 sektioner arkitekturdokumentation. Hen vill se en skärm: "DORA: 14/17 kontroller gröna, 3 gula. AI Act: 8/12 kontroller gröna. Säkerhetsskyddslagen: ej applicerbart för detta team."

#### Dashboard-design

**Plats:** Backstage-plugin (fas 2) + Grafana-dashboard (fas 1 för tekniska metrics).

```
┌─────────────────────────────────────────────────────────────────┐
│  BIFROST COMPLIANCE DASHBOARD                                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  REGELVERK           KONTROLLER    STATUS    NÄSTA       │    │
│  │  ─────────────────────────────────────────────────────── │    │
│  │  GDPR                12/12         🟢        Nästa audit │    │
│  │  EU AI Act           8/12          🟡        4 kvar      │    │
│  │  DORA                14/17         🟡        3 kvar      │    │
│  │  NIS2                10/11         🟢        1 minor     │    │
│  │  ISO 27001           Aligned       🟢        Cert audit  │    │
│  │  ISO 42001           Gap-analys    🔴        Fas 2 start │    │
│  │  Säkerhetsskyddslagen  Ej aktivt   ⚪        Vid behov   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  PER TEAM / UPPDRAG                                      │    │
│  │  ─────────────────────────────────────────────────────── │    │
│  │  Team Alpha (Finans)     Profil: DORA    Status: 🟢      │    │
│  │  Team Beta (Intern)      Profil: Standard Status: 🟢     │    │
│  │  Team Gamma (Hälsa)      Profil: Hälsa   Status: 🟡      │    │
│  │    └─ Gap: patientdatalagen loggning ej verifierad        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SENASTE HÄNDELSER                                        │    │
│  │  2026-08-15  PII-detektion blockerade 3 requests (Team G) │    │
│  │  2026-08-14  Cross-tenant anomali: false positive (OK)    │    │
│  │  2026-08-10  Pentest slutförd: 0 kritiska, 2 medium      │    │
│  │  2026-08-01  EU AI Act: högrisk-system registrerat        │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

#### Datakällor

| Dashboard-vy | Datakälla | Uppdateringsfrekvens |
|-------------|-----------|---------------------|
| Regelverk × kontroll-status | Manuellt underhållen matris i Git (YAML) + automatisk verifiering | Veckovis (manuell) + realtid (automatisk) |
| Per-team compliance-profil | Kubernetes namespace-labels + **Kyverno Policy Reporter** (aggregerar PolicyReport CRDs → Prometheus metrics + UI) | Realtid |
| PII/dataklass-händelser | LiteLLM + PII Gateway metrics → Prometheus | Realtid |
| Pentest-status | Manuell inmatning (datum + resultat) | Per pentest |
| Cross-tenant anomalier | Anomali-detektor alerts → SIEM → dashboard | Realtid |
| Audit trail completeness | Prometheus: andel requests med fullständig audit-tagg | Realtid |

#### Fasning

| Fas | Dashboard-kapabilitet |
|-----|----------------------|
| **Fas 1** | Grafana: tekniska compliance-metrics (audit completeness, NetworkPolicy denies, cert-expiry). **Kyverno Policy Reporter** installeras här — exponerar `policy_report_result` metrics till Prometheus och ger per-namespace violation-vy |
| **Fas 2** | Backstage-plugin: regelverk × kontroll-matris, per-team status, compliance-profil-vy |
| **Fas 3** | Auto-genererad kvartalsrapport (PDF/Markdown) för CISO och extern audit |

**Princip:** Dashboarden är inte dekoration — den är bevis. Vid extern audit ska dashboarden kunna exportera en compliance-snapshot som visar: "vid denna tidpunkt uppfyllde vi dessa kontroller." Utan det är compliance en påstående, inte ett faktum.
