# Metadata Standards & Ontologi — Levande Referensdokument

> **Syfte:** Dokumentera vilka metadata-standarder som implementerats, när, varför och hur de mappar till Auroras interna datamodell. Uppdateras löpande allt eftersom ontologin växer.

## Design-principer

1. **Intern graf, extern vokabulär** — Aurora använder sin egen nodmodell (aurora_nodes + JSONB) internt. Standarder används som vokabulär-alignment, inte som databasschema.
2. **JSONB-first** — Nya metadata-fält läggs till i `properties` utan migration. Standarder styr namngivning, inte schema.
3. **Pragmatisk alignment** — Vi implementerar inte full compliance med någon standard. Vi lånar begrepp och mappningar.
4. **Exporterbar** — Intern data ska kunna exporteras till standardformat (RDF/JSON-LD) i framtiden.

## Implementerade standarder

### SKOS — Simple Knowledge Organization System (W3C)
- **Status:** Implicit sedan E4b (2026-03-14)
- **Vad:** Begrepps-hierarkier och taxonomier
- **Mappning:**

| Aurora internt | SKOS-standard | Implementerat |
|---------------|---------------|---------------|
| `concept.title` | `skos:prefLabel` | E4b |
| `concept.aliases` | `skos:altLabel` | E4b |
| `edge: broader_than` | `skos:broader` | E4 (migration 013) |
| `edge: related_to` | `skos:related` | Sedan start |
| `concept.description` | `skos:definition` | E4b |

- **Beslut:** Vi använder SKOS-mönstret men lagrar i vår egen grafmodell, inte som RDF-triples.

### Dublin Core Terms (DCMI)
- **Status:** Implicit alignment sedan E4 (2026-03-14)
- **Vad:** Universella metadata-fält (title, creator, date, subject, source)
- **Mappning:**

| Aurora internt | Dublin Core | Implementerat |
|---------------|-------------|---------------|
| `node.title` | `dc:title` | Sedan start |
| `article.properties.domain` | `dc:subject` | E4 |
| `article.properties.synthesizedBy` | `dc:creator` | E4 |
| `node.created` | `dc:created` | Sedan start |
| `node.updated` | `dc:modified` | Sedan start |
| `node.source_url` | `dc:source` | Sedan start |
| `article.properties.abstract` | `dc:description` | E4 |

- **Beslut:** DC-fält är redan naturligt representerade i vår modell. Ingen kodändring behövdes — bara dokumentation.

### Schema.org
- **Status:** Facett-mappning sedan E4b (2026-03-14)
- **Vad:** Webbnära typer (Person, Organization, Article, VideoObject)
- **Mappning:**

| Aurora facet | Schema.org typ | Implementerat |
|-------------|----------------|---------------|
| `facet: topic` | `skos:Concept` | E4b |
| `facet: entity` | `schema:Organization` / `schema:Person` | E4b |
| `facet: method` | `schema:HowTo` | E4b |
| `facet: tool` | `schema:SoftwareApplication` | E4b |
| `facet: domain` | `schema:DefinedTerm` | E4b |
| `type: article` | `schema:Article` | E4 |
| `type: document` | `schema:DigitalDocument` | Sedan start |
| `type: transcript` | `schema:VideoObject` (transcript) | Spår C |
| `type: voice_print` | — (ingen direkt mappning) | Spår C |

- **Beslut:** Schema.org-typer mappar till våra facetter och node types. Ingen separat kolumn — `standardRefs.schema` i JSONB.

### PROV-O — Provenance Ontology (W3C)
- **Status:** Partiell alignment sedan E4 (2026-03-14), formaliseras framöver
- **Vad:** Spårbarhet — varifrån kom kunskapen?
- **Mappning:**

| Aurora internt | PROV-O | Implementerat |
|---------------|--------|---------------|
| `article.properties.synthesizedBy` | `prov:wasGeneratedBy` | E4 |
| `article.properties.sourceNodeIds` | `prov:wasDerivedFrom` | E4 |
| `article.properties.synthesisModel` | `prov:wasAssociatedWith` | E4 |
| `node.created` | `prov:generatedAtTime` | Sedan start |
| `edge: derived_from` | `prov:wasDerivedFrom` | Sedan start |
| `edge: summarizes` | `prov:wasDerivedFrom` (specialisering) | E4 |

