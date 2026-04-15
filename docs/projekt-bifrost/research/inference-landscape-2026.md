# Research: Inference Server Landscape 2026

> Forskningsdatum: 2026-04-13 | Projekt Bifrost | Syfte: P14-verifiering + bredare landskapsanalys
> Metod: Bred explorativ sökning (20+ queries), inte bara bekräftande

---

## Executive Summary

Tre stora överraskningar jämfört med Bifrosts nuvarande arkitektur (v8.0):

1. **llm-d** — Kubernetes-nativ disaggregerad inference (vLLM + K8s Inference Gateway). Fanns inte när arkitekturen skrevs. Nu standard för K8s-plattformar.
2. **ShadowMQ** — Copy-paste-sårbarheter spreds mellan vLLM, SGLang, TensorRT-LLM, Modular Max (30+ CVE:er). Pickle-deserialisering över ZeroMQ.
3. **SGLang har opatchade RCE-sårbarheter** (CVE-2026-3059, 3060, 3989) — kan inte exponeras mot nätverket utan härdad proxy.

---

## 1. De tre stora inference-motorerna

### vLLM (v0.11.1+)
- **Status:** Fortfarande bredast stöd (GPU, modeller, ekosystem). MRV2-rewrite pågår (GPU-nativ, async-first).
- **Styrkor:** Multi-hardware (NVIDIA, AMD, Intel, TPU), störst community (74.9K stars, 2000+ bidragsgivare)
- **Svagheter:** Inte optimerad för KV-cache-tunga workloads (multi-turn, RAG)
- **Säkerhet:** CVE-2025-62164 (memory corruption, CVSS 8.8), CVE-2025-66448 (RCE via model config). Patchade i v0.11.1.
- **Adapter hot-loading:** LoRA stöds. Multi-tenant via Punica-mönstret (12x throughput). Men dynamisk adapter-switching mitt i inference = arkitektonisk begränsning (kräver KV-cache-omberäkning).
- **Confidence:** HÖG

### SGLang (v0.5.8)
- **Status:** Prestandaledare för RAG/chat-workloads. RadixAttention ger 6.4x vinst på prefix-tunga arbetsbelastningar.
- **Adoption:** xAI (Grok 3), Microsoft Azure, Cursor, 400K+ GPU:er
- **Styrkor:** KV-cache-återanvändning via radix tree, strukturerad generering
- **Svagheter:** 
  - **KRITISK: Opatchade RCE-sårbarheter** (CVE-2026-3059, 3060, 3989). Maintainers har inte svarat på coordinated disclosure.
  - Saknar governance-features (kvoter, rate limiting, audit logging)
- **Confidence:** HÖG (prestanda), KRITISK (säkerhet)

### TensorRT-LLM
- **Status:** NVIDIA:s proprietära motor. 15-30% snabbare vid låg concurrency.
- **Kräver:** Kompileringssteg, NVIDIA-only
- **Säkerhet:** Också drabbad av ShadowMQ (CVE-2025-23254)
- **Confidence:** MEDEL — bra för mikro-benchmarks, mindre bevisad storskaligt

---

## 2. Den stora nyheten: llm-d

**Vad det är:** Kubernetes-nativt ramverk för disaggregerad LLM-inference. Separerar prefill (compute-tung) och decode (minnes-tung) i olika pods.

**Komponenter:**
- vLLM som model server
- Kubernetes Inference Gateway som kontrollplan
- Disaggregering-scheduler som routar requests dynamiskt
- OpenTelemetry-tracing inbyggd

**Prestanda (v0.4-0.5):**
- 40% reduktion i per-token-latency (DeepSeek V3.1 på H200)
- Cache-aware LoRA routing
- Active-active high availability
- Scale-to-zero autoscaling

**Varför det är relevant för Bifrost:**
- Kubernetes-first design — exakt vad Bifrost bygger
- Disaggregering är nu default-mönstret, inte experimentellt
- Observability inbyggd (Prometheus + OTel)
- Multi-cluster-stöd
- Backas av Red Hat, AWS, NVIDIA, Google

