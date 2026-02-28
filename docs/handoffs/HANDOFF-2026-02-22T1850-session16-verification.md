# Handoff — Session 16: Verifieringskörning

**Datum:** 2026-02-22
**Branch:** swarm/20260222-1316-aurora-swarm-lab (ej mergad till main)

---

## Vad är klart (från session 15)

| Ändring | Status |
|---------|--------|
| Streaming (`messages.stream()`) i alla 8 agenter | ✅ Committad (`30c44f8`) |
| Manager-bugfix via `read_memory_file` | ✅ Committad (`862bfe6`) |
| `"librarian"` tillagd i AuditEntry-enum | ✅ Committad (`30c44f8`) |
| 131 tester — alla gröna | ✅ |

**Ej live-verifierat:** Streaming och Manager-bugfixen är implementerade men har inte testats i en riktig swarm-körning.

---

## Session 16 börjar här

### Steg 1 — Kör en riktig swarm och verifiera

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx src/cli.ts run aurora-swarm-lab --brief briefs/<datum>-<slug>.md --hours 2
```

**Vad att titta efter i terminalen:**
1. **Streaming:** Text ska flöda fram tecken-för-tecken från agenter — inte dumpas i ett block
2. **Manager → Librarian:** Ska kallas max EN gång, inte dubbelt

### Steg 2 — Om något är fel

- **Streaming fungerar inte:** Kontrollera att `messages.stream()` används i `src/core/agents/*.ts`
- **Librarian kallas dubbelt:** Kontrollera `prompts/manager.md` sektion "Verifying Librarian Output" och att `read_memory_file` är korrekt implementerad i `src/core/agents/manager.ts`

---

## Nästa steg efter verifiering

1. **Länkade minnen (A-MEM-stil):** Nyckelord + kopplingar mellan entries i `memory/patterns.md`, `memory/errors.md`, `memory/techniques.md`
2. **Librarian auto-trigger:** Kör Librarian automatiskt var N:e körning
3. **Branch-merge:** `swarm/20260222-1316-aurora-swarm-lab` har legat sedan session 9 — överväg merge till main

---

## Viktiga filer att känna till

| Fil | Syfte |
|-----|-------|
| `src/core/agents/manager.ts` | `read_memory_file`-verktyg + `executeReadMemoryFile()` |
| `prompts/manager.md` | "Verifying Librarian Output" — använd `read_memory_file`, inte bash |
| `src/core/types.ts` | `"librarian"` i AuditEntry-enum |
| `memory/techniques.md` | Librarianens output hamnar här (inte i workspace) |
