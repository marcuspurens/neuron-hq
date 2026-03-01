"""Insert Quality Metrics Analysis section before '## What NOT to Do' in historian.md."""
import pathlib

historian_path = pathlib.Path("prompts/historian.md")
content = historian_path.read_text()

new_section = """## Quality Metrics Analysis

After writing the run summary, analyze `metrics.json` for this run:

1. **Efficiency**: Calculate tokens per test added (total_output / tests_added).
   Compare with previous runs if available.
2. **Budget usage**: For each agent, report iterations_used / iterations_limit
   as percentage. Flag any agent above 80%.
3. **Policy health**: If commands_blocked > 0, note the count and investigate.
4. **Delegation pattern**: If re_delegations > 0, note what was re-delegated and why.
5. **Trend**: If previous metrics.json files exist in other run dirs, compare
   tests_added and tokens_per_iteration trends.

Write a short "## Körningseffektivitet" section at the end of the run entry
in runs.md with 2-3 bullet points on efficiency and quality.

---

"""

marker = "## What NOT to Do"
if marker not in content:
    raise RuntimeError(f"Could not find '{marker}' in historian.md")

content = content.replace(marker, new_section + marker)
historian_path.write_text(content)
print("Done: inserted Quality Metrics Analysis section")
