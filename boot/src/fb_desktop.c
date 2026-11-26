#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <linux/fb.h>
#include <linux/kd.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <sys/utsname.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

/* Compact 5x7 uppercase+lowercase+symbol bitmap font (printable ASCII 32..126) */
static const uint8_t FONT5X7[95][5] = {
    {0x00,0x00,0x00,0x00,0x00},{0x00,0x00,0x5F,0x00,0x00},{0x00,0x07,0x00,0x07,0x00},
    {0x14,0x7F,0x14,0x7F,0x14},{0x24,0x2A,0x7F,0x2A,0x12},{0x23,0x13,0x08,0x64,0x62},
    {0x36,0x49,0x55,0x22,0x50},{0x00,0x05,0x03,0x00,0x00},{0x00,0x1C,0x22,0x41,0x00},
    {0x00,0x41,0x22,0x1C,0x00},{0x14,0x08,0x3E,0x08,0x14},{0x08,0x08,0x3E,0x08,0x08},
    {0x00,0x50,0x30,0x00,0x00},{0x08,0x08,0x08,0x08,0x08},{0x00,0x60,0x60,0x00,0x00},
    {0x20,0x10,0x08,0x04,0x02},{0x3E,0x51,0x49,0x45,0x3E},{0x00,0x42,0x7F,0x40,0x00},
    {0x42,0x61,0x51,0x49,0x46},{0x21,0x41,0x45,0x4B,0x31},{0x18,0x14,0x12,0x7F,0x10},
    {0x27,0x45,0x45,0x45,0x39},{0x3C,0x4A,0x49,0x49,0x30},{0x01,0x71,0x09,0x05,0x03},
    {0x36,0x49,0x49,0x49,0x36},{0x06,0x49,0x49,0x29,0x1E},{0x00,0x36,0x36,0x00,0x00},
    {0x00,0x56,0x36,0x00,0x00},{0x08,0x14,0x22,0x41,0x00},{0x14,0x14,0x14,0x14,0x14},
    {0x00,0x41,0x22,0x14,0x08},{0x02,0x01,0x51,0x09,0x06},{0x32,0x49,0x79,0x41,0x3E},
    {0x7E,0x11,0x11,0x11,0x7E},{0x7F,0x49,0x49,0x49,0x36},{0x3E,0x41,0x41,0x41,0x22},
    {0x7F,0x41,0x41,0x22,0x1C},{0x7F,0x49,0x49,0x49,0x41},{0x7F,0x09,0x09,0x09,0x01},
    {0x3E,0x41,0x49,0x49,0x7A},{0x7F,0x08,0x08,0x08,0x7F},{0x00,0x41,0x7F,0x41,0x00},
    {0x20,0x40,0x41,0x3F,0x01},{0x7F,0x08,0x14,0x22,0x41},{0x7F,0x40,0x40,0x40,0x40},
    {0x7F,0x02,0x0C,0x02,0x7F},{0x7F,0x04,0x08,0x10,0x7F},{0x3E,0x41,0x41,0x41,0x3E},
    {0x7F,0x09,0x09,0x09,0x06},{0x3E,0x41,0x51,0x21,0x5E},{0x7F,0x09,0x19,0x29,0x46},
    {0x46,0x49,0x49,0x49,0x31},{0x01,0x01,0x7F,0x01,0x01},{0x3F,0x40,0x40,0x40,0x3F},
    {0x1F,0x20,0x40,0x20,0x1F},{0x3F,0x40,0x38,0x40,0x3F},{0x63,0x14,0x08,0x14,0x63},
    {0x07,0x08,0x70,0x08,0x07},{0x61,0x51,0x49,0x45,0x43},{0x00,0x7F,0x41,0x41,0x00},
    {0x02,0x04,0x08,0x10,0x20},{0x00,0x41,0x41,0x7F,0x00},{0x04,0x02,0x01,0x02,0x04},
    {0x40,0x40,0x40,0x40,0x40},{0x00,0x01,0x02,0x04,0x00},{0x20,0x54,0x54,0x54,0x78},
    {0x7F,0x48,0x44,0x44,0x38},{0x38,0x44,0x44,0x44,0x20},{0x38,0x44,0x44,0x48,0x7F},
    {0x38,0x54,0x54,0x54,0x18},{0x08,0x7E,0x09,0x01,0x02},{0x0C,0x52,0x52,0x52,0x3E},
    {0x7F,0x08,0x04,0x04,0x78},{0x00,0x44,0x7D,0x40,0x00},{0x20,0x40,0x44,0x3D,0x00},
    {0x7F,0x10,0x28,0x44,0x00},{0x00,0x41,0x7F,0x40,0x00},{0x7C,0x04,0x18,0x04,0x78},
    {0x7C,0x08,0x04,0x04,0x78},{0x38,0x44,0x44,0x44,0x38},{0x7C,0x14,0x14,0x14,0x08},
    {0x08,0x14,0x14,0x18,0x7C},{0x7C,0x08,0x04,0x04,0x08},{0x48,0x54,0x54,0x54,0x20},
    {0x04,0x3F,0x44,0x40,0x20},{0x3C,0x40,0x40,0x20,0x7C},{0x1C,0x20,0x40,0x20,0x1C},
    {0x3C,0x40,0x30,0x40,0x3C},{0x44,0x28,0x10,0x28,0x44},{0x0C,0x50,0x50,0x50,0x3C},
    {0x44,0x64,0x54,0x4C,0x44},{0x00,0x08,0x36,0x41,0x00},{0x00,0x00,0x7F,0x00,0x00},
    {0x00,0x41,0x36,0x08,0x00},{0x08,0x04,0x08,0x10,0x08}
};