**Confidence:** HÖG — CNCF-projekt, hyperscaler-backning

**Källor:** [llm-d GitHub](https://github.com/llm-d/llm-d), [Red Hat Developer](https://developers.redhat.com/articles/2025/05/20/llm-d-kubernetes-native-distributed-inferencing), [AWS Blog](https://aws.amazon.com/blogs/machine-learning/introducing-disaggregated-inference-on-aws-powered-by-llm-d/), [NVIDIA Blog](https://developer.nvidia.com/blog/deploying-disaggregated-llm-inference-workloads-on-kubernetes/)

---

## 3. KServe (v0.15, juni 2025)

- **Stödjer:** vLLM ✅, TGI ⚠️ (deprecated), TensorRT-LLM ✅
- **Nytt:** Envoy AI Gateway-integration, förbättrad KV-caching
- **SGLang:** Inte officiellt stödd av KServe (kräver custom runtime)
- **llm-d:** Integrerar med KServe:s Inference Gateway

**Confidence:** HÖG

---

## 4. Proxy/Gateway-lagret

### LiteLLM
- Fortfarande vanligast (~50% av organisationer)
- Problem vid skala: minnesläckor, latency overhead
- Open source-versionen saknar autentisering, audit logging, policies

### Nytt alternativ: Envoy AI Gateway
- Kubernetes-nativ, integrerad med K8s Inference Gateway
- AI-medveten lastbalansering (KV-cache-utnyttjande, ködjup)
- 30% kostnadsbesparing, 60% lägre tail-latency vs traditionell LB
- Relativt nytt men backat av CNCF

### Andra alternativ
| Gateway | Styrka | Svaghet |
|---------|--------|---------|
| Portkey | Enterprise observability, caching | Hosted/managed |
| Kong AI Gateway | Policy engine, K8s | Operationell komplexitet |
| Helicone | OpenAI-kompatibel, full observability | Mindre mogen |

**Rekommendation för Bifrost:** Envoy AI Gateway (K8s-nativ, alignar med llm-d)

---

## 5. Säkerhetslandskapet

### ShadowMQ-mönstret (nov 2025)
vLLM använde unsafe pickle-deserialisering för ZeroMQ-kommunikation. SGLang kopierade koden. NVIDIA TensorRT-LLM kopierade från båda. Modular Max Server kopierade från alla.

**Resultat:** 30+ kritiska sårbarheter i 4 stora projekt, alla från kod-återanvändning.

**Drabbade:**
- vLLM (CVE-2025-30165, CVSS 8.0) — patchad
- SGLang — **INTE fullt patchad** (april 2026)
- TensorRT-LLM (CVE-2025-23254) — patchad
- Modular Max Server (CVE-2025-60455) — patchad

**Implikation:** Nätverksisolering är obligatoriskt, inte nice-to-have. Aldrig exponera ZeroMQ-sockets mot opålitliga nätverk. Använd JSON/protobuf, inte pickle.

### Övriga CVE:er
- LangChain Core: CVE-2025-68664 (CVSS 9.3) — serialiseringsinjection
- spacy-llm: CVE-2025-25362 — SSTI i prompt-templates

**Confidence:** HÖG (bekräftade CVE:er, coordinated disclosure)

---

## 6. EU AI Act — krav på inference-lagret

**Hårda krav:**
- **Inference log** = permanent logg av alla inferenser (input, output, modell, metadata)
- Måste möjliggöra **rekonstruktion av beslutsväg**
- Måste fånga **mänskliga åtgärder och override-beslut**
- Krävs för alla högrisk-AI-system

**Implikation för Bifrost:**
1. Logging-lager krävs (vLLM/SGLang har inte det inbyggt)
2. Retention: 7 år (regulatorisk default för finans, HR)
3. Privacy by design — on-premise inference starkt rekommenderad
4. Multi-tenant-isolering — logging måste vara tenant-medveten

---

## 7. Adapter-serving (LoRA/QLoRA)

### Hot-loading — det verkliga problemet
LoRA är inte optimerad för dynamisk switching. När adapter byts mitt i kontext → alla kontext-tokens måste beräknas om.

### Multi-tenant-mönster
- **Punica:** 12x throughput, 2ms extra latency per token, CUDA kernel batching
- **Merged LoRA:** Noll extra latency, men dyrt att merge/unmerge
- **Unmerged LoRA:** Skalbar, men 2-5ms extra per token

### Nya varianter
- DoRA (Decomposed LoRA) — bättre parametereffektivitet
- LoftQ — quantization-aware fine-tuning
- PiSSA — parameter-isolated subspace tuning

**Confidence:** MEDEL-HÖG

---

## 8. Olösta problem (inget ramverk löser)

1. **Abstention/osäkerhet** — LLM:er kan inte tillförlitligt vägra svara på obesvarbara frågor. Reasoning fine-tuning *försämrar* abstention med 24%.
2. **Kostnadsprediktering** — Ingen praktisk metod att förutsäga token-konsumtion i förväg.
3. **LLM-evaluering** — Offline-metrics förutsäger inte online-beteende.
4. **Kapacitetsplanering** — KV-cache-användning är modell- och request-beroende. Inga standardverktyg.
5. **Explainability logging** — EU AI Act kräver det, men inference-motorer loggar bara I/O.

---

## 9. HuggingFace TGI — deprecated

TGI gick i maintenance mode december 2025. HuggingFace rekommenderar själva vLLM eller SGLang. Bifrost bör ta bort TGI som alternativ om det nämns.

---

## 10. Kostnadstrender

- GPT-4-ekvivalent prestanda: $20/Mtok (2022) → $0.40/Mtok (2026) = 40x/år
- H100 cloud: ~$3.00/h (ned från $7-8/h 2024)
- Self-hosted break-even: inom 6-12 månader vid organisationsskala (3000 anställda)
- Gartner: inference-kostnad sjunker 90% till 2030 vs 2025

---

## 11. Jämförelsematris

| Feature | vLLM | SGLang | TensorRT-LLM | llm-d |
|---------|------|--------|--------------|-------|
| Throughput (hög concurrency) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Kubernetes-nativ | ⚠️ Basic | ⚠️ Basic | ❌ | ✅ Nativ |
| Disaggregering | ⚠️ Experimentell | ✅ | ⚠️ Begränsad | ✅ Default |
| Multi-tenant LoRA | ✅ | ⚠️ Partiell | ⚠️ Via Triton | ✅ (v0.5) |
| Governance/kvoter | ❌ (proxy) | ❌ (proxy) | ❌ (proxy) | ✅ Integrerad |
| Observability | ⚠️ Basic | ⚠️ Basic | ⚠️ Basic | ✅ OTel inbyggd |
| Säkerhetspatchar | ✅ Aktiv | ⚠️ Halkar efter | ✅ Aktiv | ✅ Ny |
| Vendor lock-in | Agnostisk | Agnostisk | 🔒 NVIDIA | Agnostisk |

---

## 12. Rekommendation för Bifrost

### Primär inference-stack
**llm-d + vLLM v0.11.1+** (ersätter "bara vLLM" i target architecture)
- Kubernetes-nativ disaggregering
- Observability inbyggd
- Säkerhetspatchar uppdaterade
- Cache-aware LoRA routing

### Gateway-lager
**Envoy AI Gateway** (utvärderas som alternativ/komplement till LiteLLM)
- AI-medveten lastbalansering
- K8s Inference Gateway-integration
- 30% kostnadsbesparing

### SGLang
**Bevaka, inte deploya** — opatchade RCE:er blockerar nätverksexponering. Om/när patchade → utvärdera som sekundär motor för RAG-workloads.

### Säkerhetshärdning
- vLLM ≥0.11.1 obligatoriskt
- Nätverksisolering obligatoriskt (aldrig exponera ZMQ)
- JSON/protobuf, aldrig pickle
- Service mesh (Istio) med mTLS

---

## Källor

Se inline-länkar ovan. Totalt ~30 källor konsulterade.
