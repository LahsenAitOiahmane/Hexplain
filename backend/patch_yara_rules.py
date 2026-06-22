import os
import re

RULES_DIR = "/build/yara-rules"

def patch_rules():
    """
    Remove problematic includes and rules from the cloned YARA repo
    to allow it to compile as a standalone bundle.
    """
    if not os.path.exists(RULES_DIR):
        print(f"Directory {RULES_DIR} not found.")
        return

    for root, dirs, files in os.walk(RULES_DIR):
        for file in files:
            if not file.endswith((".yar", ".yara")):
                continue
            
            filepath = os.path.join(root, file)
            
            # Read file
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
            except Exception as e:
                print(f"Skipping unreadable file {filepath}: {e}")
                continue
                
            # Filter lines
            new_lines = []
            for line in lines:
                # Remove include statements (which cause path resolution errors)
                if line.strip().startswith("include "):
                    continue
                new_lines.append(line)
                
            # Write back
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.writelines(new_lines)
            except Exception as e:
                print(f"Failed to write file {filepath}: {e}")

if __name__ == "__main__":
    patch_rules()
