# Handoff — Session 43

**Datum:** 2026-02-26 · 20:10
**Session:** 43
**Status vid avslut:** Stabil. Inga öppna körningar. Inga blockerare.

---

## Vad hände i session 43

1. **Aurora A2 mergad** — datum-extraktion i chunks (`5c05583`)
2. **Aurora A3 mergad** — embedding-konsistens, `model`-kolumn, `check-embeddings` CLI, default fixad (`b22ee1c`) → 236 tester
3. **ZeroClaw analyserad** — repo nedladdat, fork skapad (`github.com/marcuspurens/zeroclaw`), tillagd som Neuron-target
4. **Neuron-rapport om ZeroClaw** — `runs/20260226-1917-zeroclaw/research/zeroclaw-rapport.md` (405 rader, claude-opus-4-6)
5. **Claude-rapport om ZeroClaw** — `docs/research-2026-02-26T1900-zeroclaw-analys-claude.md`
6. **Djupsamtal** — `docs/samtal-2026-02-26T1930-zeroclaw-djup-analys.md`
   - Neuron ska INTE ingå i ZeroClaw (eller tvärtom) — de är komplement
   - Skriv INTE om Neuron i Rust — fel problem
   - Minneshantering: tre silos, börja med Aurora `/ask` → ZeroClaw
7. **Rapport: AI-acceleration** — `docs/research-2026-02-26T2000-tid-och-ai-acceleration.md`
8. **Brief: agent handoff-context** — `briefs/2026-02-26-agent-handoff-context.md` (EJ körd ännu)

---

## Direkt nästa steg (i denna ordning)

### 1. Skriv AGENTS.md för Neuron HQ (Claude gör direkt, ingen körning)
Inspirerat av ZeroClaw:s AGENTS.md. Ska definiera hur Neurons egna agenter
arbetar i Neuron HQ-repot. KISS, YAGNI, DRY, risk-tiers, anti-patterns,
handoff-template — anpassat till Neuron HQ:s arkitektur.

### 2. Kör agent handoff-context (Neuron-körning)
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-26-agent-handoff-context.md --hours 1
```
Implementer ska skriva `implementer_handoff.md` så Manager vet vad som gjordes och varför.

### 3. Aurora B2 — HyDE (nästa Aurora-körning)
Brief behöver skrivas. B2 = Hypothetical Document Embeddings för bättre retrieval.

---

## Projektläge

| | |
|---|---|
| Neuron HQ tester | 352 ✅ |
| Aurora tester | 236 ✅ |
| Aurora roadmap | A1✅ A2✅ A3✅ → B2 nästa |
| ZeroClaw | Fork skapad, analyserad, target tillagd |
| Öppna briefs | `agent-handoff-context.md` (Neuron), `zeroclaw-analys.md` (research, körd) |

---

## Till nästa Claude-instans

Läs gärna dessa filer för djupare kontext:
- `docs/samtal-2026-02-26T1930-zeroclaw-djup-analys.md` — hela ZeroClaw-diskussionen
- `memory/MEMORY.md` — laddas automatiskt
- `docs/aurora-brain-roadmap.md` — Aurora-roadmapen

Marcus är inte utvecklare. Förklara alltid vad ett förslag innebär
praktiskt innan du ber om godkännande. Kör ALDRIG `npx tsx src/cli.ts run ...`
utan att bli explicit ombedd.
