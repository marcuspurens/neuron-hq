# Research: Runbook-format & Plattforms-evolution

> Datum: 2026-04-13 | Session: Bifrost #7 | Källa: Träningsdata (ej websökning)

## Runbook-standardformat

### Google SRE-format
1. Title
2. Overview
3. Prerequisites
4. Alert/trigger description
5. Diagnosis steps (decision tree)
6. Mitigation steps
7. Escalation path
8. Rollback procedure
9. Post-incident review link

**Princip:** Skriven för on-call-ingenjören klockan 3 — ingen tvetydighet, ingen prosa.

### PagerDuty-format
1. Service name
2. Severity classification
3. Symptoms
4. Investigation steps (med exakta kommandon)
5. Resolution steps
6. Communication template
7. Timeline expectations (acknowledge i X min, resolve i Y min)

### Obligatoriska fält (båda format)
- **Ownership** — vem äger denna runbook
- **Last verified date** — det fält team oftast skippar och mest ångrar
- **Prerequisites/access** — vad behöver on-call ha åtkomst till
- **Steg-för-steg-diagnos** — exakta kommandon
- **Eskaleringskedjor** — vem och när
- **Rollback-procedur** — hur återställer du

## Plattforms-evolution / Tech Radar

### Tech Radar-modellen
Ursprung: ThoughtWorks. Visualisering med fyra ringar:

| Ring | Betydelse |
|------|-----------|
| **Adopt** | Standardval, använd aktivt |
| **Trial** | Godkänt för pilotprojekt, utvärdering pågår |
| **Assess** | Intressant, undersök — ännu ej testat |
| **Hold** | Använd inte för nya projekt |
| **Deprecating** | (tillagt av plattformsteam) Aktiv avveckling, migrationsplan krävs |

**Uppdateringsfrekvens:** Kvartalsvis.
**Värde:** Gör implicita teknikbeslut explicita.

### K8s-uppgraderingskadans
- Mogna team kör **N-1** (en version bakom latest)
- Uppgraderingscykel: kvartalsvis, alignat med K8s release-kadans
- Dependency-rotation (deprecated APIs, Helm charts, cert-rotation) = **schemalagt underhåll**, inte projekt

### Arkitektur-review
- Var 6:e månad för plattformsteam
- Inte full omdesign — review av: vilka antaganden förändrades, vad gick sönder oväntat, vad skalade sämre än väntat

## AI-plattform tech debt (6-12 månader post-launch)

Vanliga upptäckter:
1. **Modellversionering svårare än väntat** — underinvestering i reproducerbarhet och rollback
2. **Observability-gap** — traditionell APM fångar inte modellspecifika metrics
3. **Prompt/config-drift** — ingen vet vad som körs i produktion
4. **Kostnadsöverraskningar** — token-kostnader skalar icke-linjärt med adoption
5. **Evaluerings-skuld** — inget systematiskt sätt att mäta output-kvalitet

**Mönster:** Team optimerar för "få det att köra" och skjuter upp observability, versionering och kostnadsattribution — samma tre saker som blir de största smärtpunkterna.