typedef struct {
    int fd;
    uint32_t *fb;
    uint32_t *back;
    int w;
    int h;
    int stride; /* pixels per row */
    size_t map_size;
} Surface;

typedef struct {
    const char *name;
    uint32_t bg_top;
    uint32_t bg_bot;
    uint32_t panel;
    uint32_t border;
    uint32_t accent;
    uint32_t accent2;
    uint32_t text;
    uint32_t muted;
} Theme;

static const Theme OMARCHY_THEMES[] = {
    {"Tokyo Night", 0x1A1B26, 0x0F111A, 0x16161E, 0x7AA2F7, 0x7AA2F7, 0x9ECE6A, 0xC0CAF5, 0x565F89},
    {"Catppuccin",  0x1E1E2E, 0x11111B, 0x181825, 0xCBA6F7, 0xCBA6F7, 0xA6E3A1, 0xCDD6F4, 0x6C7086},
    {"Nord",        0x2E3440, 0x1E222A, 0x242933, 0x88C0D0, 0x88C0D0, 0xA3BE8C, 0xECEFF4, 0x7B88A1},
    {"Gruvbox",     0x282828, 0x1D2021, 0x1F2020, 0xFABD2F, 0xFE8019, 0xB8BB26, 0xEBDBB2, 0x928374},
    {"Rose Pine",   0x191724, 0x110F1A, 0x1F1D2E, 0xEBBCBA, 0xC4A7E7, 0x9CCFD8, 0xE0DEF4, 0x6E6A86},
};

static uint32_t lerp_rgb(uint32_t a, uint32_t b, int t, int tmax) {
    if (tmax <= 0) return a;
    int r1 = (a >> 16) & 0xFF, g1 = (a >> 8) & 0xFF, b1 = a & 0xFF;
    int r2 = (b >> 16) & 0xFF, g2 = (b >> 8) & 0xFF, b2 = b & 0xFF;
    int r = r1 + ((r2 - r1) * t) / tmax;
    int g = g1 + ((g2 - g1) * t) / tmax;
    int bl = b1 + ((b2 - b1) * t) / tmax;
    return ((uint32_t)r << 16) | ((uint32_t)g << 8) | (uint32_t)bl;
}

static void fill_rect(Surface *s, int x, int y, int w, int h, uint32_t c) {
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > s->w) w = s->w - x;
    if (y + h > s->h) h = s->h - y;
    for (int j = 0; j < h; j++) {
        uint32_t *row = s->back + (y + j) * s->w + x;
        for (int i = 0; i < w; i++) row[i] = c;
    }
}

static void draw_rect_border(Surface *s, int x, int y, int w, int h, int thick, uint32_t c) {
    fill_rect(s, x, y, w, thick, c);
    fill_rect(s, x, y + h - thick, w, thick, c);
    fill_rect(s, x, y, thick, h, c);
    fill_rect(s, x + w - thick, y, thick, h, c);
}

