/** @jsxImportSource react */

'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';

import cardDissolve from '../../assets/fx/card-dissolve-sheet.webp';
import muteBlot from '../../assets/fx/mute-blot-sheet.webp';
import pauseCracks from '../../assets/fx/pause-cracks-sheet.webp';
import pausedSmoke from '../../assets/fx/paused-smoke-sheet.webp';
import playShockwave from '../../assets/fx/play-shockwave-sheet.webp';
import scrubSpatter from '../../assets/fx/scrub-spatter-sheet.webp';
import seekComet from '../../assets/fx/seek-comet-sheet.webp';
import slotPop from '../../assets/fx/slot-pop-sheet.webp';
import volumeRipples from '../../assets/fx/volume-ripples-sheet.webp';
import wheelBloom from '../../assets/fx/wheel-bloom-sheet.webp';

/**
 * The ink effects: animated sprite strips made with GPT Image 2.6 Sunburst GIF in Melius, keyed to transparent WebP.
 * Each strip is a row of frames played with a CSS `steps()` animation.
 */
export const FX = {
  'play-shockwave': { src: playShockwave, frames: 12, ms: 60, aspect: 1 },
  'pause-cracks': { src: pauseCracks, frames: 12, ms: 70, aspect: 1 },
  'seek-comet': { src: seekComet, frames: 12, ms: 50, aspect: 1 },
  'slot-pop': { src: slotPop, frames: 8, ms: 50, aspect: 1 },
  'scrub-spatter': { src: scrubSpatter, frames: 8, ms: 60, aspect: 1 },
  'volume-ripples': { src: volumeRipples, frames: 10, ms: 80, aspect: 1 },
  'mute-blot': { src: muteBlot, frames: 8, ms: 60, aspect: 1 },
  'wheel-bloom': { src: wheelBloom, frames: 12, ms: 60, aspect: 1 },
  'card-dissolve': { src: cardDissolve, frames: 12, ms: 70, aspect: 624 / 416 },
  'paused-smoke': { src: pausedSmoke, frames: 16, ms: 120, aspect: 1 },
} as const;

export type FxName = keyof typeof FX;

export interface Burst {
  id: number;
  name: FxName;
  x: number;
  y: number;
  /** Width in player pixels. */
  size: number;
  /** Drawn under the wheel instead of over it. */
  behind?: boolean;
  /** Turn the sprite, in degrees (a comet flying the other way, say). */
  rotate?: number;
  flip?: boolean;
}

export type BurstOptions = Omit<Burst, 'id' | 'name' | 'x' | 'y' | 'size'>;

/** One-shot bursts, kept until their animation ends. */
export function useBursts(enabled: boolean) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const next = useRef(1);
  const burst = useCallback(
    (name: FxName, x: number, y: number, size: number, opts: BurstOptions = {}) => {
      if (!enabled) return;
      const id = next.current++;
      setBursts((list) => [...list.slice(-11), { id, name, x, y, size, ...opts }]);
    },
    [enabled],
  );
  const done = useCallback((id: number) => setBursts((list) => list.filter((b) => b.id !== id)), []);
  return { bursts, burst, done };
}

export function spriteStyle(name: FxName, x: number, y: number, size: number, loop: boolean, extra?: CSSProperties): CSSProperties {
  const fx = FX[name];
  return {
    left: x,
    top: y,
    width: size,
    height: size * fx.aspect,
    backgroundImage: `url(${fx.src})`,
    backgroundSize: `${fx.frames * 100}% 100%`,
    animation: `ink-fx-play ${fx.frames * fx.ms}ms steps(${fx.frames}, jump-none) ${loop ? 'infinite' : '1 forwards'}`,
    ...extra,
  };
}

function transformFor(b: { rotate?: number | undefined; flip?: boolean | undefined }) {
  return `translate(-50%, -50%)${b.rotate ? ` rotate(${b.rotate}deg)` : ''}${b.flip ? ' scaleX(-1)' : ''}`;
}

export function FxBursts({ bursts, behind, onDone }: { bursts: Burst[]; behind: boolean; onDone: (id: number) => void }) {
  return (
    <>
      {bursts
        .filter((b) => !!b.behind === behind)
        .map((b) => (
          <span
            key={b.id}
            className={'ink-fx'}
            aria-hidden="true"
            data-fx={b.name}
            style={spriteStyle(b.name, b.x, b.y, b.size, false, { transform: transformFor(b) })}
            onAnimationEnd={() => onDone(b.id)}
          />
        ))}
    </>
  );
}

/** A looping effect that stays while `on`, fading in and out. */
export function FxLoop({ name, on, x, y, size, className }: { name: FxName; on: boolean; x: number; y: number; size: number; className?: string }) {
  return (
    <span
      className={`ink-fx ink-fx-loop${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      data-on={on ? '' : undefined}
      style={spriteStyle(name, x, y, size, true, { transform: 'translate(-50%, -50%)', animationPlayState: on ? 'running' : 'paused' })}
    />
  );
}
