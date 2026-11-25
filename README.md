# Awesome-OS Desktop

**100% Holo-Native Desktop & Startup Greeter Chooser — Zero T2 SDE Dependency.**

`awesome-os-desktop` replaces legacy T2 SDE desktop packaging with pure Holo projections over `repository://`, `project://`, `v11` CAS (`0 B` projection overhead), `B8G_ABI_MAGIC_V3` (`0x33564742`), and `awesome-os/coreutils`.

---

## Startup Desktop & Greeter Chooser

The standalone Lumi Chromatic startup screen ([`greeter/index.html`](greeter/index.html)) lets users select both a **Desktop Environment** and a **Greeter Style** via mouse click or keyboard (`ArrowLeft`, `ArrowRight`, `1`-`3`, `Enter`), displaying the live `holo-project` command and `0 B` `v11` CAS projection badge with zero external CDN dependencies.

### Supported Desktop Environments

| ID | Desktop | Summary | Holo Project URI |
| :--- | :--- | :--- | :--- |
| `sectium-desktop` | Sectium Desktop | Sectium Pure-Art Canvas + Sectium Browser + Code - OSS | `project://node/sectium-desktop?from=repository://github.com/awesome-os/sectium-browser@main` |
| `omarchy-hyprland` | Omarchy Hyprland | Omarchy Hyprland/Wayland | `project://coreutils/omarchy?from=repository://github.com/awesome-os/t2desktop-omarchy@main` |
| `noctalia-shell` | Noctalia Shell | Noctalia Shell / Quickshell | `project://coreutils/noctalia?from=repository://github.com/awesome-os/t2desktop-noctalia@main` |
| `kitty-ink-tui` | Kitty-Ink TUI | Headless Kitty-Ink DevOps TUI | `project://node/kitty-ink?from=repository://github.com/awesome-os/awesome-os@main` |

### Supported Greeter Styles

| ID | Greeter | Description |
| :--- | :--- | :--- |
| `lumi-chromatic-greeter` | Lumi Chromatic Greeter | GPU/Sectium Lumi Chromatic Startup Chooser |
| `tty-ink-greeter` | TTY-Ink Greeter | Zero-GPU Kitty-Ink / ANSI Terminal Greeter |
| `wol-warm-resume` | WoL Warm Resume | 1-Way WoL Warm-RAM Instant Session Resume |

---

## Quick Usage

Resolve a desktop and greeter programmatically from [`index.mts`](index.mts) backed by [`desktop-manifest.json`](desktop-manifest.json):

```ts
import { buildLaunchCommand, loadDesktopManifest } from './index.mts';

const manifest = loadDesktopManifest();
console.log(manifest.abiMagic); // 0x33564742
console.log(buildLaunchCommand('sectium-desktop', 'lumi-chromatic-greeter'));
```

### Verification

Run the zero-dependency test suite ([`desktop.test.mts`](desktop.test.mts)):

```powershell
node --test desktop.test.mts
```

---

## Repository Layout

- [`desktop-manifest.json`](desktop-manifest.json) — Canonical `awesome-os-desktop-manifest-v1` registry (`0x33564742`, `v11` CAS)
- [`greeter/index.html`](greeter/index.html) — Standalone dark Lumi Chromatic Startup Desktop & Greeter Chooser
- [`index.mts`](index.mts) — Erasable TypeScript resolver and `holo-project` launch command builder
- [`desktop.test.mts`](desktop.test.mts) — Manifest, resolver, and greeter verification suite
- [`package.json`](package.json) — Native ESM package metadata
