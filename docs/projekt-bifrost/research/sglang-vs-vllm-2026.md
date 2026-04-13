# SGLang vs vLLM — april 2026

> Datum: 2026-04-13 | Källa: Review Pass 1 (session 6)

## Sammanfattning

SGLang har per april 2026 gått om vLLM i throughput för agentic workloads. ~29% högre throughput/$ på H100 enligt MorphLLM/SemiAnalysis-benchmarks. SGLang optimerar specifikt för multi-turn, tool-calling och agent-loopar.

vLLM är fortfarande stark för generell inferens (sync + streaming). llm-d (CNCF sandbox) wrappar vLLM.

## Relevans för Bifrost

- Agent Plane (mönster 4) bör utvärdera SGLang i fas 2
- Om SGLang leder fortsatt kan det påverka llm-d-valet
- vLLM behålls som default för mönster 1-3

## Källor

- [SGLang vs vLLM 2026 — MorphLLM](https://www.morphllm.com/comparisons/vllm-vs-sglang)
- [Open-source inference engines compared 2026](https://fish.audio/blog/open-source-llm-inference-engines-2026/)
- [llm-d CNCF Sandbox — mars 2026](https://www.cncf.io/blog/2026/03/24/welcome-llm-d-to-the-cncf-evolving-kubernetes-into-sota-ai-infrastructure/)
