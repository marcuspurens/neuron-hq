#!/usr/bin/env python3
"""
Fix remaining silent catch {} blocks with precise per-file, per-line fixes.
Each fix is based on manual review of the context.
"""
import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Map of file -> list of (line_number, fix_type, detail)
# fix_type: 'comment' -> add /* intentional: detail */ on same line
#           'log' -> change to catch (err) { console.error('[module] detail:', err);
#           'comment-existing' -> the line already has a comment, just add intentional: prefix
# line_number is 1-based

FIXES = {
    # === src/core/migrate.ts ===
    'src/core/migrate.ts': [
        (76, 'comment', 'migrations dir may not exist'),
        (90, 'comment', 'migrations table may not exist yet'),
    ],

    # === src/core/ollama.ts ===
    'src/core/ollama.ts': [
        (44, 'comment', 'ollama may not be reachable'),
        (67, 'comment', 'waiting for ollama to start'),
        (108, 'comment', 'ollama not reachable'),
    ],

    # === src/core/dashboard-server.ts ===
    'src/core/dashboard-server.ts': [
        (96, 'comment', 'SSE client may have disconnected'),
        (134, 'comment', 'client may have disconnected during replay'),
        (204, 'comment', 'skip runs with invalid metrics'),
        (217, 'log', 'listing runs failed'),
        (237, 'comment', 'brief file not found — return 404'),
        (261, 'comment', 'digest file not found — return 404'),
        (307, 'comment', 'decisions data not found — return 404'),
        (339, 'comment', 'client may already be gone'),
    ],

    # === src/core/verify.ts ===
    'src/core/verify.ts': [
        (44, 'comment', 'no package.json or unreadable'),
    ],

    # === src/core/cost-tracking.ts ===
    'src/core/cost-tracking.ts': [
        (124, 'comment', 'runs directory may not exist'),
    ],

    # === src/core/run-statistics.ts ===
    'src/core/run-statistics.ts': [
        (652, 'comment', 'runs directory may not exist'),
    ],

    # === src/core/agents/merger.ts ===
    'src/core/agents/merger.ts': [
        (71, 'comment', 'report.md not found'),
    ],

    # === src/core/agents/brief-agent.ts ===
    'src/core/agents/brief-agent.ts': [
        (189, 'comment', 'file tree command may fail'),
        (200, 'comment', 'git log may fail'),
        (227, 'comment', 'no example briefs directory'),
    ],

    # === src/core/agents/manager.ts ===
    'src/core/agents/manager.ts': [
        (246, 'comment', 'DB not available — skip adaptive hints'),
        (430, 'comment', 'non-fatal decision extraction failure'),
        (805, 'comment', 'memory file not found'),
        (848, 'comment', 'no JSON result file'),
        (873, 'comment', 'handoff file not readable'),
        (944, 'comment', 'no handoff file'),
        (956, 'comment', 'best-effort worktree cleanup'),
        (1038, 'comment', 'no JSON result file'),
        (1069, 'comment', 'handoff file not readable'),
        (1241, 'comment', 'file does not exist yet — will create'),
    ],

    # === src/core/agents/agent-utils.ts ===
    'src/core/agents/agent-utils.ts': [
        (192, 'comment', 'memory file may not exist'),
    ],

    # === src/core/agents/reviewer.ts ===
    'src/core/agents/reviewer.ts': [
        (127, 'comment', 'implementer result may not exist'),
        (173, 'log', 'writing reviewer result failed'),
        (185, 'comment', 'report.md may not exist yet'),
    ],

    # === src/core/agents/historian.ts ===
    'src/core/agents/historian.ts': [
        (473, 'log', 'saving historian knowledge failed'),
        (490, 'log', 'historian audit log failed'),
        (538, 'comment', 'knowledge.md may not exist'),
        (654, 'log', 'updating knowledge graph failed'),
        (677, 'log', 'persisting knowledge-graph state failed'),
        (723, 'comment', 'knowledge-graph file may not exist'),
        (749, 'log', 'semantic search indexing failed'),
        (791, 'log', 'graph merge failed'),
    ],

    # === src/core/agents/knowledge-manager.ts ===
    'src/core/agents/knowledge-manager.ts': [
        (265, 'log', 'reading knowledge file failed'),
        (358, 'comment', 'graph.json may not exist'),
        (381, 'log', 'writing graph data failed'),
    ],

    # === src/core/agents/librarian.ts ===
    'src/core/agents/librarian.ts': [
        (360, 'log', 'indexing run failed'),
        (388, 'comment', 'knowledge.md may not exist'),
    ],

    # === src/core/agents/implementer.ts ===
    'src/core/agents/implementer.ts': [
        (110, 'comment', 'questions.md may not exist'),
    ],

    # === src/core/agents/consolidator.ts ===
    'src/core/agents/consolidator.ts': [
        (422, 'comment', 'knowledge.md may not exist'),
    ],

    # === src/core/embeddings.ts ===
    'src/core/embeddings.ts': [
        (67, 'comment', 'ollama embedding not available'),
    ],

    # === src/core/shutdown.ts ===
    'src/core/shutdown.ts': [
        (22, 'comment', 'best-effort cleanup on shutdown'),
    ],

    # === src/core/emergency-save.ts ===
    'src/core/emergency-save.ts': [
        (38, 'comment', 'best-effort emergency save'),
        (54, 'comment', 'best-effort emergency save'),
        (63, 'comment', 'best-effort emergency save'),
        (93, 'comment', 'best-effort emergency save'),
        (114, 'comment', 'best-effort emergency save'),
        (133, 'comment', 'best-effort emergency save'),
    ],

    # === src/core/graph-merge.ts ===
    'src/core/graph-merge.ts': [
        (145, 'log', 'graph merge failed'),
    ],

    # === src/core/prompt-overlays.ts ===
    'src/core/prompt-overlays.ts': [
        (65, 'comment', 'overlay file may not exist'),
        (72, 'comment', 'overlay file may not exist'),
    ],

    # === src/core/baseline.ts ===
    'src/core/baseline.ts': [
        (37, 'comment', 'baseline file may not exist'),
        (51, 'comment', 'baseline file may not exist'),
        (62, 'comment', 'baseline file may not exist'),
    ],

    # === src/core/audit.ts ===
    'src/core/audit.ts': [
        (27, 'comment', 'best-effort audit append'),
    ],

    # === src/core/git.ts ===
    'src/core/git.ts': [
        (58, 'comment', 'git command may fail'),
        (105, 'comment', 'git command may fail'),
        (143, 'comment', 'git command may fail'),
        (160, 'comment', 'best-effort worktree cleanup'),
    ],

    # === src/core/run.ts ===
    'src/core/run.ts': [
        (56, 'comment', 'target config file may not exist'),
        (69, 'comment', 'target config file may not exist'),
        (264, 'log', 'saving run manifest failed'),
        (359, 'comment', 'best-effort file write'),
        (366, 'comment', 'best-effort file write'),
        (374, 'comment', 'best-effort file write'),
        (388, 'comment', 'best-effort metrics save'),
        (400, 'comment', 'best-effort file write'),
        (411, 'comment', 'best-effort file write'),
        (464, 'comment', 'best-effort file write'),
        (471, 'comment', 'best-effort file write'),
        (509, 'comment', 'best-effort file write'),
        (565, 'comment', 'best-effort file write'),
    ],

    # === src/aurora/worker-bridge.ts ===
    'src/aurora/worker-bridge.ts': [
        (133, 'log', 'worker bridge request failed'),
    ],

    # === src/aurora/web-search.ts ===
    'src/aurora/web-search.ts': [
        (36, 'log', 'web search failed'),
        (82, 'comment', 'URL fetch may fail'),
    ],

    # === src/aurora/job-runner.ts ===
    'src/aurora/job-runner.ts': [
        (194, 'log', 'updating job progress failed'),
        (221, 'log', 'saving job result failed'),
        (358, 'comment', 'best-effort progress update'),
        (616, 'log', 'job execution failed'),
    ],

    # === src/aurora/external-ids.ts ===
    'src/aurora/external-ids.ts': [
        (59, 'comment', 'external-ids file may not exist'),
        (64, 'comment', 'JSON parse may fail for external-ids'),
        (388, 'log', 'saving external IDs failed'),
        (418, 'log', 'saving external IDs failed'),
    ],

    # === src/aurora/video.ts ===
    'src/aurora/video.ts': [
        (120, 'log', 'video processing failed'),
        (403, 'log', 'video thumbnail extraction failed'),
        (437, 'log', 'video metadata read failed'),
    ],

    # === src/aurora/job-worker.ts ===
    'src/aurora/job-worker.ts': [
        (33, 'comment', 'jobs directory may not exist'),
    ],

    # === src/aurora/briefing.ts ===
    'src/aurora/briefing.ts': [
        (76, 'log', 'briefing generation failed'),
        (147, 'comment', 'JSON parse may fail'),
        (152, 'log', 'briefing loading failed'),
        (191, 'log', 'briefing save failed'),
    ],

    # === src/aurora/crossref.ts ===
    'src/aurora/crossref.ts': [
        (81, 'log', 'crossref API call failed'),
        (85, 'comment', 'JSON parse may fail for crossref'),
    ],

    # === src/aurora/search.ts ===
    'src/aurora/search.ts': [
        (149, 'log', 'search failed'),
    ],

    # === src/aurora/ontology.ts ===
    'src/aurora/ontology.ts': [
        (103, 'comment', 'ontology file may not exist'),
        (157, 'log', 'ontology persist failed'),
        (222, 'log', 'ontology classification failed'),
        (272, 'log', 'ontology load failed'),
        (468, 'log', 'ontology update failed'),
        (629, 'log', 'ontology merge failed'),
    ],

    # === src/aurora/gap-brief.ts ===
    'src/aurora/gap-brief.ts': [
        (50, 'log', 'loading gap briefs failed'),
        (145, 'log', 'gap brief generation failed'),
        (195, 'comment', 'JSON parse may fail'),
        (199, 'log', 'reading gap brief failed'),
        (260, 'log', 'gap brief save failed'),
    ],

    # === src/aurora/knowledge-gaps.ts ===
    'src/aurora/knowledge-gaps.ts': [
        (83, 'comment', 'knowledge-gaps file may not exist'),
        (197, 'log', 'knowledge gap analysis failed'),
        (290, 'comment', 'JSON parse may fail'),
        (306, 'log', 'knowledge gap save failed'),
    ],

    # === src/aurora/speaker-guesser.ts ===
    # (already fixed in v1)

    # === src/aurora/ask.ts ===
    'src/aurora/ask.ts': [
        (78, 'log', 'ask query failed'),
        (174, 'log', 'ask context loading failed'),
        (225, 'comment', 'context file may not exist'),
    ],

    # === src/aurora/knowledge-library.ts ===
    'src/aurora/knowledge-library.ts': [
        (142, 'log', 'loading knowledge entry failed'),
        (215, 'log', 'knowledge library search failed'),
        (427, 'log', 'knowledge library save failed'),
        (456, 'comment', 'JSON parse may fail'),
        (513, 'log', 'knowledge library indexing failed'),
        (628, 'log', 'knowledge library merge failed'),
    ],

    # === src/aurora/memory.ts ===
    'src/aurora/memory.ts': [
        (153, 'log', 'memory load failed'),
        (258, 'log', 'memory save failed'),
        (349, 'comment', 'memory file may not exist'),
    ],

    # === src/aurora/intake.ts ===
    'src/aurora/intake.ts': [
        (289, 'comment', 'JSON parse may fail'),
        (294, 'log', 'intake processing failed'),
    ],

    # === src/mcp/tools/knowledge.ts ===
    'src/mcp/tools/knowledge.ts': [
        (56, 'comment', 'JSON parse may fail'),
        (75, 'log', 'knowledge tool query failed'),
        (120, 'log', 'knowledge tool operation failed'),
    ],

    # === src/mcp/tools/runs.ts ===
    'src/mcp/tools/runs.ts': [
        (122, 'log', 'reading run data failed'),
        (143, 'comment', 'JSON parse may fail'),
        (155, 'log', 'listing runs failed'),
        (203, 'log', 'reading run details failed'),
        (208, 'log', 'reading run digest failed'),
    ],

    # === src/mcp/tools/knowledge-manager.ts ===
    'src/mcp/tools/knowledge-manager.ts': [
        (49, 'log', 'knowledge manager operation failed'),
    ],

    # === src/mcp/server.ts ===
    'src/mcp/server.ts': [
        (62, 'comment', 'best-effort server cleanup'),
    ],

    # === src/commands/status.ts ===
    'src/commands/status.ts': [
        (37, 'comment', 'manifest may not exist'),
    ],

    # === src/commands/aurora-describe-image.ts ===
    'src/commands/aurora-describe-image.ts': [
        (23, 'log', 'image description failed'),
    ],

    # === src/commands/scaffold.ts ===
    'src/commands/scaffold.ts': [
        (49, 'comment', 'target config may not exist'),
    ],

    # === src/commands/db-import.ts ===
    'src/commands/db-import.ts': [
        (100, 'log', 'reading run metrics failed'),
        (144, 'log', 'reading run brief failed'),
        (222, 'log', 'inserting run data failed'),
        (278, 'log', 'reading run knowledge failed'),
    ],

    # === src/commands/costs.ts ===
    'src/commands/costs.ts': [
        (87, 'log', 'loading cost data failed'),
        (108, 'comment', 'run cost data may not be available'),
    ],

    # === src/commands/logs.ts ===
    # (already fixed in v1 probably, but let's check)

    # === src/commands/knowledge-manager.ts ===
    'src/commands/knowledge-manager.ts': [
        (56, 'log', 'knowledge manager command failed'),
    ],

    # === src/commands/dashboard-data.ts ===
    'src/commands/dashboard-data.ts': [
        (267, 'comment', 'run data may be incomplete'),
        (300, 'log', 'dashboard data generation failed'),
        (319, 'log', 'dashboard data aggregation failed'),
    ],

    # === src/commands/monitor.ts ===
    'src/commands/monitor.ts': [
        (83, 'log', 'monitor operation failed'),
    ],

    # === src/commands/resume.ts ===
    'src/commands/resume.ts': [
        (18, 'comment', 'run directory may not exist'),
        (43, 'comment', 'manifest may not exist'),
        (96, 'comment', 'previous state may not exist'),
        (111, 'log', 'resume state restore failed'),
        (166, 'comment', 'report file may not exist'),
    ],

    # === src/commands/run.ts ===
    'src/commands/run.ts': [
        (107, 'comment', 'target config may not exist'),
        (231, 'log', 'run cleanup failed'),
    ],
}

