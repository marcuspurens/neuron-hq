# KubeCon Europe 2026 — Key Takeaways

> Sökt 2026-04-12

## Huvudteman

### Inference = center of gravity
- 67% av all AI compute → inference (inte training)
- Inference-marknaden: $255B till 2030
- Skiftet från training-fokus till serving-fokus

### Production Gap
- 82% adopterar K8s för AI workloads
- **Bara 7% deployar AI dagligen**
- Problem: för dyrt eller för komplext att drifta
- "Inte svårt att bygga AI — svårt att hålla den igång"

### Standardisering > Proprietary
- Extend K8s primitives, inte ersätt med separat AI-plattform
- Accelerators, inference pipelines, agentic systems → native K8s

### Nyckeldonationer
- **llm-d** → CNCF sandbox (IBM, Red Hat, Google)
- **NVIDIA DRA-driver** → CNCF
- Båda signalerar: GPU-inferens blir en K8s-primitiv

### Agentic AI i produktion
- Agents redan i kluster med governance som inte designats för dem
- "Will authority and containment boundaries be defined before or after the first incident?"
- Workload identity, access control, traffic management, policy enforcement = nya krav

### DBOM — Data Bill of Materials
- Dataprovenienser och transformationsspårning = plattformskrav
- Observability skiftar: inference quality, data drift, behavioral signals (inte bara cost/latency)

## Företagsspecifikt
- Nutanix: GPU-as-a-service, K8s-as-a-service, agentic AI platform service
- Microsoft: Agent Governance Toolkit
- Pulumi: "Beyond YAML" — programmatic K8s config
- Simplyblock: "Building an Agentic-Ready Kubernetes Platform in 2026"

## Källor
- [Forrester: KubeCon EU 2026](https://www.forrester.com/blogs/kubecon-europe-2026-the-not-so-unseen-engine-behind-ai-innovation/)
- [Yahoo: AI Inference Center Stage](https://tech.yahoo.com/ai/articles/ai-inference-takes-center-stage-032333044.html)
- [codecentric: AI Agents Go to Production](https://www.codecentric.de/en/knowledge-hub/blog/kubecon-europe-2026-ai-agents-go-to-production)
- [SiliconANGLE: AI Execution Gap](https://siliconangle.com/2026/03/24/kubecon-europe-2026-ai-execution-gap-meets-cloud-native-reality/)
- [Tigera: Rise of AI Agents](https://www.tigera.io/blog/2026-the-rise-of-ai-agents/)
