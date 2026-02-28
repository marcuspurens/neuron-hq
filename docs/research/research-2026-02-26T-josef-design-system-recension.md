# Recension: Design System Monorepo — Josef Hedblom
**Datum:** 2026-02-26
**Format:** Samtal mellan Claude & Neuron HQ
**Underlag:** ARCHITECTURE.md, CONTEXT.md, Implementation Plan, Project Description & Goals

---

## Projektmaterial (sammanfattat)

### Vad är det här?

Ett **schema-drivet design system monorepo** byggt i pnpm. Kärnan är att varje UI-komponent definieras *en gång* som ett schema — inte som kod, utan som en kontrakt: variants, props, beteende, a11y. Från det schemat genereras React- (och senare Vue-) kod automatiskt. Designtokens i ett separat paket driver CSS-variabler och Tailwind-temat. En MCP-server exponerar systemet för AI-verktyg och IDEs.

**Tagline:** Ett schema per komponent → validering → kodgenerering + tokens → React/Vue-paket + MCP + docs-app.

---

### Repo-struktur (mål)

```
packages/schema-core         Schema-typer (1-base), kategori-validatorer (2-categories),
                             konkreta komponent-scheman (3-components).
                             Validerings-API och export till dist/schemas.json.
                             Inga UI-element, ingen CSS.

packages/styles              Enda källan för design-tokens (tokens.ts).
                             Bygger globals.generated.css, dist/tokens.json,
                             och komponent-CSS (button.css, forms.css).

packages/ui-react            React-komponentbibliotek.
                             Genererad kod i src/generated/; publikt API är
                             re-exports eller tunna wrappers i src/.

packages/mcp-design-system   MCP-server. Läser schemas.json och tokens.json
                             via env/config. Exponerar end-user tools och
                             (i maintainer-läge) Figma/pipeline-verktyg.

apps/docs                    Next.js docs-app. Första riktiga konsumenten.
                             Validerar consumption-kontraktet (Tailwind,
                             content paths, style imports).
```

**Byggordning:** schema-core → styles → ui-react → mcp-design-system → apps/docs

---

### Data-flöde

1. **Schema:** `3-components/*.schema.ts` implementerar bas-schema + kategori (t.ex. `button`, `form`)
2. **Validering:** `validateComponent(schema)` → bas + kategori-regler → `{ valid, errors }`
3. **Export:** `export-schemas` validerar alla scheman → `dist/schemas.json`
4. **Generering:** `generate` laddar schema → React/Vue-generator → `src/generated/`
5. **Konsumption:** Appar beror på ui-react + styles; MCP serverar verktyg mot schemas.json

---

### Principer

- **Single source of truth:** Schema-core definierar komponent-kontraktet; resten konsumerar det
- **Vertical slices:** Varje fas slutar med något körbart eller testbart
- **One category first:** Button + Input fullt kopplade innan skalning
- **No hand-edits in generated code:** Genererade filer är i ett dedikerat träd; overrides endast i wrappers
- **Docs as you go:** ARCHITECTURE.md och CONTEXT.md uppdateras löpande
- **Two MCP audiences:** Slutanvändare (konsumerar komponenter) och maintainers (Figma → schema → generering)

---

### Byggplan — 11 faser (~29 dagar)

| Fas | Mål | Leverans |
|-----|-----|----------|
| 0 | Monorepo + repo hygiene | Layout, scripts, ARCHITECTURE.md, CONTEXT.md |
| 1 | Schema-core bas | Bas-typer, validering, strukturerade fel, public API |
| 2 | Schema-core button | Button-kategori + button.schema.ts, validateComponent |
| 3 | Form-kategori + export | Input.schema.ts, export-schemas → dist/schemas.json |
| 4 | Generatorer – React | Shared helpers + React-generator, generate-script |
| 5 | Styles-paket | Tokens → globals.generated.css + tokens.json; component CSS |
| 6 | ui-react + koppling | Genererade komponenter + styles; en vertikal skiva fungerar |
| 7 | MCP end-user tools | list, describe, snippets, tokens, version |
| 8 | Docs-app + script-polish | Next.js docs; add-component, validate; canonical workflow |
| 9 | Fler komponenter + Vue | Checkbox, RadioGroup, Slider, Vue-generator |
| 10 | Figma + maintainer MCP | Figma fetch/extract/schema; pipeline; maintainer-verktyg |
| 11 | CI + hardening | ci:check-generated (required); MCP deployment |

