# Awesome-OS Desktop (`awesome-os/desktop`)

Unified, cross-platform Desktop OS Foundation — modeled on the deployable, remotely manageable device architecture of ChromeOS, Android, and Fuchsia, powered by `B8G_ABI_MAGIC_V3` (`0x33564742`) and the `v11` Content-Addressable Store.

## Core Model: Devices (`local` & `remote`) => `terminal` | `desktop`

Every host (bare-metal PC, Hyper-V/QEMU VM, Proxmox blade, Windows/macOS/Linux workstation, or WebGPU browser tab) is a remotely manageable, deployable device exposing two canonical surfaces:

| Locality | `terminal` Surface | `desktop` Surface |
| :--- | :--- | :--- |
| **`local`** | `system://local/terminal/tty0` & `ttyS0` (Kitty-Ink / ANSI / POSIX shell) | `system://local/desktop/*` (Wayland / WebGPU / Sectium Canvas) |
| **`remote`** | `system://<host>/terminal/ttyS0` (mTLS / Rack Serial Console / SSH) | `system://<host>/desktop/*` (KVM Switch / Remote Wayland / WebGPU stream) |

## Unified Foundation Layers

1. **Bootscreen & Bare-Metal / Netboot (`boot/`):**
   - `boot/src/init.c` — Static musl PID 1 with dual-console output (`tty0` + `ttyS0`), interactive terminal sessions on both consoles, dynamic NIC discovery, DRM+HID device probing, and stateless RAM `v11` CAS netboot-first mode.
   - `boot/config/limine.conf` — Hybrid UEFI/BIOS Limine v8 boot configuration.
   - `boot/config/system.json` — Declarative `system://local/appliance/awesome-os-desktop` manifest.
   - `boot/netboot/boot.ipxe` — Zero-disk HTTPS iPXE netboot (`https://awesome-os.com/netboot/boot.ipxe`).
   - `boot/scripts/run-hyperv.ps1` & `boot/scripts/run-qemu.ps1` — 1-command Hyper-V Gen-2 UEFI and QEMU launchers.
2. **Greeter (`greeter/`):**
   - Lumi Chromatic Greeter (GPU/Canvas), TTY-Ink Greeter (zero-GPU `tty0`/`ttyS0`), and WoL Warm-RAM Resume.
3. **Wayland / WebGPU / Display Foundation (`holo-display.mts`, `wm-compositors.mts`):**
   - Unified `holo-display-*` backends (`wayland`, `win32`, `electron`, `nwjs`, `qt`, `tty`) + WebGPU compositor bridge.
4. **Pluggable Desktop UI Adapters (`desktop-manifest.json`, `web-demo/`):**
   - **Sectium Desktop** (`awesome-os/sectium-browser`)
   - **Omarchy Hyprland** (`awesome-os/desktop-omarchy`)
   - **Noctalia Shell** (`awesome-os/noctalia`)
   - **ChonkStep Wayland** (Smithay 0.7.0)
   - **Kitty-Ink Terminal** (Zero-GPU ANSI/TUI)
   - Plus **Virtual KVM Switch** (`web-demo/kvm.html`) and **19" Server Rack Manager** (`web-demo/rack.html`).

## Quick Start

```powershell
# Run foundation unit tests
node --test desktop.test.mts

# Boot bare-metal UEFI ISO in Windows 11 Hyper-V (elevated PowerShell)
.\boot\scripts\run-hyperv.ps1
```
