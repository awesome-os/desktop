/**
 * @file holo-display.mts
 * @description Unified `holo-display-*` backend registry implementing the Sectium
 * Host Device Boundary (`B8G_ABI_MAGIC_V3 = 0x33564742`, dual command/display NDJSON pipe)
 * across Wayland, Win32, Electron, NW.js, Qt, and Kitty-Ink TTY.
 *
 * Strictly `erasableSyntaxOnly: true`, zero external dependencies.
 */

export const B8G_ABI_MAGIC_V3 = '0x33564742';

export interface HoloDisplayBackend {
  readonly id: string;
  readonly transport: 'os-pipe' | 'unix-socket' | 'tty-ansi';
  readonly defaultBus: string;
  readonly projectUri: string;
  readonly role: string;
}

export const HOLO_DISPLAY_BACKENDS: readonly HoloDisplayBackend[] = [
  {
    id: 'holo-display-win32',
    transport: 'os-pipe',
    defaultBus: '\\\\.\\pipe\\sectium-dev',
    projectUri: 'project://cpp/holo-display-win32?from=repository://github.com/awesome-os/awesome-os-desktop@main',
    role: 'Native Win32 GDI/DirectComposition window & Awesome-OS Desktop greeter host',
  },
  {
    id: 'holo-display-wayland',
    transport: 'unix-socket',
    defaultBus: '/tmp/sectium-dev.sock',
    projectUri: 'project://cpp/holo-display-wayland?from=repository://github.com/awesome-os/sectium-display@main',
    role: 'Wayland/Hyprland compositor display sink for Omarchy & Noctalia desktops',
  },
  {
    id: 'holo-display-electron',
    transport: 'os-pipe',
    defaultBus: '\\\\.\\pipe\\sectium-dev',
    projectUri: 'project://node/holo-display-electron?from=repository://github.com/awesome-os/sectium-electron@main',
    role: 'Drop-in Electron BrowserWindow / WebContentsView shell over shared v11 V8/Chromium',
  },
  {
    id: 'holo-display-nwjs',
    transport: 'os-pipe',
    defaultBus: '\\\\.\\pipe\\sectium-dev',
    projectUri: 'project://node/holo-display-nwjs?from=repository://github.com/awesome-os/sectium-browser@main',
    role: 'NW.js unified DOM+Node context window projection over Sectium Display',
  },
  {
    id: 'holo-display-qt',
    transport: 'unix-socket',
    defaultBus: '/tmp/sectium-dev.sock',
    projectUri: 'project://cpp/holo-display-qt?from=repository://github.com/awesome-os/qt@main',
    role: 'Qt 6.10.3 / Quickshell display sink for Noctalia & native Qt apps',
  },
  {
    id: 'holo-display-tty',
    transport: 'tty-ansi',
    defaultBus: 'ttyS0',
    projectUri: 'project://node/holo-display-tty?from=repository://github.com/awesome-os/awesome-os@main',
    role: 'Zero-GPU Kitty-Ink / ANSI framebuffer terminal display sink',
  },
];

export function resolveHoloDisplay(idOrShort: string): HoloDisplayBackend | undefined {
  const key = idOrShort.trim().toLowerCase();
  return HOLO_DISPLAY_BACKENDS.find((b) => b.id === key || b.id === `holo-display-${key}`);
}
