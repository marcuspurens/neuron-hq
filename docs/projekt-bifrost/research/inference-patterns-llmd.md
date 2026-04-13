# Inference-mönster + llm-d

> Sökt 2026-04-12

## Fyra distinkta mönster

### 1. Synkront API
- Klassificering, sentiment, extraction, korta svar
- p99 < 500ms, HPA på concurrency + latency
- Liten modell, hög throughput
- Timeout och reject vid överbelastning

### 2. Streaming (SSE)
- Chattar, kodgenerering, interaktiva assistenter
- TTFT p99 < 300ms
- Connection count + TTFT-baserad KEDA-skalning
- Continuous batching kritiskt
- Prefix caching: 30-60% TTFT-reduktion vid delad system prompt

### 3. Batch
- Embeddings, eval, syntetisk data, reindexering
- Throughput-baserat, timmar OK
- Kueue med kvoter, scale-to-zero
- Prioritet och fairness mellan team

### 4. Agent-loopar
- Kodagenter, research-agenter, autonoma arbetsflöden
- End-to-end minuter till timmar
- Pågående sessioner, inte requests/s
- 50k+ input tokens per steg typiskt
- Session-baserad concurrency limit
- Timeout-policy OBLIGATORISKT

## Inference-optimeringar (2026)
- PagedAttention: prefix caching + chunked prefill
- Continuous batching: per-token (inte per-sequence)
- FP8 quantization + Flash Attention 3 + speculative decoding → 5-8x cost-efficiency
- Prefix sharing: 30-60% TTFT-reduktion i agent-pipelines

## llm-d — CNCF Sandbox
- Donerat av IBM Research, Red Hat, Google Cloud, CoreWeave, NVIDIA
- Accepted mars 2026

### Kärna
- **Prefill/Decode Disaggregation:** splittar inference i prefill-pods och decode-pods
- **Inference-Aware Routing:** KV-cache state, pod load, hardware → smart routing
- **K8s-native:** LeaderWorkerSet (LWS), multi-node replicas, wide expert parallelism

### Performance
- ~3.1k tok/s per B200 decode GPU
- Upp till 50k output tok/s på 16×16 B200 topology
- Storleksordning bättre TTFT vs round-robin

### Relevans
- Prefill = compute-bound → rå GPU-kraft
- Decode = memory-bound → VRAM + bandbredd
- Separerar dem → oberoende skalning + GPU-optimering per fas

## Framework-jämförelse 2026
| Scenario | Framework |
|----------|-----------|
| Cloud high-concurrency | vLLM |
| Ultimate performance | TensorRT-LLM |
| Agent scenarios | SGLang |
| Mac local | oMLX |
| Local testing | Ollama |
| Mobile | MLC LLM |

## Källor
- [llm-d CNCF blog](https://www.cncf.io/blog/2026/03/24/welcome-llm-d-to-the-cncf-evolving-kubernetes-into-sota-ai-infrastructure/)
- [llm-d GitHub](https://github.com/llm-d/llm-d)
- [LLM Inference Optimization Playbook](https://www.runpod.io/articles/guides/llm-inference-optimization-playbook)
- [Morphe LLM Inference Guide](https://www.morphllm.com/llm-inference)
- [Anyscale Continuous Batching](https://www.anyscale.com/blog/continuous-batching-llm-inference)
