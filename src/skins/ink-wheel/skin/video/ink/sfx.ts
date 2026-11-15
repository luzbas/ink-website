'use client';

import clickUrl from '../../assets/sfx/click.mp3';
import fanUrl from '../../assets/sfx/fan.mp3';
import flickUrl from '../../assets/sfx/flick.mp3';
import pauseUrl from '../../assets/sfx/pause.mp3';
import playUrl from '../../assets/sfx/play.mp3';
import pressUrl from '../../assets/sfx/press.mp3';
import stampUrl from '../../assets/sfx/stamp.mp3';
import tickUrl from '../../assets/sfx/tick.mp3';
import { usePlayer } from '@videojs/react/video';
import { useEffect } from 'react';

/**
 * The skin's sounds: paper, brush, wood and a small bowl, generated with Melius (ElevenLabs sound effects) and trimmed
 * to a fraction of a second. They play through Web Audio, follow the video's volume (silent when it is muted) and sit
 * well under it. Browsers keep audio locked until the viewer first clicks, taps or presses a key, so nothing plays
 * before that.
 */
const URLS = {
  tick: tickUrl,
  press: pressUrl,
  play: playUrl,
  pause: pauseUrl,
  click: clickUrl,
  fan: fanUrl,
  flick: flickUrl,
  stamp: stampUrl,
} as const;

export type SfxName = keyof typeof URLS;

/** How loud each sound sits, before the video's own volume. */
const GAIN: Record<SfxName, number> = {
  tick: 0.14,
  press: 0.3,
  play: 0.32,
  pause: 0.34,
  click: 0.24,
  fan: 0.3,
  flick: 0.28,
  stamp: 0.36,
};
const MASTER = 0.6;
/** Every play is a touch higher or lower than the last, so a run of clicks never sounds mechanical. */
const WOBBLE = 0.06;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let level = 1;
const buffers = new Map<SfxName, AudioBuffer>();
const lastAt = new Map<SfxName, number>();
let loaded: Promise<void> | null = null;

/** A sound asked for while audio is still waking up (the click that unlocks it, say) plays once it is ready. */
let pending: { name: SfxName; rate: number; gain: number; at: number } | null = null;
const PENDING_MS = 400;

type ACtor = typeof AudioContext;
const audioCtor = (): ACtor | undefined =>
  typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext);

async function decodeInto(name: SfxName, data: ArrayBuffer, decoder: BaseAudioContext) {
  if (buffers.has(name)) return;
  try {
    // decodeAudioData detaches the buffer it is given, so it gets a copy.
    buffers.set(name, await decoder.decodeAudioData(data.slice(0)));
  } catch {
    /* a file that will not decode simply stays silent */
  }
}

/**
 * Fetch and decode every sound as the page loads, before any click. An offline context decodes without needing the
 * viewer's permission to play, so the buffers are ready the moment audio unlocks and the very first sound (the click
 * that unlocks it) is not lost. Where offline decoding is missing, the files wait and are decoded on unlock.
 */
const raw = new Map<SfxName, ArrayBuffer>();
function load() {
  if (loaded || typeof window === 'undefined') return loaded;
  let offline: BaseAudioContext | null = null;
  try {
    offline = typeof OfflineAudioContext === 'undefined' ? null : new OfflineAudioContext(1, 1, 48000);
  } catch {
    offline = null;
  }
  loaded = Promise.all(
    (Object.entries(URLS) as [SfxName, string][]).map(async ([name, url]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const data = await r.arrayBuffer();
        raw.set(name, data);
        const decoder = offline ?? ctx;
        if (decoder) await decodeInto(name, data, decoder);
      } catch {
        /* a file that will not load simply stays silent */
      }
    }),
  ).then(() => flush());
  return loaded;
}

function flush() {
  const p = pending;
  if (!p || !ctx || ctx.state !== 'running') return;
  pending = null;
  if (performance.now() - p.at <= PENDING_MS) start(p.name, p.rate, p.gain);
}

function unlock() {
  const AC = audioCtor();
  if (!AC) return;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return;
    }
    out = ctx.createGain();
    out.gain.value = MASTER * level;
    out.connect(ctx.destination);
    ctx.addEventListener('statechange', flush);
    // On iPhone, Web Audio otherwise follows the ring/silent switch while the video does not; the sounds go with the
    // video.
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type === 'auto') session.type = 'playback';
    } catch {
      /* not supported */
    }
    // Anything the offline decoder could not handle is decoded here instead.
    for (const [name, data] of raw) void decodeInto(name, data, ctx).then(flush);
    void load();
  }
  if (ctx.state !== 'running') {
    void ctx
      .resume()
      .then(flush)
      .catch(() => undefined);
  }
}

function setLevel(v: number) {
  level = Math.max(0, Math.min(1, v));
  if (ctx && out) out.gain.setTargetAtTime(MASTER * level, ctx.currentTime, 0.015);
}

function start(name: SfxName, rate: number, gain: number) {
  const buffer = buffers.get(name);
  if (!ctx || !out || !buffer || level <= 0) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * WOBBLE);
  const g = ctx.createGain();
  g.gain.value = GAIN[name] * gain;
  src.connect(g).connect(out);
  src.start();
}

export interface SfxOptions {
  /** Playback speed, which also sets the pitch: 1 is as recorded. */
  rate?: number;
  /** Extra loudness on top of the sound's own level. */
  gain?: number;
  /** The shortest time in ms between two plays of this sound; closer plays are dropped. */
  gap?: number;
}

/**
 * Play one of the skin's sounds. Silent until the viewer's first click, tap or key press (the browser's rule) and
 * while the video is muted. A sound asked for while audio is still waking up plays as soon as it can.
 */
export function playSfx(name: SfxName, { rate = 1, gain = 1, gap = 30 }: SfxOptions = {}) {
  if (!ctx || !out || level <= 0) return;
  const now = performance.now();
  if (now - (lastAt.get(name) ?? -Infinity) < gap) return;
  lastAt.set(name, now);
  if (ctx.state !== 'running' || !buffers.has(name)) {
    pending = { name, rate, gain, at: now };
    if (ctx.state !== 'running') void ctx.resume().then(flush).catch(() => undefined);
    return;
  }
  start(name, rate, gain);
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

/**
 * Keeps the sounds in step with the player: their volume follows the video's, and audio unlocks on the viewer's first
 * click, tap or key press anywhere on the page (and wakes again if the browser suspends it later).
 */
export function useSfx() {
  const volume = usePlayer((s) => s.volume) ?? 1;
  const muted = usePlayer((s) => s.muted) ?? false;
  // Set during render, so a sound played by an effect in the same commit (a volume click) already hears the new level.
  setLevel(muted ? 0 : volume);

  useEffect(() => {
    void load();
    const on = () => unlock();
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, on, { capture: true, passive: true });
    return () => {
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, on, { capture: true });
    };
  }, []);
}
