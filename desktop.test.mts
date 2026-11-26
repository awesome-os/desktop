import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HOLO_DISPLAY_BACKENDS, resolveHoloDisplay } from './holo-display.mts';
import {
  buildLaunchCommand,
  createLaunchPlan,
  loadDesktopManifest,
  resolveDesktop,
  resolveDeviceSession,
  resolveGreeter,
} from './index.mts';

describe('awesome-os/desktop — Unified Cross-Platform OS Foundation', () => {
  it('loads valid v11 / B8G v3 manifest with boot, devices, 5 desktops, and 3 greeters', () => {
    const m = loadDesktopManifest();
    assert.equal(m.schema, 'awesome-os-desktop-manifest-v1');
    assert.equal(m.abiMagic, '0x33564742');
    assert.equal(m.casLayout, 'v11');
    assert.equal(m.desktops.length, 7);
    assert.equal(m.greeters.length, 3);
    assert.deepEqual(m.devices?.localities, ['local', 'remote']);
    assert.deepEqual(m.devices?.surfaces, ['terminal', 'desktop']);
    assert.equal(m.devices?.management.remoteDeployable, true);
    assert.equal(fs.existsSync(path.join(import.meta.dirname, 'boot', 'src', 'init.c')), true);
    assert.equal(fs.existsSync(path.join(import.meta.dirname, 'boot', 'config', 'limine.conf')), true);
    assert.equal(fs.existsSync(path.join(import.meta.dirname, 'boot', 'netboot', 'boot.ipxe')), true);
  });

  it('links bootscreen -> greeter -> local/remote terminal/desktop devices -> desktop UI adapters', () => {
    const omarchy = resolveDesktop('omarchy-hyprland');
    assert.equal(omarchy.projectUri.includes('desktop-omarchy'), true);
    assert.equal(omarchy.projectUri.includes('t2desktop'), false);

    const noctalia = resolveDesktop('noctalia-shell');
    assert.equal(noctalia.projectUri.includes('awesome-os/noctalia'), true);
    assert.equal(noctalia.projectUri.includes('t2desktop'), false);

    const greeter = resolveGreeter('lumi-chromatic-greeter');
    assert.ok(greeter);

    const localPlan = createLaunchPlan('omarchy-hyprland', undefined, 'local');
    assert.equal(localPlan.device.systemUri, 'system://local/desktop/omarchy-hyprland');

    const remoteTerm = resolveDeviceSession('remote', 'terminal', 'ttyS0', 'rack-blade-01');
    assert.equal(remoteTerm.systemUri, 'system://rack-blade-01/terminal/ttyS0');
    assert.equal(remoteTerm.remoteDeployable, true);

    const cmd = buildLaunchCommand('sectium-desktop', 'lumi-chromatic-greeter');
    assert.ok(cmd.includes('holo-project'));
    assert.equal(fs.existsSync(path.join(import.meta.dirname, 'greeter', 'index.html')), true);
  });

  it('unifies all 6 holo-display-* backends (win32, wayland, electron, nwjs, qt, tty)', () => {
    assert.equal(HOLO_DISPLAY_BACKENDS.length, 6);
    assert.equal(resolveHoloDisplay('wayland')?.id, 'holo-display-wayland');
    assert.equal(resolveHoloDisplay('electron')?.id, 'holo-display-electron');
    assert.equal(resolveHoloDisplay('nwjs')?.id, 'holo-display-nwjs');
    assert.equal(resolveHoloDisplay('qt')?.id, 'holo-display-qt');
    assert.equal(resolveHoloDisplay('win32')?.id, 'holo-display-win32');
    assert.equal(resolveHoloDisplay('tty')?.id, 'holo-display-tty');
  });
});
