# Dagbok — Bifrost Session 8 (allmän)

> 2026-04-14 | För: alla som vill förstå vad som hände

---

## Vad gjordes

Sessionen började med en enkel verifieringsuppgift (P14: kolla om vLLM fortfarande är rätt val) och slutade med en djuprapport om AI-agenter, GPU-ekonomi och varför managed plattformar inte fungerar.

### 1. Inference-landskapet har skiftat

Marcus frågade "var inte vLLM ute?". Det ledde till en bred research som hittade tre saker vi inte visste:

- **llm-d** — ett nytt ramverk som bygger *på* vLLM men gör det Kubernetes-nativt. Separerar tunga beräkningar och textgenerering i olika containrar. Backas av Red Hat, AWS, NVIDIA, Google. Nu rekommenderat istället för "bevaka".
- **SGLang** — snabbare än vLLM, men har opatchade säkerhetshål som gör att angripare kan köra kod på GPU-servrarna. Kan inte användas förrän det fixas.
- **ShadowMQ** — en sårbarhet som kopierades mellan vLLM, SGLang och NVIDIA:s motor via copy-paste. 30+ säkerhetshål. Patchad i vLLM ≥0.11.1, men inte i SGLang.

### 2. Executive Summary

En auditor-granskning i förra sessionen flaggade att dokumentet (3400 rader) saknade en 10-minuters-sammanfattning. Nu finns en — med vad Bifrost är, hur det är byggt, vilka risker som finns, och var compliance-arbetet står per regelverk.

### 3. Kan Gemma 4 bygga Bifrost?

Marcus undrade om Googles nya öppna AI-modell (Gemma 4) kunde ersätta behovet av Claude/GPT. Svaret blev en rapport med överraskande fynd:

- **Claude API är billigare än en lokal GPU** vid normal användning
- **Erfarna utvecklare blir 19% långsammare med AI** enligt den enda kontrollerade studien (METR) — men tror de är snabbare
- **AI-kod har 1.7x fler buggar** i riktiga projekt
- **4 utvecklare med agenter** blir ~10-25% snabbare totalt, inte 2-3x som många tror
- **Gemma 4 kan bygga enskilda delar** (Kubernetes-filer, Python-scripts) men inte hålla ihop helheten

### 4. Managed plattformar funkar inte

Ursprungligen stod det i rapporten att managed (Azure AI, Google Vertex) kunde vara rätt val för små team. Marcus ifrågasatte det — med AI:s utvecklingstakt kan du inte vara beroende av vad en leverantör väljer att erbjuda. Anthropics Mythos-modell (den mest kapabla som finns) släpps inte ens publikt. Slutsatsen korrigerades: kontroll över din egen stack är det enda som skalar med utvecklingstakten.

### 5. Langfuse och timkostnad verifierade

Två snabba kontroller:
- Langfuse har inbyggd A/B-testning av prompts (bekräftat)
- 1000 SEK/h för en CGI-utvecklare stämmer (marknad: 800-1200 SEK/h)

## Viktigaste insikten

AI-verktyg snabbar upp *kodgenerering* men saktar ner *systemarbete*. Vinsten kommer inte från att skriva kod snabbare — den kommer från att strukturera arbetet så att agenter gör det repetitiva och människor gör det komplexa. Det är en organisationsfråga, inte en teknikfråga.
