#include <windows.h>
#include <stdio.h>

int main() {
    HKEY hKey;
    DWORD dwDisposition;
    const char* value = "MalwaireTest";
    
    // Attempt to open/create a registry key
    if (RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\Malwaire", 0, NULL, 0, KEY_WRITE, NULL, &hKey, &dwDisposition) == ERROR_SUCCESS) {
        printf("Registry key created/opened.\n");
        
        // Attempt to set a registry value (This matches T1112/T1012 capa rules)
        if (RegSetValueExA(hKey, "TestValue", 0, REG_SZ, (const BYTE*)value, strlen(value) + 1) == ERROR_SUCCESS) {
            printf("Registry value set.\n");
        }
        
        RegCloseKey(hKey);
    }
    return 0;
}
