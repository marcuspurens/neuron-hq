# Agent Memory + Workspace

> Sökt 2026-04-12

## A-MEM (Agentic Memory)
- NeurIPS 2025
- Zettelkasten-inspirerat: varje minne = nod med kontext, nyckelord, taggar, kopplingar
- Nya minnen triggar uppdateringar av existerande minnen
- Dubblar prestanda på multi-hop reasoning
- Kostnadseffektivt trots multipla LLM-anrop

### Tre minneslager
| Lager | Livslängd | Innehåll | Lagring |
|-------|-----------|----------|---------|
| Working Memory | Inom session | Kontext, tool results, resonemang | Redis / in-memory |
| Episodic Memory | Mellan sessioner | Erfarenheter, beslut, utfall | Vector + Graph DB |
| Semantic Memory | Permanent | Fakta, kunskapsgraf, domänförståelse | Knowledge Graph |

## HippoRAG
- Inspirerat av hippocampus indexeringsteori
- LLM = neocortex, Knowledge Graph = hippocampus, PPR = navigering
- +20% på multi-hop questions vs SOTA
- 10-20x billigare, 6-13x snabbare än iterativ retrieval
- HippoRAG 2: +7% associative memory, djupare passage-integration

## GraphRAG (Microsoft)
- Extraherar kunskapsgrafer ur text automatiskt
- Community-hierarkier + sammanfattningar
- 80% accuracy vs 50% för vanilla RAG (komplexa queries)
- 3.4x improvement på enterprise benchmarks
- LazyGraphRAG: lägre kostnad, samma kvalitet
- Mars 2026: senaste release med performance-optimeringar

## Kubernetes Agent Sandbox
- SIG Apps, annonserad 2026-03-20
- CRD för stateful, singleton agent-workloads

### Kärnresurser
- **Sandbox:** Core resource — isolerad agentmiljö
- **SandboxTemplate:** Blueprint med resource limits, base image, security
- **SandboxClaim:** Team begär sandbox, provisionering abstraheras

### Nyckelfunktioner
- gVisor / Kata Containers isolation (kernel + nätverk)
- Pause/resume (idle i timmar, vakna och fortsätt)
- Scale-to-zero (sparar resurser)
- PersistentVolumeClaim för workspace
- Stable identity

### Roadmap 2026-2027
- Firecracker & QEMU support (MicroVM)
- Ray & CrewAI integration
- Pydantic-based process isolation

## Agent Workspace — praktisk modell
```
Agent Sandbox
├── /workspace/code       (git checkout, iterativ kodning)
├── /workspace/output     (resultat, rapporter)
├── /workspace/scratch    (skrivyta, draft, iteration)
├── /workspace/artifacts  (genererade filer, images)
└── External Services (via NetworkPolicy)
    ├── LiteLLM Gateway
    ├── Vector DB (Qdrant)
    ├── Knowledge Graph (Neo4j)
    ├── Object Store (MinIO)
    └── Git
```

## Källor
- [A-MEM (NeurIPS 2025)](https://arxiv.org/abs/2502.12110)
- [A-MEM GitHub](https://github.com/agiresearch/A-mem)
- [HippoRAG](https://arxiv.org/abs/2405.14831)
- [HippoRAG 2](https://www.emergentmind.com/topics/hipporag-2)
- [GraphRAG (Microsoft)](https://github.com/microsoft/graphrag)
- [K8s Agent Sandbox](https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox/)
- [Agent Sandbox GitHub](https://github.com/kubernetes-sigs/agent-sandbox)