static void fill_vgrad(Surface *s, int x, int y, int w, int h, uint32_t top, uint32_t bot) {
    for (int j = 0; j < h; j++) {
        uint32_t c = lerp_rgb(top, bot, j, h > 1 ? h - 1 : 1);
        fill_rect(s, x, y + j, w, 1, c);
    }
}

static void draw_char(Surface *s, int x, int y, char ch, int scale, uint32_t c) {
    if (ch < 32 || ch > 126) ch = '?';
    const uint8_t *glyph = FONT5X7[ch - 32];
    for (int col = 0; col < 5; col++) {
        uint8_t bits = glyph[col];
        for (int row = 0; row < 7; row++) {
            if (bits & (1U << row)) {
                fill_rect(s, x + col * scale, y + row * scale, scale, scale, c);
            }
        }
    }
}

static void draw_text(Surface *s, int x, int y, const char *txt, int scale, uint32_t c) {
    int cx = x;
    while (*txt) {
        if (*txt == '\n') {
            cx = x;
            y += 9 * scale;
        } else {
            draw_char(s, cx, y, *txt, scale, c);
            cx += 6 * scale;
        }
        txt++;
    }
}

static void present(Surface *s) {
    for (int y = 0; y < s->h; y++) {
        memcpy(s->fb + y * s->stride, s->back + y * s->w, (size_t)s->w * 4);
    }
}

static int init_surface(Surface *s) {
    memset(s, 0, sizeof(*s));
    s->fd = open("/dev/fb0", O_RDWR);
    if (s->fd < 0) return -1;

    struct fb_var_screeninfo vinfo;
    struct fb_fix_screeninfo finfo;
    if (ioctl(s->fd, FBIOGET_VSCREENINFO, &vinfo) < 0 ||
        ioctl(s->fd, FBIOGET_FSCREENINFO, &finfo) < 0) {
        close(s->fd);
        return -1;
    }
    if (vinfo.bits_per_pixel != 32) {
        close(s->fd);
        return -1;
    }

    s->w = (int)vinfo.xres;
    s->h = (int)vinfo.yres;
    s->stride = (int)(finfo.line_length / 4);
    s->map_size = (size_t)finfo.smem_len;
    s->fb = mmap(NULL, s->map_size, PROT_READ | PROT_WRITE, MAP_SHARED, s->fd, 0);
    if (s->fb == MAP_FAILED) {
        close(s->fd);
        return -1;
    }
    s->back = calloc((size_t)s->w * (size_t)s->h, 4);
    if (!s->back) {
        munmap(s->fb, s->map_size);
        close(s->fd);
        return -1;
    }
    return 0;
}

static void destroy_surface(Surface *s) {
    if (s->back) free(s->back);
    if (s->fb && s->fb != MAP_FAILED) munmap(s->fb, s->map_size);
    if (s->fd >= 0) close(s->fd);
}

static void draw_lumi_bootscreen(Surface *s) {
    const char *steps[] = {
        "Verifying B8G_ABI_MAGIC_V3 (0x33564742)...",
        "Mounting v11 CAS immutable substrate (/var/lib/b8g/cas/v11)...",
        "Probing local & remote devices (terminal + desktop)...",
        "Starting Awesome-OS Desktop Foundation (Omarchy / Noctalia / ChonkStep / Sectium)..."
    };
    for (int step = 0; step < 4; step++) {
        fill_vgrad(s, 0, 0, s->w, s->h, 0x0B101B, 0x16233D);

        int cx = s->w / 2;
        int cy = s->h / 2 - 40;
        /* Chromatic Lumi emblem */
        fill_rect(s, cx - 44, cy - 80, 88, 88, 0x1E293B);
        draw_rect_border(s, cx - 44, cy - 80, 88, 88, 3, 0x60A5FA);
        fill_rect(s, cx - 26, cy - 62, 52, 52, 0x34D399);
        fill_rect(s, cx - 14, cy - 50, 28, 28, 0x0B101B);

        draw_text(s, cx - 156, cy + 26, "AWESOME-OS DESKTOP", 3, 0xE6EEFC);
        draw_text(s, cx - 180, cy + 60, "v11 CAS  |  UEFI Bare-Metal  |  Slot A Verified", 1, 0x8EA2C7);

        int bar_w = 360;
        int bar_x = cx - bar_w / 2;
        int bar_y = cy + 92;
        fill_rect(s, bar_x, bar_y, bar_w, 10, 0x1E293B);
        fill_rect(s, bar_x, bar_y, (bar_w * (step + 1)) / 4, 10, 0x60A5FA);
        draw_text(s, bar_x, bar_y + 20, steps[step], 1, 0x93C5FD);

        present(s);
        struct timespec ts = {0, 260000000L};
        nanosleep(&ts, NULL);
    }
}

