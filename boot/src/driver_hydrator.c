#define _GNU_SOURCE

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define MAX_DEVICES 4096
#define MAX_INDEX_ENTRIES 1024
#define MAX_LOADED_MODS 1024

#define DEFAULT_INDEX_PATH "/etc/awesome-os/driver-index.v11.conf"
#define RUN_DIR "/run/awesome-os"
#define INVENTORY_JSON_PATH "/run/awesome-os/hardware-modalias.json"
#define STATUS_JSON_PATH "/run/awesome-os/driver-status.json"

typedef struct {
    char bus[32];
    char device[128];
    char modalias[256];
} ModaliasDevice;

typedef struct {
    char tier[32];
    char pattern[256];
    char module_path[256];
    char name[128];
} DriverIndexEntry;

typedef struct {
    const DriverIndexEntry *entry;
    char matched_modalias[256];
    const char *status;
} DriverMatchResult;

static int match_modalias(const char *pattern, const char *str) {
    if (!pattern || !str) {
        return 0;
    }
    const char *p = pattern;
    const char *s = str;
    const char *star_p = NULL;
    const char *star_s = NULL;

    while (*s != '\0') {
        if (*p == '*') {
            star_p = p++;
            star_s = s;
        } else if (*p == '?' || *p == *s) {
            p++;
            s++;
        } else if (star_p != NULL) {
            p = star_p + 1;
            s = ++star_s;
        } else {
            return 0;
        }
    }

    while (*p == '*') {
        p++;
    }
    return *p == '\0';
}

static void ensure_dir_quiet(const char *path, mode_t mode) {
    if (mkdir(path, mode) != 0 && errno != EEXIST) {
        /* Best-effort: caller will handle fopen error if path is unavailable */
    }
}

static void json_write_escaped(FILE *fp, const char *s) {
    fputc('"', fp);
    if (s) {
        for (const unsigned char *p = (const unsigned char *)s; *p != '\0'; p++) {
            switch (*p) {
                case '"':
                    fputs("\\\"", fp);
                    break;
                case '\\':
                    fputs("\\\\", fp);
                    break;
                case '\b':
                    fputs("\\b", fp);
                    break;
                case '\f':
                    fputs("\\f", fp);
                    break;
                case '\n':
                    fputs("\\n", fp);
                    break;
                case '\r':
                    fputs("\\r", fp);
                    break;
                case '\t':
                    fputs("\\t", fp);
                    break;
                default:
                    if (*p < 0x20) {
                        fprintf(fp, "\\u%04x", (unsigned int)*p);
                    } else {
                        fputc((int)*p, fp);
                    }
                    break;
            }
        }
    }
    fputc('"', fp);
}

static void trim_trailing(char *s) {
    size_t len = strlen(s);
    while (len > 0 && (s[len - 1] == '\n' || s[len - 1] == '\r' ||
                       s[len - 1] == ' ' || s[len - 1] == '\t')) {
        s[--len] = '\0';
    }
}

static size_t scan_sysfs_modalias(ModaliasDevice *out, size_t max_out) {
    static const char *const buses[] = {"pci", "usb", "vmbus", "acpi", "hid", "serio"};
    size_t count = 0;

    for (size_t b = 0; b < sizeof(buses) / sizeof(buses[0]); b++) {
        char bus_dir[128];
        int n = snprintf(bus_dir, sizeof(bus_dir), "/sys/bus/%s/devices", buses[b]);
        if (n < 0 || (size_t)n >= sizeof(bus_dir)) {
            continue;
        }

        DIR *d = opendir(bus_dir);
        if (!d) {
            continue;
        }

        struct dirent *ent;
        while ((ent = readdir(d)) != NULL && count < max_out) {
            if (ent->d_name[0] == '.') {
                continue;
            }

            char mod_path[512];
            int pn = snprintf(mod_path, sizeof(mod_path), "%s/%s/modalias", bus_dir,
                              ent->d_name);
            if (pn < 0 || (size_t)pn >= sizeof(mod_path)) {
                continue;
            }

            int fd = open(mod_path, O_RDONLY);
            if (fd < 0) {
                continue;
            }

            char buf[256];
            ssize_t r = read(fd, buf, sizeof(buf) - 1);
            close(fd);
            if (r <= 0) {
                continue;
            }
            buf[r] = '\0';
            trim_trailing(buf);
            if (buf[0] == '\0') {
                continue;
            }

            ModaliasDevice *dev = &out[count++];
            snprintf(dev->bus, sizeof(dev->bus), "%s", buses[b]);
            snprintf(dev->device, sizeof(dev->device), "%.*s",
                     (int)(sizeof(dev->device) - 1), ent->d_name);
            snprintf(dev->modalias, sizeof(dev->modalias), "%s", buf);
        }

        closedir(d);
    }

    return count;
}

