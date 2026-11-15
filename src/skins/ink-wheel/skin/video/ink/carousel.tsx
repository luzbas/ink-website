/** @jsxImportSource react */

'use client';

import { Thumbnail } from '@videojs/react';
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';

import { formatTime, type ChapterCue } from './chapters';
import { ChevronIcon, PlayGlyph } from './icons';
import type { Rect } from './layout';
import { roman } from './wheel';

/** Cards are drawn at 188 × 268 and scaled to the room there is. */
export const CARD_W = 188;
export const CARD_H = 268;
const STEP_DEG = 32;
const RADIUS = 520;
/** A swipe this many (scaled) pixels long turns the carousel one card. */
const SWIPE = 70;

export interface ChapterCarouselProps {
  area: Rect;
  cues: readonly ChapterCue[];
  /** The chapter the playhead is in. */
  playing: number;
  /** Chapters actually watched (remembered between visits). */
  seen: ReadonlySet<number>;
  /** The card at the front. */
  card: number;
  duration: number;
  small: boolean;
  onCard: (index: number) => void;
  onPlay: (index: number) => void;
  onBack: () => void;
}

export function cardScale(area: Rect, small: boolean) {
  return Math.max(0.42, Math.min(area.w / (small ? 560 : 700), area.h / (small ? 470 : 560), 1.15));
}

/**
 * The chapters as paper cards on a carousel over an ink pool. Turn it with the arrows, a swipe or the arrow keys; the
 * front card plays. Each card's window shows a frame from the chapter (from the storyboard, when the video has one).
 */
export function ChapterCarousel({ area, cues, playing, seen: seenSet, card, duration, small, onCard, onPlay, onBack }: ChapterCarouselProps) {
  const k = cardScale(area, small);
  const centerX = area.x + area.w / 2;
  const centerY = area.y + area.h * (small ? 0.47 : 0.47);
  const front = cues[card];

  // Swipe to turn.
  const stageRef = useRef<HTMLDivElement>(null);
  const live = useRef({ card, n: cues.length, onCard, k });
  useLayoutEffect(() => {
    live.current = { card, n: cues.length, onCard, k };
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let g: { x: number; start: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      g = { x: e.clientX, start: live.current.card, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!g) return;
      const dx = e.clientX - g.x;
      if (Math.abs(dx) > 8 && !g.moved) {
        g.moved = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (!g.moved) return;
      const { n, onCard: set, k: kk } = live.current;
      const to = Math.min(n - 1, Math.max(0, g.start - Math.round(dx / (SWIPE * kk))));
      if (to !== live.current.card) set(to);
    };
    const up = (e: PointerEvent) => {
      if (g?.moved) {
        // Swallow the click that ends a swipe.
        const stop = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 0);
      }
      g = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);

  const headTop = area.y + Math.max(10, area.h * 0.06);
  const controlsTop = centerY + (CARD_H / 2) * k + 22 * k + 6;

  return (
    <div className={'ink-cards'} role="dialog" aria-modal="false" aria-label="Chapters" data-small={small ? '' : undefined}>
      <div className={'ink-cards-head'} style={{ top: headTop }}>
        <h2 className={'ink-cards-title'}>Choose a chapter</h2>
        {!small ? <p className={'ink-cards-hint'}>Turn the carousel · the front card plays</p> : null}
      </div>

      <button type="button" className={'ink-btn ink-cards-back'} style={{ top: headTop - 2 }} onClick={onBack}>
        <ChevronIcon dir="left" />
        <span>{small ? 'Wheel' : 'Back to wheel'}</span>
        {!small ? <kbd>Esc</kbd> : null}
      </button>

      <span
        className={'ink-cards-pool'}
        aria-hidden="true"
        style={{ left: centerX, top: centerY + (CARD_H / 2) * k - 10 * k, width: 700 * k, height: 150 * k }}
      />

      {/* A click on the open space around the cards (not on a card or a button) goes back to the wheel. A swipe's
          closing click never gets here: the swipe handler swallows it. */}
      <div
        ref={stageRef}
        className={'ink-cards-stage'}
        style={{ perspective: `${1300 * k}px`, perspectiveOrigin: `${centerX}px ${centerY}px` }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('.ink-card')) onBack();
        }}
      >
        <div className={'ink-cards-pivot'} style={{ left: centerX, top: centerY, transform: `translateZ(${-RADIUS * k}px)` }}>
          {cues.map((cue, i) => {
            const d = i - card;
            const ad = Math.abs(d);
            if (ad > 4) return null;
            const end = Math.min(cue.endTime, duration || cue.endTime);
            const seen = seenSet.has(i) && i !== playing;
            const now = i === playing;
            const style: CSSProperties = {
              left: -CARD_W / 2,
              top: -CARD_H / 2,
              width: CARD_W,
              height: CARD_H,
              zIndex: 10 - ad,
              opacity: Math.max(0.15, 1 - ad * 0.3),
              transform: `rotateY(${d * STEP_DEG}deg) translateZ(${RADIUS * k}px)${d === 0 ? ` translateY(${-14 * k}px)` : ''} scale(${k})`,
            };
            return (
              <button
                key={`${i}-${cue.startTime}`}
                type="button"
                className={'ink-card'}
                data-front={d === 0 ? '' : undefined}
                data-state={now ? 'now' : seen ? 'seen' : 'ahead'}
                tabIndex={d === 0 ? 0 : -1}
                aria-label={`${d === 0 ? 'Play ' : ''}chapter ${i + 1} of ${cues.length}: ${cue.text}, ${formatTime(cue.startTime)} to ${formatTime(end)}${now ? ', playing now' : seen ? ', seen' : ''}`}
                style={style}
                onClick={() => (d === 0 ? onPlay(i) : onCard(i))}
              >
                <span className={'ink-card-face ink-card-front'}>
                  <span className={'ink-card-top'}>
                    <span className={'ink-card-roman'}>{roman(i)}</span>
                    <span className={'ink-card-range'}>
                      {formatTime(cue.startTime)} – {formatTime(end)}
                    </span>
                  </span>
                  <Thumbnail.Root className={'ink-card-thumb'} time={Math.min(end - 0.5, cue.startTime + Math.max(1, (end - cue.startTime) * 0.4))}>
                    <Thumbnail.Image className={'ink-card-thumb-image'} loading="lazy" alt="" draggable={false} />
                  </Thumbnail.Root>
                  <span className={'ink-card-name'}>{cue.text}</span>
                  <span className={'ink-card-foot'}>
                    <span className={'ink-card-len'}>{Math.max(1, Math.round(end - cue.startTime))} s</span>
                  </span>
                  {now || seen ? <span className={'ink-card-stamp'} data-stamp={now ? 'now' : 'seen'} aria-hidden="true" /> : null}
                </span>
                <span className={'ink-card-face ink-card-back'} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className={'ink-cards-controls'} style={{ top: Math.min(controlsTop, area.y + area.h - 56) }}>
        <button type="button" className={'ink-btn ink-btn-round'} aria-label="Previous chapter" disabled={card <= 0} onClick={() => onCard(card - 1)}>
          <ChevronIcon dir="left" />
        </button>
        <button type="button" className={'ink-btn ink-btn-main'} disabled={!front} onClick={() => onPlay(card)}>
          <PlayGlyph />
          <span>Play {front?.text ?? ''}</span>
        </button>
        <button
          type="button"
          className={'ink-btn ink-btn-round'}
          aria-label="Next chapter"
          disabled={card >= cues.length - 1}
          onClick={() => onCard(card + 1)}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
    </div>
  );
}
