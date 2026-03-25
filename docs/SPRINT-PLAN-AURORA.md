# Sprint: Neuron → Aurora — Körningsplan v2

> Deal: Aurora som second brain, Neuron som verktyg.
> Startdatum: 2026-03-25
> Uppdaterad: 2026-03-24 efter dubbelkoll

## Vad dubbelkollen avslöjade

1. **Aurora-repot är trasigt** — ocommittad MCP-refaktorering (`server_fastmcp.py` + `meta=`-param) kraschar alla tester. Måste fixas först.
2. **4 av 6 planerade briefs var redan implementerade:**
   - A1 (confidence decay) — `decay_confidence()` + `confidence_audit`-tabell + CLI finns
   - A2 (auto-embedding) — `autoEmbedAuroraNodes()` körs automatiskt vid ingest
   - A3 (semantisk dedup) — `remember()` gör similarity ≥0.95 → duplikat, ≥0.85 → uppdatering
   - A5 (cross-system sökning) — `unifiedSearch()` söker båda graferna parallellt
3. **Neuron klarar Python** — allowlist, prompter, verifiering allt klart. Senaste Aurora-körning (26 feb) GRÖN.

---

## Fas 0 — Förberedelser (manuellt, session 145)

### Steg 1: Fixa Aurora-repot (~15 min)

Aurora har en ofärdig MCP-refaktorering som bryter alla tester:
- `app/modules/mcp/server_fastmcp.py` använder `meta=` som inte finns i MCP 1.25.0
- `app/cli/main.py` importerar den trasiga filen
- `pyproject.toml` kräver `mcp>=1.26.0` (ej installerad)

**Alternativ:**
- **A) Reverta** — ta bort `server_fastmcp.py`, återställ `main.py` och `pyproject.toml`. Snabbast.
- **B) Uppgradera** — installera MCP 1.26.0+ om tillgängligt. Renare men osäkert.

**Verifiering:** `cd aurora-swarm-lab && python -m pytest tests/ -x -q` → alla tester gröna.

### Steg 2: Neuron direktfixar (~65 min)

| Fix | Fil | Vad | Tid |
|-----|-----|-----|-----|
| F1 | `src/core/run-metrics.ts:70` | metrics regex matchar inte "3916/3916" | 20 min |
| F2 | `src/core/run-digest.ts:278` | emoji 🟢 bryter STOPLIGHT-regex | 10 min |
| F3 | `tests/core/agents/manager.test.ts` | nytt test: audit loggar `diff_override_set` | 20 min |
| F4 | `tests/policy.test.ts:67-83` | test: `overrideWarnLines=0` edge case | 10 min |
| F5 | `src/core/agents/manager.ts:879` | kommentar: maxDiffLines → overrideWarnLines | 5 min |

**Verifiering:** `pnpm test` → alla 3916+ tester gröna.

### Steg 3: Brief 3.6 — Historian/Consolidator reliability

**Rotorsak:** API returnerar HTTP 200 med 0 output tokens. Nuvarande retry: 1 försök, bara iteration 1.

**Mål:**
- 3x retry med exponentiell backoff (5s, 15s, 30s)
- Diagnostiklogg: system prompt size, request size, token counts
- Fallback till icke-streaming vid upprepade 0-token
- Observer-awareness: hoppa över 0-token-agenter i analys

**Filer:** `historian.ts`, `consolidator.ts`, `agent-utils.ts`, `observer.ts`

---

## Fas 1 — Neuron körning N1 (Brief 3.6)

| # | Typ | Brief | Mål | Budget |
|---|------|-------|-----|--------|
| **N1** | NEURON | 3.6 Historian/Consolidator reliability | 3x retry + diagnostik + fallback | ~$40 |

**Gate:** N1 måste vara GRÖN innan Aurora-körningar startar.
**Varför:** Om Historian tappar data lär sig inte systemet av Aurora-körningarna.

---

## Fas 2 — Aurora-körningar

Aurora target: `aurora-swarm-lab` (konfigurerad i `targets/repos.yaml`)
Baseline: `python -m pytest tests/ -x -q`
Senaste gröna Aurora-körning: 2026-02-26 (236/236 tester)

### Kvar att bygga (2 briefs)

| # | Brief | Mål | Varför | AC (kortfattat) |
|---|-------|-----|--------|-----------------|
| **A1** | Obsidian round-trip | Export→edit→re-import utan dataförlust | Import finns men ingen verifiering att round-trip fungerar | Test: exportera nod, ändra i Obsidian, importera, verifiera att ändring finns i Aurora |
| **A2** | DOCX/XLSX intake | `aurora:ingest rapport.docx` fungerar | PDF fungerar redan, men DOCX saknas helt | End-to-end: ingest → chunk → embed → sökbar |

### Redan klart (verifiering, ej körning)

Dessa 4 behöver **inte** köras — de är implementerade. Men vi bör verifiera dem manuellt:

