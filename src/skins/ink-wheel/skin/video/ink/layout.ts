/** The video's shape, read from its metadata. */
export type Orientation = 'landscape' | 'portrait';

/**
 * - `overlay`: a wide video fills the player; a medium wheel rests bottom-right while it plays and the full wheel
 *   comes to the centre on pause (desktop, phones held sideways, fullscreen on a wide screen).
 * - `stack`: a wide video on a narrow screen; the video sits on top, a title strip below it, and the full wheel under that.
 * - `side`: a tall video on a wide screen; the video stands in the middle over a blurred copy of itself, the chapter
 *   info is on the left and the full wheel on the right.
 * - `tall`: a tall video on a narrow screen fills the player, like `overlay`.
 */
export type LayoutKind = 'overlay' | 'stack' | 'side' | 'tall';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the wheel's centre is and how wide it is drawn, in player pixels. */
export interface WheelPose {
  cx: number;
  cy: number;
  size: number;
}

export interface Layout {
  kind: LayoutKind;
  width: number;
  height: number;
  video: Rect;
  /** The open wheel. */
  full: WheelPose;
  /** The resting wheel while the video plays, or null where the full wheel always shows. */
  compact: WheelPose | null;
  /** The wheel while the chapter cards are up: small, sunk into the bottom edge. */
  dock: WheelPose;
  /** Room for the chapter carousel. */
  cards: Rect;
  /** The left info panel (`side`) or the title strip (`stack`). */
  info: Rect | null;
  /** True on small players: the chrome drops its smaller print. */
  small: boolean;
}

/** Narrower than this and a wide video stacks above the wheel. */
export const WIDE_MIN = 640;
const STRIP = 58;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Works out the layout for a player `width` wide. `height` is only given in fullscreen, where the screen sets it;
 * otherwise the layout picks the height it needs.
 */
export function computeLayout(width: number, height: number | null, orientation: Orientation, viewportH: number): Layout {
  const W = Math.max(1, width);
  const wide = height != null ? W >= height : W >= WIDE_MIN;
  const kind: LayoutKind = orientation === 'portrait' ? (wide ? 'side' : 'tall') : wide ? 'overlay' : 'stack';
  const m = clamp(W * 0.014, 10, 22);

  if (kind === 'overlay') {
    const H = height ?? Math.round((W * 9) / 16);
    const F = Math.min(H * 0.88, W * 0.62, 760);
    const C = clamp(Math.max(F * 0.5, Math.min(250, H * 0.66)), 0, H - 2 * m);
    return {
      kind,
      width: W,
      height: H,
      video: { x: 0, y: 0, w: W, h: H },
      full: { cx: W / 2, cy: H / 2, size: F },
      compact: { cx: W - m - C / 2, cy: H - m - C / 2, size: C },
      dock: { cx: W / 2, cy: H + F * 0.02, size: F * 0.42 },
      cards: { x: 0, y: 0, w: W, h: H },
      info: null,
      small: W < 900,
    };
  }

  if (kind === 'tall') {
    const H = height ?? Math.round(Math.min((W * 16) / 9, Math.max(560, viewportH * 0.92)));
    const F = Math.min(W * 0.94, H * 0.62);
    const C = clamp(F * 0.56, 200, W * 0.62);
    return {
      kind,
      width: W,
      height: H,
      video: { x: 0, y: 0, w: W, h: H },
      full: { cx: W / 2, cy: H * 0.56, size: F },
      compact: { cx: W - m - C / 2, cy: H - m - C / 2, size: C },
      dock: { cx: W / 2, cy: H + F * 0.02, size: F * 0.48 },
      cards: { x: 0, y: H * 0.06, w: W, h: H * 0.8 },
      info: null,
      small: true,
    };
  }

  if (kind === 'side') {
    const H = height ?? Math.round((W * 9) / 16);
    const vw = Math.min((H * 9) / 16, W * 0.4);
    const vx = (W - vw) / 2;
    const sideW = vx;
    const F = Math.max(160, Math.min(H * 0.88, sideW - 2 * m));
    return {
      kind,
      width: W,
      height: H,
      video: { x: vx, y: 0, w: vw, h: H },
      full: { cx: vx + vw + sideW / 2, cy: H / 2, size: F },
      compact: null,
      dock: { cx: W / 2, cy: H + F * 0.04, size: F * 0.55 },
      cards: { x: 0, y: 0, w: W, h: H },
      info: { x: m * 1.5, y: m * 1.5, w: sideW - 3 * m, h: H - 3 * m },
      small: W < 900,
    };
  }

  // stack
  const vh = Math.round((W * 9) / 16);
  const F = Math.min(W - 2 * m, 480);
  const needed = vh + STRIP + F + 2 * m;
  const H = height ?? needed;
  const top = height != null ? Math.max(0, (H - needed) / 2) : 0;
  const wheelTop = top + vh + STRIP + m;
  return {
    kind,
    width: W,
    height: H,
    video: { x: 0, y: top, w: W, h: vh },
    full: { cx: W / 2, cy: wheelTop + F / 2, size: F },
    compact: null,
    dock: { cx: W / 2, cy: H + F * 0.06, size: F * 0.5 },
    cards: { x: 0, y: top + vh, w: W, h: H - top - vh },
    info: { x: 0, y: top + vh, w: W, h: STRIP },
    small: true,
  };
}
