# Dagbok — Projekt Bifrost, 12 april 2026

> Version: Senior Developer / Arkitekt

---

## Kontext

Nytt projekt: AI Hub-plattform för 3000+ anställda. Marcus blir Tjänsteägare för AI, start mitten av maj. Target: Kubernetes-native AI-plattform med lokal och extern inferens, multi-tenant, compliance (AI Act deadline 2 aug 2026).

## Arkitekturgranskning — fynd

Utgångsdokument: 14 sektioner, infrastruktur-tungt. Granskning med parallella websökningar mot aktuell best practice.

### Tekniska korrigeringar

| Area | Problem | Åtgärd |
|------|---------|--------|
| GPU scheduling | Device plugins | → DRA (GA i K8s 1.34, NVIDIA DRA-driver donerad CNCF) |
| LLM Gateway | Ospecificerad | → LiteLLM (multi-provider, multi-tenant, cost tracking) |
| Inference | Behandlat som homogent | → 4 distinkta mönster: sync, streaming, batch, agent-loops |

### Arkitekturella luckor

| Lucka | Varför det är ett problem | Lösning |
|-------|--------------------------|---------|
| Multi-tenancy | 3000 anställda, inga kvoter | LiteLLM Org → Team → Virtual Key |
| Compliance | AI Act enforcement aug 2026 | Risk registry, PII gateway, DBOM |
| Dev experience | Infrastruktur utan UX | Backstage som AI Hub portal |
| Model lifecycle | Ingen pipeline import→sunset | MLflow + KServe canary + drift detection |
| **Data Plane** | Tom rubrik, inget innehåll | Se nedan |
| **Agent workspace** | Agenter = stateless API-konsumenter | Agent Sandbox CRD |

### Data Plane — den stora missen

Dokumentet listade "Data Plane" med en rad text. Ingen komponentval, inget diagram, inga trade-offs.

**Beslutade tekniker:**

| Komponent | Val | Trade-off |
|-----------|-----|-----------|
| Vector DB | Qdrant | Rust, 8ms p50, enkel ops. Milvus vid miljarder vektorer. |
| Knowledge Graph | Neo4j | GraphRAG (80% vs 50% accuracy), HippoRAG (10-20x billigare multi-hop) |
| Object Store | MinIO | S3-kompatibelt, billigt. Modellvikter, artifacts, backups. |
| Cache | Redis | Session state, rate limiting, working memory |
| Agent Memory | A-MEM-inspirerat | Working (Redis) → Episodic (Qdrant+Neo4j) → Semantic (Neo4j) |
| Agent Workspace | K8s Agent Sandbox | CRD från SIG Apps (mars 2026). gVisor/Kata isolation, PVC, pause/resume. |

**RAG som plattformstjänst:**
- Vanilla RAG (Qdrant)
- GraphRAG (Neo4j + Qdrant)
- HippoRAG (Neo4j + Qdrant + PPR)
- Hybrid RAG (vector + BM25)
Team väljer recept vid onboarding.

### Agent-arkitekturen

Agenter är inte API-konsumenter. De är stateful workers som behöver:

```
Agent Sandbox (PVC)
├── /workspace/code        ← git checkout, iteration
├── /workspace/scratch     ← drafts, skrivyta
├── /workspace/output      ← resultat
├── /workspace/artifacts   ← genererade filer
└── External: LiteLLM, Qdrant, Neo4j, MinIO, Git (via NetworkPolicy)
```

gVisor/Kata för kodexekvering. Pause/resume för idle agents. Scale-to-zero.
Agent Governance Toolkit (MS, MIT) för OWASP agentic top 10.

## Meta-insikt: granskningsprocess

Alla 9 fynd kom från att *reagera på dokumentets innehåll*, inte från att jämföra mot en oberoende referensmodell. Data Plane-missen avslöjades av Marcus, inte av granskningen.

**Fem varför:**
1. Varför missade jag Data Plane? → Granskade vad som stod.
2. Varför bara det? → Ankrade i dokumentets ramverk.
3. Varför ankrade jag? → Sökstrategi utgick från innehåll.
4. Varför från innehåll? → Ingen oberoende referensmodell.
5. Varför ingen? → **Hoppade direkt till granskning.**

→ Ledde till Pass 0 i systemprompt: bygg referensmodell *innan* du läser dokumentet.

## Systemprompt: SYSTEMPROMPT-BIFROST.md

4-pass granskningsmodell:
- **Pass 0:** Bygg referensmodell (vad borde finnas?) innan du läser
- **Pass 1:** Vad säger dokumentet fel? (diff mot verklighet)
- **Pass 2:** Vad saknas? (rollbyte: dev, CISO, CTO, agent)
- **Pass 3:** Meta + fem varför (granska din egen granskning)

5 dokumenterade biaser, explicit loggformat, explorativa sökningar obligatoriska.

## Rollout: 30/60/90 (v1.0 — behöver uppdateras)

| Fas | Tid | Fokus |
|-----|-----|-------|
| Foundation | Maj-Jun | GPU+DRA, vLLM, LiteLLM, 1 modell, 1 pilotteam |
| Platform | Jun-Jul | Multi-tenant, GitOps, KServe, Kueue, policy, PII |
| Scale | Aug-Okt | Agents, compliance, MLflow, canary, 10+ team |

**OBS:** Data Plane (Qdrant, Neo4j, MinIO, Agent Sandbox) inte infasad ännu.

## Stack-sammanfattning

```
Inference: vLLM → KServe → llm-d (fas 2-3)
Gateway:   LiteLLM (multi-provider, multi-tenant)
Data:      Qdrant · Neo4j · MinIO · Redis
Agents:    K8s Agent Sandbox · A-MEM · MS Agent Governance Toolkit
Platform:  Backstage · MLflow · ArgoCD · Kueue · KEDA
Security:  DRA · Sigstore · ValidatingAdmissionPolicy · PII Gateway
```
