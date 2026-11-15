'use client';

import { usePlayer } from '@videojs/react/video';
import { useCallback } from 'react';

/** A chapter cue, as the player store exposes it from the media's chapters track. */
export interface ChapterCue {
  startTime: number;
  endTime: number;
  text: string;
}

const NO_CUES: readonly ChapterCue[] = [];

export function formatTime(seconds: number) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Which chapter a moment belongs to (-1 before the first one). */
export function chapterAt(cues: readonly ChapterCue[], time: number) {
  let index = -1;
  for (let i = 0; i < cues.length; i++) if (time >= cues[i]!.startTime - 0.05) index = i;
  return index;
}

export interface ChaptersState {
  cues: readonly ChapterCue[];
  /** The chapter the playhead is in, or -1. */
  index: number;
  /** How far through the playing chapter the playhead is (0–1). */
  progress: number;
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  rate: number;
}

/** Reads the chapters track and the playhead from the player store. */
export function useChapters(): ChaptersState {
  const cues = usePlayer((s) => s.chaptersCues) ?? NO_CUES;
  const time = usePlayer((s) => s.currentTime) ?? 0;
  const duration = usePlayer((s) => s.duration) ?? 0;
  const ended = usePlayer((s) => s.ended) ?? false;
  const paused = usePlayer((s) => s.paused) ?? true;
  const rate = usePlayer((s) => s.playbackRate) ?? 1;

  const index = ended && cues.length ? cues.length - 1 : chapterAt(cues, time);
  const current = index >= 0 ? cues[index] : undefined;
  const progress = current
    ? ended
      ? 1
      : Math.min(1, Math.max(0, (time - current.startTime) / Math.max(0.001, current.endTime - current.startTime)))
    : 0;
  return { cues, index, progress, time, duration, paused, ended, rate };
}

/**
 * Chapter steps. `prev` restarts the playing chapter if it's more than 3s in, like most players; `next` from the
 * last chapter goes to the end (the castle).
 */
export function useChapterNav(state: Pick<ChaptersState, 'cues' | 'index' | 'time' | 'duration'>) {
  const store = usePlayer();
  const { cues, index, time, duration } = state;

  const goTo = useCallback(
    (i: number) => {
      const cue = cues[i];
      if (cue) void store.seek(cue.startTime);
    },
    [cues, store],
  );

  const prev = useCallback(() => {
    if (!cues.length) return void store.seek(0);
    if (index >= 0 && time - cues[index]!.startTime > 3) goTo(index);
    else goTo(Math.max(0, index - 1));
  }, [cues, index, time, goTo, store]);

  const next = useCallback(() => {
    if (index < cues.length - 1) goTo(index + 1);
    else if (duration > 0) void store.seek(Math.max(0, duration - 0.05));
  }, [cues.length, index, duration, goTo, store]);

  return { goTo, prev, next };
}
