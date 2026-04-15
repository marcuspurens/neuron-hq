# Dagbok — Bifrost Session 8 (LLM-komprimerad)

> 2026-04-14 | Format: komprimerat för framtida LLM-kontext

---

## Delta v8.0→v9.0

### Nya sektioner
- ES: Executive Summary (~80 rader, compliance-statusmatris fas 1/2/3, läsordning auditor)
- TOC: +ES, +auditor-läsordning

### Ändrade sektioner
- §2: Sexplans-diagram → llm-d + K8s Inference Gateway + Envoy
- §3b: ai-serving-zon utökad med llm-d-komponenter
- §6: Rubrik "LiteLLM → Envoy fas 2", diagram med llm-d routing, migreringstext
- §7.5: Routing-diagram omritat med K8s Inference Gateway + disaggregerade pods
- §7.6: Omskriven — llm-d rekommenderad (v0.5 GA), SGLang Hold (CVE-2026-3059/3060/3989), TGI deprecated (dec 2025), fasning fas 1→2→3
- §20.2: +1 attackvektor (ShadowMQ inference-motor supply chain, 30+ CVE:er, pickle/ZMQ)
- §20.4: +1 SIEM-event (ZMQ-deserialisering)
- §21.1: Envoy AI Gateway primärt LiteLLM-alternativ, rekommendation uppdaterad
- §22: +fotnot 1000 SEK/h verifierad (800-1200 SEK/h marknad, Unionen/Opsio)
- §23.9: Tech radar: vLLM Adopt, llm-d Trial→Adopt(fas2), SGLang Hold, KServe Adopt, K8s Inf GW Trial, Envoy Assess, TGI Hold(deprecated), LiteLLM Adopt(reservation)+Envoy backup
- §25: +hänvisning till ES
- §27.1: A/B-testning nyans — Langfuse trackar, applogik väljer variant
- §27.2: +adapter hot-loading-begränsning (switch mitt i kontext = KV-omberäkning), +Punica-mönster (12x throughput, 2ms/tok), +llm-d v0.5 cache-aware LoRA routing, +nya varianter (DoRA, LoftQ, PiSSA)

### Rollout v5.0
- Fas 1: +vLLM ≥0.11.1 krav
- Fas 2: +llm-d deployment, +K8s Inference Gateway, +Envoy-utvärdering, +RB-007, +SGLang-patchkontroll, +uppdaterad gateway-utvärdering
- Post90: llm-d "utvärdera"→"full disaggregering", "LiteLLM-beslut"→"Gateway-beslut"
- Risker: +ShadowMQ, LiteLLM-rad→Envoy

### Ny rapport
- `reports/gemma4-bifrost-build-feasibility.md`: 14§, 40+ källor
  - Gemma 4: 31B dense, 26B MoE, Apache 2.0, 256K kontext, 36-80 tok/s
  - METR: erfarna devs −19% med AI (n=16, RCT)
  - CodeRabbit: AI-kod 1.7x fler defekter (470 PR:er)
  - SWE-bench: 93.9% Verified vs ~50% Pro (kontaminering)
  - Claude API < lokal RTX 4090 i kostnad vid <2M tok/dag
  - TTFT (inte throughput) = flaskhals för agent-loopar
  - 4 devs + agenter = 10-25% snabbare, inte 2-3x
  - Managed = aldrig rätt val (Mythos + utvecklingstakt)

### Research (2 nya, totalt 22)
- research/inference-landscape-2026.md
- reports/gemma4-bifrost-build-feasibility.md

## Siffror
- Target arch: 3400→~3700 rader (+300)
- Rollout: +7 leverabler
- Research/reports: 22 filer totalt
- Gates: 5 körda, 10 fynd→10 fixar
- P7-backlog: TOM (P12-P15 klara)
