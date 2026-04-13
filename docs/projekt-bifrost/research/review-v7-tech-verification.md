# Teknologiverifiering — Target Architecture v7.0

> Datum: 2026-04-13 | Typ: 4-pass review, Pass 1 | Granskare: Opus 4.6

## 15 tekniker verifierade

| # | Teknik | Status april 2026 | Bedömning |
|---|--------|-------------------|-----------|
| 1 | DRA (GPU scheduling) | GA i K8s 1.34, GKE + OpenShift 4.21 | ✅ Korrekt |
| 2 | vLLM | Bra generellt, SGLang leder för agentic workloads | ⚠️ SGLang bör utvärderas |
| 3 | KServe | CNCF Incubating, v0.17.0 mars 2026 | ✅ Korrekt |
| 4 | LiteLLM | Supply chain-attack mars 2026, 40k drabbade | ✅ Adresserat i §21.1 |
| 5 | Qdrant | Apache 2.0, stabil, Rust-baserad | ✅ Korrekt |
| 6 | Neo4j | AGPL + Commons Clause, kommersiell licens krävs | ✅ Adresserat i §21.1 |
| 7 | ArgoCD | v3.3, 64% enterprise GitOps, CNCF graduated | ✅ Korrekt |
| 8 | Backstage | CNCF Incubating, 89% IDP-marknadsandel, 3400+ orgs | ✅ Korrekt |
| 9 | Agent Sandbox CRD | Materialiserat! K8s SIG Apps, blog mars 2026 | ✅ Korrekt |
| 10 | A-MEM | NeurIPS 2025 paper, research-grade | ⚠️ Noterat i §5.6 |
| 11 | A2A | v1.0 stabil, AAIF/Linux Foundation, 150+ orgs | ✅ Korrekt |
| 12 | MCP | Spec 2025-11-25 stabil, OAuth 2.1 mandaterat | ✅ Korrekt |
| 13 | Kyverno | CNCF Incubating, hybrid med OPA rekommenderas | ✅ Korrekt |
| 14 | llm-d | CNCF Sandbox 24 mars 2026, v0.5 pre-stable | ✅ Korrekt |
| 15 | MS Agent Governance Toolkit | MIT, 2 april 2026, 9500+ tester | ⚠️ Noterat i §12.5 |

## Källor

Se individuella research-filer:
- [sglang-vs-vllm-2026.md](sglang-vs-vllm-2026.md)
- [litellm-supply-chain-2026.md](litellm-supply-chain-2026.md)
- [dependency-risk-qdrant-neo4j-litellm.md](dependency-risk-qdrant-neo4j-litellm.md)
- [a-mem-agent-memory-2026.md](a-mem-agent-memory-2026.md)

Övriga källor:
- [DRA GA K8s 1.34](https://www.cloudkeeper.com/insights/blog/kubernetes-134-future-dynamic-resource-allocation-here)
- [KServe CNCF Incubating](https://thenewstack.io/kserve-joins-cncf-to-standardize-ai-model-serving-on-kubernetes/)
- [ArgoCD vs Flux 2026](https://dev.to/mechcloud_academy/the-gitops-standard-in-2026-a-comparative-research-analysis-of-argocd-and-fluxcd-46d8)
- [Backstage CNCF](https://www.cncf.io/projects/backstage/)
- [Agent Sandbox K8s blog](https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox/)
- [A2A 150+ orgs](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)
- [MCP spec](https://modelcontextprotocol.io/specification/2025-11-25)
- [llm-d CNCF](https://www.cncf.io/blog/2026/03/24/welcome-llm-d-to-the-cncf-evolving-kubernetes-into-sota-ai-infrastructure/)
- [MS Agent Governance Toolkit](https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/)
