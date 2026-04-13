# LiteLLM Supply Chain-attack — mars 2026

> Datum: 2026-04-13 | Källa: Review Pass 1 + websökning (session 6)

## Vad hände

24 mars 2026: komprometterade PyPI-versioner (1.82.7 och 1.82.8) publicerades efter att angripare (TeamPCP) stulit PYPI_PUBLISH-token via en trojaniserad Trivy GitHub Action i LiteLLMs CI/CD-pipeline.

- **Exponeringstid:** ~40 minuter innan PyPI satte karantän
- **Nedladdningar:** 40 000+
- **Payload:** Stal SSL/SSH-nycklar, cloud credentials, K8s-konfigurationer, API-nycklar, shell history, crypto wallets
- **Docker-användare:** Ej drabbade (Docker Hub-images var rena)

## Mitigering

- Pinna versioner, verifiera PyPI-signaturer
- Blockera automatiska uppdateringar
- Docker-image-only deployment rekommenderas
- Utvärdera Portkey/Kong som alternativ

## Källor

- [LiteLLM officiellt — Security Update](https://docs.litellm.ai/blog/security-update-march-2026)
- [Snyk — Poisoned Security Scanner](https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/)
- [Sonatype — Compromised litellm PyPI](https://www.sonatype.com/blog/compromised-litellm-pypi-package-delivers-multi-stage-credential-stealer)
- [InfoQ — PyPI Supply Chain Attack](https://www.infoq.com/news/2026/03/litellm-supply-chain-attack/)
- [Kaspersky — TeamPCP trojanization](https://www.kaspersky.com/blog/critical-supply-chain-attack-trivy-litellm-checkmarx-teampcp/55510/)
- [Wiz — TeamPCP analysis](https://www.wiz.io/blog/threes-a-crowd-teampcp-trojanizes-litellm-in-continuation-of-campaign)