def apply_fix(filepath, line_num, fix_type, detail):
    """Apply a single fix to a file."""
    full_path = os.path.join(BASE, filepath)
    with open(full_path, 'r') as f:
        lines = f.readlines()
    
    idx = line_num - 1
    if idx >= len(lines):
        print(f'  WARNING: line {line_num} out of range in {filepath}')
        return False
    
    line = lines[idx]
    
    # Check this line actually has 'catch {'
    if 'catch' not in line or '{' not in line:
        print(f'  WARNING: line {line_num} in {filepath} does not contain catch {{: {line.rstrip()}')
        return False
    
    # Skip if already fixed
    if 'intentional:' in line or 'catch (err' in line or 'catch (e)' in line:
        return False
    
    module = os.path.basename(filepath).replace('.ts', '')
    
    if fix_type == 'comment':
        # Add intentional comment
        new_line = line.rstrip().rstrip('}').rstrip()
        if new_line.endswith('catch {'):
            # } catch {  ->  } catch { /* intentional: detail */
            new_line = new_line + '  /* intentional: ' + detail + ' */\n'
        else:
            new_line = line.rstrip() + '  /* intentional: ' + detail + ' */\n'
        lines[idx] = new_line
    
    elif fix_type == 'log':
        # Change catch { to catch (err) { console.error(...); 
        indent = len(line) - len(line.lstrip())
        inner_indent = indent + 2  # Inside the catch block
        
        # Replace catch { with catch (err) {
        new_catch_line = line.replace('catch {', 'catch (err) {')
        lines[idx] = new_catch_line
        
        # Now we need to add console.error on the next line
        # Check if the next line is } (empty catch) or has content
        next_idx = idx + 1
        if next_idx < len(lines):
            next_line = lines[next_idx].strip()
            if next_line == '}' or next_line == '} catch' or next_line.startswith('}'):
                # Empty catch block - insert console.error before the closing }
                log_line = ' ' * inner_indent + f"console.error('[{module}] {detail}:', err);\n"
                lines.insert(next_idx, log_line)
            elif next_line.startswith('//') or next_line == '':
                # Comment or empty - replace with console.error
                log_line = ' ' * inner_indent + f"console.error('[{module}] {detail}:', err);\n"
                lines[next_idx] = log_line
            else:
                # Has content already - insert console.error before it
                log_line = ' ' * inner_indent + f"console.error('[{module}] {detail}:', err);\n"
                lines.insert(next_idx, log_line)
    
    with open(full_path, 'w') as f:
        f.writelines(lines)
    
    return True

def main():
    total = 0
    for filepath, fixes in FIXES.items():
        file_changes = 0
        # Process fixes in reverse line order to avoid line number shifts
        sorted_fixes = sorted(fixes, key=lambda x: x[0], reverse=True)
        for line_num, fix_type, detail in sorted_fixes:
            if apply_fix(filepath, line_num, fix_type, detail):
                file_changes += 1
        if file_changes > 0:
            print(f'  {filepath}: {file_changes} changes')
            total += file_changes
    
    print(f'\nTotal fixed: {total}')

if __name__ == '__main__':
    main()