static int write_inventory_json(const char *path, const ModaliasDevice *devs,
                                size_t count) {
    ensure_dir_quiet("/run", 0755);
    ensure_dir_quiet(RUN_DIR, 0755);

    FILE *fp = fopen(path, "w");
    if (!fp) {
        return -1;
    }

    fprintf(fp, "{\n  \"version\": \"v11\",\n  \"count\": %zu,\n  \"devices\": [\n",
            count);
    for (size_t i = 0; i < count; i++) {
        fprintf(fp, "    {\"bus\": ");
        json_write_escaped(fp, devs[i].bus);
        fprintf(fp, ", \"device\": ");
        json_write_escaped(fp, devs[i].device);
        fprintf(fp, ", \"modalias\": ");
        json_write_escaped(fp, devs[i].modalias);
        fprintf(fp, "}%s\n", (i + 1 < count) ? "," : "");
    }
    fprintf(fp, "  ]\n}\n");

    fclose(fp);
    return 0;
}

static size_t load_driver_index(const char *path, DriverIndexEntry *out,
                                size_t max_out) {
    FILE *fp = fopen(path, "r");
    if (!fp) {
        return 0;
    }

    size_t count = 0;
    char line[1024];
    while (fgets(line, sizeof(line), fp) != NULL && count < max_out) {
        char *p = line;
        while (*p == ' ' || *p == '\t') {
            p++;
        }
        if (*p == '\0' || *p == '\n' || *p == '\r' || *p == '#') {
            continue;
        }

        DriverIndexEntry *e = &out[count];
        memset(e, 0, sizeof(*e));
        if (sscanf(p, "%31s %255s %255s %127s", e->tier, e->pattern, e->module_path,
                   e->name) == 4) {
            count++;
        }
    }

    fclose(fp);
    return count;
}

static int run_insmod(const char *module_path) {
    if (access("/bin/insmod", X_OK) != 0) {
        return -2;
    }
    if (access(module_path, R_OK) != 0) {
        return -3;
    }

    pid_t pid = fork();
    if (pid < 0) {
        return -1;
    }
    if (pid == 0) {
        int devnull = open("/dev/null", O_RDWR);
        if (devnull >= 0) {
            dup2(devnull, STDIN_FILENO);
            dup2(devnull, STDOUT_FILENO);
            dup2(devnull, STDERR_FILENO);
            if (devnull > 2) {
                close(devnull);
            }
        }
        char *const argv[] = {"/bin/insmod", (char *)module_path, NULL};
        execv("/bin/insmod", argv);
        _exit(127);
    }

    int status = 0;
    while (waitpid(pid, &status, 0) < 0) {
        if (errno != EINTR) {
            return -1;
        }
    }
    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    }
    return -1;
}

static int already_processed_module(const char *const *seen, size_t seen_count,
                                    const char *module_path) {
    for (size_t i = 0; i < seen_count; i++) {
        if (strcmp(seen[i], module_path) == 0) {
            return 1;
        }
    }
    return 0;
}

