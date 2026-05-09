import re
import subprocess
import sys

def get_original_file(path):
    """Get original file from commit 8b7f642"""
    try:
        result = subprocess.run(['git', 'show', f'8b7f642:{path}'], 
                              capture_output=True, text=True)
        return result.stdout
    except:
        print(f"Error getting original file {path}")
        return None

def restore_auth_functions():
    original = get_original_file('src/features/auth/auth.functions.ts')
    if not original:
        return
    
    with open('src/features/auth/auth.functions.ts', 'r') as f:
        current = f.read()
    
    # Find all if (isDev) { ... } blocks in current
    lines = current.split('\n')
    output_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        if 'if (isDev) {' in line:
            # This is a block we need to replace
            # Find matching }
            j = i
            brace_count = 0
            while j < len(lines):
                brace_count += lines[j].count('{')
                brace_count -= lines[j].count('}')
                if brace_count == 0 and j > i:
                    break
                j += 1
            
            # Get context to find original log statements
            # Look back for function signature
            context_lines = []
            for k in range(max(0, i-10), i):
                context_lines.append(lines[k])
            
            context = '\n'.join(context_lines)
            
            # For now, just remove the empty block
            # We'll need more sophisticated matching to restore logs
            print(f"Found empty if (isDev) block at lines {i+1}-{j+1}")
            print(f"Context: {context[-100:] if len(context) > 100 else context}")
            print()
            
            # Skip this block
            i = j + 1
            continue
        else:
            output_lines.append(line)
            i += 1
    
    # For now, write back without empty blocks
    with open('src/features/auth/auth.functions.ts', 'w') as f:
        f.write('\n'.join(output_lines))
    
    print("Removed empty if (isDev) blocks. Need to restore logs manually.")

if __name__ == '__main__':
    restore_auth_functions()
