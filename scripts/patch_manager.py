"""Patch delegateToReviewer to read reviewer_handoff.md."""
import pathlib

manager_path = pathlib.Path("src/core/agents/manager.ts")
content = manager_path.read_text()

old = """    const reviewer = new ReviewerAgent(this.ctx, this.baseDir);
    await reviewer.run();
    return 'Reviewer agent completed successfully.';
  }

  /**
   * Delegate research to the Researcher agent.
   */"""

new = """    const reviewer = new ReviewerAgent(this.ctx, this.baseDir);
    await reviewer.run();

    // Read handoff file if it exists
    const handoffPath = path.join(this.ctx.runDir, 'reviewer_handoff.md');
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      return `Reviewer agent completed.\\n\\n--- REVIEWER HANDOFF ---\\n${handoff}`;
    } catch {
      return 'Reviewer agent completed successfully. (No handoff written)';
    }
  }

  /**
   * Delegate research to the Researcher agent.
   */"""

if old not in content:
    raise ValueError("Could not find the old delegateToReviewer pattern in manager.ts")

content = content.replace(old, new)
manager_path.write_text(content)
print("Done. Patched delegateToReviewer in manager.ts")
