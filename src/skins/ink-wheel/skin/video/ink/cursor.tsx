/** @jsxImportSource react */

'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/*
 * The skin's pointer. The pointer itself is the browser's own cursor, set to small ink drawings, so it never lags
 * behind the mouse. Which drawing shows is pure CSS (ink.css, "cursor"): an ink drop anywhere, a drop in a seal ring
 * over buttons and cards, a drop with turn arrows over the wheel's ring, a tightened drop while the ring is turned,
 * and corner marks in the open space around the chapter cards. Two small extras are drawn by this component: an ink
 * ripple where you click, and arrows that spin around the pointer while you turn the ring.
 */

const PAPER = '#EDE8DF';
const INK = '#0B0B0C';
const RED = '#D9472B';

/** A rough ink drop centred on (c, c), with two satellite spots and a vermillion core. */
function drop(c: number, scale = 1, core = 2.6) {
  return (
    `<g transform='translate(${c} ${c}) scale(${scale})'>` +
    `<path d='M0-8.5c2.6-.3 4.1 1.3 5.7 2.2 1.9 1 3.4 2.9 3.1 5.6-.2 2.2.4 4.3-1.3 6.1-1.7 1.9-3.9 3-6.6 3.1-2.6.1-4.7-.8-6.4-2.5-1.6-1.6-2.9-3.6-2.6-6.2.3-2.5 1.1-4.6 3-6.2 1.5-1.2 3.1-2 5.1-2.1z' fill='${INK}' stroke='${PAPER}' stroke-width='1.8'/>` +
    `<circle cx='9.5' cy='-7.5' r='1.6' fill='${INK}' stroke='${PAPER}' stroke-width='.9'/>` +
    `<circle cx='-9' cy='9' r='1.1' fill='${INK}' stroke='${PAPER}' stroke-width='.8'/>` +
    `</g>` +
    `<circle cx='${c}' cy='${c}' r='${core}' fill='${RED}'/>`
  );
}

/** Draws the same path twice, dark and wide under paper and thin, so it reads on light and dark frames alike. */
function inked(d: string, width = 2.4) {
  return (
    `<path d='${d}' fill='none' stroke='${INK}' stroke-width='${width + 2.4}' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<path d='${d}' fill='none' stroke='${PAPER}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'/>`
  );
}

function cursorUrl(size: number, body: string, fallback: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`;
  const hot = size / 2;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hot} ${hot}, ${fallback}`;
}

const ARROWS =
  'M6.5 15 A14.5 14.5 0 0 1 25 6.4 M21.6 2.8 L26 6.6 L21.2 9.8 M33.5 25 A14.5 14.5 0 0 1 15 33.6 M18.4 37.2 L14 33.4 L18.8 30.2';

/** The pointer drawings, as CSS `cursor` values, one per custom property. */
export const INK_CURSORS = {
  '--ink-cursor': cursorUrl(32, drop(16), 'default'),
  '--ink-cursor-press': cursorUrl(
    40,
    `<circle cx='20' cy='20' r='15' fill='none' stroke='${INK}' stroke-width='4.6'/>` +
      `<circle cx='20' cy='20' r='15' fill='none' stroke='${RED}' stroke-width='2.4' stroke-dasharray='22 3 14 2 30 4'/>` +
      drop(20, 0.9, 3.4),
    'pointer',
  ),
  '--ink-cursor-turn': cursorUrl(40, inked(ARROWS) + drop(20, 0.85), 'grab'),
  '--ink-cursor-turning': cursorUrl(40, drop(20, 0.72, 2.2), 'grabbing'),
  '--ink-cursor-close': cursorUrl(
    40,
    inked('M8 8 L12.5 12.5 M32 8 L27.5 12.5 M8 32 L12.5 27.5 M32 32 L27.5 27.5', 2.2) + drop(20, 0.8, 1.6),
    'pointer',
  ),
} as const;

/** Only for a mouse or trackpad: touch screens have no pointer to replace. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const read = () => setFine(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return fine;
}

/**
 * Turns on the ink pointer for the stage, and draws its two extras: the click ripple, and the arrows that spin around
 * the pointer while the ring is being turned. Only the spinning arrows follow the mouse, and only during a turn.
 */
export function InkCursor({ stageRef, turning }: { stageRef: RefObject<HTMLElement | null>; turning: boolean }) {
  const fine = useFinePointer();
  const rippleRef = useRef<HTMLSpanElement>(null);
  const spinRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!fine || !stage) return;
    for (const [k, v] of Object.entries(INK_CURSORS)) stage.style.setProperty(k, v);
    stage.setAttribute('data-ink-cursor', '');

    let frame = 0;
    let x = 0;
    let y = 0;
    const local = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
    };
    const paintSpin = () => {
      frame = 0;
      const el = spinRef.current;
      if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      local(e);
      paintSpin();
      const rp = rippleRef.current;
      if (!rp) return;
      rp.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      rp.classList.remove('ink-cursor-ripple-go');
      void rp.offsetWidth;
      rp.classList.add('ink-cursor-ripple-go');
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !stage.querySelector('.ink-wheel[data-drag]')) return;
      local(e);
      if (!frame) frame = requestAnimationFrame(paintSpin);
    };

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeAttribute('data-ink-cursor');
      for (const k of Object.keys(INK_CURSORS)) stage.style.removeProperty(k);
    };
  }, [fine, stageRef]);

  if (!fine) return null;

  return (
    <>
      <span ref={rippleRef} className={'ink-cursor-ripple'} aria-hidden="true" />
      <span ref={spinRef} className={'ink-cursor-spin'} data-on={turning ? '' : undefined} aria-hidden="true">
        <svg viewBox="0 0 40 40" width="40" height="40" focusable="false">
          <path className={'ink-cursor-spin-under'} d={ARROWS} />
          <path className={'ink-cursor-spin-over'} d={ARROWS} />
        </svg>
      </span>
    </>
  );
}
