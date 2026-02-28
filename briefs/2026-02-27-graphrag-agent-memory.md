# GraphRAG-baserad minneshantering för agenter — Översikt

> **Status:** Paraplydokument. Enskilda briefs per steg nedan.
>
> **Källdokument:** [docs/research-2026-02-27T1219-graphrag-agent-memory.md](../docs/research-2026-02-27T1219-graphrag-agent-memory.md)
>
> **Roadmap:** Se `ROADMAP.md` → "GraphRAG — Kunskapsgraf för agentminne"

---

## Bakgrund

Neuron HQ:s agenter använder idag filbaserat minne (`memory/patterns.md`,
`memory/errors.md`, `memory/techniques.md`). Systemet fungerar men skalas dåligt:
mönster dedupliceras manuellt, relationer är textbaserade (`Relaterat:`-fält),
och agenter kan inte ställa strukturerade frågor mot minnet.

## Beslut (Session 48)

| Fråga | Beslut |
|-------|--------|
| **Scope** | Neuron HQ först. Designa API:et generellt så Aurora kan använda det senare. |
| **Relation till befintligt** | Ersätter `patterns.md` + `errors.md` stegvis. Parallellkörning under övergång. |
| **Lagring** | JSON-fil (`memory/graph.json`), versionshanteras i git. |
| **Vem skriver** | Historian (patterns + errors) + Librarian (techniques). |
| **Vem läser** | Alla agenter via gemensamt query-API. |

## Implementation i 3 steg

| Steg | Brief | Risk | Status |
|------|-------|------|--------|
| **G1** Core + migration | `briefs/2026-02-27-graphrag-g1-core.md` | Low | ❌ |
| **G2** Verktyg + skribenter | Skrivs efter G1 | Medium | — |
| **G3** Alla agenter läser | Skrivs efter G2 | Medium | — |

## Risk

**Medium totalt.** G1 är Low risk (ren ny kod, inga agentändringar).
G2–G3 berör agentprompts och verktygsregistret (Medium).
Parallellkörning med befintliga filer minskar blast radius.
