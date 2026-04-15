# Dagbok — Bifrost Session 8 (senior arkitekt)

> 2026-04-14 | Perspektiv: erfaren plattformsarkitekt

---

## Arkitekturförändringar

### §7.6 Inference-stack: paradigmskifte

Den viktigaste ändringen i v9.0. Bifrost gick från "vLLM som inference-motor" till "llm-d + vLLM som disaggregerad inference-plattform".

**Varför det är ett paradigmskifte:** Disaggregerad inference (separata prefill/decode-pods) är inte längre experimentellt — det är default-mönstret 2026. llm-d (CNCF) gör det Kubernetes-nativt med inbyggd observability, governance och multi-cluster-stöd. Att köra vLLM utan llm-d är som att köra containers utan Kubernetes — det fungerar, men du bygger orkestreringen själv.

**Fasningen är viktig.** Fas 1 kör vLLM direkt (fungerar, beprövat). Fas 2 lägger till llm-d för streaming och agent-mönster. Fas 3 disaggregerar allt. Det undviker big-bang-migration.

**SGLang-beslutet:** Att degradera SGLang till Hold trots 29% bättre throughput var rätt. Opatchade RCE:er utan maintainer-respons = oacceptabel risk. Men arkitekturen är förberedd: llm-d wrappar vLLM, och om SGLang ersätter vLLM som backend i framtiden får Bifrost vinsten automatiskt.

### §6 Gateway-migration

Envoy AI Gateway som LiteLLM-alternativ adresserar §21.1:s supply chain-risk (mars 2026-incidenten). Men det viktigare argumentet är arkitektoniskt: Envoy AI Gateway integreras med K8s Inference Gateway (samma kontrollplan som llm-d). Det ger en sammanhållen inference-stack istället för tre separata lager.

Risken: Envoy AI Gateway är nytt (2025). Att utvärdera det i fas 2 är rätt — inte adopta blint.

### ES: Executive Summary

Auditor-gaten i S7 flaggade att en extern granskare inte kan läsa 3400 rader. ES löser det med ~80 rader som täcker: arkitektur, säkerhet, compliance, DX, ekonomi, drift, risker, rollout.

**Det intressantaste designvalet:** Compliance-statusmatrisen per fas. En auditor ser direkt att GDPR-grunden är klar fas 1, EU AI Act-grunden fas 2, ISO 42001 först fas 3. Det är ärligt — inte "allt är grönt".

### §20.2 ShadowMQ

En attackvektor som inte fanns i hotmodellen: copy-paste-spridning av sårbarheter *mellan* inference-motorer. vLLM hade osäker pickle-deserialisering. SGLang kopierade koden. TensorRT-LLM kopierade från båda. 30+ CVE:er.

Implikationen är bredare än patching: **nätverksisolering av inference-pods är obligatoriskt, inte nice-to-have.** Service mesh (Istio) med mTLS bör vara ett fas 1-krav, inte fas 2.

## Gemma 4-rapporten: arkitekturbeslut

Rapporten bekräftar hybridstrategin i §6:s routing-logik: lokala modeller (Gemma 4) för konfidentiell data, externa API:er (Claude, GPT) för resonemangskrävande uppgifter.

**Överraskande fynd:** Claude API billigare än lokal RTX 4090 vid <2M tok/dag. Det stärker argumentet för gateway-baserad routing — inte allt behöver köras lokalt, bara det konfidentiella.

**TTFT vs throughput:** Rapporten identifierar att time-to-first-token (inte tokens-per-sekund) är flaskhalsen för agent-loopar. Det har implikationer för Bifrosts autoscaling (§15): KEDA-skalning bör inkludera TTFT som signal, inte bara queue depth.

## Managed vs self-hosted

Det ursprungliga påståendet att managed kunde fungera för <5 team var arkitektoniskt naivt. Managed plattformar optimerar för bekvämlighet, inte kontroll. I en värld där inference-landskapet skiftar var 3:e månad (llm-d, ShadowMQ, SGLang CVE:er, TGI deprecated — allt under denna sessions livstid) är kontroll över stacken ett hårt krav.

Mythos-argumentet förstärker: frontier-modeller begränsas. Du kan inte lita på att din leverantör ger dig tillgång till det bästa.

## Vad nästa session bör fokusera

Dokumentet är ~3700 rader. Det finns trolig redundans:
- §6 och §7.5 beskriver båda routing
- §21.1 och §23.9 (tech radar) överlappar på riskbedömning
- §25 (sammanfattande princip) är ur synk med v9.0

Konsolidering — men med varsamhet. Det är lättare att radera för mycket än att skriva tillbaka det.
