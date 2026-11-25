import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HOLO_DISPLAY_BACKENDS, resolveHoloDisplay } from './holo-display.mts';
import {
  buildLaunchCommand,
  loadDesktopManifest,
  resolveDesktop,
  resolveGreeter,
} from './index.mts';

describe('awesome-os/awesome-os-desktop & holo-display-* unification', () => {
  it('loads valid v11 / B8G v3 manifest with 4 desktops and 3 greeters', () => {
    const m = loadDesktopManifest();
    assert.equal(m.schema, 'awesome-os-desktop-manifest-v1');
    assert.equal(m.abiMagic, '0x33564742');
    assert.equal(m.casLayout, 'v11');
    assert.equal(m.desktops.length, 4);
    assert.equal(m.greeters.length, 3);
  });

  it('resolves desktops, greeters, launch commands, and standalone greeter/index.html', () => {
    const sectium = resolveDesktop('sectium-desktop');
    assert.ok(sectium.projectUri.startsWith('project://'));
    const greeter = resolveGreeter('lumi-chromatic-greeter');
    assert.ok(greeter);
    const plan = buildLaunchCommand('sectium-desktop', 'lumi-chromatic-greeter');
    const cmdStr = typeof plan === 'string' ? plan : plan.command;
    assert.ok(cmdStr.includes('holo-project'));
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
