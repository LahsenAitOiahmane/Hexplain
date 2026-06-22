#include <stdio.h>

// 64-character hex string to trigger the "Big_Numbers3" YARA rule from crypto_signatures.yar
const char* yara_trigger = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f61234";

int main() {
    printf("YARA teeth test: %s\n", yara_trigger);
    return 0;
}
