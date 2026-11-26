# AwesomeOS Desktop (`awesome-os/desktop`)

> **ChromeOS-Grade Sovereign Desktop OS Foundation** — pairing **Holo-Linux `7.3.6`**, **Ed25519 Verified Boot**, **A/B Atomic Slots**, **1-Click Powerwash**, and **Sectium** (Browser-as-Shell), consolidated in the [`awesome-os/awesome-os`](https://github.com/awesome-os/awesome-os) monorepo and live at **[https://awesome-os.com/shell/](https://awesome-os.com/shell/)**.

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
   - **GNOME Wayland (Debloated)** (Mutter + GNOME Shell; Xorg/Tracker/Evolution excluded)
   - **KDE Plasma Wayland (Debloated)** (KWin + Plasma + shared Qt6 `v11` CAS; Xorg/Baloo/Akonadi excluded)
   - **Kitty-Ink Terminal** (Zero-GPU ANSI/TUI)
   - Plus **Virtual KVM Switch** (`web-demo/kvm.html`), **19" Server Rack Manager** (`web-demo/rack.html`), and **Zero-Asset 3D White Dragon VTuber Studio** (`web-demo/vtuber.html`).

---

## Why X11 (`xorg-server`) Is Never Needed in Awesome-OS

> **Awesome-OS supports every machine from 2026 WebGPU/Wayland workstations down to 1978 VT100 serial terminals — with zero `xorg-server` and 549+ fewer legacy packages.** See the full technical breakdown in **[`docs/WHY-NO-X11.md`](docs/WHY-NO-X11.md)**.

| Tier | Display Sink | Hardware Era Covered |
| :--- | :--- | :--- |
| **1. GPU / WebGPU** | Wayland DRM+KMS + `holo-display-webgpu` | Modern GPUs (2016–2026), 120–240 Hz, full 3D & shaders |
| **2. Raw Framebuffer** | `/dev/fb0` (`boot/src/fb_desktop.c`, `42 KB` static C11) | **Any PC since ~1998** — truecolor desktop with **0 GPU drivers** |
| **3. Kitty Graphics + ANSI** | `kitty-ink` TUI + inline graphics over SSH / mTLS | Old laptops, Raspberry Pis, remote blades with **0 GPU** |
| **4. VGA Text (`80×25`)** | 16-color `tty0` / `linux` VT (`TTY-Ink Greeter`) | **1987+ VGA**, IPMI/iDRAC/iLO KVM consoles, recovery boots |
| **5. Pure Serial (`ttyS0`)** | `115200 8N1` VT100 / ASCII (`awesome-os/posix`) | Headless 19" rack blades, embedded boards, **1978 VT100** |

- **Selectable `+ Advanced Graphics` Layer (Default Rootless `Xwayland`):**
  - **Base OS (`~31 MB`):** Boots anywhere with `/dev/fb0` + `kitty-ink` + `ttyS0` — zero GPU stack bloat on servers, VMs, or minimal installs.
  - **`+ Advanced Graphics` (opt-in workstation toggle):** Adds full **Wayland DRM+KMS + Mesa / Vulkan / Dawn WebGPU** hardware acceleration **with rootless `Xwayland` enabled by default** — so every legacy X11 app works seamlessly inside Wayland without ever shipping `xorg-server` or the 549 legacy Xorg packages.
- **Hardware drivers belong in the kernel + `modalias` `v11` CAS hydrator (`boot/src/driver_hydrator.c`), not X11.**
- **Zero X11 security surface** (no global keystroke-sniffing X11 bus, no `setuid` Xorg).

## Quick Start

```powershell
# Run foundation unit tests
node --test desktop.test.mts

# Boot bare-metal UEFI ISO in Windows 11 Hyper-V (elevated PowerShell)
.\boot\scripts\run-hyperv.ps1
```