static int write_status_json(const char *path, const char *index_path,
                             size_t scanned, size_t matched, size_t loaded,
                             const DriverMatchResult *results, size_t result_count) {
    ensure_dir_quiet("/run", 0755);
    ensure_dir_quiet(RUN_DIR, 0755);

    FILE *fp = fopen(path, "w");
    if (!fp) {
        return -1;
    }

    fprintf(fp, "{\n  \"version\": \"v11\",\n  \"index\": ");
    json_write_escaped(fp, index_path);
    fprintf(fp,
            ",\n  \"scanned\": %zu,\n  \"matched\": %zu,\n  \"loaded\": %zu,\n"
            "  \"drivers\": [\n",
            scanned, matched, loaded);

    for (size_t i = 0; i < result_count; i++) {
        const DriverMatchResult *r = &results[i];
        fprintf(fp, "    {\"tier\": ");
        json_write_escaped(fp, r->entry->tier);
        fprintf(fp, ", \"pattern\": ");
        json_write_escaped(fp, r->entry->pattern);
        fprintf(fp, ", \"module\": ");
        json_write_escaped(fp, r->entry->module_path);
        fprintf(fp, ", \"name\": ");
        json_write_escaped(fp, r->entry->name);
        fprintf(fp, ", \"matched_modalias\": ");
        json_write_escaped(fp, r->matched_modalias);
        fprintf(fp, ", \"status\": ");
        json_write_escaped(fp, r->status);
        fprintf(fp, "}%s\n", (i + 1 < result_count) ? "," : "");
    }

    fprintf(fp, "  ]\n}\n");
    fclose(fp);
    return 0;
}

static int cmd_scan(void) {
    ModaliasDevice *devs = calloc(MAX_DEVICES, sizeof(ModaliasDevice));
    if (!devs) {
        fprintf(stderr, "[AWESOME-OS] driver-hydrator: out of memory\n");
        return 1;
    }

    size_t count = scan_sysfs_modalias(devs, MAX_DEVICES);
    (void)write_inventory_json(INVENTORY_JSON_PATH, devs, count);

    for (size_t i = 0; i < count; i++) {
        printf("%s\t%s\t%s\n", devs[i].bus, devs[i].device, devs[i].modalias);
    }
    printf("[AWESOME-OS] driver-hydrator: scanned=%zu\n", count);

    free(devs);
    return 0;
}

static int cmd_hydrate(const char *index_path) {
    ModaliasDevice *devs = calloc(MAX_DEVICES, sizeof(ModaliasDevice));
    DriverIndexEntry *entries = calloc(MAX_INDEX_ENTRIES, sizeof(DriverIndexEntry));
    DriverMatchResult *results = calloc(MAX_INDEX_ENTRIES, sizeof(DriverMatchResult));
    if (!devs || !entries || !results) {
        free(devs);
        free(entries);
        free(results);
        fprintf(stderr, "[AWESOME-OS] driver-hydrator: out of memory\n");
        return 1;
    }

    size_t scanned = scan_sysfs_modalias(devs, MAX_DEVICES);
    (void)write_inventory_json(INVENTORY_JSON_PATH, devs, scanned);

    size_t entry_count = load_driver_index(index_path, entries, MAX_INDEX_ENTRIES);
    const char *seen_mods[MAX_LOADED_MODS];
    size_t seen_count = 0;

    size_t matched = 0;
    size_t loaded = 0;
    size_t result_count = 0;

    for (size_t i = 0; i < entry_count; i++) {
        const DriverIndexEntry *e = &entries[i];
        const ModaliasDevice *hit = NULL;

        for (size_t d = 0; d < scanned; d++) {
            if (match_modalias(e->pattern, devs[d].modalias)) {
                hit = &devs[d];
                break;
            }
        }
        if (!hit) {
            continue;
        }

        if (already_processed_module(seen_mods, seen_count, e->module_path)) {
            continue;
        }
        if (seen_count < MAX_LOADED_MODS) {
            seen_mods[seen_count++] = e->module_path;
        }

        matched++;

        const char *status_str = "skipped";
        int rc = run_insmod(e->module_path);
        if (rc == 0) {
            loaded++;
            status_str = "loaded";
        } else if (rc == -3) {
            status_str = "missing";
        } else if (rc == -2) {
            status_str = "no-insmod";
        } else {
            status_str = "already-loaded-or-error";
        }

        if (result_count < MAX_INDEX_ENTRIES) {
            DriverMatchResult *res = &results[result_count++];
            res->entry = e;
            snprintf(res->matched_modalias, sizeof(res->matched_modalias), "%s",
                     hit->modalias);
            res->status = status_str;
        }
    }

    (void)write_status_json(STATUS_JSON_PATH, index_path, scanned, matched, loaded,
                            results, result_count);

    printf("[AWESOME-OS] driver-hydrator: scanned=%zu matched=%zu loaded=%zu\n",
           scanned, matched, loaded);

    free(devs);
    free(entries);
    free(results);
    return 0;
}

