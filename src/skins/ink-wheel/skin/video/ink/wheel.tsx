/** @jsxImportSource react */

'use client';

import { selectQuality } from '@videojs/core/dom';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { chapterAt, formatTime, type ChapterCue } from './chapters';
import { spriteStyle, type BurstOptions, type FxName } from './fx';
import { SlotIcon, type SlotId } from './icons';
import type { WheelPose } from './layout';
import { playSfx, useSfx } from './sfx';

/** The wheel is drawn in a 640 px box and scaled to its pose. */
export const BOX = 640;
const HALF = BOX / 2;
/** Timeline ring radius, the band the ring can be grabbed in, and the chapter numerals' radius. */
export const RING_R = 266;
const GRAB_IN = 232;
const LABEL_R = 303;
/** Slot ring radius and slot size. */
const SLOT_R = 196;
const SLOT = 64;
/** Gap between chapters on the ring, in degrees each side of a boundary. */
const GAP = 1.4;
/** The volume dial spans -150° to 150°. */
const VOL_FROM = -150;
const VOL_SPAN = 300;
const SEEK_STEP = 10;

export const SLOTS: { id: SlotId; label: string }[] = [
  { id: 'play', label: 'Pause' },
  { id: 'back', label: 'Rewind' },
  { id: 'fwd', label: 'Skip' },
  { id: 'vol', label: 'Volume' },
  { id: 'cc', label: 'Captions' },
  { id: 'chap', label: 'Chapters' },
  { id: 'speed', label: 'Speed' },
  { id: 'quality', label: 'Quality' },
  { id: 'pip', label: 'Mini player' },
  { id: 'fs', label: 'Fullscreen' },
];
export const VOLUME_SLOT = SLOTS.findIndex((s) => s.id === 'vol');
export const SPEED_SLOT = SLOTS.findIndex((s) => s.id === 'speed');
export const QUALITY_SLOT = SLOTS.findIndex((s) => s.id === 'quality');

/** Speeds for the speed dial when the player does not list its own. */
const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** Degrees of empty ring between two speed steps (each side). */
const STEP_GAP = 1.8;

export type RingDrag = 'time' | 'vol' | 'speed' | 'quality';

/** A video rendition as the player lists it. */
interface Rendition {
  id: string;
  width?: number | undefined;
  height?: number | undefined;
  bitrate?: number | undefined;
  selected: boolean;
}

interface QualityOption {
  id: string;
  label: string;
}

const STANDARD_SIZES = [4320, 2160, 1440, 1080, 720, 480, 360, 240];

/** A rendition's size as people name it (1080 for 1920×1080, and for a 1920×800 widescreen cut too). */
function renditionSize({ width, height }: Rendition) {
  if (width && height) {
    if (width > height && width * 9 > height * 16) {
      const wide = Math.round((width * 9) / 16);
      return STANDARD_SIZES.includes(wide) ? wide : height;
    }
    return Math.min(width, height);
  }
  return height ?? width;
}

function formatBitrate(b: number) {
  return b >= 1e6 ? `${Math.round(b / 1e5) / 10}M` : `${Math.round(b / 1e3)}k`;
}

/** The quality dial's steps: Auto first, then each rendition from the smallest up. */
function qualityOptions(list: readonly Rendition[]): QualityOption[] {
  const sorted = [...list].sort((a, b) => (renditionSize(a) ?? 0) - (renditionSize(b) ?? 0) || (a.bitrate ?? 0) - (b.bitrate ?? 0));
  const labels = sorted.map((r) => {
    const size = renditionSize(r);
    return size ? `${size}p` : r.bitrate ? formatBitrate(r.bitrate) : 'Source';
  });
  return [
    { id: 'auto', label: 'Auto' },
    ...sorted.map((r, i) => {
      // Two renditions of the same size are told apart by their bitrate.
      const twin = labels.filter((l) => l === labels[i]).length > 1;
      return { id: r.id, label: twin && r.bitrate ? `${labels[i]} ${formatBitrate(r.bitrate)}` : labels[i]! };
    }),
  ];
}

