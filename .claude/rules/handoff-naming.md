# Handoff Naming Convention

## Format

```
HANDOFF-YYYY-MM-DDT<HHMM>-<beskrivning>.md
```

### Fält

| Fält | Format | Exempel |
|------|--------|---------|
| Datum | `YYYY-MM-DD` | `2026-02-22` |
| Tid | `T<HHMM>` (24h, ingen kolon) | `T1830` |
| Beskrivning | kebab-case, kortfattad | `session16-streaming` |

## Exempel

```
HANDOFF-2026-02-22T1830-session16-streaming.md
HANDOFF-2026-02-22T0900-session8-first-real-run.md
```

## Regler

1. **Alltid datum + tid** — gör det enkelt att sortera kronologiskt
2. **Beskrivning på svenska eller engelska** — välj det som är tydligast
3. **Inkludera sessionsnummer** om det är en session-handoff: `session<N>-<slug>`
4. **Placeras i `docs/`**
5. **Uppdatera `HANDOFF.md`** (index i roten) när en ny fil skapas

## Uppdatera indexet

Efter att ha skapat en ny handoff-fil, lägg till en rad i `HANDOFF.md`:

```markdown
| 2026-02-22 18:30 | Session 16 | Verifieringskörning | [länk](docs/HANDOFF-...) |
```
