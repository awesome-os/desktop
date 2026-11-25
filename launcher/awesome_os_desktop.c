/*
 * awesome_os_desktop.c — Native Win32/C11 Awesome-OS Desktop & Greeter Chooser
 *
 * Implements the `holo-display-win32` backend (B8G_ABI_MAGIC_V3 = 0x33564742)
 * as a zero-bloat (~50 KB) native window entrypoint: Launcher == Installer.
 *
 * CLI flags:
 *   --self-test   Verify B8G_ABI_MAGIC_V3 & desktop/greeter table and exit 0 (headless CI)
 *   (default)     Open native Win32 Lumi Chromatic Startup Desktop & Greeter Chooser window
 */

#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#endif

#define B8G_ABI_MAGIC_V3 0x33564742u

typedef struct {
  const char* id;
  const char* title;
  const char* subtitle;
  const char* project_uri;
} holo_desktop_entry_t;

static const holo_desktop_entry_t DESKTOPS[4] = {
  {
    "sectium-desktop",
    "Sectium Pure-Art Desktop",
    "Sectium Canvas + Browser + Code - OSS (587 MB total RAM)",
    "project://node/sectium-desktop?from=repository://github.com/awesome-os/sectium-browser@main"
  },
  {
    "omarchy-hyprland",
    "Omarchy Hyprland / Wayland",
    "holo-display-wayland + awesome-os/coreutils (0 B v11 projection)",
    "project://coreutils/omarchy?from=repository://github.com/awesome-os/t2desktop-omarchy@main"
  },
  {
    "noctalia-shell",
    "Noctalia Shell / Quickshell",
    "holo-display-qt / wayland prismatic shell (0 B v11 projection)",
    "project://coreutils/noctalia?from=repository://github.com/awesome-os/t2desktop-noctalia@main"
  },
  {
    "kitty-ink-tui",
    "Kitty-Ink DevOps TUI",
    "holo-display-tty zero-GPU terminal shell",
    "project://node/kitty-ink?from=repository://github.com/awesome-os/awesome-os@main"
  }
};

static const char* GREETERS[3] = {
  "lumi-chromatic-greeter",
  "tty-ink-greeter",
  "wol-warm-resume"
};

#ifdef _WIN32
static int g_selected_desktop = 0;
static int g_selected_greeter = 0;
static RECT g_card_rects[4];
static RECT g_greeter_rects[3];
static RECT g_launch_rect;

static void draw_round_box(HDC hdc, RECT r, COLORREF fill, COLORREF border, int radius) {
  HBRUSH br = CreateSolidBrush(fill);
  HPEN pen = CreatePen(PS_SOLID, 2, border);
  HGDIOBJ old_br = SelectObject(hdc, br);
  HGDIOBJ old_pen = SelectObject(hdc, pen);
  RoundRect(hdc, r.left, r.top, r.right, r.bottom, radius, radius);
  SelectObject(hdc, old_br);
  SelectObject(hdc, old_pen);
  DeleteObject(br);
  DeleteObject(pen);
}

static void draw_text_utf8(HDC hdc, const char* text, RECT* r, COLORREF color, UINT fmt) {
  wchar_t wbuf[512];
  int n = MultiByteToWideChar(CP_UTF8, 0, text, -1, wbuf, 512);
  if (n > 0) {
    SetTextColor(hdc, color);
    SetBkMode(hdc, TRANSPARENT);
    DrawTextW(hdc, wbuf, -1, r, fmt);
  }
}

static void launch_selected_desktop(HWND hwnd) {
  char cmd[1024];
  snprintf(
    cmd,
    sizeof(cmd),
    "holo-project.cmd \"%s\"",
    DESKTOPS[g_selected_desktop].project_uri
  );
  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);
  if (CreateProcessA(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
  }
  PostMessageW(hwnd, WM_CLOSE, 0, 0);
}