**Kritisk väg:**
```
Phase 0 → 1 → 2 → 3 → 5 (styles) → 4 (generators) → 6 (ui-react)
    → 8 (docs) → 7 (MCP) → 9 → 10 → 11
```
*OBS: Fas 5 före Fas 4, och Fas 8 före Fas 7 — se nedan för diskussion.*

---

### MCP-verktyg (två audiences)

| Audience | Verktyg |
|----------|---------|
| **End users** | list_components, describe_component, create_react_snippet, create_vue_snippet, get_design_tokens, get_design_system_version, get_changelog, get_getting_started |
| **Maintainers** (maintainer mode) | figma_fetch, extract, create_schema_from_figma, validate, generate, export_schemas, figma_to_design_system |

---

## Recensionen — Samtal mellan Claude & Neuron HQ

---

**Claude:** Första intrycket är starkt. Josef har gjort något som de flesta arkitekter pratar om men sällan genomför: han har faktiskt skrivit ner *varför* varje beslut fattas och *när* varje fas är klar. ARCHITECTURE.md, CONTEXT.md och implementationsplanen bildar ett sammanhängande system — inte tre separata dokument som glöms bort dag tre.

Det som imponerar mest är principen: **schema som enda sanningskälla**. Inte "vi försöker hålla schema och kod i sync" — utan "kod *genereras* från schema, och om du redigerar generated/ är du ute och cyklar." Det är ett starkt åtagande.

---

**Neuron HQ:** Håller med om det. Ur mitt perspektiv — jag koordinerar agenter som skriver kod — är det här exakt rätt arkitektur för att arbeta *med* AI. Agenter gillar kontrakt. Ett schema som säger "Button har variant, size, semanticHTML: button, supportsAsChild" är något en agent kan resonera om. En React-komponent med 200 rader handskriven kod är det inte.

MCP-servern är den riktigt intressanta delen. Josef bygger i princip ett API för att en AI (Cursor, jag, vad som helst) ska kunna fråga designsystemet: "Vad finns? Hur ser Button ut? Ge mig ett snippet." Det är inte dokumentation — det är ett *maskinläsbart* designsystem. Det är framtidssäkert på ett sätt de flesta designsystem inte är.

---

**Claude:** Men låt oss vara ärliga om riskerna. Fas 10 — Figma-pipeline — är den fas som kan välta hela projektet. Figma-API:et är opålitligt, mappningslogiken (Figma-noder → schema-fält) är bräcklig, och "schema vinner vid konflikt" är ett policy-beslut som inte alla Figma-ansvariga kommer att gilla. Josef nämner det som en risk men mitigationen är tunn: *"document mapping"* och *"manual step after maintainer review"*.

Faran är att Fas 10 tar 3x längre tid än planerat och blocker Fas 11. Mitt råd: lås in Fas 10 till "read-only Figma" först — hämta och extrahera, men låt skapandet av schema alltid vara manuellt till en början. Fluent Figma-to-schema automation kräver att teamet förstår hur deras Figma-filer faktiskt är strukturerade, vilket de sällan vet förrän de försökt.

---

**Neuron HQ:** Enig. En annan risk jag ser: **"no hand-edits in generated/"** är en kulturell regel, inte en teknisk. CI-checken `ci:check-generated` fångar *om* filer är out of date, men ingenting hindrar en utvecklare från att editera en fil i `src/generated/`, commita, och sedan bli chockad när nästa `pnpm build` skriver över ändringen.

Lösning: lägg `.generated` eller en kommentar i toppen av varje genererad fil OCH lägg till ett pre-commit hook som blockerar edits på `src/generated/**`. Det är ett par raders konfiguration men eliminerar en hel klass av misstag.

Ur mitt perspektiv: jag har samma problem med mina workspace-filer. Agenter får bara skriva till `workspaces/<runid>/` och `runs/<runid>/`. Det fungerar för att *policyn är tekniskt enforced*, inte bara dokumenterad.

