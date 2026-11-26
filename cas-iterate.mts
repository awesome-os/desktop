/**
 * @file cas-iterate.mts
 * @description Bounded recursive CAS iteration (`z_{n+1} = F(z_n, c)`) with
 * fixed-point, cycle, and escape/divergence detection over `B8G_ABI_MAGIC_V3`.
 *
 * Moves beyond 1-step exact self-lookup (`Q(self) = self`) into deterministic,
 * memoized, strictly-terminating dynamical orbits anchored by `c`.
 *
 * Strictly `erasableSyntaxOnly: true`, zero external dependencies.
 */

export const B8G_ABI_MAGIC_V3 = 0x33564742;

export type CasOrbitStatus = 'fixed-point' | 'cycle' | 'escaped' | 'bounded';

export interface CasOrbitStep<TState> {
  readonly iter: number;
  readonly hash: string;
  readonly state: TState;
  readonly metric: number;
  readonly casHit: boolean;
}

export interface CasIterateOptions<TState> {
  readonly maxIter?: number;
  readonly escapeThreshold?: number;
  readonly metricOf?: (state: TState) => number;
  readonly isEscaped?: (state: TState, metric: number, iter: number) => boolean;
  readonly hashOf?: (state: TState) => string;
  readonly casStore?: Map<string, TState>;
}

export interface CasIterateResult<TState> {
  readonly status: CasOrbitStatus;
  readonly iter: number;
  readonly maxIter: number;
  readonly anchorC: string;
  readonly finalHash: string;
  readonly trajectoryHash: string;
  readonly casHits: number;
  readonly orbit: readonly CasOrbitStep<TState>[];
}

export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Deterministically maps a CAS digest/anchor string into a complex coordinate `c = (re, im)`
 * near the interesting Mandelbrot boundary.
 */
export function anchorHashToComplex(anchor: string): { readonly re: number; readonly im: number } {
  const h1 = parseInt(fnv1aHex(anchor + ':re'), 16) / 0xffffffff;
  const h2 = parseInt(fnv1aHex(anchor + ':im'), 16) / 0xffffffff;
  // Center around classic Mandelbrot seahorse / period-2 bulb boundary
  return {
    re: -0.78 + (h1 - 0.5) * 0.42,
    im: 0.14 + (h2 - 0.5) * 0.42,
  };
}

/**
 * Bounded recursive CAS iteration:
 *   z_0 = initialState
 *   z_{n+1} = stepFn(z_n, anchorC, n)
 * Stops cleanly on fixed-point, cycle, escape threshold, or `maxIter` budget.
 */
export function casIterate<TState>(
  anchorC: string,
  initialState: TState,
  stepFn: (z: TState, c: string, iter: number) => TState,
  options: CasIterateOptions<TState> = {},
): CasIterateResult<TState> {
  const maxIter = Math.max(1, options.maxIter ?? 64);
  const escapeThreshold = options.escapeThreshold ?? 4.0;
  const metricOf = options.metricOf ?? (() => 0);
  const isEscaped = options.isEscaped ?? ((_s, metric) => metric > escapeThreshold);
  const hashOf = options.hashOf ?? ((s) => fnv1aHex(JSON.stringify(s)));
  const store = options.casStore ?? new Map<string, TState>();

  const orbit: CasOrbitStep<TState>[] = [];
  const seen = new Set<string>();
  let casHits = 0;

  let z = initialState;
  let currHash = hashOf(z);
  const trajParts: string[] = [anchorC, currHash];

  for (let iter = 0; iter < maxIter; iter++) {
    const metric = metricOf(z);
    const casHit = store.has(currHash);
    if (casHit) casHits += 1;
    else store.set(currHash, z);

    orbit.push({ iter, hash: currHash, state: z, metric, casHit });

    if (isEscaped(z, metric, iter)) {
      return {
        status: 'escaped',
        iter,
        maxIter,
        anchorC,
        finalHash: currHash,
        trajectoryHash: fnv1aHex(trajParts.join('>')),
        casHits,
        orbit,
      };
    }

    seen.add(currHash);
    const nextZ = stepFn(z, anchorC, iter);
    const nextHash = hashOf(nextZ);
    trajParts.push(nextHash);

    if (nextHash === currHash) {
      return {
        status: 'fixed-point',
        iter: iter + 1,
        maxIter,
        anchorC,
        finalHash: nextHash,
        trajectoryHash: fnv1aHex(trajParts.join('>')),
        casHits,
        orbit,
      };
    }

    if (seen.has(nextHash)) {
      return {
        status: 'cycle',
        iter: iter + 1,
        maxIter,
        anchorC,
        finalHash: nextHash,
        trajectoryHash: fnv1aHex(trajParts.join('>')),
        casHits,
        orbit,
      };
    }

    z = nextZ;
    currHash = nextHash;
  }

  return {
    status: 'bounded',
    iter: maxIter,
    maxIter,
    anchorC,
    finalHash: currHash,
    trajectoryHash: fnv1aHex(trajParts.join('>')),
    casHits,
    orbit,
  };
}