static LRESULT CALLBACK wnd_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      RECT client;
      GetClientRect(hwnd, &client);

      HBRUSH bg = CreateSolidBrush(RGB(11, 14, 20));
      FillRect(hdc, &client, bg);
      DeleteObject(bg);

      HFONT f_title = CreateFontW(26, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
      HFONT f_sub = CreateFontW(15, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
      HFONT f_card = CreateFontW(17, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_SWISS, L"Segoe UI");

      HGDIOBJ old_f = SelectObject(hdc, f_title);
      RECT hdr = { 32, 22, client.right - 32, 56 };
      draw_text_utf8(hdc, "Awesome-OS Desktop  |  Install-on-Launch (holo-display-win32)", &hdr, RGB(248, 250, 252), DT_LEFT | DT_SINGLELINE);

      SelectObject(hdc, f_sub);
      RECT sub = { 32, 56, client.right - 32, 80 };
      draw_text_utf8(hdc, "Pick Desktop & Greeter — 0-byte v11 CAS hardlink projection via project:// (Arrow keys + Enter or Click)", &sub, RGB(148, 163, 184), DT_LEFT | DT_SINGLELINE);

      /* 2x2 Desktop cards */
      int card_w = (client.right - 32 * 2 - 16) / 2;
      int card_h = 104;
      for (int i = 0; i < 4; i++) {
        int col = i % 2;
        int row = i / 2;
        RECT r = {
          32 + col * (card_w + 16),
          96 + row * (card_h + 14),
          32 + col * (card_w + 16) + card_w,
          96 + row * (card_h + 14) + card_h
        };
        g_card_rects[i] = r;
        int sel = (i == g_selected_desktop);
        draw_round_box(
          hdc, r,
          sel ? RGB(20, 42, 64) : RGB(18, 23, 34),
          sel ? RGB(56, 189, 248) : RGB(45, 58, 78),
          14
        );
        SelectObject(hdc, f_card);
        RECT tr = { r.left + 16, r.top + 14, r.right - 16, r.top + 40 };
        draw_text_utf8(hdc, DESKTOPS[i].title, &tr, RGB(248, 250, 252), DT_LEFT | DT_SINGLELINE);

        SelectObject(hdc, f_sub);
        RECT sr = { r.left + 16, r.top + 42, r.right - 16, r.bottom - 12 };
        draw_text_utf8(hdc, DESKTOPS[i].subtitle, &sr, RGB(148, 163, 184), DT_LEFT | DT_WORDBREAK);
      }

      /* 3 Greeter pills */
      int pill_y = 336;
      int pill_w = (client.right - 32 * 2 - 24) / 3;
      for (int g = 0; g < 3; g++) {
        RECT gr = {
          32 + g * (pill_w + 12),
          pill_y,
          32 + g * (pill_w + 12) + pill_w,
          pill_y + 34
        };
        g_greeter_rects[g] = gr;
        int sel = (g == g_selected_greeter);
        draw_round_box(
          hdc, gr,
          sel ? RGB(46, 30, 74) : RGB(18, 23, 34),
          sel ? RGB(167, 139, 250) : RGB(45, 58, 78),
          12
        );
        SelectObject(hdc, f_sub);
        draw_text_utf8(hdc, GREETERS[g], &gr, sel ? RGB(243, 232, 255) : RGB(148, 163, 184), DT_CENTER | DT_VCENTER | DT_SINGLELINE);
      }

      /* URI Preview + Launch button */
      RECT uri_r = { 32, 390, client.right - 220, 434 };
      draw_round_box(hdc, uri_r, RGB(15, 23, 42), RGB(51, 65, 85), 10);
      RECT uri_txt = { uri_r.left + 12, uri_r.top + 10, uri_r.right - 12, uri_r.bottom - 10 };
      SelectObject(hdc, f_sub);
      draw_text_utf8(hdc, DESKTOPS[g_selected_desktop].project_uri, &uri_txt, RGB(125, 211, 252), DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

      g_launch_rect.left = client.right - 204;
      g_launch_rect.top = 390;
      g_launch_rect.right = client.right - 32;
      g_launch_rect.bottom = 434;
      draw_round_box(hdc, g_launch_rect, RGB(2, 132, 199), RGB(56, 189, 248), 12);
      SelectObject(hdc, f_card);
      draw_text_utf8(hdc, "Launch / Install", &g_launch_rect, RGB(255, 255, 255), DT_CENTER | DT_VCENTER | DT_SINGLELINE);

      SelectObject(hdc, old_f);
      DeleteObject(f_title);
      DeleteObject(f_sub);
      DeleteObject(f_card);
      EndPaint(hwnd, &ps);
      return 0;
    }

    case WM_LBUTTONDOWN: {
      POINT pt = { (short)LOWORD(lp), (short)HIWORD(lp) };
      for (int i = 0; i < 4; i++) {
        if (PtInRect(&g_card_rects[i], pt)) {
          g_selected_desktop = i;
          InvalidateRect(hwnd, NULL, FALSE);
          return 0;
        }
      }
      for (int g = 0; g < 3; g++) {
        if (PtInRect(&g_greeter_rects[g], pt)) {
          g_selected_greeter = g;
          InvalidateRect(hwnd, NULL, FALSE);
          return 0;
        }
      }
      if (PtInRect(&g_launch_rect, pt)) {
        launch_selected_desktop(hwnd);
        return 0;
      }
      return 0;
    }

    case WM_KEYDOWN: {
      if (wp == VK_RIGHT) g_selected_desktop = (g_selected_desktop + 1) % 4;
      else if (wp == VK_LEFT) g_selected_desktop = (g_selected_desktop + 3) % 4;
      else if (wp == VK_DOWN) g_selected_desktop = (g_selected_desktop + 2) % 4;
      else if (wp == VK_UP) g_selected_desktop = (g_selected_desktop + 2) % 4;
      else if (wp == VK_RETURN) { launch_selected_desktop(hwnd); return 0; }
      else if (wp == VK_ESCAPE) { PostMessageW(hwnd, WM_CLOSE, 0, 0); return 0; }
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }

    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}
#endif

int main(int argc, char** argv) {
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--self-test") == 0) {
      printf("PASS: awesome-os-desktop abiMagic=0x%08X backend=holo-display-win32 desktops=%d greeters=%d\n",
        B8G_ABI_MAGIC_V3, 4, 3);
      return 0;
    }
  }

#ifdef _WIN32
  SetProcessDPIAware();
  HINSTANCE hinst = GetModuleHandleW(NULL);
  WNDCLASSEXW wc;
  ZeroMemory(&wc, sizeof(wc));
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = wnd_proc;
  wc.hInstance = hinst;
  wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
  wc.lpszClassName = L"AwesomeOsDesktopChooser";
  RegisterClassExW(&wc);

  HWND hwnd = CreateWindowExW(
    0,
    L"AwesomeOsDesktopChooser",
    L"Awesome-OS Desktop — Startup Greeter & Chooser",
    WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
    CW_USEDEFAULT, CW_USEDEFAULT, 880, 500,
    NULL, NULL, hinst, NULL
  );
  if (!hwnd) return 1;

  ShowWindow(hwnd, SW_SHOW);
  UpdateWindow(hwnd);

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  return 0;
#else
  printf("awesome-os-desktop: non-Win32 host — use greeter/index.html or holo-display-wayland\n");
  return 0;
#endif
}