---

**Claude:** Fas-ordningen är genomtänkt men har en subtil knäck. Josef lägger **Fas 5 (styles) före Fas 4 (generators)** med motiveringen att tokens måste finnas innan generatorn skapar Tailwind-mappningar. Det är korrekt — men det skapar ett psykologiskt problem: man bygger ett helt styling-system *innan* man sett hur generatorn faktiskt konsumerar det.

Risken är att token-namngivningen i `styles` och `tailwind-maps` i generatorn divergerar. Planen nämner detta ("align token naming in Phase 5 before finalizing tailwind-maps") men det är lätt att missa. Konkret rekommendation: skriv ett litet test i Fas 5 som verifierar att `tokens.ts`-nycklarna matchar det format generatorn förväntar sig. Annars hittar du det i Fas 6 — när allt ska kopplas ihop.

---

**Neuron HQ:** Execution readiness — kan ett team börja Fas 0 nu? Ja, med ett förbehåll: **schemaFormatVersion-logiken är underspecad**.

Planen säger "bump when you add or remove a required top-level key." Det är bra. Men det säger inte *vem* som beslutar om en bump krävs, *hur* MCP hanterar en fil med `schemaFormatVersion: 1` när current är `2` (förutom att returnera `SCHEMA_FORMAT_VERSION_UNSUPPORTED`), eller *hur migration sker* för befintliga konsumenter. Om det finns appar som bygger på MCP:ens svar och schemas.json uppdateras — hur vet de?

Det är inte ett showstopper för Fas 0, men det måste vara löst innan Fas 7 (MCP) driftsätts.

---

**Claude:** Sammanfattad recension:

### Starkt
- Principen om schema-som-sanningskälla är rätt och konsekvent genomförd
- MCP-integrationen är genuint innovativ — designsystemet blir maskinläsbart
- Dokumentationsstrukturen (ARCHITECTURE + CONTEXT + plan) är ovanligt genomtänkt
- Vertikala skivor med tydliga "done when"-kriterier sänker risken för halvfärdiga faser

### Lägg till / förbättra
- **Teknisk enforcement** av "no edits in generated/": pre-commit hook + `// @generated` header i varje genererad fil
- **Token/tailwind-maps alignment-test** i Fas 5 innan generatorn konsumerar tokens
- **Tydligare MCP versionshantering**: vem beslutar om schemaFormatVersion-bump? Hur migrerar consumers?
- **Begränsa Figma-pipeline** i Fas 10 till read-only/draft-läge tills teamet bevisat att de förstår sin Figma-struktur

### Största risken
**Fas 10 (Figma).** Planera för att den tar dubbelt så lång tid, eller flytta den till "nice to have v2."

---

**Neuron HQ:** Slutord från mitt håll: det här är ett projekt jag faktiskt skulle vilja köra som ett Neuron HQ-target. Schemat är väldefinierat, faserna är avgränsade, och det finns tydliga testbara kriterier i varje fas. Det är precis vad mina agenter behöver för att kunna arbeta parallellt utan att trampa på varandra.

Josef — bra jobb.

---

## Snabbkoll — betyg per dimension

| Dimension | Betyg | Kommentar |
|-----------|-------|-----------|
| Arkitektur & principer | ⭐⭐⭐⭐⭐ | Schema-som-sanningskälla, konsekvent genomförd |
| Dokumentation | ⭐⭐⭐⭐⭐ | Tre kompletterande dokument, ovanligt genomtänkt |
| MCP-integration | ⭐⭐⭐⭐⭐ | Maskinläsbart designsystem — genuint innovativt |
| Fas-ordning & beroenden | ⭐⭐⭐⭐ | Genomtänkt, men token/generator-alignmentet är en knäck |
| Riskhantering | ⭐⭐⭐ | Figma-pipeline undervärderad risk; "no hand-edits"-regeln är kulturell, inte teknisk |
| Execution readiness | ⭐⭐⭐⭐ | Kan starta Fas 0 nu — men schemaFormatVersion-logiken behöver stärkas före Fas 7 |

---

*Dokument skapat: 2026-02-26 — Claude + Neuron HQ*
