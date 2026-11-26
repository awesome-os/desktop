/**
 * @file wm-compositors.mts
 * @description Orthogonal WM-Compositor & VM-Architecture Registry aligning
 * `awesome-os/wayland`, `wm-compositor-*`, and promoted `holo-vm-arch` (ex-Emukit)
 * over `B8G_ABI_MAGIC_V3` (`0x33564742`) and `B8G_ARENA_V1`.
 *
 * Strictly `erasableSyntaxOnly: true`, zero external dependencies.
 */

export const B8G_ABI_MAGIC_V3 = '0x33564742';

export interface WmCompositorEntry {
  readonly id:
    | 'wm-compositor-wayland'
    | 'wm-compositor-hyprland'
    | 'wm-compositor-noctalia'
    | 'wm-compositor-sectium'
    | 'wm-compositor-tmux';
  readonly desktopFace: string;
  readonly webDemoPath: string;
  readonly waylandSubstrate: 'awesome-os/wayland' | 'awesome-os/sectium-display' | 'holo-display-tty';
  readonly upstreamRepo: string;
  readonly layoutModel: 'floating-smithay' | 'dwindle-bsp' | 'wayland-gles-shell' | 'pure-art' | 'ansi-tmux-panes';
  readonly role: string;
}

export const WM_COMPOSITORS: readonly WmCompositorEntry[] = [
  {
    id: 'wm-compositor-sectium',
    desktopFace: 'Sectium Pure-Art Desktop',
    webDemoPath: './sectium.html',
    waylandSubstrate: 'awesome-os/sectium-display',
    upstreamRepo: 'repository://github.com/awesome-os/sectium-display@main',
    layoutModel: 'pure-art',
    role: 'Lumi Chromatic pure-art desktop, Code-OSS workbench & libsectium_display sink',
  },
  {
    id: 'wm-compositor-hyprland',
    desktopFace: 'Omarchy Hyprland / Wayland',
    webDemoPath: './omarchy.html',
    waylandSubstrate: 'awesome-os/wayland',
    upstreamRepo: 'repository://github.com/awesome-os/desktop-omarchy@main',
    layoutModel: 'dwindle-bsp',
    role: 'Dynamic Hyprland Dwindle BSP tiling compositor, 25 themes, Walker & WebGPU ring',
  },
  {
    id: 'wm-compositor-noctalia',
    desktopFace: 'Noctalia Wayland Shell',
    webDemoPath: './noctalia.html',
    waylandSubstrate: 'awesome-os/wayland',
    upstreamRepo: 'repository://github.com/awesome-os/noctalia@main',
    layoutModel: 'wayland-gles-shell',
    role: 'Sovereign C++23 native Wayland + OpenGL ES shell (zero Qt/GTK) + awesome-os/explorer',
  },
  {
    id: 'wm-compositor-wayland',
    desktopFace: 'Chonkstep Wayland',
    webDemoPath: './chonkstep.html',
    waylandSubstrate: 'awesome-os/wayland',
    upstreamRepo: 'repository://github.com/awesome-os/chonkstep@main',
    layoutModel: 'floating-smithay',
    role: 'Generic floating Smithay 0.7.0 Wayland compositor with BeOS / OS/2 / System 7 / Modern themes',
  },
  {
    id: 'wm-compositor-tmux',
    desktopFace: 'Kitty-Ink DevOps TUI',
    webDemoPath: './kitty-ink.html',
    waylandSubstrate: 'holo-display-tty',
    upstreamRepo: 'repository://github.com/awesome-os/awesome-os@main',
    layoutModel: 'ansi-tmux-panes',
    role: 'Zero-GPU ANSI/tmux multi-pane terminal compositor over holo-display-tty',
  },
];

export const HOLO_VM_ARCH = {
  id: 'holo-vm-arch',
  legacyAlias: 'emukit',
  repo: 'repository://github.com/awesome-os/holo-vm-arch@main',
  webPath: '/emukit.html',
  abi: B8G_ABI_MAGIC_V3,
  targets: ['wasm32-wasi', 'x86_64-linux-musl', 'aarch64-linux-musl', 'riscv64'] as const,
  role: 'Promoted paravirtual VM & CPU/GPU architecture substrate (formerly Emukit), decoupled from desktop faces',
} as const;

export function resolveWmCompositor(id: string): WmCompositorEntry | undefined {
  const key = id.trim().toLowerCase();
  return WM_COMPOSITORS.find((c) => c.id === key || c.id === `wm-compositor-${key}`);
}
