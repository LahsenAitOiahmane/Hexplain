import os
import yaml
from pathlib import Path

RULES_DIR = Path("/build/capa-rules")

def patch_registry_rules():
    reg_dir = RULES_DIR / "host-interaction" / "registry"
    if not reg_dir.exists():
        print(f"Registry dir {reg_dir} not found!")
        return

    patched = 0
    for root, _, files in os.walk(RULES_DIR):
        for file in files:
            if not file.endswith(".yml"):
                continue
            path = Path(root) / file
            content = path.read_text(encoding="utf-8")
            if "T1012" in content or "T1112" in content:
                # Naive patch: inject `- os: windows` right after `features:` or `  features:` if not there
                if "- os: windows" not in content and "- os: linux" not in content:
                    # Let's just use string replacement
                    content = content.replace("  features:\n    - or:\n", "  features:\n    - and:\n      - os: windows\n      - or:\n")
                    content = content.replace("  features:\n    - and:\n", "  features:\n    - and:\n      - os: windows\n")
                    path.write_text(content, encoding="utf-8")
                    patched += 1

    print(f"Patched {patched} capa rules to enforce os: windows")

if __name__ == "__main__":
    patch_registry_rules()
