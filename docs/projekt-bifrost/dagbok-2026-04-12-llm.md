# Dagbok — Projekt Bifrost, 12 april 2026

> Version: LLM-optimerad (kompakt, strukturerad, nyckelbegrepp explicit)

---

## SESSION_CONTEXT
- project: Projekt Bifrost
- type: AI-native Kubernetes platform (AI Hub)
- org_size: 3000+ employees
- role: Marcus = Tjänsteägare (Service Owner) for AI
- start_date: mid-May 2026
- critical_deadline: EU AI Act high-risk enforcement 2026-08-02

## KEY_DECISIONS

```yaml
gpu_scheduling: DRA (Dynamic Resource Allocation, GA in K8s 1.34)
llm_gateway: LiteLLM (multi-provider, multi-tenant, OpenAI-compatible)
vector_db: Qdrant (Rust, 8ms p50, metadata filtering)
knowledge_graph: Neo4j (GraphRAG, HippoRAG, Cypher)
object_store: MinIO (S3-compatible, K8s-native)
cache: Redis (session, rate limiting, working memory)
agent_workspace: K8s Agent Sandbox CRD (SIG Apps, 2026-03-20)
agent_memory: A-MEM inspired (working→episodic→semantic)
agent_governance: Microsoft Agent Governance Toolkit (MIT, OWASP agentic top 10)
developer_portal: Backstage (CNCF graduated)
model_registry: MLflow (experiment tracking, LLM eval)
serving: vLLM → KServe → llm-d (future)
gitops: ArgoCD
batch: Kueue
autoscaling: KEDA (streaming), HPA (sync), Kueue (batch)
```

## ARCHITECTURE — 6 PLANES

1. **BUILD**: Docker (signed, SBOM, provenance), Helm, CI/CD, Sigstore
2. **CONTROL**: Kubernetes, ArgoCD (GitOps), DRA, RBAC
3. **INFERENCE**: vLLM, KServe, LiteLLM gateway, 4 patterns (sync/stream/batch/agent-loop)
4. **DATA**: Qdrant, Neo4j, MinIO, Redis, MLflow, DBOM store
5. **AGENT**: Agent Sandbox CRD (gVisor/Kata), PVC workspace, A-MEM (3 layers), pause/resume
6. **GOVERNANCE**: ValidatingAdmissionPolicy, PII gateway, Risk Registry, Agent Governance Toolkit, audit trail

## INFERENCE_PATTERNS

| pattern | sla | scaling | gpu_profile |
|---------|-----|---------|-------------|
| sync_api | p99<500ms | HPA concurrency+latency | small model |
| streaming_sse | TTFT p99<300ms | KEDA connections+TTFT | medium+prefix_cache |
| batch | throughput, hours ok | Kueue quotas, scale-to-zero | max throughput |
| agent_loop | e2e minutes-hours | session count | large, 50k+ tokens/step |

## AGENT_WORKSPACE_MODEL

```
Agent Sandbox (CRD) + PVC:
├── /workspace/code (git, iterative coding)
├── /workspace/scratch (drafts, iteration)
├── /workspace/output (results)
├── /workspace/artifacts (generated files)
└── External (NetworkPolicy): LiteLLM, Qdrant, Neo4j, MinIO, Git
Isolation: gVisor/Kata | Lifecycle: create→run→pause→resume→scale-to-zero→delete
```

## AGENT_MEMORY_MODEL

| layer | lifetime | storage | content |
|-------|----------|---------|---------|
| working | in-session | Redis | context, tool results, reasoning |
| episodic | cross-session | Qdrant+Neo4j | experiences, decisions, outcomes |
| semantic | permanent | Neo4j | facts, domain knowledge, org understanding |

## RAG_PATTERNS_AS_SERVICE

- vanilla_rag: Qdrant only
- graph_rag: Neo4j + Qdrant (80% vs 50% accuracy on complex queries)
- hippo_rag: Neo4j + Qdrant + PPR (10-20x cheaper multi-hop)
- hybrid_rag: vector + BM25

## MULTI_TENANCY

```
Organization (company)
└── Team (budget, RPM, TPM, model access, guardrail profile)
    └── Virtual Key (prod/staging/sandbox)
```

## COMPLIANCE

- EU AI Act: risk classification mandatory at onboarding (forbidden/high/limited/minimal)
- GDPR: PII detection in gateway (NER/GLiNER), reversible anonymization (phase 2)
- DBOM: data provenance per model
- Audit: per-request logging with tenant/model/guardrail decisions

## ROLLOUT_PHASES (needs update for Data Plane)

| phase | days | focus |
|-------|------|-------|
| foundation | 1-30 | GPU+DRA, vLLM, LiteLLM, 1 model, 1 pilot team |
| platform | 31-60 | multi-tenant, GitOps, KServe, Kueue, policy, PII |
| scale | 61-90 | agents, compliance, MLflow, canary, 10+ teams |

## META_INSIGHT: REVIEW_METHODOLOGY

Problem discovered: first review (P1-P9) found 9 issues but missed entire Data Plane (empty label accepted as content). Root cause via 5-whys: no independent reference model built before reviewing.

**SYSTEMPROMPT-BIFROST.md** defines 4-pass review:
- Pass 0: Build reference model BEFORE reading document
- Pass 1: What does the document say wrong? (diff vs reality)
- Pass 2: What is missing? (role-switch: dev, CISO, CTO, agent)
- Pass 3: Meta-review + 5-whys on own biases

5 documented biases: reviews-stated-not-absent, anchors-in-narrative, prefers-clean, stops-early, searches-confirmatory.

## FILES

```
docs/projekt-bifrost/
├── target-architecture.md (v1.1, 20 sections)
├── rollout-plan-30-60-90.md (v1.0, NEEDS UPDATE for Data Plane)
├── SYSTEMPROMPT-BIFROST.md (4-pass review methodology)
├── chat-log.md
├── logs/ (empty, for future review logs)
└── research/ (11 files covering DRA, vLLM, LiteLLM, OWASP, compliance, inference, backstage, MLflow, KubeCon, data plane, agent memory)
```

## TODO_NEXT_SESSION

1. Update rollout-plan with Data Plane components (Qdrant, Neo4j, MinIO, Agent Sandbox phasing)
2. Test SYSTEMPROMPT against target-architecture (does 4-pass find new gaps?)
3. Budget framework (GPU costs, licenses, headcount)
4. Marcus decides which sections to deepen
