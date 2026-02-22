# Brief: Librarian Smoke Test

**Datum:** 2026-02-22
**Target:** aurora-swarm-lab
**Typ:** Smoke test — testa Librarian-agenten live

---

## Bakgrund

Neuron HQ har nu en ny Librarian-agent som söker arxiv efter AI-forskning och skriver
till `memory/techniques.md`. Denna körning är ett smoke test av den agenten.

---

## Uppgift

1. **Delegera till Librarian** (`delegate_to_librarian`) för att söka efter nya papers.
   Librarian ska söka arxiv på dessa tre topics:
   - `ti:agent+memory+LLM`
   - `ti:autonomous+software+agent`
   - `ti:context+window+management`

2. **Verifiera resultatet** — läs `memory/techniques.md` och bekräfta att minst 1 ny
   entry skrevs in.

3. **Delegera till Historian** (`delegate_to_historian`) sist — logga körningen i
   `memory/runs.md`.

---

## Acceptanskriterier

- [ ] `memory/techniques.md` innehåller minst 1 ny entry från arxiv
- [ ] Varje entry har: titel, källa (arxiv-id), kärna, relevans
- [ ] `memory/runs.md` har fått en ny entry för denna körning
- [ ] Inga fel i audit.jsonl

---

## Inte i scope

- Inga kodändringar i aurora-swarm-lab
- Ingen Implementer, Reviewer eller Tester behövs
- Ingen merge

---

## Verifiering

```bash
cat memory/techniques.md
cat memory/runs.md
```
