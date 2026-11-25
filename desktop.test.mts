import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_GREETER_HTML_PATH,
  buildLaunchCommand,
  createLaunchPlan,
  loadDesktopManifest,
  resolveDesktop,
  resolveGreeter,
} from './index.mts';

test('desktop-manifest.json conforms to awesome-os-desktop-manifest-v1 with ABI 0x33564742 and v11 CAS', () => {
  const manifest = loadDesktopManifest();

  assert.equal(manifest.schema, 'awesome-os-desktop-manifest-v1');
  assert.equal(manifest.abiMagic, '0x33564742');
  assert.equal(manifest.casLayout, 'v11');
  assert.equal(manifest.desktops.length, 4);
  assert.equal(manifest.greeters.length, 3);
});

test('all 4 desktops have expected IDs and project:// URIs', () => {
  const manifest = loadDesktopManifest();

  const expectedDesktops: ReadonlyArray<readonly [string, string]> = [
    [
      'sectium-desktop',
      'project://node/sectium-desktop?from=repository://github.com/awesome-os/sectium-browser@main',
    ],
    [
      'omarchy-hyprland',
      'project://coreutils/omarchy?from=repository://github.com/awesome-os/t2desktop-omarchy@main',
    ],
    [
      'noctalia-shell',
      'project://coreutils/noctalia?from=repository://github.com/awesome-os/t2desktop-noctalia@main',
    ],
    [
      'kitty-ink-tui',
      'project://node/kitty-ink?from=repository://github.com/awesome-os/awesome-os@main',
    ],
  ];

  for (const [id, expectedUri] of expectedDesktops) {
    const entry = resolveDesktop(id, manifest);
    assert.equal(entry.id, id);
    assert.equal(entry.projectUri, expectedUri);
    assert.ok(entry.projectUri.startsWith('project://'));
    assert.equal(entry.casProjectionBytes, 0);
  }
});

test('all 3 greeters resolve cleanly', () => {
  const manifest = loadDesktopManifest();

  const expectedGreeters = [
    'lumi-chromatic-greeter',
    'tty-ink-greeter',
    'wol-warm-resume',
  ] as const;

  for (const id of expectedGreeters) {
    const entry = resolveGreeter(id, manifest);
    assert.equal(entry.id, id);
    assert.ok(entry.summary.length > 0);
  }
});

test('buildLaunchCommand and createLaunchPlan produce exact holo-project commands', () => {
  const cmd = buildLaunchCommand('omarchy-hyprland', 'wol-warm-resume');
  assert.equal(
    cmd,
    'holo-project "project://coreutils/omarchy?from=repository://github.com/awesome-os/t2desktop-omarchy@main" --greeter=wol-warm-resume',
  );

  const plan = createLaunchPlan('kitty-ink-tui');
  assert.equal(plan.desktop.id, 'kitty-ink-tui');
  assert.equal(plan.greeter.id, 'tty-ink-greeter');
  assert.equal(plan.abiMagic, '0x33564742');
  assert.equal(plan.casLayout, 'v11');
  assert.equal(
    plan.command,
    'holo-project "project://node/kitty-ink?from=repository://github.com/awesome-os/awesome-os@main" --greeter=tty-ink-greeter',
  );

  assert.throws(() => resolveDesktop('nonexistent-desktop'), /Unknown desktop/);
  assert.throws(() => resolveGreeter('nonexistent-greeter'), /Unknown greeter/);
});

test('greeter/index.html exists, is standalone, and includes all desktops, greeters, keyboard nav, and v11 CAS badge', () => {
  assert.equal(existsSync(DEFAULT_GREETER_HTML_PATH), true);
  const html = readFileSync(DEFAULT_GREETER_HTML_PATH, 'utf8');

  assert.doesNotMatch(html, /https?:\/\/cdn\./i);
  assert.match(html, /sectium-desktop/);
  assert.match(html, /omarchy-hyprland/);
  assert.match(html, /noctalia-shell/);
  assert.match(html, /kitty-ink-tui/);
  assert.match(html, /lumi-chromatic-greeter/);
  assert.match(html, /tty-ink-greeter/);
  assert.match(html, /wol-warm-resume/);
  assert.match(html, /holo-project/);
  assert.match(html, /0 B v11 CAS Projection/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /Enter/);
});
