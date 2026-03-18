#!/usr/bin/env python3
"""
Fix all silent catch {} blocks in src/ by adding error logging or intentional comments.

Strategy:
- For each file, look at catch blocks with context
- Determine the appropriate fix based on the surrounding try block
- Apply the fix
"""
import re
import os
import sys

# Base directory
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'src')

def get_module_tag(filepath):
    """Extract module tag from filepath for console.error messages."""
    basename = os.path.basename(filepath).replace('.ts', '')
    return basename

def get_context(lines, catch_line_idx, num_before=15):
    """Get lines before the catch to understand context."""
    start = max(0, catch_line_idx - num_before)
    return '\n'.join(lines[start:catch_line_idx + 3])

def classify_catch(lines, idx, filepath):
    """
    Classify a catch block and return the replacement.
    Returns (new_catch_line, classification)
    """
    context = get_context(lines, idx, 20)
    line = lines[idx]
    indent = len(line) - len(line.lstrip())
    indent_str = line[:indent]
    module = get_module_tag(filepath)
    
    # Already has a comment - improve it if needed
    if '/*' in line and '*/' in line:
        comment = re.search(r'/\*\s*(.*?)\s*\*/', line).group(1)
        if 'intentional' in comment.lower():
            return None, 'already-good'
        # Update existing comments to use intentional: prefix
        if comment in ('noop', 'skip', 'no brief', 'no report', 'no manifest', 
                       'no usage.json', 'no metrics.json', 'no audit.jsonl', 
                       'no task_scores.jsonl'):
            new_comment = f'/* intentional: {comment} */'
            new_line = re.sub(r'/\*.*?\*/', new_comment, line)
            return new_line, 'improved-comment'
        return None, 'already-has-comment'
    
    # Single-line catch with return (inline map/JSON.parse patterns)
    # e.g., .map(line => { try { return JSON.parse(line); } catch { return null; } })
    if 'catch' in line and 'return' in line and 'JSON.parse' in context:
        new_line = line.replace('catch {', 'catch { /* intentional: skip malformed JSON */')
        return new_line, 'inline-json-parse'
    
    # Check for various patterns in the try block context
    
    # Pattern A: File existence check (fs.access)
    if 'fs.access' in context or 'fsp.access' in context:
        # Check what happens after catch - if it's for checking existence
        if 'exists' in context.lower() or 'hasDigest' in context or 'access(' in context:
            new_line = line.rstrip() + '\n'
            # Check if catch is on same line as closing brace
            stripped = line.strip()
            if stripped == '} catch {':
                new_line = f'{indent_str}}} catch {{  /* intentional: file may not exist */\n'
                return new_line, 'file-access-check'
            elif stripped == 'catch {':
                new_line = f'{indent_str}catch {{  /* intentional: file may not exist */\n'
                return new_line, 'file-access-check'
    
    # Pattern for scaffold - directory existence check
    if 'fs.access' in context and ('projectDir' in context or 'scaffold' in filepath.lower()):
        stripped = line.strip()
        if stripped == '} catch {':
            return f'{indent_str}}} catch {{  /* intentional: directory does not exist yet */\n', 'dir-check'
    
    # Pattern B: readJsonSafe / readTextSafe / readJsonlSafe helpers
    func_name = ''
    for i in range(max(0, idx-15), idx):
        m = re.search(r'(?:async\s+)?function\s+(\w+)', lines[i])
        if m:
            func_name = m.group(1)
            break
    
    if func_name in ('readJsonSafe', 'readTextSafe', 'readJsonlSafe'):
        stripped = line.strip()
        if stripped == '} catch {':
            return f'{indent_str}}} catch {{  /* intentional: safe fallback for missing/malformed file */\n', 'safe-reader'
    
    # Pattern: JSON.parse in try block
    if 'JSON.parse' in context and ('readFile' not in context or func_name in ('readJsonSafe', 'readJsonlSafe')):
        stripped = line.strip()
        if stripped == '} catch {':
            return f'{indent_str}}} catch {{  /* intentional: parse may fail */\n', 'json-parse'
    
    # Now return None - we'll handle these per-file
    return None, 'unclassified'


def process_file(filepath):
    """Process a single file, fixing all catch blocks."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    changes = 0
    module = get_module_tag(filepath)
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Match catch { without any parameter and without existing comment
        if re.search(r'catch\s*\{', stripped) and 'catch (e' not in stripped and 'catch (err' not in stripped:
            # Skip if already has intentional comment
            if 'intentional:' in stripped:
                i += 1
                continue
            
            replacement, classification = classify_catch(lines, i, filepath)
            if replacement is not None:
                lines[i] = replacement.rstrip('\n')
                changes += 1
                i += 1
                continue
        
        i += 1
    
    if changes > 0:
        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))
    
    return changes


# First pass: handle the easy automatic classifications
# Then we'll handle the rest manually per-file

if __name__ == '__main__':
    total = 0
    for root, dirs, files in os.walk(SRC):
        for fname in files:
            if fname.endswith('.ts'):
                fp = os.path.join(root, fname)
                n = process_file(fp)
                if n > 0:
                    print(f'  {os.path.relpath(fp, BASE)}: {n} changes')
                    total += n
    print(f'\nTotal auto-fixed: {total}')
    
    # Count remaining
    import subprocess
    result = subprocess.run(
        ['grep', '-rn', 'catch\\s*{', 'src/', '--include=*.ts'],
        capture_output=True, text=True, cwd=BASE
    )
    remaining = [l for l in result.stdout.strip().split('\n') if l and 'intentional:' not in l and 'catch (e' not in l]
    print(f'Remaining to fix: {len(remaining)}')
    for l in remaining[:30]:
        print(f'  {l}')
