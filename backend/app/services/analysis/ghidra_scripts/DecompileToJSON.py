# MalwAIre - Ghidra Decompilation Script (Jython)
#
# This script runs inside Ghidra's headless analyzer (Jython 2.7).
# It decompiles the most relevant functions to pseudo-C and writes
# the output as JSON.
#
# Function selection priority:
#   1. Entry point / main / _start
#   2. Functions with highest cross-reference count (most-called)
#   3. Remaining by address order
#
# Arguments (passed via Ghidra -postScript):
#   arg[0] = max number of functions to decompile (default: 10)
#   arg[1] = output JSON file path
#
# Security: This script performs static analysis only. Ghidra reads
# the binary structure but does NOT execute or emulate it.

import json
import os
import sys

from ghidra.app.decompiler import DecompInterface, DecompileOptions
from ghidra.util.task import ConsoleTaskMonitor

# Maximum lines per decompiled function
MAX_LINES_PER_FUNCTION = 200


def get_args():
    """Parse script arguments."""
    args = getScriptArgs()
    max_funcs = 10
    output_path = "/tmp/decompiled_output.json"

    if len(args) >= 1:
        try:
            max_funcs = int(args[0])
        except (ValueError, TypeError):
            max_funcs = 10

    if len(args) >= 2:
        output_path = args[1]

    return max_funcs, output_path


def get_xref_count(func):
    """Count incoming references (callers) to a function."""
    try:
        refs = getReferencesTo(func.getEntryPoint())
        return len([r for r in refs])
    except Exception:
        return 0


def select_functions(program, max_funcs):
    """
    Select the most relevant functions for decompilation.

    Priority:
      1. Entry point / main / _start
      2. By cross-reference count (most-called first)
      3. By address order (for remaining slots)
    """
    fm = program.getFunctionManager()
    all_funcs = list(fm.getFunctions(True))
    total_count = len(all_funcs)

    if total_count == 0:
        return [], total_count

    selected = []
    selected_addrs = set()

    # Priority 1: Entry point and well-known names
    priority_names = {"main", "_start", "entry", "DllMain", "WinMain",
                      "wWinMain", "_main", "__main", "start", "_init"}

    for func in all_funcs:
        name = func.getName()
        if name in priority_names or func.getEntryPoint() == program.getMinAddress():
            if str(func.getEntryPoint()) not in selected_addrs:
                selected.append(func)
                selected_addrs.add(str(func.getEntryPoint()))

    # Priority 2: By cross-reference count
    remaining = [f for f in all_funcs
                 if str(f.getEntryPoint()) not in selected_addrs]

    # Sort by xref count (descending)
    func_xrefs = []
    for func in remaining:
        xref_count = get_xref_count(func)
        func_xrefs.append((func, xref_count))

    func_xrefs.sort(key=lambda x: x[1], reverse=True)

    for func, _count in func_xrefs:
        if len(selected) >= max_funcs:
            break
        # Skip thunks and very small functions (likely stubs)
        try:
            body = func.getBody()
            if body.getNumAddresses() < 4:
                continue
        except Exception:
            pass
        selected.append(func)
        selected_addrs.add(str(func.getEntryPoint()))

    return selected[:max_funcs], total_count


