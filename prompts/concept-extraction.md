Extrahera 3-7 nyckelbegrepp från följande text. Klassificera varje begrepp med en facett.

Returnera JSON:

{"concepts": [
  { "name": "GPT-5", "facet": "tool", "broaderConcept": "Large Language Models",
    "standardRefs": { "schema": "schema:SoftwareApplication" } },
  { "name": "OpenAI", "facet": "entity", "broaderConcept": "AI Companies",
    "standardRefs": { "schema": "schema:Organization", "wikidata": "Q21298850" } },
  { "name": "RLHF", "facet": "method", "broaderConcept": "Fine-tuning",
    "standardRefs": { "schema": "schema:HowTo" } },
  { "name": "LLM", "facet": "topic", "broaderConcept": "AI",
    "standardRefs": { "skos": "skos:Concept" } }
]}

OBS: standardRefs är valfritt. Fyll i om du känner igen:
- wikidata: Wikidata entity ID (QXX)
- orcid: ORCID iD för forskare (0000-XXXX-XXXX-XXXX)
- ror: ROR-ID för organisationer (https://ror.org/...)
- schema: Schema.org-typ (schema:Organization, schema:Person, etc.)

## Facetter
- **topic** — ämne, teori, forskningsområde (AI, Agile, Embeddings)
- **entity** — organisation, person, universitet, institut (OpenAI, Stanford, Sam Altman)
- **method** — metodik, process, teknik (RLHF, Sprint Planning, TDD)
- **domain** — tillämpningsområde (Healthcare AI, Kodgenerering, DevOps)
- **tool** — verktyg, produkt, modell (GPT-5, Jira, TypeScript)

## Regler
- Extrahera begrepp från FLERA facetter, inte bara ämnen
- Varje begrepp ska ha ett bredare begrepp (parent) om möjligt — null om det är en rot-kategori
- Använd etablerade namn (inte förkortningar om fullständigt namn är vanligare)
- Om en person nämns, extrahera även deras organisation

## Text
{{text}}
