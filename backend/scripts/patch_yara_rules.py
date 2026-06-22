import os
import re
from pathlib import Path

RULES_DIR = Path("/build/yara-rules")

def remove_rule(filepath: Path, rule_name: str):
    if not filepath.exists():
        return
    content = filepath.read_text(encoding="utf-8", errors="replace")
    # Matches 'rule <rule_name> { ... }' accounting for nested blocks if simple, but YARA rules usually don't have nested braces in condition except for strings or loops. 
    # A safer regex: find 'rule <name>' and then find the first '}' that closes it.
    # To be extremely safe, we can match from 'rule <rule_name>' to the next 'rule ' or end of file, or use a naive regex if we know the rule doesn't contain '}'.
    
    # We know the specific rules don't have tricky braces. 
    # Using a regex that captures everything until a line starting with '}' 
    pattern = re.compile(r'rule\s+' + re.escape(rule_name) + r'\b.*?^}', re.MULTILINE | re.DOTALL)
    new_content, count = pattern.subn('', content)
    if count > 0:
        filepath.write_text(new_content, encoding="utf-8")
        print(f"Removed rule '{rule_name}' from {filepath.name}")

def patch_azorult():
    azorult_path = RULES_DIR / "malware" / "MALW_AZORULT.yar"
    if not azorult_path.exists():
        return
    source = azorult_path.read_text(encoding="utf-8", errors="replace")
    source = source.replace('import "cuckoo"\n', "")
    source = source.replace(
        "($mz at 0 and all of ($string*) and ($constant1 or $constant2) or cuckoo.sync.mutex(/Ad48qw4d6wq84d56as|Adkhvhhydhasdasashbc/))",
        "($mz at 0 and all of ($string*) and ($constant1 or $constant2))",
    )
    azorult_path.write_text(source, encoding="utf-8")
    print("Patched MALW_AZORULT.yar")

def inject_common_rules():
    common_path = RULES_DIR / "malware" / "000_common_rules.yar"
    if not common_path.exists():
        return
    
    source = common_path.read_text(encoding="utf-8", errors="replace")
    common_prefix = source.replace("rule is__Mirai_gen7", "private rule is__Mirai_gen7")
    
    patched_count = 0
    for root, _, files in os.walk(RULES_DIR):
        for filename in files:
            if not filename.endswith(".yar") and not filename.endswith(".yara"):
                continue
            if filename == "000_common_rules.yar":
                continue
            
            filepath = Path(root) / filename
            content = filepath.read_text(encoding="utf-8", errors="replace")
            
            if "is__elf" in content or "is__Mirai_gen7" in content:
                # Add the common prefix if not already present
                if "rule is__elf" not in content:
                    content = f"{common_prefix}\n\n{content}"
                    filepath.write_text(content, encoding="utf-8")
                    patched_count += 1

    print(f"Injected common helpers into {patched_count} files")

def main():
    if not RULES_DIR.exists():
        print(f"Rules directory {RULES_DIR} not found. Skipping.")
        return
        
    print("Patching YARA rules...")
    # 1. Remove noisy rules
    remove_rule(RULES_DIR / "malware" / "MALW_Miscelanea.yar", "spyeye")
    remove_rule(RULES_DIR / "malware" / "MALW_Miscelanea.yar", "spyeye_plugins")
    remove_rule(RULES_DIR / "packers" / "peid.yar", "Microsoft_Visual_Cpp_80_DLL")
    remove_rule(RULES_DIR / "packers" / "peid.yar", "Microsoft_Visual_Cpp_80_DLL_additional")
    
    # 2. Patch AZORult
    patch_azorult()
    
    # 3. Inject common rules where needed
    inject_common_rules()
    print("YARA rules patched successfully.")

if __name__ == "__main__":
    main()