- **Beslut:** PROV-O har mest potential att fördjupas — särskilt för att spåra vilken LLM-modell, vid vilken tidpunkt, från vilken källa.

## Planerade standarder (ej implementerade)

### EBUCore+ — European Broadcasting Union
- **Relevans:** HÖG — vi har redan video-intake, transcripts, voice prints, speaker identity
- **Vad det ger:** Standardiserade fält för mediabeskrivning, segment-metadata, produktionsroller
- **Plan:** Aligna befintliga multimedia-noder (transcript, voice_print, speaker_identity) med EBUCore+ properties
- **Prioritet:** E6+ eller separat multimedia-sprint

### IPTC — International Press Telecommunications Council
- **Relevans:** MEDEL — relevant om vi indexerar nyhetsinnehåll
- **Vad det ger:** Photo metadata, NewsML, Video Metadata Hub, RightsML
- **Plan:** Adapter vid behov, inte kärnmodell

### C2PA — Content Provenance and Authenticity
- **Relevans:** MEDEL — för verifiering av mediakällor
- **Vad det ger:** Ursprung och ändringshistorik för digitalt innehåll
- **Plan:** Framtida verifieringsflöde

### Persistenta identifierare (DOI, ORCID, ROR, ISNI)
- **Relevans:** HÖG — gör entities länkbara istället för fria strängar
- **Vad det ger:** Disambiguering, koppling till externa kunskapsbaser
- **Plan:** `standardRefs` fältet i concept properties (E4b) är förberedelse

| Identifierare | Vad | Exempel |
|--------------|-----|---------|
| DOI | Publikationer, papers | `10.1038/s41586-024-07487-w` |
| ORCID | Forskare/personer | `0000-0002-1825-0097` |
| ROR | Organisationer | `https://ror.org/03yrm5c26` |
| ISNI | Kreatörer, publika figurer | `0000 0001 2156 2780` |
| Wikidata | Allt | `Q312` (OpenAI) |

### Croissant (MLCommons)
- **Relevans:** LÅG nu, HÖG framöver — för ML-datasets och träningsdata
- **Plan:** Relevant när/om vi indexerar dataset-metadata

## Standard-alignment i JSONB

Alla standard-mappningar lagras i nodens `properties.standardRefs`:

```typescript
interface StandardRefs {
  // Ontologi-mappning
  skos?: string;         // 'skos:Concept', 'skos:ConceptScheme'
  schema?: string;       // 'schema:Organization', 'schema:Person'

  // Persistenta identifierare
  wikidata?: string;     // 'Q312' (entity-ID)
  orcid?: string;        // '0000-0002-...' (person-ID)
  ror?: string;          // 'https://ror.org/...' (org-ID)
  doi?: string;          // '10.1038/...' (publication-ID)
  isni?: string;         // '0000 0001 2156 2780'

  // Media-standarder
  ebucore?: string;      // EBUCore+ typ-mappning
  iptc?: string;         // IPTC-typ

  // Proveniens
  prov?: string;         // PROV-O klass/relation
}
```

Fältet är **helt valfritt** — noder som inte har standardreferenser fungerar exakt som förut. Det kostar ingenting att lägga till (JSONB) men ger möjlighet att länka till omvärlden.

## Ändringslogg

| Datum | Version | Vad | Brief/Sprint |
|-------|---------|-----|--------------|
| 2026-03-14 | v1 | Initial: SKOS + DC + Schema.org alignment, facetter, standardRefs | E4 + E4b |

## Research-källor

- ChatGPT metadata-research (2026-03-14) — bred genomgång av EBUCore+, IPTC, C2PA, PROV-O, DataCite, Croissant
- W3C SKOS Reference: https://www.w3.org/TR/skos-reference/
- Dublin Core Terms: https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
- EBUCore+ Specification: https://tech.ebu.ch/metadata/ebucoreplus
- PROV-O: https://www.w3.org/TR/prov-o/
