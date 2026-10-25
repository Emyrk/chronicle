// cascget "<cachedir>*<product>*<region>" <fid|name:path>=<outfile> ...
#include "CascLib.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static bool WINAPI progress(void*, CASC_PROGRESS_MSG msg, LPCSTR obj, DWORD cur, DWORD tot) {
    if (tot && cur % 200 != 0 && cur != tot) return false;
    fprintf(stderr, "[casc] msg=%d %s %u/%u\n", (int)msg, obj ? obj : "", cur, tot);
    return false;
}

int main(int argc, char** argv) {
    if (argc < 2) { fprintf(stderr, "usage: cascget PARAMS [fid=out ...]   (no specs: just report the build)\n"); return 2; }
    CASC_OPEN_STORAGE_ARGS args = {sizeof(CASC_OPEN_STORAGE_ARGS)};
    args.dwLocaleMask = CASC_LOCALE_ENUS;
    args.PfnProgressCallback = progress;
    HANDLE hs = NULL;
    if (!CascOpenStorageEx(argv[1], &args, true, &hs)) {
        fprintf(stderr, "open storage failed: %u\n", GetCascError()); return 1;
    }
    CASC_STORAGE_PRODUCT prod = {};
    if (CascGetStorageInfo(hs, CascStorageProduct, &prod, sizeof(prod), NULL))
        fprintf(stderr, "[casc] product=%s build=%u\n", prod.szCodeName, prod.BuildNumber);
    int failed = 0;
    for (int i = 2; i < argc; i++) {
        std::string spec(argv[i]);
        size_t eq = spec.find('=');
        if (eq == std::string::npos) { fprintf(stderr, "bad spec %s\n", argv[i]); failed++; continue; }
        std::string key = spec.substr(0, eq), out = spec.substr(eq + 1);
        HANDLE hf = NULL;
        bool ok;
        if (key.rfind("name:", 0) == 0)
            ok = CascOpenFile(hs, key.c_str() + 5, 0, CASC_OPEN_BY_NAME, &hf);
        else
            ok = CascOpenFile(hs, CASC_FILE_DATA_ID(strtoul(key.c_str(), NULL, 10)), 0, CASC_OPEN_BY_FILEID, &hf);
        if (!ok) { fprintf(stderr, "open %s failed: %u\n", key.c_str(), GetCascError()); failed++; continue; }
        ULONGLONG size = 0; CascGetFileSize64(hf, &size);
        std::vector<char> buf((size_t)size);
        DWORD got = 0, total = 0;
        while (total < size && CascReadFile(hf, buf.data() + total, (DWORD)(size - total), &got) && got) total += got;
        CascCloseFile(hf);
        if (total != size) { fprintf(stderr, "read %s short %u/%llu\n", key.c_str(), total, size); failed++; continue; }
        FILE* f = fopen(out.c_str(), "wb"); fwrite(buf.data(), 1, total, f); fclose(f);
        printf("%s %u %s\n", key.c_str(), total, out.c_str());
    }
    CascCloseStorage(hs);
    return failed ? 1 : 0;
}
