"""Patch src/commands/run.ts to pass consolidation trigger to ManagerAgent."""

filepath = 'src/commands/run.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add consolidation trigger detection and console log after librarian trigger block
old_block = """    if (librarianAutoTrigger) {
      console.log(chalk.magenta(`  ⚡ Auto-trigger: Librarian will run after Historian (run #${completedRuns + 1} in cycle)`));
    }

    // Run manager agent
    console.log(chalk.cyan('\\n→ Starting manager agent...'));
    const manager = new ManagerAgent(ctx, BASE_DIR, librarianAutoTrigger);"""

new_block = """    if (librarianAutoTrigger) {
      console.log(chalk.magenta(`  ⚡ Auto-trigger: Librarian will run after Historian (run #${completedRuns + 1} in cycle)`));
    }

    // Check if consolidation trigger was injected into the brief
    const processedBrief = await ctx.artifacts.readBrief();
    const consolidationAutoTrigger = processedBrief.includes('⚡ Consolidation-trigger:');

    if (consolidationAutoTrigger) {
      console.log(chalk.magenta('  ⚡ Consolidation-trigger: Consolidator will run after Historian'));
    }

    // Run manager agent
    console.log(chalk.cyan('\\n→ Starting manager agent...'));
    const manager = new ManagerAgent(ctx, BASE_DIR, librarianAutoTrigger, consolidationAutoTrigger);"""

assert old_block in content, f'Could not find old block in run.ts'
content = content.replace(old_block, new_block, 1)

with open(filepath, 'w') as f:
    f.write(content)

print('Patched src/commands/run.ts successfully')
