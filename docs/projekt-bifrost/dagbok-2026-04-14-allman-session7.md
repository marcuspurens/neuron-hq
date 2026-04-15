# Dagbok — Bifrost Session 7 (allmän)

> 2026-04-14 | För: alla som vill förstå vad som hände

---

## Vad gjordes

Förra sessionen avslutades med en formell granskning av arkitekturdokumentet som hittade 15 saker som saknades. 3 fixades direkt, 4 blev denna sessions uppgifter.

Denna session adresserade alla 4:

### 1. Felsökningsguide för utvecklare (§23.8)

Förut beskrev dokumentet hur *plattformsteamet* hanterar problem. Nu finns en guide för *utvecklare som använder plattformen* — de som dag 30 efter launch undrar varför deras AI-svar blivit sämre.

Guiden innehåller:
- Ett felsökningsträd: "Vad är problemet?" → "Kolla detta" → "Gör detta"
- De 6 vanligaste problemen med symptom och åtgärd
- En felkatalog: varje felkod teamet kan få, med förklaring och nästa steg
- En eskaleringsmatris: när löser du själv, när ringer du plattformsteamet?

**Nyckelinsikt:** Det största dag-30-problemet är sällan att AI:n svarar fel — det är att teamet inte kan *se* om den svarar fel. Observability-verktyg är viktigare än modellkvalitet.

### 2. Runbook-format (§23.1)

Varje komponent behöver en "instruktionsbok" som on-call-personen kan följa klockan 3 på natten. Sessionen definierade:
- Ett standardformat som alla runbooks ska följa
- Ett komplett exempel (vLLM slutar svara / tar slut på minne)
- En lista av 6 runbooks som behövs från dag 1

**Viktigaste fältet:** "Senast verifierad" — det fält som team oftast glömmer och mest ångrar.

### 3. Plattforms-evolution (§23.9)

Alla tidigare sessioner byggde *framåt*. Denna frågar: vad händer *efter* launch?

- **Tech Radar:** En karta över vilka tekniker plattformen använder, med 5 nivåer (Adopt → Trial → Assess → Hold → Deprecating). Uppdateras kvartalsvis.
- **Dependency-rotation:** Vad triggar att vi byter ut en komponent? Säkerhetsproblem, licensändring, bättre alternativ.
- **Notifiering:** Om en teknik fasas ut, hur vet teamen som använder den? Automatisk notifiering via Slack + SDK.
- **Team offboarding:** Vad händer när ett team slutar använda plattformen? 6 steg med compliance-koppling.

### 4. Prompt Management, Fine-Tuning & Context Assembly (§27)

Tre kapabiliteter som identifierades som saknade i granskningen:

- **Prompt Management:** Prompts (instruktionerna till AI:n) ska versioneras och hanteras som kod. Verktyget Langfuse, som redan finns i stacken, löser detta.
- **Fine-Tuning:** Hur anpassar vi AI-modeller till specifika uppgifter? QLoRA-teknik (kostnadseffektivt), med full säkerhetskoppling.
- **Context Assembly:** Istället för en traditionell "feature store" (databas med faktapunkter) visar vi att Bifrost redan har det som behövs — vektordatabas + kunskapsgraf + cache. Ingen ny komponent krävs.

### Bonusfixar (gate-fynd)

Leveransgate-systemet (kvalitetskontroll efter varje block) hittade 4 ytterligare luckor som fixades direkt:
- Operations-besparingar i affärsargumentet (~30K SEK/mån)
- Säkerhetshot kring fine-tuning (dataförgiftning)
- Deprecation-notifiering till konsumerande team
- Brygga mellan teamets felsökning och plattformens incidenthantering

## Var är vi nu?

- **Arkitekturdokument:** ~3400 rader, 27 sektioner. Från vision till compliance, operations, DX och evolution.
- **Rollout-plan:** 25 nya leverabler fördelade per fas.
- **Research:** 20 filer i repot.
- **Nästa:** Dokumentet börjar bli stort. Nästa session bör troligen handla om att *sammanfatta och konsolidera* snarare än lägga till mer.
