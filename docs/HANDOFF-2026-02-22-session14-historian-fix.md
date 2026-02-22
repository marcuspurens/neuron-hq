# Handoff — Session 14: Historian-fix + Librarian smoke test verifierad

**Datum:** 2026-02-22
**Branch:** swarm/20260222-1316-aurora-swarm-lab (ej mergad till main)

---

## Vad gjordes i denna session

### 1. Historian-bugfix (root cause: saknade verktyg + läste fel artefakter)

Historian drog felaktiga slutsatser (❌ "Librarian körde aldrig") trots att Librarian faktiskt körde och skrev 8 entries. Orsak: Historian läste bara `brief.md` och saknade verktyg för att verifiera minnesfiler.

**Åtgärder:**

| Fil | Ändring |
|-----|---------|
| `src/core/agents/historian.ts` | Nytt `read_memory_file`-verktyg (runs/patterns/errors/techniques) + `buildSystemPrompt` listar nu `audit.jsonl` |
| `prompts/historian.md` | Läs `audit.jsonl` som ground truth; kontrollera `techniques.md` vid Librarian-körningar |
| `tests/agents/historian.test.ts` | 3 nya tester för `read_memory_file` — 123 tester totalt, alla gröna |

### 2. Librarian smoke test — verifierad

Körning `20260222-1651-aurora-swarm-lab`:
- Librarian sökte arxiv på 3 topics (6 fetch-anrop) — 13 nya entries i `techniques.md`
- Historian läste `audit.jsonl` + `techniques.md` korrekt → skriver ✅ i `runs.md`

### 3. Commits

- `5374a2a` — Historian-bugfixen (kod + tester)
- `a57e160` — Memory-filer (21 nya arxiv-papers i techniques.md, körningshistorik)

---

## Känd bugg (ej åtgärdad)

**Manager letar efter Librarians output på fel ställe.**

Librarian skriver till `memory/techniques.md` (delad Neuron HQ-mapp).
Manager verifierar sedan med `bash_exec cat workspace/.../techniques.md` — hittar ingenting → delegerar till Librarian igen.

**Symptom:** Dubbel Librarian-delegation, onödiga tokens.
**Rot-orsak:** Managerprompt/systemkontext säger inte explicit var `memory/`-mappen ligger i förhållande till workspace.
**Fix:** Lägg till i Managers systemkontext att `memory/` är relativ till Neuron HQ root (`baseDir`), inte workspace. Alternativt: ge Manager ett `read_memory_file`-verktyg (likt Historian).

---

## Nästa session startar med

1. Fixa Manager-buggen (dubbel Librarian-delegation)
   - Alternativ A: Ge Manager ett `read_memory_file`-verktyg (konsistens med Historian/Librarian)
   - Alternativ B: Lägg till sökväg till `memory/`-mappen i Managers systemkontext

2. Sedan: **Nivå 2 streaming** — `messages.stream()` i alla agent-loopar

---

## Status

- 123 tester — alla gröna
- `techniques.md` har nu 25+ arxiv-entries om agentminne, kodningsagenter, kontextfönster
- Branch `swarm/20260222-1316-aurora-swarm-lab` ej mergad till main — fortfarande kvar från session 9
