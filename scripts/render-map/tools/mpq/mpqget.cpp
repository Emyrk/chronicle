// mpqget — read-only MPQ access for 1.12-era clients (StormLib).
//   mpqget info <mpq>                      archive header, table sizes, (listfile) present?
//   mpqget list <mpq> [ext-listfile]       every resolvable name: "name\tsize\tcsize\tflags";
//                                          unnamed entries are counted on stderr, not printed
//   mpqget has  <mpq> <namesfile>          print "name\tsize" for each name (one per line) present
//   mpqget get  <mpq> <name>=<out> ...     extract by name
// Archives are always opened with STREAM_FLAG_READ_ONLY: never writes into a client's Data/.
#include "StormLib.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static HANDLE open_ro(const char* path) {
    HANDLE h = NULL;
    if (!SFileOpenArchive(path, 0, STREAM_FLAG_READ_ONLY, &h)) {
        fprintf(stderr, "open %s failed: %u\n", path, SErrGetLastError());
        exit(1);
    }
    return h;
}

int main(int argc, char** argv) {
    if (argc < 3) { fprintf(stderr, "usage: mpqget info|list|has|get <mpq> ...\n"); return 2; }
    std::string cmd(argv[1]);
    HANDLE ha = open_ro(argv[2]);
    if (cmd == "info") {
        DWORD v = 0, hs = 0, bs = 0, nf = 0;
        SFileGetFileInfo(ha, SFileMpqHashTableSize, &hs, sizeof(hs), NULL);
        SFileGetFileInfo(ha, SFileMpqBlockTableSize, &bs, sizeof(bs), NULL);
        SFileGetFileInfo(ha, SFileMpqNumberOfFiles, &nf, sizeof(nf), NULL);
        // SFileMpqHeader's wFormatVersion lives at offset 0x0C
        TMPQHeader hdr; memset(&hdr, 0, sizeof(hdr));
        SFileGetFileInfo(ha, SFileMpqHeader, &hdr, sizeof(hdr), NULL);
        v = hdr.wFormatVersion;
        printf("format=%u hash_table=%u block_table=%u files=%u listfile=%d\n", v, hs, bs, nf,
               SFileHasFile(ha, LISTFILE_NAME) ? 1 : 0);
    } else if (cmd == "list") {
        const char* ext = argc > 3 ? argv[3] : NULL;
        SFILE_FIND_DATA fd;
        unsigned named = 0, unnamed = 0;
        HANDLE hf = SFileFindFirstFile(ha, "*", &fd, ext);
        if (hf) {
            do {
                const char* n = fd.cFileName;
                // StormLib names unresolved entries File%08u.xxx
                if (strncmp(n, "File", 4) == 0 && strlen(n) >= 12 && strspn(n + 4, "0123456789") == 8) { unnamed++; continue; }
                if (strcmp(n, LISTFILE_NAME) == 0 || strcmp(n, ATTRIBUTES_NAME) == 0 || strcmp(n, SIGNATURE_NAME) == 0) continue;
                printf("%s\t%u\t%u\t%08x\n", n, fd.dwFileSize, fd.dwCompSize, fd.dwFileFlags);
                named++;
            } while (SFileFindNextFile(hf, &fd));
            SFileFindClose(hf);
        }
        fprintf(stderr, "[mpq] %s named=%u unnamed=%u\n", argv[2], named, unnamed);
    } else if (cmd == "has") {
        FILE* f = fopen(argv[3], "r");
        if (!f) { fprintf(stderr, "cannot read %s\n", argv[3]); return 1; }
        char line[1024];
        while (fgets(line, sizeof(line), f)) {
            line[strcspn(line, "\r\n")] = 0;
            if (!line[0]) continue;
            HANDLE hf = NULL;
            if (SFileOpenFileEx(ha, line, SFILE_OPEN_FROM_MPQ, &hf)) {
                printf("%s\t%u\n", line, SFileGetFileSize(hf, NULL));
                SFileCloseFile(hf);
            }
        }
        fclose(f);
    } else if (cmd == "get") {
        int failed = 0;
        for (int i = 3; i < argc; i++) {
            std::string spec(argv[i]);
            size_t eq = spec.rfind('=');
            if (eq == std::string::npos) { fprintf(stderr, "bad spec %s\n", argv[i]); failed++; continue; }
            std::string name = spec.substr(0, eq), out = spec.substr(eq + 1);
            if (!SFileExtractFile(ha, name.c_str(), out.c_str(), SFILE_OPEN_FROM_MPQ)) {
                fprintf(stderr, "extract %s failed: %u\n", name.c_str(), SErrGetLastError()); failed++;
            }
        }
        SFileCloseArchive(ha);
        return failed ? 1 : 0;
    } else { fprintf(stderr, "unknown command %s\n", cmd.c_str()); return 2; }
    SFileCloseArchive(ha);
    return 0;
}
