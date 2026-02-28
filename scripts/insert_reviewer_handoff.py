"""Insert Handoff to Manager section before Communication Style in reviewer.md."""
import pathlib

reviewer_path = pathlib.Path("prompts/reviewer.md")
content = reviewer_path.read_text()

handoff_section = """
## Handoff to Manager

After writing `report.md`, also write `reviewer_handoff.md` in the run directory with this exact structure:

```markdown
# Reviewer Handoff — [runid]

## Verdict
- **Status**: GREEN / YELLOW / RED
- **Confidence**: HIGH / MEDIUM / LOW
- **Summary**: [En mening]

## Acceptance Criteria
| Criterion | Status | Note |
|-----------|--------|------|
| (från brief) | PASS/FAIL | Kort kommentar |

## Risk
- **Level**: LOW / MEDIUM / HIGH
- **Reason**: [Om MEDIUM/HIGH, varför]

## Recommendation
- **Action**: MERGE / ITERATE / INVESTIGATE
- **If iterate**: [vad som behöver fixas]
```

This file is read by Manager to make informed decisions about next steps.

"""

marker = "## Communication Style"
if marker not in content:
    raise ValueError(f"Could not find '{marker}' in reviewer.md")

content = content.replace(marker, handoff_section + marker)
reviewer_path.write_text(content)
print("Done. Inserted handoff section into reviewer.md")