static void draw_window(Surface *s, int x, int y, int w, int h, const char *title,
                        uint32_t bg, uint32_t border, uint32_t title_fg, int chonk_tab) {
    if (chonk_tab) {
        fill_rect(s, x, y - 24, 210, 24, 0xFACC15);
        draw_text(s, x + 10, y - 16, title, 1, 0x111827);
        fill_rect(s, x, y, w, h, bg);
        draw_rect_border(s, x, y, w, h, 2, border);
    } else {
        fill_rect(s, x, y, w, h, bg);
        draw_rect_border(s, x, y, w, h, 2, border);
        fill_rect(s, x + 2, y + 2, w - 4, 26, lerp_rgb(bg, border, 1, 5));
        draw_text(s, x + 12, y + 10, title, 1, title_fg);
    }
}

static void render_desktop(Surface *s, int mode, int theme_idx, const char *uname_str) {
    const Theme *t = &OMARCHY_THEMES[theme_idx % 5];
    time_t now = time(NULL);
    struct tm *tmv = localtime(&now);
    char clock_buf[32];
    snprintf(clock_buf, sizeof(clock_buf), "%02d:%02d:%02d UTC",
             tmv ? tmv->tm_hour : 0, tmv ? tmv->tm_min : 0, tmv ? tmv->tm_sec : 0);

    if (mode == 0) {
        /* [1] Omarchy Hyprland BSP Tiling */
        fill_vgrad(s, 0, 0, s->w, s->h, t->bg_top, t->bg_bot);

        /* Top Waybar */
        fill_rect(s, 10, 8, s->w - 20, 32, t->panel);
        draw_rect_border(s, 10, 8, s->w - 20, 32, 1, t->border);
        draw_text(s, 22, 20, "[1] OMARCHY HYPRLAND   [2] NOCTALIA   [3] CHONKSTEP   [4] SECTIUM", 1, t->accent);
        char right_bar[128];
        snprintf(right_bar, sizeof(right_bar), "Theme: %s (T)  |  Slot A*  |  %s", t->name, clock_buf);
        draw_text(s, s->w - 360, 20, right_bar, 1, t->text);

        int gap = 12;
        int top = 48;
        int avail_h = s->h - top - 42;
        int left_w = (s->w - 3 * gap) * 58 / 100;
        int right_x = gap * 2 + left_w;
        int right_w = s->w - right_x - gap;
        int top_h = (avail_h - gap) / 2;

        /* Left Main BSP Tile: Terminal / System Info */
        draw_window(s, gap, top, left_w, avail_h, "kitty :: system://local/desktop/omarchy-hyprland", t->panel, t->accent, t->text, 0);
        draw_text(s, gap + 18, top + 46, "AWESOME-OS DESKTOP v11 (OMARCHY HYPRLAND)", 2, t->accent);
        draw_text(s, gap + 18, top + 78, uname_str, 1, t->accent2);
        draw_text(s, gap + 18, top + 102, "ABI Magic     : B8G_ABI_MAGIC_V3 (0x33564742)", 1, t->text);
        draw_text(s, gap + 18, top + 120, "v11 CAS Store : /var/lib/b8g/cas/v11/files/ (RAM Netboot)", 1, t->text);
        draw_text(s, gap + 18, top + 138, "Boot Slot     : SLOT A [ACTIVE · VERIFIED]", 1, t->accent2);
        draw_text(s, gap + 18, top + 156, "Devices       : local & remote => terminal | desktop", 1, t->text);
        draw_text(s, gap + 18, top + 184, "Hotkeys:", 1, t->accent);
        draw_text(s, gap + 18, top + 202, "  [1] Omarchy Hyprland   [2] Noctalia Shell", 1, t->muted);
        draw_text(s, gap + 18, top + 220, "  [3] ChonkStep Wayland  [4] Sectium Pure-Art Canvas", 1, t->muted);
        draw_text(s, gap + 18, top + 238, "  [T] Cycle Omarchy Theme (Tokyo/Catppuccin/Nord/Gruvbox/RosePine)", 1, t->muted);
        draw_text(s, gap + 18, top + 256, "  [5] or [ESC] Drop to interactive Terminal (/bin/sh)", 1, t->muted);

        /* Top-Right BSP Tile: Host Manager */
        draw_window(s, right_x, top, right_w, top_h, "host-manager :: Fleet Control Plane", t->panel, t->border, t->text, 0);
        draw_text(s, right_x + 14, top + 42, "ENROLLED HOSTS (ChromeOS-Grade A/B)", 1, t->accent2);
        draw_text(s, right_x + 14, top + 64, "* local-workstation   desktop  Slot A*", 1, t->text);
        draw_text(s, right_x + 14, top + 82, "* hyperv-baremetal-01 desktop  Slot A*", 1, t->text);
        draw_text(s, right_x + 14, top + 100, "* rack-blade-01       omarchy  Slot A*", 1, t->muted);
        draw_text(s, right_x + 14, top + 118, "* rack-blade-02       noctalia Slot B*", 1, t->muted);

        /* Bottom-Right BSP Tile: Live Wayland / DRM Telemetry */
        draw_window(s, right_x, top + top_h + gap, right_w, avail_h - top_h - gap, "wayland :: /dev/fb0 + /dev/dri/card0", t->panel, t->accent2, t->text, 0);
        char res_buf[64];
        snprintf(res_buf, sizeof(res_buf), "Display : %dx%d 32bpp Truecolor", s->w, s->h);
        draw_text(s, right_x + 14, top + top_h + gap + 42, res_buf, 1, t->text);
        draw_text(s, right_x + 14, top + top_h + gap + 62, "Input   : VT Raw Keyboard (/dev/tty0)", 1, t->text);
        draw_text(s, right_x + 14, top + top_h + gap + 82, "Serial  : ttyS0 115200 (parallel terminal)", 1, t->muted);
    } else if (mode == 1) {
        /* [2] Noctalia Shell (Floating pill bar + Miller Explorer + Dock) */
        fill_vgrad(s, 0, 0, s->w, s->h, 0x0F172A, 0x1E1B4B);
        fill_rect(s, s->w / 2 - 220, 12, 440, 30, 0x1E293B);
        draw_rect_border(s, s->w / 2 - 220, 12, 440, 30, 1, 0x38BDF8);
        draw_text(s, s->w / 2 - 195, 22, "NOCTALIA SHELL  |  v11 CAS  |  Slot A*", 1, 0xE0F2FE);

        draw_window(s, 40, 64, s->w - 80, s->h - 140, "Noctalia Miller Explorer :: /var/lib/b8g/cas/v11", 0x111827, 0x38BDF8, 0xE0F2FE, 0);
        draw_text(s, 60, 108, "LOCALITIES          SURFACES            V11 CAS OBJECTS", 1, 0x38BDF8);
        draw_text(s, 60, 134, "> local             > desktop/noctalia  files/ (immutable)", 1, 0xE2E8F0);
        draw_text(s, 60, 154, "  remote              terminal/ttyS0    links/ (zero-copy)", 1, 0x94A3B8);
        draw_text(s, 60, 174, "                      desktop/omarchy   system.json", 1, 0x94A3B8);

        fill_rect(s, s->w / 2 - 210, s->h - 56, 420, 40, 0x1E293B);
        draw_rect_border(s, s->w / 2 - 210, s->h - 56, 420, 40, 1, 0x818CF8);
        draw_text(s, s->w / 2 - 190, s->h - 40, "[1] Omarchy  [2] Noctalia  [3] Chonk  [4] Sectium  [5] TTY", 1, 0xE0E7FF);
    } else if (mode == 2) {
        /* [3] ChonkStep Wayland (BeOS / System7 yellow tab floating windows) */
        fill_vgrad(s, 0, 0, s->w, s->h, 0x1E3A5F, 0x102542);
        draw_window(s, 48, 72, 460, 280, "ChonkStep :: System Status", 0xE2E8F0, 0x0F172A, 0x0F172A, 1);
        draw_text(s, 66, 98, "ChonkStep Wayland (BeOS / Smithay Edition)", 1, 0x0F172A);
        draw_text(s, 66, 122, uname_str, 1, 0x1E293B);
        draw_text(s, 66, 148, "Zero bloat. Zero X11. Pure framebuffer + Wayland.", 1, 0x334155);
        draw_text(s, 66, 178, "Press [1]-[4] to switch Desktop UI, [5]/ESC for Shell", 1, 0x0F172A);

        draw_window(s, 360, 220, 420, 220, "Host Manager :: Devices", 0xF8FAFC, 0x0F172A, 0x0F172A, 1);
        draw_text(s, 378, 250, "system://local/desktop/chonkstep-wayland", 1, 0x1D4ED8);
        draw_text(s, 378, 274, "system://local/terminal/ttyS0", 1, 0x047857);
    } else {
        /* [4] Sectium Pure-Art Canvas */
        fill_vgrad(s, 0, 0, s->w, s->h, 0x070B14, 0x16243E);
        int cx = s->w / 2;
        int cy = s->h / 2;
        draw_rect_border(s, cx - 180, cy - 90, 360, 180, 2, 0x34D399);
        draw_text(s, cx - 120, cy - 28, "SECTIUM CANVAS", 3, 0xE6EEFC);
        draw_text(s, cx - 148, cy + 16, "Pure-Art Display Appliance  |  v11 CAS", 1, 0x6EE7B7);
        fill_rect(s, 18, s->h - 46, 360, 28, 0x111827);
        draw_rect_border(s, 18, s->h - 46, 360, 28, 1, 0x34D399);
        draw_text(s, 28, s->h - 36, "HOST: local/desktop  |  [1-4] UI  [5/ESC] Terminal", 1, 0xA7F3D0);
    }

    /* Universal subtle footer */
    fill_rect(s, 0, s->h - 24, s->w, 24, 0x090D16);
    draw_text(s, 14, s->h - 16, "[1] Omarchy  [2] Noctalia  [3] ChonkStep  [4] Sectium  [T] Theme  [5/ESC] Terminal Shell", 1, 0x8EA2C7);

    present(s);
}

