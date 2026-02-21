# Decision Cache

Reusable decisions that agents can reference to avoid re-asking the same questions.

## Format
Each entry should be:
- **Decision**: The question/decision point
- **Answer**: The chosen approach
- **Rationale**: Why this was chosen
- **Scope**: When this applies

---

## Example

### Decision: Error Handling Strategy
**Answer**: Use Result<T, E> pattern with explicit error types
**Rationale**: Makes errors type-safe and forces handling at call sites
**Scope**: All TypeScript modules in this repo

---

## Active Decisions

(Agents will propose entries here but only write with explicit opt-in)
