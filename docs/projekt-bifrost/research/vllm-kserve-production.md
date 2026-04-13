# vLLM + KServe: Production Deployment

> Sökt 2026-04-12

## vLLM Best Practices
- Pinna specifik Docker image tag
- Konfigurera `--max-model-len` och `--gpu-memory-utilization` för KV-cache vs OOM
- Startup/readiness/liveness probes
- Topology spread + GPU resource limits
- Aktivera PagedAttention: prefix caching + chunked prefill
- Prefix caching reducerar TTFT 30-60% vid delad system prompt

## KServe Integration
- InferenceService CRD ger autoscaling, routing, canary rollouts
- KEDA-baserad autoscaling för generativ inferens (Prometheus: pågående requests)
- Knative-läge: scale-to-zero, revisionsbaserade canary-rollouts
- OpenAI-spec support

## Monitoring
- TTFT p99, KV-cache utilization, request queue depth
- Prometheus + Grafana dashboards
- Load-test med benchmark_serving.py innan produktion

## API & Autoscaling
- OpenAI-kompatibelt API med miljöbaserad autentisering
- KEDA triggered av per-replica queue depth
- Guided decoding för strukturerad output

## Sources
- [vLLM Production Guide 2026](https://www.sitepoint.com/vllm-production-deployment-guide-2026/)
- [vLLM KServe integration](https://docs.vllm.ai/en/stable/deployment/integrations/kserve/)
- [Red Hat: KServe autoscaling vLLM KEDA](https://developers.redhat.com/articles/2025/09/23/how-set-kserve-autoscaling-vllm-keda)
- [PremAI: Deploying LLMs on K8s](https://blog.premai.io/deploying-llms-on-kubernetes-vllm-ray-serve-gpu-scheduling-guide-2026/)
