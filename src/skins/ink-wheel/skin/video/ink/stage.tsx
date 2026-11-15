/** @jsxImportSource react */

'use client';

import { Title as TitlePrimitive } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import { BufferingIndicator } from '../../ui/buffering-indicator';
import { ErrorDialog } from '../../ui/error-dialog';
import { Poster } from '../../ui/poster';

import { VideoStatusIndicators } from '../display/status-indicators';
import { Ambient } from './ambient';
import { previewPlacement, ScrubPreview } from './preview';
import { useProgress } from './progress';
import { InkCursor } from './cursor';
import { CARD_W, ChapterCarousel, cardScale } from './carousel';
import { formatTime, useChapterNav, useChapters } from './chapters';
import { FxBursts, useBursts } from './fx';
import { computeLayout, type Orientation, type WheelPose } from './layout';
import { playSfx } from './sfx';
import { InkWheel, QUALITY_SLOT, roman, SPEED_SLOT, VOLUME_SLOT, type RingDrag, type WheelMode } from './wheel';

export interface InkStageProps {
  children?: ReactNode;
  renderPoster?: NonNullable<ComponentProps<typeof Poster>>['renderImage'];
  /**
   * The video's shape. Left on `auto`, the skin reads it from the video's metadata and switches between the wide
   * layouts (16:9 and the like) and the tall ones (9:16) by itself.
   */
  orientation?: 'auto' | Orientation | undefined;
  /**
   * Fill the parent's height instead of picking a height from the video's shape, as in fullscreen. For a player that
   * takes the whole window; the parent needs a height.
   */
  fill?: boolean | undefined;
  /**
   * Remember where the viewer stopped and which chapters they watched, between visits (localStorage). On by default;
   * pass `false` to turn it off.
   */
  rememberProgress?: boolean | undefined;
  /** What identifies this video in that memory. Defaults to the media's source URL, or failing that its title. */
  progressKey?: string | undefined;
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function useViewportHeight() {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const read = () => setH(window.innerHeight);
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return h;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return reduced;
}

/** Reads the video's shape from its metadata, and follows it when the source changes. */
function useVideoOrientation(screenRef: RefObject<HTMLElement | null>) {
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  useEffect(() => {
    const host = screenRef.current;
    if (!host) return;
    let video: HTMLVideoElement | null = null;
    const read = () => {
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        setOrientation(video.videoHeight > video.videoWidth * 1.05 ? 'portrait' : 'landscape');
      }
    };
    const attach = () => {
      const next = host.querySelector('video');
      if (next === video) return;
      video?.removeEventListener('loadedmetadata', read);
      video?.removeEventListener('resize', read);
      video = next;
      video?.addEventListener('loadedmetadata', read);
      video?.addEventListener('resize', read);
      read();
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(host, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      video?.removeEventListener('loadedmetadata', read);
      video?.removeEventListener('resize', read);
    };
  }, [screenRef]);
  return orientation;
}

/** A touch screen with no hover: keyboard hints are left out there. */
function useTouchScreen() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const read = () => setTouch(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return touch;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function grow(pose: WheelPose, by: number, anchor: 'center' | 'corner'): WheelPose {
  const size = pose.size * by;
  if (anchor === 'center') return { ...pose, size };
  const d = (size - pose.size) / 2;
  return { cx: pose.cx - d, cy: pose.cy - d, size };
}

/**
 * Ink Wheel: the controls live on a painted wheel, like a game's radial menu. While the video plays a medium wheel
 * rests in the corner (or under the video, on a narrow screen); pause and the full wheel comes to the middle. Turn the
 * outer ring to scrub, and open Chapters for a carousel of paper cards.
 */
export function InkStage({
  children,
  renderPoster,
  orientation: forced = 'auto',
  fill = false,
  rememberProgress = true,
  progressKey,
}: InkStageProps) {
  const store = usePlayer();
  const state = useChapters();
  const nav = useChapterNav(state);
  const { cues, index, time, duration, paused, ended } = state;
  const isFullscreen = usePlayer((s) => s.isFullscreen) ?? false;
  const stopped = paused || ended;
  // Fullscreen, or filling the parent: the room sets the height and the layout fits into it.
  const fitted = isFullscreen || fill;

  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(rootRef);
  const detected = useVideoOrientation(screenRef);
  const orientation = forced === 'auto' ? detected : forced;
  const viewportH = useViewportHeight();
  const reducedMotion = useReducedMotion();
  const touch = useTouchScreen();

  const layout = useMemo(
    () => computeLayout(size.w || 960, fitted && size.h > 0 ? size.h : null, orientation, viewportH),
    [size.w, size.h, fitted, orientation, viewportH],
  );

  // The video glides to its new place only when the layout itself changes (say, a tall video was detected), not on
  // every resize, so it never trails the window or grows in from a default size on load.
  const [reflow, setReflow] = useState(false);
  // Nothing animates into place on load: the wheel's moves start once the player has been measured.
  const [ready, setReady] = useState(false);
  const measured = size.w > 0;
  useEffect(() => {
    if (!measured) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [measured]);
  const lastKind = useRef(layout.kind);
  useEffect(() => {
    if (lastKind.current === layout.kind) return;
    lastKind.current = layout.kind;
    setReflow(true);
    const t = window.setTimeout(() => setReflow(false), 650);
    return () => window.clearTimeout(t);
  }, [layout.kind]);

  const [sel, setSel] = useState(0);
  const [view, setView] = useState<'wheel' | 'cards'>('wheel');
  const [card, setCard] = useState(0);
  const [over, setOver] = useState(false);
  const [drag, setDrag] = useState<RingDrag | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const { bursts, burst, done } = useBursts(!reducedMotion);

  // Progress between visits: resume where the viewer stopped, and keep the chapters they watched.
  const currentSrc = usePlayer((s) => s.currentSrc) ?? '';
  const title = usePlayer((s) => s.title) ?? '';
  const storageKey = !rememberProgress
    ? null
    : progressKey || (currentSrc && !currentSrc.startsWith('blob:') ? currentSrc : '') || title || null;
  const seekTo = useCallback((t: number) => void store.seek(t), [store]);
  const progress = useProgress({ storageKey, cues, time, duration, paused, ended, seek: seekTo });
  const { resumedAt, dismissResume } = progress;
  useEffect(() => {
    if (resumedAt == null) return;
    const t = window.setTimeout(dismissResume, 6000);
    return () => window.clearTimeout(t);
  }, [resumedAt, dismissResume]);

  const mode: WheelMode = view === 'cards' ? 'dock' : !layout.compact || stopped ? 'full' : 'compact';
  const base = mode === 'dock' ? layout.dock : mode === 'full' ? layout.full : layout.compact!;
  // The resting wheel sits a little smaller than its layout size and grows when the mouse is over it.
  const pose =
    mode === 'compact' ? grow(base, over ? 1.12 : 0.86, 'corner') : over && mode === 'full' ? grow(base, 1.03, 'center') : base;

  // Ink on pause and play: the full wheel blooms out of a splash and cracks into place; playing again sends a
  // shockwave out from where the wheel comes to rest.
  // The sounds go with them: a small bowl on pause, a brush sweep on play (unless a card's seal was just stamped).
  const wasStopped = useRef(stopped);
  const stampedAt = useRef(-Infinity);
  useEffect(() => {
    if (wasStopped.current === stopped) return;
    wasStopped.current = stopped;
    if (view === 'cards') return;
    const f = layout.full;
    if (stopped) {
      playSfx('pause', { gap: 250 });
      burst('wheel-bloom', f.cx, f.cy, f.size * 1.25, { behind: true });
      burst('pause-cracks', f.cx, f.cy, f.size * 1.12);
    } else {
      if (performance.now() - stampedAt.current > 800) playSfx('play', { gap: 250 });
      const to = layout.compact ?? layout.full;
      burst('play-shockwave', to.cx, to.cy, to.size * 1.3);
    }
  }, [stopped, view, layout, burst]);

  // Opening the chapter cards pauses the video and puts the playing chapter at the front.
  const openCards = useCallback(() => {
    if (!cues.length) return;
    store.pause();
    playSfx('fan');
    setCard(Math.max(0, index));
    setView('cards');
  }, [cues.length, index, store]);

  const closeCards = useCallback(() => {
    setView('wheel');
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[data-slot="chap"]')?.focus({ preventScroll: true }));
  }, []);

  const playCard = useCallback(
    (i: number) => {
      const k = cardScale(layout.cards, layout.small);
      const x = layout.cards.x + layout.cards.w / 2;
      const y = layout.cards.y + layout.cards.h * 0.47 - 14 * k;
      burst('card-dissolve', x, y, CARD_W * k * 1.35);
      stampedAt.current = performance.now();
      playSfx('stamp');
      nav.goTo(i);
      void store.play();
      setSel(0);
      setView('wheel');
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('.ink-ring-grab')?.focus({ preventScroll: true }));
    },
    [layout, burst, nav, store],
  );

  useEffect(() => {
    if (view !== 'cards') return;
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('.ink-card[data-front]')?.focus({ preventScroll: true }));
  }, [view]);

  // A paper flick each time the carousel turns to another card (not when it opens on the playing one).
  const lastCard = useRef({ card, view });
  useEffect(() => {
    const turned = lastCard.current.view === 'cards' && view === 'cards' && lastCard.current.card !== card;
    lastCard.current = { card, view };
    if (turned) playSfx('flick', { gap: 60 });
  }, [card, view]);

  // Esc closes the cards wherever focus is: after a click on the open space, focus falls back to the page and the
  // stage's own key listener no longer hears it.
  useEffect(() => {
    if (view !== 'cards') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTyping(e.target)) return;
      if (rootRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      closeCards();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, closeCards]);

  // Skin keys. They are heard on the stage, before the player's own hotkeys (which listen on the container), so a key
  // used here is marked as handled and the hotkeys leave it alone.
  const keys = useRef({ view, sel, card, cues, stopped, ended, compact: !!layout.compact, nav, closeCards, playCard, store });
  useLayoutEffect(() => {
    keys.current = { view, sel, card, cues, stopped, ended, compact: !!layout.compact, nav, closeCards, playCard, store };
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = keys.current;
      if (k.view === 'cards') {
        const n = k.cues.length;
        let to = -1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, k.card - 1);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(n - 1, k.card + 1);
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        if (to >= 0) {
          e.preventDefault();
          setCard(to);
          requestAnimationFrame(() => root.querySelector<HTMLElement>('.ink-card[data-front]')?.focus({ preventScroll: true }));
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          k.closeCards();
          return;
        }
        // Space and the number keys still reach the player, but not while a card button would take them.
        if ((e.target as HTMLElement).closest('button') && (e.key === ' ' || e.key === 'Enter')) e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        if (k.sel === VOLUME_SLOT || k.sel === SPEED_SLOT || k.sel === QUALITY_SLOT) setSel(0);
        else if (k.compact && k.stopped && !k.ended) void k.store.play();
        else return;
        e.preventDefault();
      } else if (/^[0-9]$/.test(e.key)) {
        // The number keys set the volume, 1 to 9 for 10% to 90% and 0 for full, instead of jumping through the video.
        // The ring turns into the volume dial so the new level shows.
        e.preventDefault();
        const level = e.key === '0' ? 1 : Number(e.key) / 10;
        k.store.setVolume(level);
        k.store.setMuted(false);
        setSel(VOLUME_SLOT);
      } else if (e.key === 'k' || e.key === 'K') {
        // K still reaches the player's hotkey (which plays or pauses); the wheel follows it to the Play slot.
        setSel(0);
        requestAnimationFrame(() => root.querySelector<HTMLElement>('[data-slot="play"]')?.focus({ preventScroll: true }));
      } else if (e.key === '[') {
        e.preventDefault();
        k.nav.prev();
      } else if (e.key === ']') {
        e.preventDefault();
        k.nav.next();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  // Tell assistive tech when a new chapter starts.
  const [announcement, setAnnouncement] = useState('');
  const lastIndex = useRef(index);
  useEffect(() => {
    if (lastIndex.current === index) return;
    lastIndex.current = index;
    const cue = cues[index];
    if (cue) setAnnouncement(`Chapter ${roman(index)}: ${cue.text}`);
  }, [index, cues]);

  const togglePlay = () => {
    if (stopped) void store.play();
    else store.pause();
  };

  const cue = index >= 0 ? cues[index] : undefined;
  const chapterLine = cue ? `${roman(index)} · ${cue.text}` : '';
  const v = layout.video;

  const stageStyle = {
    height: fitted ? '100%' : layout.height,
    '--ink-video-x': `${v.x}px`,
    '--ink-video-y': `${v.y}px`,
    '--ink-video-w': `${v.w}px`,
    '--ink-video-h': `${v.h}px`,
    // Captions clear the resting wheel on a tall video, where it sits across the bottom of the picture.
    '--ink-caption-y': layout.kind === 'tall' && layout.compact ? `${-Math.round(layout.compact.size + 16)}px` : '-12px',
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={'ink-stage'}
      data-layout={layout.kind}
      data-orientation={orientation}
      data-mode={mode}
      data-view={view}
      data-drag={drag ?? undefined}
      data-paused={stopped ? '' : undefined}
      data-small={layout.small ? '' : undefined}
      data-touch={touch ? '' : undefined}
      data-fullscreen={fitted ? '' : undefined}
      data-reflow={reflow ? '' : undefined}
      data-ready={ready ? '' : undefined}
      style={stageStyle}
    >
      <Ambient screenRef={screenRef} on={layout.kind === 'side'} />

      <div ref={screenRef} className={'ink-screen'} style={{ left: v.x, top: v.y, width: v.w, height: v.h }}>
        {children}
        <Poster renderImage={renderPoster} />
        <span className={'ink-scrim'} aria-hidden="true" />
        <button
          type="button"
          className={'ink-hit'}
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => (view === 'cards' ? closeCards() : togglePlay())}
        />
        <BufferingIndicator />
        <VideoStatusIndicators />
        <ErrorDialog />
      </div>

      <div className={'ink-fx-layer'} aria-hidden="true">
        <FxBursts bursts={bursts} behind onDone={done} />
      </div>

      {layout.kind === 'overlay' || layout.kind === 'tall' ? (
        <div className={'ink-chrome'} aria-hidden="true">
          <span className={'ink-chrome-title'}>
            <TitlePrimitive />
          </span>
          <span className={'ink-pill ink-chrome-state'}>
            {ended ? 'Ended' : drag === 'time' ? 'Scrubbing' : paused ? 'Paused' : 'Playing'} · {formatTime(time)}
          </span>
          {chapterLine ? <span className={'ink-chrome-chapter'}>{chapterLine}</span> : null}
          <span className={'ink-chrome-keys'}>
            <kbd>Space</kbd> pause <kbd>←</kbd>
            <kbd>→</kbd> seek <kbd>[</kbd>
            <kbd>]</kbd> chapter <kbd>1</kbd>–<kbd>0</kbd> volume <kbd>Esc</kbd> back
          </span>
        </div>
      ) : null}

      {layout.kind === 'side' && layout.info ? (
        <div className={'ink-info'} style={{ left: layout.info.x, top: layout.info.y, width: layout.info.w, height: layout.info.h }}>
          <span className={'ink-info-title'}>
            <TitlePrimitive />
          </span>
          {cue ? (
            <>
              <span className={'ink-info-kicker'}>
                Chapter {roman(index)} of {roman(cues.length - 1)}
              </span>
              <span className={'ink-info-chapter'}>{cue.text}</span>
            </>
          ) : null}
          <span className={'ink-info-time'}>
            {formatTime(time)} / {formatTime(duration)}
          </span>
          <span className={'ink-info-bar'} aria-hidden="true">
            <span style={{ width: `${duration > 0 ? (time / duration) * 100 : 0}%` }} />
          </span>
          <span className={'ink-info-hint'}>
            {touch ? 'Turn the outer ring to scrub · tap the video to pause' : 'Turn the outer ring to scrub · Space to pause'}
          </span>
        </div>
      ) : null}

      {layout.kind === 'stack' && layout.info ? (
        <div className={'ink-strip'} style={{ left: layout.info.x, top: layout.info.y, width: layout.info.w, height: layout.info.h }} aria-hidden="true">
          <span className={'ink-strip-chapter'}>
            {cue ? <span className={'ink-strip-roman'}>{roman(index)}</span> : null}
            <span className={'ink-strip-name'}>{cue?.text ?? <TitlePrimitive />}</span>
          </span>
          <span className={'ink-strip-time'}>
            {formatTime(time)} / {formatTime(duration)}
          </span>
        </div>
      ) : null}

      <InkWheel
        pose={pose}
        mode={mode}
        sel={sel}
        cues={cues}
        reducedMotion={reducedMotion}
        touch={touch}
        seen={progress.seen}
        onSelect={setSel}
        onOpenCards={openCards}
        onHover={setOver}
        onDragChange={setDrag}
        onScrub={setScrubTime}
        onBurst={burst}
      />

      <div className={'ink-fx-layer ink-fx-front'} aria-hidden="true">
        <FxBursts bursts={bursts} behind={false} onDone={done} />
      </div>

      {view === 'cards' ? (
        <ChapterCarousel
          area={layout.cards}
          cues={cues}
          playing={index}
          seen={progress.seen}
          card={card}
          duration={duration}
          small={layout.small}
          onCard={setCard}
          onPlay={playCard}
          onBack={closeCards}
        />
      ) : null}

      {drag === 'time' && scrubTime != null && duration > 0 && view === 'wheel' ? (
        <ScrubPreview
          time={scrubTime}
          cues={cues}
          {...previewPlacement(pose, (scrubTime / duration) * 360, { w: layout.width, h: layout.height })}
        />
      ) : null}

      <InkCursor stageRef={rootRef} turning={drag !== null} />

      {resumedAt != null && view === 'wheel' ? (
        <div className={'ink-resume'} role="status">
          <span>
            Picked up at <b>{formatTime(resumedAt)}</b>
          </span>
          <button type="button" className={'ink-resume-over'} onClick={progress.startOver}>
            Start over
          </button>
          <button type="button" className={'ink-resume-close'} aria-label="Dismiss" onClick={dismissResume}>
            ×
          </button>
        </div>
      ) : null}

      <p className={'ink-sr'} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