/** Dial arcs given from -150° to 150°, as 0–360° arcs in order (one crossing 12 o'clock is split). */
function dialArcs(arcs: [number, number][]) {
  const out: [number, number][] = [];
  for (const [a, b] of arcs) {
    const a0 = (a + 360) % 360;
    const b0 = a0 + (b - a);
    if (b0 <= 360) out.push([a0, b0]);
    else out.push([a0, 360], [0, b0 - 360]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function nearestIndex(list: readonly number[], v: number) {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Math.abs(list[i]! - v) < Math.abs(list[best]! - v)) best = i;
  return best;
}

function rateText(r: number) {
  return `${Number(r.toFixed(2))}×`;
}

/** The keyboard shortcut shown in each slot's tooltip. */
const SLOT_KEYS: Record<SlotId, string> = {
  play: 'K',
  back: 'J',
  fwd: 'L',
  vol: 'M',
  cc: 'C',
  chap: '[ ]',
  speed: '< >',
  quality: '',
  pip: 'I',
  fs: 'F',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (i: number) => ROMAN[i] ?? String(i + 1);

function polar(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: HALF + r * Math.sin(a), y: HALF - r * Math.cos(a) };
}

export function slotPoint(i: number) {
  return polar((i * 360) / SLOTS.length, SLOT_R);
}

/** Converts a point in the wheel's 640 box to player pixels for a pose. */
export function toStage(pose: WheelPose, p: { x: number; y: number }) {
  const s = pose.size / BOX;
  return { x: pose.cx + (p.x - HALF) * s, y: pose.cy + (p.y - HALF) * s };
}

/** A conic mask that shows the given arcs (degrees clockwise from 12 o'clock) and hides the rest. */
function arcsMask(arcs: [number, number][]) {
  const stops: string[] = [];
  let at = 0;
  for (const [a0, a1] of arcs) {
    if (a1 - a0 <= 0.05) continue;
    if (a0 > at) stops.push(`transparent ${at}deg ${a0}deg`);
    stops.push(`#000 ${a0}deg ${a1}deg`);
    at = a1;
  }
  if (at < 360) stops.push(`transparent ${at}deg 360deg`);
  return `conic-gradient(${stops.join(', ')})`;
}

export type WheelMode = 'full' | 'compact' | 'dock';

export interface InkWheelProps {
  pose: WheelPose;
  mode: WheelMode;
  sel: number;
  cues: readonly ChapterCue[];
  reducedMotion: boolean;
  /** A touch screen: the hub's hints talk about taps and leave out keyboard shortcuts. */
  touch?: boolean;
  /** Chapters already watched: their numerals on the ring turn vermillion. */
  seen?: ReadonlySet<number> | undefined;
  onSelect: (index: number) => void;
  onOpenCards: () => void;
  onHover: (over: boolean) => void;
  onDragChange: (drag: RingDrag | null) => void;
  /** The time the ring is turned to while it is being turned (null when it is let go). */
  onScrub?: ((time: number | null) => void) | undefined;
  onBurst: (name: FxName, x: number, y: number, size: number, opts?: BurstOptions) => void;
}

/**
 * The control wheel: ten slots around an ink disc, a hub that says what the highlighted slot does, and a painted
 * timeline ring. Turn the ring to scrub from wherever the playhead is (one turn is the whole video); with Volume
 * highlighted the ring becomes a 300° volume dial.
 */
export function InkWheel({ pose, mode, sel, cues, reducedMotion, touch = false, seen, onSelect, onOpenCards, onHover, onDragChange, onScrub, onBurst }: InkWheelProps) {
  useSfx();
  const store = usePlayer();
  const time = usePlayer((s) => s.currentTime) ?? 0;
  const duration = usePlayer((s) => s.duration) ?? 0;
  const paused = usePlayer((s) => s.paused) ?? true;
  const ended = usePlayer((s) => s.ended) ?? false;
  const volume = usePlayer((s) => s.volume) ?? 1;
  const muted = usePlayer((s) => s.muted) ?? false;
  const rate = usePlayer((s) => s.playbackRate) ?? 1;
  const rates = usePlayer((s) => s.playbackRates);
  const subtitlesShowing = usePlayer((s) => s.subtitlesShowing) ?? false;
  const textTracks = usePlayer((s) => s.textTrackList);
  const isFullscreen = usePlayer((s) => s.isFullscreen) ?? false;
  const fsAvailable = usePlayer((s) => s.fullscreenAvailability) === 'available';
  const isPip = usePlayer((s) => s.isPictureInPicture) ?? false;
  const pipAvailable = usePlayer((s) => s.pictureInPictureAvailability) === 'available';
  const buffered = usePlayer((s) => s.buffered);

  const hasCaptions = useMemo(() => (textTracks ?? []).some((t) => t.kind === 'captions' || t.kind === 'subtitles'), [textTracks]);
  const volMode = SLOTS[sel]?.id === 'vol';
  // With Speed highlighted the ring becomes a speed dial: one step per speed across the same 300° as the volume dial.
  const speedMode = SLOTS[sel]?.id === 'speed';
  const speeds = useMemo(() => (rates && rates.length >= 2 ? [...new Set(rates)].sort((a, b) => a - b) : DEFAULT_RATES), [rates]);
  const speedIdx = nearestIndex(speeds, rate);
  // With Quality highlighted it becomes a quality dial the same way: Auto, then each rendition from the smallest up.
  // Turning the ring previews a step and picks it when let go, so the stream does not switch at every notch.
  const qualMode = SLOTS[sel]?.id === 'quality';
  const quality = usePlayer(selectQuality);
  const renditions = quality?.videoRenditionList;
  const qualOptions = useMemo(() => qualityOptions(renditions ?? []), [renditions]);
  const qualAvailable = (renditions?.length ?? 0) > 1;
  const selectedId = renditions?.find((r) => r.selected)?.id;
  const qualIdx = selectedId == null ? 0 : Math.max(0, qualOptions.findIndex((o) => o.id === selectedId));
  // What Auto is playing right now, when Auto is picked.
  const activeId = quality?.activeVideoRendition?.id;
  const activeOpt = qualIdx === 0 ? qualOptions.find((o) => o.id === activeId) : undefined;
  const [qualPreview, setQualPreview] = useState<number | null>(null);
  const shownQualIdx = Math.min(qualOptions.length - 1, qualPreview ?? qualIdx);
  const pickQuality = (i: number) => {
    const o = qualOptions[i];
    if (o && quality) quality.selectVideoRendition(o.id);
  };
  const qualText = qualIdx === 0 ? 'Auto' : (qualOptions[qualIdx]?.label ?? 'Auto');
  const qualNow = activeOpt ? `Auto · now ${activeOpt.label}` : qualText;
  // Speed and quality are both stepped dials: the same 300° cut into one segment per step.
  const stepMode = speedMode || qualMode;
  const stepCount = qualMode ? qualOptions.length : speeds.length;
  const stepIdx = qualMode ? shownQualIdx : speedIdx;
  const stepSeg = VOL_SPAN / Math.max(1, stepCount);
  const level = muted ? 0 : volume;
  const pct = Math.round(level * 100);

  // Turning the ring: the time shown follows the hand, and the player seeks a few times a second.
  const [drag, setDrag] = useState<RingDrag | null>(null);
  const [scrubT, setScrubT] = useState(0);
  const t = drag === 'time' ? scrubT : time;
  const ci = Math.max(0, chapterAt(cues, t));
  const cue = cues[ci];

  const live = useRef({
    time,
    duration,
    volume: level,
    cues,
    volMode,
    speedMode,
    speeds,
    speedIdx,
    qualMode,
    qualIdx,
    qualCount: qualOptions.length,
    pickQuality,
    store,
    drag,
    mode,
  });
  const callbacks = useRef({ onDragChange, onSelect, onScrub });
  useLayoutEffect(() => {
    live.current = {
      time,
      duration,
      volume: level,
      cues,
      volMode,
      speedMode,
      speeds,
      speedIdx,
      qualMode,
      qualIdx,
      qualCount: qualOptions.length,
      pickQuality,
      store,
      drag,
      mode,
    };
    callbacks.current = { onDragChange, onSelect, onScrub };
  });

  const ringRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // The dials click as they turn: volume once per 5%, pitched up as it gets louder; speed once per step, pitched by
  // speed. Whatever turned them (ring, keys, number keys, chips) is heard the same way.
  const volStep = Math.round(level * 20);
  const lastVolStep = useRef(volStep);
  useEffect(() => {
    if (lastVolStep.current === volStep) return;
    lastVolStep.current = volStep;
    playSfx('click', { rate: 0.75 + level * 0.6, gap: 35 });
  }, [volStep, level]);
  const lastSpeed = useRef(speedIdx);
  useEffect(() => {
    if (lastSpeed.current === speedIdx) return;
    lastSpeed.current = speedIdx;
    playSfx('click', { rate: 0.8 + (speedIdx / Math.max(1, speeds.length - 1)) * 0.6, gain: 1.1, gap: 35 });
  }, [speedIdx, speeds.length]);
  const lastQual = useRef(shownQualIdx);
  useEffect(() => {
    if (lastQual.current === shownQualIdx) return;
    lastQual.current = shownQualIdx;
    playSfx('click', { rate: 0.8 + (shownQualIdx / Math.max(1, qualOptions.length - 1)) * 0.6, gain: 1.1, gap: 35 });
  }, [shownQualIdx, qualOptions.length]);

  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    let g: {
      last: number;
      turned: number;
      startT: number;
      startV: number;
      startIdx: number;
      idx: number;
      kind: RingDrag;
      lastSeek: number;
      t: number;
      ch: number;
    } | null = null;

    const read = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      return { deg: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, dist: Math.hypot(dx, dy) * (BOX / r.width) };
    };

    // The ring turns freely across chapter boundaries: no detents, so the knob never catches at a chapter's edge.
    // Crossing into another chapter still clicks (and buzzes on phones that can).
    const clamp = (to: number) => Math.min(Math.max(0, live.current.duration - 0.05), Math.max(0, to));

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const r = read(e);
      if (r.dist < GRAB_IN || r.dist > HALF + 4) return;
      const { time: t0, duration: d, volume: v0, volMode: vm, speedMode: sm, speedIdx: si, qualMode: qm, qualIdx: qi, qualCount: qn, cues: cs } = live.current;
      const kind: RingDrag = vm ? 'vol' : sm ? 'speed' : qm ? 'quality' : 'time';
      if (kind === 'time' && !(d > 0)) return;
      if (kind === 'quality' && qn < 2) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const i0 = kind === 'quality' ? qi : si;
      g = { last: r.deg, turned: 0, startT: t0, startV: v0, startIdx: i0, idx: i0, kind, lastSeek: 0, t: t0, ch: chapterAt(cs, t0) };
      setScrubT(t0);
      setDrag(g.kind);
      callbacks.current.onDragChange(g.kind);
      if (g.kind === 'time') callbacks.current.onScrub?.(t0);
    };

    const move = (e: PointerEvent) => {
      if (!g) return;
      const deg = read(e).deg;
      let delta = deg - g.last;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      g.turned += delta;
      g.last = deg;
      const { store: st, duration: d, cues: cs, speeds: sp, qualCount: qn } = live.current;
      if (g.kind === 'quality') {
        // The same steps for quality, shown as the ring turns and picked when it is let go.
        const next = Math.min(qn - 1, Math.max(0, g.startIdx + Math.round(g.turned / (VOL_SPAN / qn))));
        if (next !== g.idx) {
          g.idx = next;
          setQualPreview(next);
          try {
            navigator.vibrate?.(8);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (g.kind === 'speed') {
        // The ring clicks from speed to speed as it turns: one step per segment of the dial.
        const next = Math.min(sp.length - 1, Math.max(0, g.startIdx + Math.round(g.turned / (VOL_SPAN / sp.length))));
        if (next !== g.idx) {
          g.idx = next;
          st.setPlaybackRate(sp[next]!);
          try {
            navigator.vibrate?.(8);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (g.kind === 'vol') {
        const v = Math.min(1, Math.max(0, g.startV + g.turned / VOL_SPAN));
        st.setVolume(v);
        if (v > 0) st.setMuted(false);
        return;
      }
      const next = clamp(g.startT + (g.turned / 360) * d);
      g.t = next;
      setScrubT(next);
      callbacks.current.onScrub?.(next);
      const ch = chapterAt(cs, next);
      if (ch !== g.ch) {
        g.ch = ch;
        playSfx('click', { rate: 1.3, gain: 1.15, gap: 60 });
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
      }
      const now = performance.now();
      if (now - g.lastSeek > 90) {
        g.lastSeek = now;
        void st.seek(next);
      }
    };

    const up = (e: PointerEvent) => {
      if (!g) return;
      if (g.kind === 'time') {
        void live.current.store.seek(g.t);
        callbacks.current.onScrub?.(null);
      }
      if (g.kind === 'quality') {
        if (g.idx !== g.startIdx) live.current.pickQuality(g.idx);
        setQualPreview(null);
      }
      g = null;
      setDrag(null);
      callbacks.current.onDragChange(null);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    // Keys on the ring: arrows step 5 s (or 5% volume), Page keys jump a chapter, Home and End go to the ends. They
    // are kept from the player's own seek and volume hotkeys, which would double them.
    const key = (e: KeyboardEvent) => {
      const {
        store: st,
        time: tt,
        duration: d,
        volume: v,
        volMode: vm,
        speedMode: sm,
        speeds: sp,
        speedIdx: si,
        qualMode: qm,
        qualIdx: qi,
        qualCount: qn,
        pickQuality: pq,
        cues: cs,
      } = live.current;
      const up = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      const dn = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
      if (qm) {
        if (!up && !dn && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        e.stopPropagation();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? qn - 1 : Math.min(qn - 1, Math.max(0, qi + (up ? 1 : -1)));
        if (next !== qi) pq(next);
        return;
      }
      if (sm) {
        if (!up && !dn && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        e.stopPropagation();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? sp.length - 1 : Math.min(sp.length - 1, Math.max(0, si + (up ? 1 : -1)));
        st.setPlaybackRate(sp[next]!);
        return;
      }
      if (vm) {
        if (!up && !dn && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        e.stopPropagation();
        const nv = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : Math.min(1, Math.max(0, v + (up ? 0.05 : -0.05)));
        st.setVolume(nv);
        st.setMuted(nv === 0);
        return;
      }
      if (!(d > 0)) return;
      let to: number | null = null;
      if (up || dn) to = tt + (up ? 5 : -5);
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = d - 0.05;
      else if (e.key === 'PageUp' || e.key === 'PageDown') {
        const i = chapterAt(cs, tt);
        const j = e.key === 'PageUp' ? i + 1 : tt - (cs[i]?.startTime ?? 0) > 3 ? i : i - 1;
        to = j >= cs.length ? d - 0.05 : (cs[Math.max(0, j)]?.startTime ?? 0);
      }
      if (to == null) return;
      e.preventDefault();
      e.stopPropagation();
      void st.seek(Math.min(d - 0.05, Math.max(0, to)));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('keydown', key);
    };
  }, []);

  // Slots are one tab stop: the arrow keys move between them (roving focus), Enter or Space presses one. Their keys are
  // kept from the player's hotkeys, which would otherwise seek or pause as well.
  const slotsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = slotsRef.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!btn) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.stopPropagation();
        return;
      }
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      const home = e.key === 'Home' ? 0 : e.key === 'End' ? SLOTS.length - 1 : -1;
      if (!dir && home < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-slot]')];
      const n = buttons.length;
      const step = home >= 0 ? (home === 0 ? 1 : -1) : dir;
      let i = home >= 0 ? home : (buttons.indexOf(btn) + step + n) % n;
      for (let k = 0; k < n && buttons[i]?.disabled; k++) i = (i + step + n) % n;
      buttons[i]?.focus();
      playSfx('tick', { gap: 40 });
      callbacks.current.onSelect(i);
    };
    el.addEventListener('keydown', key);
    return () => el.removeEventListener('keydown', key);
  }, []);

  const s = pose.size / BOX;
  const fxAt = (i: number) => toStage(pose, slotPoint(i));

  const activate = (i: number) => {
    const id = SLOTS[i]!.id;
    const p = fxAt(i);
    const small = pose.size * 0.26;
    // Play and Chapters have their own sounds (the brush sweep or the bowl, the cards fanning out).
    if (id !== 'play' && id !== 'chap') playSfx('press');
    switch (id) {
      case 'play':
        if (paused || ended) void store.play();
        else store.pause();
        break;
      case 'back':
        void store.seek(Math.max(0, time - SEEK_STEP));
        onBurst('seek-comet', p.x, p.y, pose.size * 0.5, { flip: true });
        break;
      case 'fwd':
        if (duration > 0) void store.seek(Math.min(duration - 0.05, time + SEEK_STEP));
        onBurst('seek-comet', p.x, p.y, pose.size * 0.5);
        break;
      case 'vol':
        if (sel === i) {
          const mute = !muted;
          store.setMuted(mute);
          if (!mute && volume === 0) store.setVolume(0.5);
          onBurst(mute ? 'mute-blot' : 'volume-ripples', p.x, p.y, pose.size * (mute ? 0.34 : 0.5));
        } else onBurst('volume-ripples', pose.cx, pose.cy, pose.size * 0.95);
        break;
      case 'cc':
        store.toggleSubtitles();
        onBurst('slot-pop', p.x, p.y, small);
        break;
      case 'chap':
        onOpenCards();
        break;
      case 'speed':
      case 'quality':
        // First press turns the ring into the speed (or quality) dial; a second press puts the timeline back.
        if (sel === i) {
          onSelect(0);
          return;
        }
        onBurst('slot-pop', p.x, p.y, small);
        break;
      case 'pip':
        if (isPip) void store.exitPictureInPicture();
        else void store.requestPictureInPicture();
        onBurst('slot-pop', p.x, p.y, small);
        break;
      case 'fs':
        if (isFullscreen) void store.exitFullscreen();
        else void store.requestFullscreen();
        break;
    }
    onSelect(i);
  };

  const speedText = rateText(rate);
  const disabledFor = (id: SlotId) =>
    (id === 'cc' && !hasCaptions) || (id === 'chap' && !cues.length) || (id === 'quality' && !qualAvailable) ||
    (id === 'pip' && !pipAvailable && !isPip) ||
    (id === 'fs' && !fsAvailable && !isFullscreen);

  const labelFor = (id: SlotId) => {
    switch (id) {
      case 'play':
        return paused || ended ? 'Play' : 'Pause';
      case 'vol':
        return muted ? 'Muted' : 'Volume';
      case 'cc':
        return subtitlesShowing ? 'Captions on' : 'Captions off';
      case 'speed':
        return `Speed ${speedText}`;
      case 'quality':
        return `Quality ${qualText}`;
      case 'pip':
        return isPip ? 'Exit mini player' : 'Mini player';
      case 'fs':
        return isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
      default:
        return SLOTS.find((x) => x.id === id)!.label;
    }
  };

  const detailFor = (id: SlotId) => (touch ? touchDetailFor(id) : keyDetailFor(id));

  const touchDetailFor = (id: SlotId) => {
    switch (id) {
      case 'play':
        return paused || ended ? 'Tap to play' : 'Tap to pause';
      case 'back':
        return 'Back 10 seconds';
      case 'fwd':
        return 'Ahead 10 seconds';
      case 'vol':
        return muted ? 'Tap again to unmute' : `${pct}% · turn the ring · tap again to mute`;
      case 'cc':
        return hasCaptions ? (subtitlesShowing ? 'Showing' : 'Hidden') : 'No captions for this video';
      case 'chap':
        return cue ? `${roman(ci)} · ${cue.text}` : 'No chapters';
      case 'speed':
        return 'Turn the ring or tap a speed';
      case 'quality':
        return qualAvailable ? (activeOpt ? `Now ${activeOpt.label} · turn the ring or tap one` : 'Turn the ring or tap a quality') : 'One quality only';
      case 'pip':
        return 'Picture in picture';
      case 'fs':
        return isFullscreen ? 'Back to the page' : 'Fill the screen';
    }
  };

  const keyDetailFor = (id: SlotId) => {
    switch (id) {
      case 'play':
        return paused || ended ? 'Space or K to play' : 'Space or K to pause';
      case 'back':
        return 'Back 10 seconds · J';
      case 'fwd':
        return 'Ahead 10 seconds · L';
      case 'vol':
        return muted ? 'Click again to unmute' : `${pct}% · turn the ring · click again to mute`;
      case 'cc':
        return hasCaptions ? (subtitlesShowing ? 'Showing · C to hide' : 'Hidden · C to show') : 'No captions for this video';
      case 'chap':
        return cue ? `${roman(ci)} · ${cue.text}` : 'No chapters';
      case 'speed':
        return 'Turn the ring or click a speed · < >';
      case 'quality':
        return qualAvailable ? (activeOpt ? `Now ${activeOpt.label} · turn the ring or click one` : 'Turn the ring or click a quality') : 'One quality only';
      case 'pip':
        return 'Picture in picture · I';
      case 'fs':
        return 'F';
    }
  };

  const disabledTip = (id: SlotId) =>
    id === 'cc'
      ? 'No captions'
      : id === 'chap'
        ? 'No chapters'
        : id === 'quality'
          ? 'One quality only'
          : id === 'pip'
            ? 'Mini player unavailable'
            : 'Fullscreen unavailable';

  const badgeFor = (id: SlotId) => {
    switch (id) {
      case 'vol':
        return muted ? 'M' : String(pct);
      case 'cc':
        return hasCaptions ? (subtitlesShowing ? 'on' : 'off') : '';
      case 'chap':
        return cues.length ? `${ci + 1}/${cues.length}` : '';
      case 'speed':
        return speedText;
      case 'quality':
        return qualAvailable ? (qualIdx === 0 ? 'auto' : (qualOptions[qualIdx]?.label ?? '')) : '';
      default:
        return '';
    }
  };

  // The painted ring: which arcs exist (chapters split by gaps, or the volume arc), and how much of them is filled.
  const p = duration > 0 ? Math.min(1, Math.max(0, t / duration)) * 360 : 0;
  const segMask = useMemo(() => {
    if (volMode) return arcsMask([[0, 150], [210, 360]]);
    if (stepMode) {
      return arcsMask(
        dialArcs(
          Array.from({ length: stepCount }, (_, i) => [VOL_FROM + i * stepSeg + STEP_GAP, VOL_FROM + (i + 1) * stepSeg - STEP_GAP] as [number, number]),
        ),
      );
    }
    if (!(duration > 0) || cues.length < 2) return arcsMask([[GAP, 360 - GAP]]);
    return arcsMask(
      cues.map((c) => [(c.startTime / duration) * 360 + GAP, (Math.min(c.endTime, duration) / duration) * 360 - GAP] as [number, number]),
    );
  }, [volMode, stepMode, stepCount, stepSeg, cues, duration]);
  const dialFill = volMode ? level * VOL_SPAN : stepMode ? (stepIdx + 1) * stepSeg : 0;
  const fillMask =
    volMode || stepMode
      ? `conic-gradient(from ${360 + VOL_FROM}deg, #000 0deg ${dialFill}deg, transparent ${dialFill}deg)`
      : `conic-gradient(#000 0deg ${p}deg, transparent ${p}deg)`;
  // What has loaded: a fainter band on the ring between the track and the played part. Ranges a moment apart are
  // joined and the angles rounded, so the mask only changes when the band visibly grows.
  const bufferMask = useMemo(() => {
    if (volMode || stepMode || !(duration > 0) || !buffered?.length) return null;
    const arcs: [number, number][] = [];
    for (const [s0, e0] of buffered) {
      const a0 = Math.round((Math.max(0, s0) / duration) * 720) / 2;
      const a1 = Math.round((Math.min(duration, e0) / duration) * 720) / 2;
      if (a1 <= a0) continue;
      const last = arcs[arcs.length - 1];
      if (last && a0 - last[1] < 1) last[1] = Math.max(last[1], a1);
      else arcs.push([a0, a1]);
    }
    return arcs.length ? arcsMask(arcs) : null;
  }, [volMode, stepMode, duration, buffered]);
  const knobDeg = volMode ? VOL_FROM + level * VOL_SPAN : stepMode ? VOL_FROM + (stepIdx + 0.5) * stepSeg : p;
  const knob = polar(knobDeg, RING_R);

  const numerals = useMemo(() => {
    if (volMode) {
      return [0, 25, 50, 75, 100].map((v) => ({ key: `v${v}`, text: String(v), ...polar(VOL_FROM + (v / 100) * VOL_SPAN, LABEL_R) }));
    }
    if (stepMode || !(duration > 0) || cues.length > 12) return [];
    return cues.map((c, i) => ({ key: `c${i}`, text: roman(i), seen: !!seen?.has(i), ...polar((((c.startTime + Math.min(c.endTime, duration)) / 2) / duration) * 360, LABEL_R) }));
  }, [volMode, stepMode, cues, duration, seen]);

  const ticks = useMemo(() => {
    if (!volMode) return [];
    return Array.from({ length: 11 }, (_, i) => {
      const a = VOL_FROM + i * 30;
      const p0 = polar(a, RING_R - 26);
      const p1 = polar(a, RING_R - (i % 5 === 0 ? 34 : 30));
      return { key: i, x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y };
    });
  }, [volMode]);

  const sel0 = SLOTS[sel] ?? SLOTS[0]!;
  const ringLabel = volMode
    ? 'Volume dial: turn the ring, or use the arrow keys'
    : speedMode
      ? 'Speed dial: turn the ring, or use the arrow keys'
      : qualMode
        ? 'Quality dial: turn the ring, or use the arrow keys'
        : 'Timeline ring: turn it to scrub from the current time';
  const ringText = volMode
    ? muted
      ? 'Muted'
      : `${pct} percent`
    : speedMode
      ? `${Number(rate.toFixed(2))} times speed`
      : qualMode
        ? `Quality ${qualNow}`
        : `${formatTime(t)} of ${formatTime(duration)}${cue ? `, chapter ${roman(ci)}, ${cue.text}` : ''}`;

  const smallFx = (name: FxName, x: number, y: number, size: number, on: boolean) =>
    reducedMotion ? null : (
      <span
        className={'ink-fx ink-fx-loop'}
        aria-hidden="true"
        data-fx={name}
        data-on={on ? '' : undefined}
        style={spriteStyle(name, x, y, size, true, { transform: 'translate(-50%, -50%)', animationPlayState: on ? 'running' : 'paused' })}
      />
    );

  return (
    <div
      ref={wheelRef}
      className={'ink-wheel'}
      data-mode={mode}
      data-vol={volMode ? '' : undefined}
      data-speed={stepMode ? '' : undefined}
      data-quality={qualMode ? '' : undefined}
      data-drag={drag ?? undefined}
      // Hover is tracked on the whole wheel (ring, slots and hub together), so moving from the ring onto a slot is
      // not a leave. Only the circle and its buttons take the pointer; the box's corners let it through.
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(false)}
      style={
        {
          transform: `translate(${pose.cx - HALF}px, ${pose.cy - HALF}px) scale(${s})`,
          '--ink-wheel-scale': s,
        } as CSSProperties
      }
    >
      {smallFx('paused-smoke', HALF, HALF, BOX * 1.45, mode === 'full' && (paused || ended) && !drag)}
      <span className={'ink-wheel-disc'} aria-hidden="true" />

      <div className={'ink-ring ink-ring-track'} style={{ maskImage: segMask, WebkitMaskImage: segMask } as CSSProperties} />
      {bufferMask ? (
        <div
          className={'ink-ring ink-ring-buffer'}
          style={{ maskImage: `${segMask}, ${bufferMask}`, WebkitMaskImage: `${segMask}, ${bufferMask}` } as CSSProperties}
        />
      ) : null}
      <div
        className={'ink-ring ink-ring-fill'}
        style={{ maskImage: `${segMask}, ${fillMask}`, WebkitMaskImage: `${segMask}, ${fillMask}` } as CSSProperties}
      />

      <svg className={'ink-ring-marks'} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
        {ticks.map((k) => (
          <line key={k.key} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} />
        ))}
        {numerals.map((n) => (
          <text key={n.key} x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" data-seen={'seen' in n && n.seen ? '' : undefined}>
            {n.text}
          </text>
        ))}
        {volMode || stepMode ? (
          <text className={'ink-ring-caption'} {...polar(180, RING_R - 50)} textAnchor="middle" dominantBaseline="central">
            {volMode ? 'VOLUME' : speedMode ? 'SPEED' : 'QUALITY'}
          </text>
        ) : null}
      </svg>

      {smallFx('scrub-spatter', knob.x, knob.y, 150, drag === 'time')}
      {smallFx('volume-ripples', HALF, HALF, BOX * 0.9, drag === 'vol')}

      <div
        ref={ringRef}
        className={'ink-ring-grab'}
        role="slider"
        tabIndex={mode === 'dock' ? -1 : 0}
        aria-label={ringLabel}
        aria-valuemin={0}
        aria-valuemax={volMode ? 100 : stepMode ? stepCount - 1 : Math.max(0, Math.round(duration))}
        aria-valuenow={volMode ? pct : stepMode ? stepIdx : Math.floor(t)}
        aria-valuetext={ringText}
      />

      {/* The ring only turns in its outer band; inside it, between the slots and over the hub, the pointer is a plain
          one. This disc takes that space so the ring's turn pointer shows only where turning works. */}
      <span className={'ink-ring-still'} aria-hidden="true" style={{ left: HALF - GRAB_IN, top: HALF - GRAB_IN, width: GRAB_IN * 2, height: GRAB_IN * 2 }} />

      <span className={'ink-knob'} aria-hidden="true" style={{ left: knob.x, top: knob.y }} />

      {speedMode ? (
        <div className={'ink-speed-chips'}>
          {speeds.map((r, i) => {
            const c = polar(VOL_FROM + (i + 0.5) * stepSeg, LABEL_R + 4);
            return (
              <button
                key={r}
                type="button"
                className={'ink-speed-chip'}
                tabIndex={-1}
                aria-pressed={i === speedIdx}
                aria-label={`Speed ${Number(r.toFixed(2))} times`}
                style={{ left: c.x, top: c.y }}
                onClick={() => store.setPlaybackRate(r)}
              >
                {rateText(r)}
              </button>
            );
          })}
        </div>
      ) : null}

      {qualMode ? (
        <div className={'ink-speed-chips'} data-dial="quality">
          {qualOptions.map((o, i) => {
            const c = polar(VOL_FROM + (i + 0.5) * stepSeg, LABEL_R + 4);
            return (
              <button
                key={o.id}
                type="button"
                className={'ink-speed-chip'}
                tabIndex={-1}
                aria-pressed={i === shownQualIdx}
                // With Auto picked, the rendition it is playing carries a small seal.
                data-active={activeOpt?.id === o.id ? '' : undefined}
                aria-label={i === 0 ? 'Automatic quality' : `Quality ${o.label}`}
                style={{ left: c.x, top: c.y }}
                onClick={() => pickQuality(i)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div ref={slotsRef} className={'ink-slots'} role="toolbar" aria-label="Player controls" aria-orientation="horizontal">
        {SLOTS.map((slot, i) => {
          const pt = slotPoint(i);
          const badge = badgeFor(slot.id);
          const disabled = disabledFor(slot.id);
          const pressed =
            slot.id === 'cc' ? subtitlesShowing : slot.id === 'vol' ? muted : slot.id === 'pip' ? isPip : slot.id === 'fs' ? isFullscreen : undefined;
          return (
            <button
              key={slot.id}
              type="button"
              data-slot={slot.id}
              className={'ink-slot'}
              data-selected={i === sel ? '' : undefined}
              tabIndex={mode === 'dock' ? -1 : i === sel ? 0 : -1}
              disabled={disabled}
              aria-label={labelFor(slot.id)}
              aria-pressed={pressed}
              style={{ left: pt.x - SLOT / 2, top: pt.y - SLOT / 2, width: SLOT, height: SLOT }}
              onClick={() => activate(i)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && !disabled && mode !== 'dock' && playSfx('tick', { gap: 40 })}
            >
              <span className={'ink-slot-face'}>
                <SlotIcon id={slot.id} paused={paused || ended} muted={muted} />
              </span>
              {badge ? (
                <span className={'ink-slot-badge'} aria-hidden="true">
                  {badge}
                </span>
              ) : null}
              {/* The button's own label already names it for assistive tech; the tip is for the eye. */}
              <span className={'ink-slot-tip'} data-side={pt.y > HALF + 1 ? 'below' : 'above'} aria-hidden="true">
                <span>{disabled ? disabledTip(slot.id) : labelFor(slot.id)}</span>
                {!disabled && SLOT_KEYS[slot.id] ? <kbd>{SLOT_KEYS[slot.id]}</kbd> : null}
              </span>
            </button>
          );
        })}
      </div>

      {drag ? (
        <div className={'ink-hub ink-hub-paper'} aria-hidden="true">
          {drag === 'vol' ? (
            <>
              <span className={'ink-hub-big'}>{muted ? 'Muted' : `${pct}%`}</span>
              <span className={'ink-hub-title'}>Volume</span>
            </>
          ) : drag === 'speed' ? (
            <>
              <span className={'ink-hub-big'}>{rateText(rate)}</span>
              <span className={'ink-hub-title'}>Speed</span>
            </>
          ) : drag === 'quality' ? (
            <>
              <span className={'ink-hub-big'}>{qualOptions[shownQualIdx]?.label ?? 'Auto'}</span>
              <span className={'ink-hub-title'}>Quality</span>
            </>
          ) : (
            <>
              <span className={'ink-hub-big'}>{cue ? roman(ci) : '·'}</span>
              <span className={'ink-hub-title'}>{cue?.text ?? 'Timeline'}</span>
              <span className={'ink-hub-time'}>{formatTime(t)}</span>
            </>
          )}
        </div>
      ) : (
        <div className={'ink-hub ink-hub-ink'} aria-hidden="true">
          <span className={'ink-hub-meta'}>
            SLOT {String(sel + 1).padStart(2, '0')} / {String(SLOTS.length).padStart(2, '0')}
          </span>
          <span className={'ink-hub-label'}>{labelFor(sel0.id)}</span>
          <span className={'ink-hub-detail'}>{detailFor(sel0.id)}</span>
          <span className={'ink-hub-time'}>
            {formatTime(t)} / {formatTime(duration)}
          </span>
        </div>
      )}

      {mode === 'compact' ? (
        <button
          type="button"
          className={'ink-hub-open'}
          aria-label="Open the full wheel (pauses the video)"
          onClick={() => {
            store.pause();
          }}
        />
      ) : null}
    </div>
  );
}
