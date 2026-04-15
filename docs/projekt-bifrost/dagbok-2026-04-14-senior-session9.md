# Dagbok — Bifrost Session 9 (senior arkitekt)

> 2026-04-14 | Perspektiv: erfaren plattformsarkitekt

---

## Arkitekturförändringar

Inga. Session 9 var ren konsolidering — synka existerande text med v9.0-beslut. Ingen ny arkitektur, inga nya komponenter, inga nya trade-offs.

### Konsistens som arkitekturhygien

5 sektioner refererade fortfarande den pre-llm-d-världen:

| Sektion | Problemet | Arkitektursignifikans |
|---------|-----------|----------------------|
| §7.1-7.4 mönster | Inga fas 2-hänvisningar | Läsare av §7.1 missar att inference-arkitekturen ändras i fas 2 |
| §8.2 gränssnitt | "via LiteLLM" utan Envoy | Signalerar att gateway-migration inte är planerad |
| §15 autoscaling | Scale-to-zero saknade llm-d | llm-d:s inbyggda scale-to-zero är en nyckelkapabilitet |
| §23.5 uppgraderingar | Saknade llm-d, K8s Inf GW | Ops-teamet vet inte att nya komponenter behöver uppgraderingsstrategi |
| §11.1 Helm charts | "vLLM/KServe" utan llm-d | Helm-hierarkin matchar inte den faktiska deploy-topologin |

**Takeaway:** Ett arkitekturdokument som uppdateras inkrementellt (P1-P15 över 8 sessioner) ackumulerar inkonsistens. Konsolidering efter varje major-ändring borde vara standard — inte efterkonstruktion.

### Redundans — vad som var avsiktligt vs inte

Fyra oavsiktliga redundanser rensades. Men två *avsiktliga* behölls:

| Redundans | Beslut | Motivering |
|-----------|--------|------------|
| LiteLLM supply chain (ES vs §21.1) | Behåll | ES sammanfattar kort, §21.1 är kanonisk med CVE-detaljer. Olika detaljeringsnivå. |
| Operations-besparingar (§22 vs §23.8) | Behåll | §22 kvantifierar ekonomi (SEK/månad), §23.8 beskriver mekanism (decision tree). Olika perspektiv. |

**Princip:** Redundans som tjänar olika läsarroller är inte redundans — det är vy-generering i embryo.

### §25 — en mening som speglar hela arkitekturen

§25 (sammanfattande princip) är en enda mening. Den tjänar som litmustest: om en ändring i arkitekturen inte syns i §25, har antingen ändringen inte integrerats eller §25 har tappat relevans.

6 element saknades efter v9.0. Nu synkad. Men frågan kvarstår: är en mening rätt format? Vid 27 sektioner och 3476 rader blir meningen ohanterlig. Vy-designen (session 10) kan lösa detta.

## Vy-design — den intressantaste insikten

Marcus idé om tre dokumentversioner (C-level, dev, LLM) avslöjar ett arkitekturproblem: target-architecture.md försöker vara allt för alla. ES var ett första steg mot rollbaserade vyer, men resten av dokumentet blandar CTO-perspektiv med SRE-runbooks med SDK-kod.

**Lösning: en source of truth + genererade vyer.** Samma mönster som Bifrost-plattformen (en gateway, flera konsumenter).

Den intressanta frågan är LLM-vyn. Om Gemma 4 eller Qwen 3.5 ska använda arkitekturen behöver de inte prosa — de behöver strukturerad data (YAML/JSON-LD) med entydiga definitioner och relationer. Det är en ny typ av teknisk dokumentation som inte har etablerade mönster.

## Nästa session

Vy-design. Tre frågor att besvara:
1. Vilka sektioner hör till vilken vy? (mapping)
2. Hur genereras vyerna? (manuell, prompt, script)
3. Vad behöver en LLM som arbetskontext vs en som svarar på frågor?
