#define _GNU_SOURCE

#include <ctype.h>
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
#include <sys/utsname.h>
#include <sys/wait.h>
#include <unistd.h>

#define MAX_DEVICES 4096
#define MAX_INDEX_ENTRIES 1024
#define MAX_LOADED_MODS 1024

#define DEFAULT_INDEX_PATH "/etc/awesome-os/driver-index.v11.conf"
#define DEFAULT_DRIVER_MIRROR "https://awesome-os.com/v11/drivers"
#define DEFAULT_CAS_ROOT "/var/lib/b8g/cas/v11"
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
    char sha512[136];
} DriverIndexEntry;

typedef struct {
    const DriverIndexEntry *entry;
    char matched_modalias[256];
    const char *status;
    const char *source;
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

static int mkdir_p(const char *path, mode_t mode) {
    if (!path || path[0] == '\0') {
        return -1;
    }
    char buf[512];
    int n = snprintf(buf, sizeof(buf), "%s", path);
    if (n < 0 || (size_t)n >= sizeof(buf)) {
        return -1;
    }
    size_t len = (size_t)n;
    while (len > 1 && buf[len - 1] == '/') {
        buf[--len] = '\0';
    }
    for (char *p = buf + 1; *p != '\0'; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(buf, mode) != 0 && errno != EEXIST) {
                return -1;
            }
            *p = '/';
        }
    }
    if (mkdir(buf, mode) != 0 && errno != EEXIST) {
        return -1;
    }
    return 0;
}

static int ensure_parent_dir(const char *file_path, mode_t mode) {
    const char *slash = strrchr(file_path, '/');
    if (!slash || slash == file_path) {
        return 0;
    }
    size_t dir_len = (size_t)(slash - file_path);
    char dir[512];
    if (dir_len >= sizeof(dir)) {
        return -1;
    }
    memcpy(dir, file_path, dir_len);
    dir[dir_len] = '\0';
    return mkdir_p(dir, mode);
}

static int is_valid_pinned_sha512(const char *sha512) {
    if (!sha512 || sha512[0] == '\0' || strcmp(sha512, "-") == 0) {
        return 0;
    }
    size_t len = strlen(sha512);
    if (len < 2 || len > 128) {
        return 0;
    }
    for (size_t i = 0; i < len; i++) {
        if (!isxdigit((unsigned char)sha512[i])) {
            return 0;
        }
    }
    return 1;
}

static int is_safe_component(const char *s) {
    if (!s || s[0] == '\0') {
        return 0;
    }
    if (strstr(s, "..") != NULL) {
        return 0;
    }
    for (const char *p = s; *p != '\0'; p++) {
        if (*p == '/' || *p == '\\') {
            return 0;
        }
    }
    return 1;
}

static int ends_with_ko(const char *name) {
    size_t len = strlen(name);
    return (len >= 3 && strcmp(name + len - 3, ".ko") == 0);
}

static const char *get_driver_mirror(void) {
    const char *env = getenv("AWESOME_V11_DRIVER_MIRROR");
    if (env && env[0] != '\0') {
        return env;
    }
    return DEFAULT_DRIVER_MIRROR;
}

static const char *get_cas_root(void) {
    const char *env = getenv("CAS_ROOT");
    if (env && env[0] != '\0') {
        return env;
    }
    return DEFAULT_CAS_ROOT;
}

static void get_kernel_release(char *out, size_t out_sz) {
    struct utsname uts;
    if (uname(&uts) == 0 && uts.release[0] != '\0') {
        int n = snprintf(out, out_sz, "%s", uts.release);
        if (n >= 0 && (size_t)n < out_sz) {
            return;
        }
    }
    snprintf(out, out_sz, "unknown");
}

static int derive_cas_path(const char *cas_root, const char *uname_r,
                           const char *name, const char *sha512,
                           char *out, size_t out_sz) {
    if (!cas_root || cas_root[0] == '\0' || !out || out_sz == 0) {
        return -1;
    }
    size_t root_len = strlen(cas_root);
    while (root_len > 1 && cas_root[root_len - 1] == '/') {
        root_len--;
    }

    int n = -1;
    if (is_valid_pinned_sha512(sha512)) {
        char c0 = (char)tolower((unsigned char)sha512[0]);
        char c1 = (char)tolower((unsigned char)sha512[1]);
        n = snprintf(out, out_sz, "%.*s/files/%c%c/%s",
                     (int)root_len, cas_root, c0, c1, sha512);
    } else {
        if (!is_safe_component(uname_r) || !is_safe_component(name)) {
            return -1;
        }
        if (ends_with_ko(name)) {
            n = snprintf(out, out_sz, "%.*s/drivers/%s/%s",
                         (int)root_len, cas_root, uname_r, name);
        } else {
            n = snprintf(out, out_sz, "%.*s/drivers/%s/%s.ko",
                         (int)root_len, cas_root, uname_r, name);
        }
    }

    if (n < 0 || (size_t)n >= out_sz) {
        return -1;
    }
    return 0;
}

