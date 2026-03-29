## Senaste konsolidering: 20260325-0715-neuron-hq

### Kunskapsluckor

- **KRITISK: Graf är RED** — 1149/1385 noder (83%) saknar kanter. 277 pattern/error/technique-noder saknar `discovered_in`-kant till run-nod. PPR-discovery fungerar inte korrekt. Historian MÅSTE lägga till kanter vid varje `graph_assert`.
- **idea-noder är operationellt oanvändbara** — ~900 idea-noder, 92.7% isolerade, alla `confidence: 0.5`, `mention_count: 1`. Utan kanter hittas de aldrig via grafsökning.
- **Techniques saknar koppling till patterns** — technique-101 (CAP theorem), technique-111 (AgentRM), technique-097 (Security) har inga kanter till patterns de inspirerade. Kunskapen är "dark matter" — finns men kan inte hittas.
- **Öppna fel osynliga** — error-query returnerade tom — troligen för att error-noder är isolerade, inte för att det saknas öppna fel.

### Scope-promotioner

- **pattern-018** ("Exakt feloutput + fixförslag i brief ger kirurgiska leveranser"): `unknown` → `universal` ✅ FIXAT. Scope-fältet fastnade i 15+ konsolideringspass trots `scope_promoted: true` i properties. Trolig bugg: `properties.scope` uppdaterar inte scope-fältet — använd top-level `scope`-parameter i `graph_update`.

### Abstraktioner skapade (2 st)

- **abstraction-1774427987006-aq0ttg** — "Aurora Ingest Pipeline Improvements Cluster": generaliserar idea-280, 281, 282, 283 (batch enqueue API, source_version migration, Whisper auto-detection test)
- **abstraction-1774427999510-z0ym86** — "Structured Agent Handoff Protocol Enhancements": generaliserar idea-321, 322, 323, 324 (Reviewer/Tester handoffs, schema validation)

### Saknade kanter tillagda

- pattern-228: run-059 ↔ technique-101 (cross-reference placeholder)
- pattern-229: pattern-225/114/113 kluster-koppling (Bayesian confidence system)
- pattern-230: pattern-224 ↔ pattern-222 (0-token retry system, samma körning)

### Kvalitetsvarningar

- **error-031**: Korrupta properties `0`-`75` (tecken-för-tecken serialisering av JSON). Innehåll fortfarande läsbart i symptom/impact/solution. Historian bör städa bort dessa numrerade properties.
- **Dubblettpar ej granskade** (kräver content-läsning): idea-900 vs idea-905 (0.982), technique-050 vs technique-001 (0.945), pattern-195 vs pattern-192 (0.943). Flaggade för Historian.
- **Inga sanna dubbletter kvar** i pattern/error/technique — alla similarity=1.0 par är redan ihopslagna av tidigare konsolideringar.

### Granskning för Historian
Noder som Historian bör verifiera vid nästa run:
- **error-031**: Rensa numrerade properties (0-75) — serialiseringskorruption
- **idea-900 + idea-905**: Similarity 0.982 — kontrollera om dessa är dubbletter
- **technique-050 + technique-001**: Similarity 0.945 — samma paper?
- **pattern-195 + pattern-192**: Similarity 0.943 — olika eller samma mönster?

### Rekommendationer

1. **Historian (KRITISK)**: Lägg alltid till `discovered_in`-kant i `graph_assert`. Utan detta kan grafen aldrig nå GREEN.
2. **Manager**: Planera "integration-brief" som kopplar techniques till patterns de inspirerade.
3. **Manager**: Overväg sprint för "Structured Agent Handoff Protocol" — abstraktionen är redo.
4. **Historian**: Minska volym idea-noder — skapa bara om `mention_count >= 2` ELLER om en kant kan läggas till direkt.
5. **Librarian**: Lägg till `related_to`-kant till närmast relaterat pattern vid varje technique-assert.

## Abstraktioner skapade

### Aurora Ingest Pipeline Improvements Cluster
COMMON CAUSE: All nodes describe Aurora ingestion pipeline enhancements discovered in the same run (20260226-1553-aurora-swarm-lab), sharing a common root — improving data reliability and developer tooling in the Aurora ingest layer. ACTIONABLE: The abstraction "Aurora Ingest Pipeline Improvements" gives a useful rollup of backlog items that can be triaged together in a sprint, which individual nodes cannot convey. STABLE: Remove any one node (e.g., idea-283 Whisper test) and the abstraction still meaningfully represents "Aurora ingest batch/versioning improvements".

### Structured Agent Handoff Protocol Enhancements
COMMON CAUSE: All nodes describe aspects of the same architectural concern — structured, validated handoffs between swarm agents. They share the same root principle: agents should pass machine-readable, schema-validated context to downstream agents rather than free-form text. ACTIONABLE: The meta-concept "Structured Agent Handoff Protocol" gives actionable direction for a future sprint to implement formal handoff schemas across the swarm, which individual fragmented ideas cannot convey. STABLE: Remove idea-324 (schema validation) and the remaining three still coherently describe "extend structured handoffs to Reviewer and Tester agents".

## PPR-upptäckter
*(Noder som PPR hittade men Jaccard missade. Fylls i av LLM i rapport-innehållet.)*

## Grafstatistik (noder/kanter före/efter)
*(Statistik fylls i av LLM i rapport-innehållet.)*
