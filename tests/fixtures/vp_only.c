#include <windows.h>
#include <stdio.h>

int main() {
    DWORD oldProtect;
    VirtualProtect(NULL, 0, PAGE_EXECUTE_READWRITE, &oldProtect);
    printf("VirtualProtect called\n");
    return 0;
}