static int cmd_selftest(void) {
    struct {
        const char *pattern;
        const char *input;
        int expected;
    } const cases[] = {
        {"pci:*", "pci:v000010DEd00002684sv000010DEsd00001682bc03sc00i00", 1},
        {"pci:v000010DEd*", "pci:v000010DEd00002684sv000010DEsd00001682", 1},
        {"pci:v000010DEd*", "pci:v00008086d00001234", 0},
        {"vmbus:*", "vmbus:f912ad6d2b1749139d0815b8b8742a9d", 1},
        {"vmbus:*", "acpi:PNP0A03:", 0},
        {"serio:ty01pr00id*", "serio:ty01pr00id00ex00", 1},
        {"serio:ty0?pr00id*", "serio:ty01pr00id00ex00", 1},
        {"serio:ty0?pr00id*", "serio:ty011pr00id00ex00", 0},
        {"serio:ty01pr00id*", "serio:ty02pr00id00ex00", 0},
        {"hid:*", "hid:b0003g0001v0000045Ep000007A5", 1},
        {"usb:*", "usb:v1D6Bp0002d0608dc09dsc00dp01ic09isc00ip00in00", 1},
        {"*", "", 1},
        {"", "", 1},
        {"?", "", 0},
        {"?", "a", 1},
    };

    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
        int got = match_modalias(cases[i].pattern, cases[i].input);
        if (got != cases[i].expected) {
            fprintf(stderr,
                    "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: case %zu "
                    "(pattern='%s', input='%s', expected=%d, got=%d)\n",
                    i, cases[i].pattern, cases[i].input, cases[i].expected, got);
            return 1;
        }
    }

    printf("[AWESOME-OS] DRIVER-HYDRATOR SELFTEST PASS\n");
    return 0;
}

int main(int argc, char **argv) {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);

    const char *index_path = DEFAULT_INDEX_PATH;
    int mode = 0; /* 1=scan, 2=hydrate, 3=selftest */

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--scan") == 0) {
            mode = 1;
        } else if (strcmp(argv[i], "--hydrate") == 0) {
            mode = 2;
        } else if (strcmp(argv[i], "--selftest") == 0) {
            mode = 3;
        } else if (strcmp(argv[i], "--index") == 0 && i + 1 < argc) {
            index_path = argv[++i];
        } else {
            fprintf(stderr,
                    "Usage: %s [--scan | --hydrate | --selftest] [--index <path>]\n",
                    argv[0]);
            return 1;
        }
    }

    if (mode == 1) {
        return cmd_scan();
    }
    if (mode == 2) {
        return cmd_hydrate(index_path);
    }
    if (mode == 3) {
        return cmd_selftest();
    }

    fprintf(stderr,
            "Usage: %s [--scan | --hydrate | --selftest] [--index <path>]\n",
            argv[0]);
    return 1;
}
