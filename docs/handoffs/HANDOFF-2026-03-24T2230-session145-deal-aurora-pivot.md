# HANDOFF-2026-03-24T2230 — Session 145: Deal — Aurora-pivot

## Bakgrund

Marcus ifrågasatte om Neuron HQ var värt att fortsätta med. Djupt samtal om frustration, trötthet och tvivel. Tre agenter grävde igenom hela kodbasen, körningshistorik och Aurora-status.

## Samtalsflöde

### 1. "Är Neuron värt att rädda?"

Tre Explore-agenter undersökte kodbasen oberoende:
- **Agent 1 (kodkvalitet):** 3916 tester, 2 `any` i core, clean arkitektur, 120/180 GREEN. Historian 0-tokens + bash-budget = verkliga problem, men "fixa och stabilisera"-problem, inte "börja om".
- **Agent 2 (körningshistorik):** 180 körningar, 95% recent success rate, men 95%+ mot sig själv. Aurora stagnerat sedan februari.
- **Slutsats:** Neuron fungerar. Problemet = aldrig pekat mot Aurora.

### 2. "Ska vi hänga på Nvidia NemoClaw?"

Marcus nämnde NemoClaw/OpenShell som alternativ.
- **Analys:** NemoClaw = sandboxad runtime (infra-lager). Neuron = orkestrering + brief + review + learning (applikations-lager). De konkurrerar inte.
- NemoClaw är alpha, Apache 2.0, inte produktionsmogent.
- **Slutsats:** Byt inte häst. "Shiny new thing"-fällan.

### 3. Deal: Neuron fixar Aurora

Överenskommelse:
1. Fixa Neuron (direktfixar + brief 3.6)
2. Peka Neuron mot Aurora (2-8 briefs)
3. Utvärdera efter Aurora-sprinten

### 4. Sprint-plan v1 → dubbelkoll → v2

Första planen hade 6 Aurora-briefs. Dubbelkollen avslöjade:
- **Aurora-repot är trasigt** — ocommittad MCP-refaktorering (`server_fastmcp.py` + `meta=`) bryter alla tester
- **4 av 6 briefs redan implementerade** — decay, auto-embedding, dedup, cross-search
- Planen krympte från 6 obligatoriska → 2 obligatoriska + 6 valfria

### 5. Roadmap-uppdatering

- ROADMAP.md: 3.1, 3.2b, 3.5 markerade ✅ (var ⬜ trots att de var klara). 23/28 klar.
- Ny fil: ROADMAP-AURORA.md — separat roadmap för Aurora second brain
- Sprint-plan uppdaterad till v2

### 6. Dagbok-diskussion

Marcus frågade om ett bättre dokumentationssystem ("dagbok"). Diskussion om att docs/samtal/ redan har 31 filer men inget samlat index eller dagboksformat.

---

## Tre stora upptäckter

1. **Aurora-repot bryter vid test** — MCP 1.25 vs 1.26 mismatch. Måste reverteras.
2. **4 av 6 planerade Aurora-briefs var onödiga** — funktionerna fanns redan i koden. Sparade ~$160.
3. **ROADMAP hade 3 punkter markerade ⬜ som var ✅** — 3.1, 3.2b, 3.5. Korrigerat.

---

## Nya/ändrade filer

| Fil | Ändring |
|-----|---------|
| `ROADMAP.md` | 3.1 ✅, 3.2b ✅, 3.5 ✅, stats uppdaterade (3916 tester, S145) |
| `ROADMAP-AURORA.md` | NY — Aurora second brain roadmap |
| `docs/SPRINT-PLAN-AURORA.md` | NY → v2 — körningsplan med dubbelkoll-fynd |
| `docs/handoffs/HANDOFF-2026-03-24T2230-session145-deal-aurora-pivot.md` | NY — denna handoff |
| `docs/samtal/samtal-2026-03-24T2230-ar-neuron-vart-att-radda.md` | NY — samtalslogg |

---

## Commits denna session

1. `cf06b1a` — docs: S144 handoff + djupanalys körning 3.5 + dynamisk diff-limit (tidigt i sessionen)
2. *(pending)* — docs: S145 handoff + Aurora-pivot + roadmap-uppdatering

---

## Tester

3916 gröna (oförändrat — inga kodändringar denna session).

## Branch

`swarm/20260324-1523-neuron-hq`

---

## VIKTIGT för nästa chatt

1. **Dealen:** Fixa Neuron först (F1-F5 + brief 3.6), sedan Aurora.
2. **Aurora-repot är trasigt** — reverta MCP-refaktorering innan körning.
3. **Läs:** `docs/SPRINT-PLAN-AURORA.md` (v2) — komplett körningsplan.
4. **Läs:** `ROADMAP-AURORA.md` — Aurora-specifik roadmap.
5. **4 Aurora-funktioner redan klara** — decay, embedding, dedup, cross-search. Verifiera manuellt.
6. **Dagbok:** Marcus vill ha bättre dokumentation. Överväg dagboksformat i docs/.
7. **Feedback:** `feedback-run-artifact-reading.md` — 4-tier läsordning.
8. Kör ALDRIG `run` själv.
