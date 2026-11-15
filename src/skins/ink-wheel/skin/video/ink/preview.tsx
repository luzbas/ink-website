/** @jsxImportSource react */

'use client';

import { Thumbnail } from '@videojs/react';

import { chapterAt, formatTime, type ChapterCue } from './chapters';
import type { WheelPose } from './layout';
import { BOX, RING_R, roman, toStage } from './wheel';

/** The card's size in player pixels: a 200 × 113 frame (16:9, pinned in ink.css) over one line of text. */
const CARD_W = 216;
const CARD_H = 113 + 12 + 30;
const GAP = 18;
const EDGE = 8;

/**
 * Where the card goes: just outside the ring, in line with the seal knob, so it rides along as you turn. When that
 * would leave the player (the resting wheel sits in a corner), it moves to the side of the wheel that faces the middle
 * of the player instead.
 */
export function previewPlacement(pose: WheelPose, deg: number, stage: { w: number; h: number }) {
  const a = (deg * Math.PI) / 180;
  const knob = toStage(pose, { x: BOX / 2 + RING_R * Math.sin(a), y: BOX / 2 - RING_R * Math.cos(a) });
  const reach = Math.hypot(CARD_W, CARD_H) / 2 + GAP;
  const fits = (x: number, y: number) =>
    x - CARD_W / 2 >= EDGE && x + CARD_W / 2 <= stage.w - EDGE && y - CARD_H / 2 >= EDGE && y + CARD_H / 2 <= stage.h - EDGE;

  let x = knob.x + Math.sin(a) * reach;
  let y = knob.y - Math.cos(a) * reach;
  const dx = stage.w / 2 - pose.cx;
  const dy = stage.h / 2 - pose.cy;
  const len = Math.hypot(dx, dy);
  // A wheel in the middle has no "side facing the middle": there the card just keeps to the player's edges.
  if (!fits(x, y) && len > 40) {
    const out = (pose.size / 2) * 0.96 + reach;
    x = pose.cx + (dx / len) * out;
    y = pose.cy + (dy / len) * out;
  }
  x = Math.min(stage.w - EDGE - CARD_W / 2, Math.max(EDGE + CARD_W / 2, x));
  y = Math.min(stage.h - EDGE - CARD_H / 2, Math.max(EDGE + CARD_H / 2, y));
  return { x, y };
}

/**
 * The frame you are turning to, on a paper card beside the ring while it is turned: the storyboard frame for that
 * moment (when the video has one), the chapter's numeral and name, and the time.
 */
export function ScrubPreview({ time, cues, x, y }: { time: number; cues: readonly ChapterCue[]; x: number; y: number }) {
  const i = chapterAt(cues, time);
  const cue = i >= 0 ? cues[i] : undefined;
  return (
    <div className={'ink-preview'} aria-hidden="true" style={{ left: x - CARD_W / 2, top: y - CARD_H / 2, width: CARD_W }}>
      <Thumbnail.Root className={'ink-preview-thumb'} time={time}>
        <Thumbnail.Image className={'ink-preview-image'} alt="" draggable={false} />
      </Thumbnail.Root>
      <span className={'ink-preview-meta'}>
        {cue ? <span className={'ink-preview-roman'}>{roman(i)}</span> : null}
        <span className={'ink-preview-name'}>{cue?.text ?? 'Timeline'}</span>
        <span className={'ink-preview-time'}>{formatTime(time)}</span>
      </span>
    </div>
  );
}
