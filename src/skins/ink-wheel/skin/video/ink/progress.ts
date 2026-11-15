'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { chapterAt, type ChapterCue } from './chapters';

/** What is kept per video in localStorage. */
interface Saved {
  /** Where to resume (0 once the video was watched to the end). */
  t: number;
  /** Seconds actually watched in each chapter, by chapter index. */
  watched: Record<number, number>;
  /** Chapters counted as seen. */
  seen: number[];
  /** When it was last saved (ms since epoch). */
  at: number;
}

const PREFIX = 'ink-wheel:progress:';
/** A chapter counts as seen once this share of it has been watched. */
const SEEN_SHARE = 0.7;
/** No resume this close to the start or the end. */
const RESUME_MARGIN = 5;

function read(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      t: typeof v.t === 'number' && Number.isFinite(v.t) ? v.t : 0,
      watched: v.watched && typeof v.watched === 'object' ? v.watched : {},
      seen: Array.isArray(v.seen) ? v.seen.filter((n) => Number.isInteger(n)) : [],
      at: typeof v.at === 'number' ? v.at : 0,
    };
  } catch {
    return null;
  }
}

function write(key: string, v: Saved) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: progress just isn't kept */
  }
}

export interface ProgressInput {
  /** Which video this is; nothing is kept without one. */
  storageKey: string | null;
  cues: readonly ChapterCue[];
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  seek: (t: number) => void;
}

/**
 * Remembers, per video, where you stopped and which chapters you have actually watched (not just skipped past), in
 * the browser's localStorage. On the next visit it picks up where you were and the chapter cards keep their stamps.
 */
export function useProgress({ storageKey, cues, time, duration, paused, ended, seek }: ProgressInput) {
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const [resumedAt, setResumedAt] = useState<number | null>(null);

  const state = useRef<{ key: string | null; loaded: boolean; watched: Record<number, number>; last: number; savedAt: number }>({
    key: null,
    loaded: false,
    watched: {},
    last: 0,
    savedAt: 0,
  });
  const live = useRef({ time, duration, ended, seen });
  useEffect(() => {
    live.current = { time, duration, ended, seen };
  });

  const save = useCallback(() => {
    const s = state.current;
    if (!s.key || !s.loaded) return;
    const { time: t, duration: d, ended: done, seen: set } = live.current;
    write(s.key, { t: done || (d > 0 && t > d - RESUME_MARGIN) ? 0 : t, watched: s.watched, seen: [...set], at: Date.now() });
    s.savedAt = performance.now();
  }, []);

  // Load once the video's length is known, and resume if there is somewhere to resume to.
  useEffect(() => {
    const s = state.current;
    if (!storageKey || !(duration > 0) || s.key === storageKey) return;
    s.key = storageKey;
    s.loaded = true;
    s.last = time;
    const saved = read(storageKey);
    s.watched = saved?.watched ?? {};
    setSeen(new Set(saved?.seen ?? []));
    if (saved && saved.t > RESUME_MARGIN && saved.t < duration - RESUME_MARGIN && time < 1) {
      seek(saved.t);
      setResumedAt(saved.t);
    }
  }, [storageKey, duration, time, seek]);

  // Count the seconds actually played in each chapter; a jump or a seek is not watching.
  useEffect(() => {
    const s = state.current;
    if (!s.loaded) return;
    const delta = time - s.last;
    s.last = time;
    if (paused || delta <= 0 || delta > 1.5 || !cues.length) return;
    const i = chapterAt(cues, time - delta / 2);
    const cue = cues[i];
    if (!cue) return;
    const watched = (s.watched[i] ?? 0) + delta;
    s.watched[i] = watched;
    const len = Math.max(1, Math.min(cue.endTime, duration) - cue.startTime);
    if (watched >= len * SEEN_SHARE && !live.current.seen.has(i)) {
      setSeen((prev) => new Set(prev).add(i));
    }
    if (performance.now() - s.savedAt > 3000) save();
  }, [time, paused, cues, duration, save]);

  // Save on pause, at the end, when a new chapter is seen, and when the page goes away.
  useEffect(() => {
    if (paused || ended) save();
  }, [paused, ended, save]);
  useEffect(() => {
    save();
  }, [seen, save]);
  useEffect(() => {
    const away = () => save();
    const hidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [save]);

  const dismissResume = useCallback(() => setResumedAt(null), []);
  const startOver = useCallback(() => {
    setResumedAt(null);
    seek(0);
  }, [seek]);

  return { seen, resumedAt, dismissResume, startOver };
}