static int build_mirror_url(const char *mirror, const char *uname_r,
                            const char *name, char *out, size_t out_sz) {
    if (!mirror || mirror[0] == '\0' || !is_safe_component(uname_r) ||
        !is_safe_component(name) || !out || out_sz == 0) {
        return -1;
    }
    size_t mlen = strlen(mirror);
    while (mlen > 0 && mirror[mlen - 1] == '/') {
        mlen--;
    }
    if (mlen == 0) {
        return -1;
    }

    int n;
    if (ends_with_ko(name)) {
        n = snprintf(out, out_sz, "%.*s/%s/%s", (int)mlen, mirror, uname_r, name);
    } else {
        n = snprintf(out, out_sz, "%.*s/%s/%s.ko", (int)mlen, mirror, uname_r, name);
    }
    if (n < 0 || (size_t)n >= out_sz) {
        return -1;
    }
    return 0;
}

static int parse_index_line(const char *line, DriverIndexEntry *e) {
    if (!line || !e) {
        return 0;
    }
    const char *p = line;
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    if (*p == '\0' || *p == '\n' || *p == '\r' || *p == '#') {
        return 0;
    }

    memset(e, 0, sizeof(*e));
    int fields = sscanf(p, "%31s %255s %255s %127s %135s",
                        e->tier, e->pattern, e->module_path, e->name, e->sha512);
    if (fields < 4) {
        return 0;
    }
    if (fields == 4 || strcmp(e->sha512, "-") == 0) {
        e->sha512[0] = '\0';
    }
    return 1;
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
        if (parse_index_line(line, &out[count])) {
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

static int run_wget(const char *url, const char *dest_path) {
    if (access("/bin/wget", X_OK) != 0) {
        return -2;
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
        char *const argv[] = {
            "/bin/wget", "-q", "-T", "5", "-O", (char *)dest_path, (char *)url, NULL
        };
        execv("/bin/wget", argv);
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

static int hex_equal_ci(const char *a, const char *b) {
    while (*a != '\0' && *b != '\0') {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) {
            return 0;
        }
        a++;
        b++;
    }
    return (*a == '\0' && *b == '\0');
}

static int verify_file_sha512(const char *file_path, const char *expected_sha512) {
    if (access("/bin/sha512sum", X_OK) != 0) {
        return -2;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        return -1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        return -1;
    }
    if (pid == 0) {
        close(pipefd[0]);
        dup2(pipefd[1], STDOUT_FILENO);
        close(pipefd[1]);

        int devnull = open("/dev/null", O_RDWR);
        if (devnull >= 0) {
            dup2(devnull, STDIN_FILENO);
            dup2(devnull, STDERR_FILENO);
            if (devnull > 2) {
                close(devnull);
            }
        }

        char *const argv[] = {"/bin/sha512sum", (char *)file_path, NULL};
        execv("/bin/sha512sum", argv);
        _exit(127);
    }

    close(pipefd[1]);
    char buf[256];
    size_t total = 0;
    while (total < sizeof(buf) - 1) {
        ssize_t r = read(pipefd[0], buf + total, sizeof(buf) - 1 - total);
        if (r < 0) {
            if (errno == EINTR) {
                continue;
            }
            break;
        }
        if (r == 0) {
            break;
        }
        total += (size_t)r;
    }
    buf[total] = '\0';
    close(pipefd[0]);

    int status = 0;
    while (waitpid(pid, &status, 0) < 0) {
        if (errno != EINTR) {
            return -1;
        }
    }
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
        return -1;
    }

    char digest[136];
    if (sscanf(buf, "%135s", digest) != 1) {
        return -1;
    }
    return hex_equal_ci(digest, expected_sha512) ? 0 : -3;
}

static int fetch_driver_to_cas(const DriverIndexEntry *e, const char *mirror,
                               const char *uname_r, const char *cas_path) {
    if (access("/bin/wget", X_OK) != 0) {
        return -2;
    }

    char url[512];
    if (build_mirror_url(mirror, uname_r, e->name, url, sizeof(url)) != 0) {
        return -1;
    }

    if (ensure_parent_dir(cas_path, 0755) != 0) {
        return -1;
    }

    char tmp_path[560];
    int tn = snprintf(tmp_path, sizeof(tmp_path), "%s.tmp.%ld",
                      cas_path, (long)getpid());
    if (tn < 0 || (size_t)tn >= sizeof(tmp_path)) {
        return -1;
    }

    (void)unlink(tmp_path);
    int wrc = run_wget(url, tmp_path);
    if (wrc != 0) {
        (void)unlink(tmp_path);
        return -1;
    }

    struct stat st;
    if (stat(tmp_path, &st) != 0 || st.st_size <= 0) {
        (void)unlink(tmp_path);
        return -1;
    }

    if (is_valid_pinned_sha512(e->sha512)) {
        if (verify_file_sha512(tmp_path, e->sha512) != 0) {
            (void)unlink(tmp_path);
            return -3;
        }
    }

    if (rename(tmp_path, cas_path) != 0) {
        (void)unlink(tmp_path);
        return -1;
    }

    return 0;
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
                             const char *mirror,
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
    fprintf(fp, ",\n  \"mirror\": ");
    json_write_escaped(fp, mirror);
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
        fprintf(fp, ", \"source\": ");
        json_write_escaped(fp, r->source);
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

    const char *mirror = get_driver_mirror();
    const char *cas_root = get_cas_root();
    char uname_r[128];
    get_kernel_release(uname_r, sizeof(uname_r));

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

        const char *source_str = "missing";
        const char *status_str = "missing";
        const char *load_path = NULL;
        char cas_path[512];

        if (access(e->module_path, R_OK) == 0) {
            source_str = "local";
            load_path = e->module_path;
        } else if (derive_cas_path(cas_root, uname_r, e->name, e->sha512,
                                   cas_path, sizeof(cas_path)) == 0) {
            if (access(cas_path, R_OK) == 0) {
                source_str = "cas-cache";
                load_path = cas_path;
            } else if (fetch_driver_to_cas(e, mirror, uname_r, cas_path) == 0) {
                source_str = "net-hydrated";
                load_path = cas_path;
            }
        }

        if (load_path != NULL) {
            int rc = run_insmod(load_path);
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
        }

        if (result_count < MAX_INDEX_ENTRIES) {
            DriverMatchResult *res = &results[result_count++];
            res->entry = e;
            snprintf(res->matched_modalias, sizeof(res->matched_modalias), "%s",
                     hit->modalias);
            res->status = status_str;
            res->source = source_str;
        }
    }

    (void)write_status_json(STATUS_JSON_PATH, index_path, mirror,
                            scanned, matched, loaded, results, result_count);

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

    /* Offline-safe CAS path derivation tests */
    char buf[512];
    const char *sample_sha =
        "ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890"
        "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
    char expected_cas_pinned[512];
    snprintf(expected_cas_pinned, sizeof(expected_cas_pinned),
             "/var/lib/b8g/cas/v11/files/ab/%s", sample_sha);

    if (derive_cas_path(DEFAULT_CAS_ROOT, "6.12.0-awesome", "r8169", sample_sha,
                        buf, sizeof(buf)) != 0 ||
        strcmp(buf, expected_cas_pinned) != 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: pinned CAS path "
                "(got='%s', expected='%s')\n",
                buf, expected_cas_pinned);
        return 1;
    }

    if (derive_cas_path(DEFAULT_CAS_ROOT, "6.12.0-awesome", "r8169", "-",
                        buf, sizeof(buf)) != 0 ||
        strcmp(buf, "/var/lib/b8g/cas/v11/drivers/6.12.0-awesome/r8169.ko") != 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: unpinned CAS path "
                "(got='%s')\n",
                buf);
        return 1;
    }

    if (derive_cas_path(DEFAULT_CAS_ROOT, "6.12.0-awesome", "../evil", "",
                        buf, sizeof(buf)) == 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: traversal not rejected\n");
        return 1;
    }

    /* Offline-safe mirror URL construction tests */
    if (build_mirror_url(DEFAULT_DRIVER_MIRROR, "6.12.0-awesome", "r8169",
                         buf, sizeof(buf)) != 0 ||
        strcmp(buf, "https://awesome-os.com/v11/drivers/6.12.0-awesome/r8169.ko") != 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: default mirror URL "
                "(got='%s')\n",
                buf);
        return 1;
    }

    if (build_mirror_url("https://mirror.example.org/v11/drivers/",
                         "6.12.0-awesome", "iwlwifi", buf, sizeof(buf)) != 0 ||
        strcmp(buf, "https://mirror.example.org/v11/drivers/6.12.0-awesome/iwlwifi.ko") != 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: trailing-slash mirror URL "
                "(got='%s')\n",
                buf);
        return 1;
    }

    /* Backward-compatible 4-field and 5-field index line parsing tests */
    DriverIndexEntry e4;
    DriverIndexEntry e5_dash;
    DriverIndexEntry e5_sha;
    if (!parse_index_line("tier0 vmbus:* /lib/modules/hv_vmbus.ko hv_vmbus\n", &e4) ||
        e4.sha512[0] != '\0') {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: 4-field parse\n");
        return 1;
    }
    if (!parse_index_line("tier1 pci:* /lib/modules/r8169.ko r8169 -\n", &e5_dash) ||
        e5_dash.sha512[0] != '\0') {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: 5-field dash parse\n");
        return 1;
    }
    char line_sha[512];
    snprintf(line_sha, sizeof(line_sha),
             "tier1 pci:* /lib/modules/r8169.ko r8169 %s\n", sample_sha);
    if (!parse_index_line(line_sha, &e5_sha) ||
        strcmp(e5_sha.sha512, sample_sha) != 0) {
        fprintf(stderr,
                "[AWESOME-OS] DRIVER-HYDRATOR SELFTEST FAIL: 5-field sha512 parse\n");
        return 1;
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
