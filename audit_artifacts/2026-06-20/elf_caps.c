#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#ifndef AUDIT_MARKER
#define AUDIT_MARKER "base"
#endif

int main(void) {
    char host[256] = {0};
    const char *path = getenv("PATH");
    printf("marker=%s\n", AUDIT_MARKER);
    if (gethostname(host, sizeof(host)) == 0) {
        printf("host=%s\n", host);
    }
    if (path != NULL) {
        printf("path-len=%zu\n", sizeof(path));
    }

    DIR *dir = opendir(".");
    if (dir != NULL) {
        struct dirent *entry = readdir(dir);
        if (entry != NULL) {
            printf("first=%s\n", entry->d_name);
        }
        closedir(dir);
    }
    return 0;
}
