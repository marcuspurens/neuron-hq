"""Insert Reviewer Handoff section before Communication Style in manager.md."""
import pathlib

manager_path = pathlib.Path("prompts/manager.md")
content = manager_path.read_text()

handoff_section = """
### Reviewer Handoff
After Review, you will receive a `--- REVIEWER HANDOFF ---` block containing:
- **Verdict** (GREEN/YELLOW/RED) and confidence
- **Acceptance criteria** status per criterion
- **Risk** assessment
- **Recommendation** (MERGE/ITERATE/INVESTIGATE)

Use this to decide next steps:
- GREEN + MERGE → Proceed to Merger
- YELLOW + ITERATE → Re-delegate to Implementer with specific fixes
- RED + INVESTIGATE → Research the issue before re-implementing

"""

marker = "## Communication Style"
if marker not in content:
    raise ValueError(f"Could not find '{marker}' in manager.md")

content = content.replace(marker, handoff_section + marker)
manager_path.write_text(content)
print("Done. Inserted Reviewer Handoff section into manager.md")
