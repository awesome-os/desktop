import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DesktopEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly projectUri: string;
  readonly runtime: string;
  readonly compositor: string;
  readonly defaultGreeter: string;
  readonly casProjectionBytes: number;
}

export interface GreeterEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly mode: string;
  readonly entrypoint?: string;
}

export interface DesktopManifest {
  readonly schema: 'awesome-os-desktop-manifest-v1';
  readonly abiMagic: '0x33564742';
  readonly casLayout: 'v11';
  readonly defaultDesktop: string;
  readonly defaultGreeter: string;
  readonly desktops: readonly DesktopEntry[];
  readonly greeters: readonly GreeterEntry[];
}

export interface LaunchPlan {
  readonly desktop: DesktopEntry;
  readonly greeter: GreeterEntry;
  readonly command: string;
  readonly abiMagic: string;
  readonly casLayout: string;
}

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST_PATH = resolve(PACKAGE_DIR, 'desktop-manifest.json');
export const DEFAULT_GREETER_HTML_PATH = resolve(PACKAGE_DIR, 'greeter', 'index.html');

export function loadDesktopManifest(manifestPath: string = DEFAULT_MANIFEST_PATH): DesktopManifest {
  const raw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as DesktopManifest;

  if (parsed.schema !== 'awesome-os-desktop-manifest-v1') {
    throw new Error(`Unsupported desktop manifest schema: ${String(parsed.schema)}`);
  }
  if (parsed.abiMagic !== '0x33564742') {
    throw new Error(`Unsupported B8G ABI magic: ${String(parsed.abiMagic)}`);
  }
  if (parsed.casLayout !== 'v11') {
    throw new Error(`Unsupported CAS layout: ${String(parsed.casLayout)}`);
  }

  return parsed;
}

export function resolveDesktop(
  desktopId: string,
  manifest: DesktopManifest = loadDesktopManifest(),
): DesktopEntry {
  const desktop = manifest.desktops.find((entry) => entry.id === desktopId);
  if (!desktop) {
    const valid = manifest.desktops.map((entry) => entry.id).join(', ');
    throw new Error(`Unknown desktop "${desktopId}". Available desktops: ${valid}`);
  }
  return desktop;
}

export function resolveGreeter(
  greeterId: string,
  manifest: DesktopManifest = loadDesktopManifest(),
): GreeterEntry {
  const greeter = manifest.greeters.find((entry) => entry.id === greeterId);
  if (!greeter) {
    const valid = manifest.greeters.map((entry) => entry.id).join(', ');
    throw new Error(`Unknown greeter "${greeterId}". Available greeters: ${valid}`);
  }
  return greeter;
}

export function buildLaunchCommand(
  desktopId: string,
  greeterId?: string,
  manifest: DesktopManifest = loadDesktopManifest(),
): string {
  const desktop = resolveDesktop(desktopId, manifest);
  const effectiveGreeterId = greeterId ?? desktop.defaultGreeter ?? manifest.defaultGreeter;
  const greeter = resolveGreeter(effectiveGreeterId, manifest);
  return `holo-project "${desktop.projectUri}" --greeter=${greeter.id}`;
}

export function createLaunchPlan(
  desktopId: string,
  greeterId?: string,
  manifest: DesktopManifest = loadDesktopManifest(),
): LaunchPlan {
  const desktop = resolveDesktop(desktopId, manifest);
  const effectiveGreeterId = greeterId ?? desktop.defaultGreeter ?? manifest.defaultGreeter;
  const greeter = resolveGreeter(effectiveGreeterId, manifest);
  return {
    desktop,
    greeter,
    command: `holo-project "${desktop.projectUri}" --greeter=${greeter.id}`,
    abiMagic: manifest.abiMagic,
    casLayout: manifest.casLayout,
  };
}
