# Aurora — Second Brain Roadmap

> **Senast uppdaterad:** 2026-03-24 · Session 145
> **Mål:** Aurora fungerar som second brain — indexera, minnas, söka, svara.
> **Verktyg:** Neuron HQ kör briefs mot `aurora-swarm-lab` target.
> **Sprintplan:** [docs/SPRINT-PLAN-AURORA.md](docs/SPRINT-PLAN-AURORA.md)

---

## Status just nu

| Mått | Värde |
|------|-------|
| Senaste gröna körning | 2026-02-26 (236 tester) |
| CLI-kommandon | 32 |
| MCP-tools | 24 |
| Agenter | 13 (alla i Neuron HQ) |
| Databas | PostgreSQL + pgvector (1024-dim) |
| Obsidian vault | "Neuron Lab" |

---

## Redan klart (verifierat i kod, session 145)

Dessa funktioner finns och är implementerade. Behöver manuell verifiering, inte körning.

| # | Funktion | Verifieringskommando | Status |
|---|----------|---------------------|--------|
| ✅ | Video-ingest (YouTube, audio) | `aurora:ingest-video <url>` | Testad, fungerar |
| ✅ | PDF-ingest + OCR-fallback | `aurora:ingest rapport.pdf` | Testad, fungerar |
| ✅ | Semantisk sökning | `aurora:search <term>` | Testad, fungerar |
| ✅ | Fråga-svar med källhänvisningar | `aurora:ask <fråga>` | Testad, fungerar |
| ✅ | Confidence decay + audit trail | `aurora:decay --days 30` | Implementerad (S145 dubbelkoll) |
| ✅ | Auto-embedding vid ingest | Automatisk i intake-pipeline | Implementerad (S145 dubbelkoll) |
| ✅ | Semantisk dedup i memory | `aurora:remember` (≥0.95=dup) | Implementerad (S145 dubbelkoll) |
| ✅ | Cross-system sökning | `unifiedSearch()` | Implementerad (S145 dubbelkoll) |
| ✅ | Obsidian export | `obsidian-export` | Testad, fungerar |
| ✅ | Obsidian import (taggar, kommentarer) | `obsidian-import` | Testad, fungerar |
| ✅ | Speaker timeline + diarization | `aurora:identify-speakers` | Testad, fungerar |
| ✅ | LLM-korrekturläsning | `aurora:polish <nodeId>` | Testad, fungerar |
| ✅ | Knowledge gaps | `aurora:gaps` | Testad, fungerar |
| ✅ | Morning briefing | `morning-briefing` | Testad, fungerar |
| ✅ | Bayesiansk confidence | `aurora:confidence` | Implementerad |

---

## Blockers (måste fixas innan körningar)

### B1: Aurora-repot har trasiga tester

**Problem:** Ocommittad MCP-refaktorering (`server_fastmcp.py`) bryter alla tester.
**Lösning:** Reverta eller uppgradera MCP 1.26.0+.
**Effort:** ~15 min manuellt.

### B2: Neuron Historian/Consolidator 0-token (Brief 3.6)

**Problem:** API returnerar HTTP 200 med 0 output tokens. Kunskapsgrafen lär sig inte.
**Lösning:** Brief 3.6 → Neuron-körning N1.
**Effort:** ~$40, 1 körning.

---

## Fas 1 — Kvarvarande gap (Neuron-körningar mot Aurora)

| # | Brief | Mål | Varför behövs det | AC |
|---|-------|-----|-------------------|------|
| **A1** | Obsidian round-trip | Export→edit→re-import utan dataförlust | Import finns men ingen round-trip-verifiering eller konflikthantering | Test: exportera, ändra i Obsidian, importera, verifiera |
| **A2** | DOCX/XLSX intake | `aurora:ingest rapport.docx` | PDF fungerar men DOCX saknas helt | End-to-end: ingest → chunk → embed → sökbar |

---

## Fas 2 — Valfria förbättringar (välj efter behov)

| # | Funktion | Vad det ger dig | Prioritet |
|---|----------|----------------|-----------|
| **A3** | Voice-to-brain | Diktera → transkribera → remember → länka | Hög om du använder röst |
| **A4** | Smart consolidation | Aurora-fakta → Neuron KG (agenterna lär sig av dina anteckningar) | Hög för agentlärande |
| **A5** | HyDE-sökning | Generera hypotetiskt svar → embed → bättre sökträffar | Medium |
| **A6** | Ask-pipeline polish | Bättre citations, confidence-indikatorer i svar | Medium |
| **A7** | Batch re-indexing | Omembedda alla noder med ny modell | Låg (infrastruktur) |
| **A8** | Dashboard | Visuell vy av kunskapsgrafen, timeline, gaps | Medium-Hög |

---

## Fas 3 — Daglig användning

> Innan nya features: **använd Aurora i 1 vecka**. Indexera videor, ställ frågor, anteckna i Obsidian. Skriv ner vad som saknas — det blir underlag för nästa fas.

| Aktivitet | Kommando |
|-----------|---------|
| Indexera en video | `aurora:ingest-video <url>` |
| Ställ en fråga | `aurora:ask "Vad sa Dario om agenter?"` |
| Spara en insikt | `aurora:remember "Nyckelinsikt: ..."` |
| Sök i allt | `aurora:search <term>` |
| Morgon-briefing | `morning-briefing` |
| Se knowledge gaps | `aurora:gaps` |

---

## Budget

| Fas | Körningar | Kostnad |
|-----|-----------|---------|
| Blockers | 1 (N1) | ~$40 |
| Fas 1 | 2 (A1-A2) | ~$80 |
| Fas 2 | 0-6 (valfria) | $0-240 |
| **Totalt** | **3-9** | **~$120-360** |
