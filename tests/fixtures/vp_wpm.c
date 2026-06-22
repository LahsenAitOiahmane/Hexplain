#include <windows.h>
#include <stdio.h>

int main() {
    DWORD oldProtect;
    VirtualProtect(NULL, 0, PAGE_EXECUTE_READWRITE, &oldProtect);
    WriteProcessMemory(GetCurrentProcess(), NULL, NULL, 0, NULL);
    printf("VirtualProtect and WriteProcessMemory called\n");
    return 0;
}
