#!/usr/bin/env python3
"""Insert executeWriteTaskPlan method into manager.ts after executeListFiles."""

import re

with open('src/core/agents/manager.ts', 'r') as f:
    content = f.read()

# Find the end of executeListFiles method
# It ends with "    } catch (error: any) {\n      return `Error listing files: ${error.message}`;\n    }\n  }\n"
# followed by a blank line and the start of executeSearchMemory

method_code = '''
  /**
   * Write a structured task plan to the run directory.
   */
  private async executeWriteTaskPlan(input: { tasks: Array<{ id: string; description: string; files: string[]; passCriterion: string; dependsOn?: string[] }> }): Promise<string> {
    const plan: TaskPlan = { tasks: input.tasks };
    const errors = validateTaskPlan(plan);

    if (errors.length > 0) {
      return `Task plan validation failed:\\n${errors.map(e => `- ${e}`).join('\\n')}`;
    }

    // Build markdown
    const lines: string[] = ['# Task Plan\\n'];
    for (const task of plan.tasks) {
      const deps = task.dependsOn?.length ? ` (depends on: ${task.dependsOn.join(', ')})` : '';
      lines.push(`## ${task.id}: ${task.description}${deps}\\n`);
      lines.push(`- **Files**: ${task.files.join(', ')}`);
      lines.push(`- **Pass criterion**: ${task.passCriterion}`);
      lines.push('- **Status**: \\u23f3 pending\\n');
    }

    const content = lines.join('\\n');
    const planPath = path.join(this.ctx.runDir, 'task_plan.md');

    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, content, 'utf-8');

    await this.ctx.audit.log({
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'write_task_plan',
      allowed: true,
      note: `Task plan written with ${plan.tasks.length} tasks`,
    });

    return `Task plan written to task_plan.md with ${plan.tasks.length} tasks:\\n${plan.tasks.map(t => `- ${t.id}: ${t.description}`).join('\\n')}`;
  }
'''

# Insert after the closing of executeListFiles and before executeSearchMemory
# Look for the pattern: end of executeListFiles followed by Search memory comment
search_pattern = '  /**\n   * Search all memory files for a keyword.\n   */'
replacement = method_code + '\n  /**\n   * Search all memory files for a keyword.\n   */'

if search_pattern in content:
    content = content.replace(search_pattern, replacement, 1)
    with open('src/core/agents/manager.ts', 'w') as f:
        f.write(content)
    print("Method inserted successfully")
else:
    print("ERROR: Could not find insertion point")
    # Debug: print nearby content
    idx = content.find('executeSearchMemory')
    if idx >= 0:
        print(f"Found executeSearchMemory at index {idx}")
        print(repr(content[idx-200:idx]))