| Funktion | Kommando att testa | Vad vi kollar |
|----------|-------------------|---------------|
| Confidence decay | `aurora:decay --days 30 --factor 0.95` | Noder åldras, audit trail skapas |
| Auto-embedding | `aurora:remember "Testfakta"` → `aurora:recall "test"` | Embedding skapas, recall hittar |
| Semantisk dedup | `aurora:remember "X"` 3 gånger | Bara 1 nod, högre confidence |
| Cross-system sökning | `aurora:search "valfri term"` | Resultat från båda graferna |

---

## Fas 3 — Fria Aurora-körningar (upp till 6 st)

Nu har vi **budget kvar** — planen krympte från 6 till 2 nödvändiga körningar. Det ger oss utrymme:

| # | Brief | Mål | Prioritet |
|---|-------|-----|-----------|
| **A3** | Voice-to-brain pipeline | Diktera → transkribera → remember → länka | Hög om du använder röst |
| **A4** | Smart consolidation | Aurora-fakta → Neuron KG för agentlärande | Hög om du vill att agenterna lär sig av Aurora |
| **A5** | HyDE-sökning | Generera hypotetiskt svar, embed, sök | Medium — förbättrar sökprecision |
| **A6** | Ask-pipeline polish | Bättre citations, confidence-indikatorer i svar | Medium — UX-förbättring |
| **A7** | Batch re-indexing | Omembedda alla noder med ny modell | Låg — infrastruktur |
| **A8** | Valfri | Baserat på vad du behöver efter A1-A4 | - |

**Du väljer ordning efter att A1-A2 är klara.** Baserat på vad du faktiskt saknar.

---

## Fas 4 — Neuron underhåll N2 (valfri)

| # | Typ | Brief | Mål | Trigger |
|---|------|-------|-----|---------|
| **N2** | NEURON | 3.7 Bash-exec budget | Hård gräns + varning vid 70% | Om Manager spränger budgeten i Aurora-körningarna |

Körs bara vid behov.

---

## Checkpoint: Utvärdering

**Efter A1-A2 + manuell verifiering av de 4 befintliga funktionerna:**

1. Fungerar `aurora:remember` + `aurora:recall` som du förväntar dig?
2. Kan du indexera en video och sen ställa frågor om den?
3. Fungerar round-trip Obsidian → Aurora → Obsidian?
4. Känns Aurora som en *second brain* eller en *databas*?
5. Vad saknas mest?

Svaren styr vilka av A3-A8 som körs.

---

## Budget (reviderad)

| Fas | Körningar | Uppskattad kostnad |
|-----|-----------|-------------------|
| Fas 0 | 0 (manuellt) | $0 |
| Fas 1 | 1 (N1) | ~$40 |
| Fas 2 | 2 (A1-A2) | ~$80 |
| Fas 3 | 2-6 (A3-A8, valfria) | ~$80-240 |
| Fas 4 | 0-1 (N2) | $0-40 |
| **Totalt** | **5-10** | **~$200-400** |

**Besparingen:** ~$160 jämfört med v1, för att vi inte bygger saker som redan finns.

---

## Regler

1. **Skriv brief → Marcus kör → läs rapport.** Alltid.
2. **En körning i taget.** Ingen parallelism förrän Aurora bevisat sig.
3. **Historian måste fungera** (N1 GRÖN) innan Aurora-fas.
4. **Varje brief granskas** med Brief Reviewer + Code Anchor.
5. **Om en körning går RÖD:** Analysera, fixa, kör om. Max 1 retry per brief.
6. **N2 triggas bara vid behov**, inte förebyggande.
7. **Aurora-repot måste ha gröna tester** innan första körningen.

---

## Logg (fylls i under sprinten)

| Datum | Körning | Status | Tester | Kostnad | Anteckningar |
|-------|---------|--------|--------|---------|-------------|
| | Aurora-fix | | | $0 | Reverta MCP-refaktorering |
| 2026-03-24 | Neuron F1-F5 | ✅ KLAR | 3909 | $0 | F1-F4 fixade, F5 redan klar. Commit `e3bae8e` |
| 2026-03-24 | N1 (3.6) | ✅ GRÖN | 3917 | $60.54 | 12/12 AC, streamWithEmptyRetry, Observer checkZeroTokenAgents |
| 2026-03-25 | A1 (Obsidian round-trip) | ✅ GRÖN | 3936 | ~$39 | 12/12 AC, mergad till main |
| 2026-03-25 | Code Anchor härdning (ej i deal) | ✅ GRÖN | 3949 | ~$39 | 13/14 AC, säkerhetsfix |
| | Aurora-fix | | | $0 | **BLOCKERAR A2** — Marcus fixar |
| | Manuell verifiering | | | $0 | decay, embedding, dedup, cross-search |
| | A2 | | | | DOCX/XLSX intake |
| | A3-A8 | | | | Valfria, baserat på behov |
| | N2? | | | | Bash-budget (om behov) |