def decompile_functions(program, functions, monitor):
    """Decompile a list of functions and return results."""
    decomp = DecompInterface()

    # Configure decompiler options
    opts = DecompileOptions()
    decomp.setOptions(opts)
    decomp.openProgram(program)

    results = []

    for func in functions:
        try:
            # Decompile with 30-second timeout per function
            decomp_result = decomp.decompileFunction(func, 30, monitor)

            if decomp_result and decomp_result.getDecompiledFunction():
                code = decomp_result.getDecompiledFunction().getC()

                # Truncate to MAX_LINES_PER_FUNCTION
                lines = code.split("\n")
                truncated = len(lines) > MAX_LINES_PER_FUNCTION
                if truncated:
                    lines = lines[:MAX_LINES_PER_FUNCTION]
                    lines.append("// ... truncated (exceeded %d line limit)" % MAX_LINES_PER_FUNCTION)

                code = "\n".join(lines)

                # Extract cross-references (calls and strings)
                xrefs = {"calls": [], "strings": []}
                try:
                    ref_mgr = program.getReferenceManager()
                    listing = program.getListing()
                    calls = set()
                    strings = set()
                    
                    for addr in func.getBody().getAddresses(True):
                        for ref in ref_mgr.getReferencesFrom(addr):
                            to_addr = ref.getToAddress()
                            
                            # Check if it's a function
                            called_func = program.getFunctionManager().getFunctionAt(to_addr)
                            if called_func:
                                calls.add(called_func.getName())
                                continue
                            
                            # Check if it's data (like a string)
                            data = listing.getDataAt(to_addr)
                            if data:
                                # String objects might be StringDataInstance or just have a string-like value
                                try:
                                    # Fallback check for strings
                                    val = str(data.getValue())
                                    if len(val) > 1 and len(val) < 200:
                                        # Only add if it looks like a readable string, avoiding random bytes
                                        # StringDataInstance often returns something like "http://bad.com"
                                        if any(c.isalpha() for c in val):
                                            strings.add(val)
                                except Exception:
                                    pass

                    xrefs["calls"] = list(calls)[:50]  # Cap at 50 unique to avoid bloat
                    xrefs["strings"] = list(strings)[:50]
                except Exception as e:
                    xrefs["error"] = str(e)
                    
                # Extract disassembly instructions
                assembly = []
                try:
                    listing = program.getListing()
                    instructions = listing.getInstructions(func.getBody(), True)
                    
                    # Cap at 500 instructions to keep JSON size reasonable
                    max_instructions = 500
                    count = 0
                    
                    for instr in instructions:
                        if count >= max_instructions:
                            assembly.append({
                                "address": "...",
                                "mnemonic": "...",
                                "operands": "[truncated]"
                            })
                            break
                            
                        # Extract basic info safely
                        instr_str = str(instr)
                        mnemonic = str(instr.getMnemonicString())
                        # The operands are the remainder of the string after the mnemonic
                        operands = instr_str[len(mnemonic):].strip() if instr_str.startswith(mnemonic) else ""
                        
                        assembly.append({
                            "address": str(instr.getAddress()),
                            "mnemonic": mnemonic,
                            "operands": operands
                        })
                        count += 1
                except Exception as e:
                    assembly.append({"address": "error", "mnemonic": "error", "operands": str(e)})

                results.append({
                    "name": func.getName(),
                    "address": str(func.getEntryPoint()),
                    "decompiled": code,
                    "line_count": min(len(code.split("\n")), MAX_LINES_PER_FUNCTION),
                    "truncated": truncated,
                    "xrefs": xrefs,
                    "assembly": assembly,
                    "pipeline": "native",
                })
            else:
                error_msg = ""
                if decomp_result:
                    error_msg = str(decomp_result.getErrorMessage() or "")
                results.append({
                    "name": func.getName(),
                    "address": str(func.getEntryPoint()),
                    "decompiled": None,
                    "line_count": 0,
                    "error": error_msg or "Decompilation returned no result",
                    "xrefs": {"calls": [], "strings": []},
                    "assembly": [],
                    "pipeline": "native",
                })

        except Exception as e:
            results.append({
                "name": func.getName(),
                "address": str(func.getEntryPoint()),
                "decompiled": None,
                "line_count": 0,
                "error": str(e),
                "xrefs": {"calls": [], "strings": []},
                "assembly": [],
                "pipeline": "native",
            })

    decomp.dispose()
    return results


def main():
    """Main script entry point."""
    max_funcs, output_path = get_args()

    monitor = ConsoleTaskMonitor()
    program = currentProgram

    if program is None:
        output = {
            "functions": [],
            "total_functions_decompiled": 0,
            "total_functions_in_binary": 0,
            "error": "No program loaded",
        }
    else:
        # Select functions
        functions, total_in_binary = select_functions(program, max_funcs)

        # Decompile
        if functions:
            decompiled = decompile_functions(program, functions, monitor)
        else:
            decompiled = []

        successful = len([f for f in decompiled if f.get("decompiled")])

        output = {
            "functions": decompiled,
            "total_functions_decompiled": successful,
            "total_functions_in_binary": total_in_binary,
        }

    # Write output JSON
    try:
        parent_dir = os.path.dirname(output_path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir)

        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
    except Exception as e:
        println("ERROR writing output: " + str(e))


# Run the script
main()