int main(void) {
    Surface surf;
    if (init_surface(&surf) != 0) {
        return 1;
    }

    struct utsname uts;
    char uname_str[256] = "Linux awesome-os v11";
    if (uname(&uts) == 0) {
        snprintf(uname_str, sizeof(uname_str), "%s %s (%s)", uts.sysname, uts.release, uts.machine);
    }

    int tty_fd = open("/dev/tty0", O_RDWR);
    struct termios orig_tio;
    int has_tio = 0;
    if (tty_fd >= 0 && tcgetattr(tty_fd, &orig_tio) == 0) {
        has_tio = 1;
        struct termios raw = orig_tio;
        raw.c_lflag &= (tcflag_t)~(ICANON | ECHO);
        raw.c_cc[VMIN] = 0;
        raw.c_cc[VTIME] = 0;
        (void)tcsetattr(tty_fd, TCSANOW, &raw);
        /* Hide blinking VT text cursor while graphical desktop is active */
        (void)write(tty_fd, "\033[?25l", 6);
    }

    draw_lumi_bootscreen(&surf);

    int mode = 0; /* Default: Omarchy Hyprland */
    int theme_idx = 0;
    render_desktop(&surf, mode, theme_idx, uname_str);

    for (;;) {
        fd_set rfds;
        FD_ZERO(&rfds);
        if (tty_fd >= 0) FD_SET(tty_fd, &rfds);
        struct timeval tv = {1, 0};
        int r = select(tty_fd >= 0 ? tty_fd + 1 : 0, &rfds, NULL, NULL, &tv);
        if (r > 0 && tty_fd >= 0 && FD_ISSET(tty_fd, &rfds)) {
            char ch = 0;
            if (read(tty_fd, &ch, 1) == 1) {
                if (ch == '1') mode = 0;
                else if (ch == '2') mode = 1;
                else if (ch == '3') mode = 2;
                else if (ch == '4') mode = 3;
                else if (ch == 't' || ch == 'T') theme_idx = (theme_idx + 1) % 5;
                else if (ch == '5' || ch == 27 || ch == 'q' || ch == 'Q') break;
            }
        }
        render_desktop(&surf, mode, theme_idx, uname_str);
    }

    if (tty_fd >= 0) {
        (void)write(tty_fd, "\033[?25h\033[2J\033[H", 13);
        if (has_tio) (void)tcsetattr(tty_fd, TCSANOW, &orig_tio);
        close(tty_fd);
    }
    destroy_surface(&surf);
    return 0;
}
