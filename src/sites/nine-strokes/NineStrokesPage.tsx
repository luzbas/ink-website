// Nine Strokes — a landing page for a concept game, built to show the Ink Wheel skin in a real website.
// The page is a handscroll (emakimono): on a wide screen, scrolling down slides the painted paper sideways, panel by
// panel, and each panel is one chapter of the 15-second reveal trailer playing in the Ink Wheel player. The panels'
// "Play from" links seek the trailer, and the bestiary cards are stamped as the trailer passes their chapter.
// On a phone, or with reduced motion, the same panels stack as an ordinary vertical page.
import { HlsVideo } from '@videojs/react/media/hls-video';
import { usePlayer, VideoPlayer } from '@videojs/react/video';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { VideoSkin } from '../../skins/ink-wheel/skin/video/skin';
import brushRing from '../../skins/ink-wheel/skin/assets/brush-ring.webp';
import cardBack from '../../skins/ink-wheel/skin/assets/card-back.webp';
import cardFront from '../../skins/ink-wheel/skin/assets/card-front.webp';
import decalFlick from '../../skins/ink-wheel/skin/assets/decal-flick.webp';
import decalSpatter from '../../skins/ink-wheel/skin/assets/decal-spatter.webp';
import hubPaper from '../../skins/ink-wheel/skin/assets/hub-paper.webp';
import inkDisc from '../../skins/ink-wheel/skin/assets/ink-disc.webp';
import inkPool from '../../skins/ink-wheel/skin/assets/ink-pool.webp';
import pillInk from '../../skins/ink-wheel/skin/assets/pill-ink.webp';
import stampPlaying from '../../skins/ink-wheel/skin/assets/stamp-playing.webp';
import stampSeen from '../../skins/ink-wheel/skin/assets/stamp-seen.webp';
import hunt from './assets/keyframe-2-the-hunt.webp';
import { useHandscroll } from './use-handscroll';
import { Yokai, type YokaiName } from './Yokai';
import './nine-strokes.css';

// The reveal trailer on Mux: 15 s, five chapters, English captions, and a Mux storyboard for the chapter-card frames.
const PLAYBACK_ID = 'hE8iC3t2fiIGg9JQj5imNcSPjvlYog7QcVAtJMTj3FY';
const HLS = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=1.6`;
const STORYBOARD = `https://image.mux.com/${PLAYBACK_ID}/storyboard.vtt`;
const CHAPTERS_VTT = '/nine-strokes/nine-strokes-chapters.vtt';
const CAPTIONS_VTT = '/nine-strokes/nine-strokes-captions-en.vtt';

/** Display fonts for the page; the player loads its own (IM Fell English SC and Inter). */
const FONT_URL = 'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Inter:wght@400;500;600&family=Yuji+Boku&display=swap';

/** The trailer's chapters, as cut (they match chapters.vtt), and the panel each one belongs to. */
const CHAPTERS = [
  { n: 'I', start: 0, end: 3.24, title: 'The Drop', panel: 'top' },
  { n: 'II', start: 3.24, end: 5.8, title: 'The Hunt', panel: 'story' },
  { n: 'III', start: 5.8, end: 8.72, title: 'The Wheel', panel: 'techniques' },
  { n: 'IV', start: 8.72, end: 11.4, title: 'The Seal', panel: 'bestiary' },
  { n: 'V', start: 11.4, end: 15.116, title: 'Press your seal', panel: 'wishlist' },
] as const;

/** Share of a chapter that must actually play before it counts as seen (the skin uses the same). */
const SEEN_SHARE = 0.7;

const clock = (t: number) => `0:${String(Math.floor(t)).padStart(2, '0')}`;

/** The eight strokes of 永 ("eternity"), the classic lesson in brushwork, and the ninth that ends a fight. */
const STROKES = [
  { k: '印', name: 'Seal' },
  { k: '側', name: 'Dot' },
  { k: '勒', name: 'Bridle' },
  { k: '努', name: 'Crossbow' },
  { k: '趯', name: 'Leap' },
  { k: '策', name: 'Whip' },
  { k: '掠', name: 'Sweep' },
  { k: '啄', name: 'Peck' },
  { k: '磔', name: 'Rend' },
];

const SPIRITS: { name: YokaiName; title: string; kanji: string; alt: string; chapter: number }[] = [
  { name: 'kitsune', title: 'Kitsune', kanji: '狐', alt: 'Kitsune, an ink fox spirit', chapter: 0 },
  { name: 'kappa', title: 'Kappa', kanji: '河童', alt: 'Kappa, a river spirit with a water dish on its head', chapter: 1 },
  { name: 'chochin', title: 'Chōchin-obake', kanji: '提灯お化け', alt: 'Chōchin-obake, a paper lantern spirit', chapter: 2 },
  { name: 'umibozu', title: 'Umibōzu', kanji: '海坊主', alt: 'Umibōzu, a giant sea spirit rising from the waves', chapter: 3 },
];

interface PlayerApi {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The player follows the reader: once the trailer has been played and its place in the hero slides away (sideways on
 * the scroll, up on the vertical page), it lifts into a small player in the corner, and settles back into the hero when
 * the hero comes back into view. It is the same player the whole time (only its box moves), so playback never stops.
 * Closing it pauses the trailer and leaves it in the hero until the reader comes back there.
 */
function useFollowPlayer(horizontal: boolean, started: boolean, pause: () => void) {
  const slotRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [slotH, setSlotH] = useState<number | null>(null);
  const dockRect = useRef<DOMRect | null>(null);
  const docked = away && started && !dismissed;

  useEffect(() => {
    let frame = 0;
    const check = () => {
      const slot = slotRef.current;
      if (!slot) return;
      const r = slot.getBoundingClientRect();
      // Sideways: half the player has slid off to the left. Vertical: the player has scrolled up past the top.
      const gone = horizontal ? r.left + r.width / 2 < 0 : r.bottom < 80;
      setAway(gone);
      if (!gone) setDismissed(false);
      if (floatRef.current?.classList.contains('is-docked')) dockRect.current = floatRef.current.getBoundingClientRect();
      else setSlotH(slot.offsetHeight);
    };
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [horizontal]);

  // Glide between the hero and the corner (from the old box to the new one), unless the reader prefers less motion.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const float = floatRef.current;
    const slot = slotRef.current;
    if (!float || !slot || reduceMotion()) return;
    const to = float.getBoundingClientRect();
    if (docked) dockRect.current = to;
    const from = docked ? slot.getBoundingClientRect() : dockRect.current;
    if (!from || !to.width) return;
    const s = from.width / to.width;
    float.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})` },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [docked]);

  const close = useCallback(() => {
    pause();
    setDismissed(true);
  }, [pause]);

  return { slotRef, floatRef, docked, slotH, close };
}

/** Lives inside the player: hands the page a way to seek and play, and reports the playhead. */
function PlayerBridge({
  onApi,
  onTime,
}: {
  onApi: (api: PlayerApi) => void;
  onTime: (t: number, playing: boolean) => void;
}) {
  const store = usePlayer();
  const time = usePlayer((s) => s.currentTime) ?? 0;
  const paused = usePlayer((s) => s.paused) ?? true;
  useEffect(() => {
    onApi({ seek: (t) => void store.seek(t), play: () => void store.play(), pause: () => store.pause() });
  }, [store, onApi]);
  useEffect(() => onTime(time, !paused), [time, paused, onTime]);
  return null;
}

function PlayIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 14 16" aria-hidden="true">
      <path d="M1 1.5v13l12-6.5z" fill="currentColor" />
    </svg>
  );
}

export default function NineStrokesPage() {
  const { horizontal, trackRef, viewRef, scrollerRef, stripRef, goTo } = useHandscroll();
  const api = useRef<PlayerApi | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const pause = useCallback(() => api.current?.pause(), []);
  const { slotRef, floatRef, docked, slotH, close: closeFollow } = useFollowPlayer(horizontal, started, pause);
  // Chapters actually played through (seeking past one doesn't count), for the rail and the SEEN stamps.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const [sent, setSent] = useState(false);

  const onApi = useCallback((a: PlayerApi) => {
    api.current = a;
  }, []);
  const onTime = useCallback((t: number, isPlaying: boolean) => {
    setTime(t);
    setPlaying(isPlaying);
    if (isPlaying) setStarted(true);
  }, []);

  // Count the seconds actually watched in each chapter, from the video's own events (seeks don't count), like the
  // skin's own SEEN stamps: a chapter is seen once most of it has played.
  useEffect(() => {
    const video = playerRef.current?.querySelector('video');
    if (!video) return;
    const watched = CHAPTERS.map(() => 0);
    let prev = video.currentTime;
    let seeking = false;
    const onSeeking = () => {
      seeking = true;
    };
    const onSeeked = () => {
      seeking = false;
      prev = video.currentTime;
    };
    const onTimeUpdate = () => {
      const t = video.currentTime;
      const dt = t - prev;
      if (!seeking && !video.paused && dt > 0 && dt < 1.5) {
        const i = CHAPTERS.findIndex((c) => prev >= c.start && prev < c.end);
        if (i >= 0) {
          watched[i] += dt;
          const c = CHAPTERS[i]!;
          if (watched[i] >= SEEN_SHARE * (c.end - c.start)) setSeen((s) => (s.has(i) ? s : new Set([...s, i])));
        }
      }
      prev = t;
    };
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, []);

  const current = CHAPTERS.findIndex((c) => time >= c.start && time < c.end);

  /** In-page links: slide the scroll to the panel instead of jumping. */
  const nav = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    goTo(id);
  };

  /** Back to the player, at this chapter, playing. */
  const playFrom = (t: number) => (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    goTo('top');
    api.current?.seek(t);
    api.current?.play();
    playerRef.current?.focus({ preventScroll: true });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className={`ns ${horizontal ? 'ns--h' : 'ns--v'}`}>
      <link rel="stylesheet" href={FONT_URL} precedence="default" />

      <div className="ns-track" ref={trackRef}>
        <div className="ns-view" ref={viewRef}>
          {horizontal && (
            <div className="ns-mount" aria-hidden="true">
              <span>九画 · 墨の絵巻</span>
            </div>
          )}

          <div className="ns-scroller" ref={scrollerRef}>
          <div className="ns-strip" ref={stripRef}>
            {/* I · the scroll opens: title and the trailer */}
            <section id="top" className="ns-hero" aria-labelledby="ns-title">
              {/* First, so everything else in the hero paints over it (no z-index, which would trap the docked player). */}
              <img className="ns-decal ns-decal--spatter" src={decalSpatter} alt="" />
              <header className="ns-nav">
                <a href="#top" className="ns-brand" onClick={nav('top')}>
                  <span className="ns-seal" aria-hidden="true">
                    九
                  </span>
                  <span className="ns-brand__name">Nine Strokes</span>
                </a>
                <nav aria-label="Main" className="ns-nav__links">
                  <a href="#story" onClick={nav('story')}>
                    Story
                  </a>
                  <a href="#techniques" onClick={nav('techniques')}>
                    Techniques
                  </a>
                  <a href="#bestiary" onClick={nav('bestiary')}>
                    Bestiary
                  </a>
                  <a href="#wishlist" className="ns-pill" style={{ backgroundImage: `url(${pillInk})` }} onClick={nav('wishlist')}>
                    Wishlist
                  </a>
                </nav>
              </header>

              <div className="ns-hero__body">
                <div className="ns-hero__text">
                  <img className="ns-decal ns-decal--flick" src={decalFlick} alt="" />
                  <p className="ns-eyebrow">An ink-painted yōkai hunt</p>
                  <h1 id="ns-title" className="ns-title">
                    <span>Nine</span> <span>Strokes</span>
                  </h1>
                  <p className="ns-lede">
                    Every spirit has a name. Track it through the mist, paint it in nine strokes, and press your seal to
                    keep it.
                  </p>
                  <div className="ns-actions">
                    <button type="button" className="ns-btn" onClick={playFrom(0)}>
                      <PlayIcon />
                      Watch the trailer
                    </button>
                    <a href="#bestiary" className="ns-link" onClick={nav('bestiary')}>
                      Meet the spirits
                    </a>
                  </div>
                  <p className="ns-meta">[PLATFORMS] · [RELEASE WINDOW]</p>
                </div>

                <figure className="ns-player">
                  {/* Keeps the player's place in the hero while it follows the reader in the corner. */}
                  <div className="ns-player__slot" ref={slotRef} style={docked && slotH ? { height: slotH } : undefined}>
                    <div
                      ref={floatRef}
                      className={`ns-float${docked ? ' is-docked' : ''}`}
                      role={docked ? 'region' : undefined}
                      aria-label={docked ? 'Trailer, following the scroll' : undefined}
                    >
                      {docked && (
                        <div className="ns-float__bar">
                          <span className="ns-float__title">
                            {current >= 0 ? `${CHAPTERS[current]!.n} · ${CHAPTERS[current]!.title}` : 'Nine Strokes'}
                          </span>
                          <button type="button" className="ns-float__btn" onClick={() => goTo('top')}>
                            Back to top
                          </button>
                          <button type="button" className="ns-float__btn ns-float__close" aria-label="Close the small player" onClick={closeFollow}>
                            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      )}
                  <div className="ns-player__frame" ref={playerRef} tabIndex={-1}>
                    <VideoPlayer poster={POSTER} title="Nine Strokes — reveal trailer">
                      <PlayerBridge onApi={onApi} onTime={onTime} />
                      <VideoSkin
                        progressKey={PLAYBACK_ID}
                        fill={docked}
                        style={{ width: '100%', height: docked ? '100%' : undefined, borderRadius: 0 }}
                      >
                        <HlsVideo src={HLS} playsInline crossOrigin="anonymous">
                          <track kind="chapters" label="Chapters" srcLang="en" src={CHAPTERS_VTT} default />
                          <track kind="captions" label="English" srcLang="en" src={CAPTIONS_VTT} />
                          <track kind="metadata" label="thumbnails" src={STORYBOARD} default />
                        </HlsVideo>
                      </VideoSkin>
                    </VideoPlayer>
                  </div>
                    </div>
                  </div>
                  <figcaption className="ns-player__cap">
                    <span>Reveal trailer · 0:15</span>
                    <span>Turn the outer ring to scrub</span>
                  </figcaption>
                </figure>
              </div>

              <nav className="ns-rail" aria-label="Chapters of the scroll">
                <div className="ns-rail__head">
                  <span className="ns-rail__title">{horizontal ? 'Scroll to unroll' : 'Chapters'}</span>
                  <span className="ns-rail__note">Each panel is a chapter of the trailer</span>
                </div>
                <ol className="ns-rail__list">
                  {CHAPTERS.map((c, i) => (
                    <li key={c.n}>
                      <a
                        href={`#${c.panel}`}
                        onClick={nav(c.panel)}
                        aria-current={i === current ? 'step' : undefined}
                        className={i === current ? 'is-current' : seen.has(i) ? 'is-seen' : undefined}
                      >
                        <span className="ns-rail__dot" aria-hidden="true" />
                        <span className="ns-rail__time">
                          {c.n} · {clock(c.start)}
                        </span>
                        <span className="ns-rail__name">{c.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </section>

            {/* II · the hunt */}
            <section id="story" className="ns-panel ns-panel--hunt" aria-labelledby="ns-hunt">
              <div className="ns-panel__text">
                <p className="ns-eyebrow">Chapter II · {clock(CHAPTERS[1].start)}</p>
                <h2 id="ns-hunt" className="ns-h2">
                  The Hunt
                </h2>
                <p className="ns-copy">
                  Spirits hide in the mist between brushstrokes. Follow their ink trails across the painted provinces, and
                  keep your brush wet.
                </p>
                <a href="#top" className="ns-play" onClick={playFrom(CHAPTERS[1].start)}>
                  <PlayIcon />
                  <span>Play from {clock(CHAPTERS[1].start)}</span>
                </a>
              </div>
              <img
                className="ns-hunt__art"
                src={hunt}
                alt="The calligrapher on a misty ridge while an ink spirit watches from the clouds."
                loading="lazy"
              />
            </section>

            {/* III · the wheel */}
            <section id="techniques" className="ns-panel ns-panel--wheel" aria-labelledby="ns-wheel">
              <span className="ns-ghost" aria-hidden="true">
                永
              </span>
              <div className="ns-panel__text">
                <p className="ns-eyebrow">Chapter III · {clock(CHAPTERS[2].start)}</p>
                <h2 id="ns-wheel" className="ns-h2">
                  The Wheel
                </h2>
                <p className="ns-copy">
                  Eight strokes write 永, eternity. The ninth ends the fight. Open the wheel and the world slows to a crawl
                  while you choose.
                </p>
                <a href="#top" className="ns-play" onClick={playFrom(CHAPTERS[2].start)}>
                  <PlayIcon />
                  <span>Play from {clock(CHAPTERS[2].start)}</span>
                </a>
              </div>
              <div className="ns-wheel">
                <img className="ns-wheel__ring" src={brushRing} alt="" />
                <img className="ns-wheel__disc" src={inkDisc} alt="" />
                <div className="ns-wheel__hub">
                  <img src={hubPaper} alt="" />
                  <span className="ns-wheel__hub-k" aria-hidden="true">
                    印
                  </span>
                  <span className="ns-wheel__hub-name">Seal</span>
                </div>
                <ol className="ns-wheel__strokes" aria-label="The nine strokes">
                  {STROKES.map((s, i) => {
                    const a = (i * 40 * Math.PI) / 180;
                    return (
                      <li
                        key={s.name}
                        className={i === 0 ? 'is-seal' : undefined}
                        style={{ left: `${50 + 47 * Math.sin(a)}%`, top: `${50 - 47 * Math.cos(a)}%` }}
                      >
                        <span className="ns-wheel__k" lang="ja" aria-hidden="true">
                          {s.k}
                        </span>
                        <span className="ns-wheel__name">{s.name}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>

            {/* IV · the seal: a bestiary of cards, stamped as the trailer passes */}
            <section id="bestiary" className="ns-panel ns-panel--seal" aria-labelledby="ns-seal">
              <div className="ns-panel__text">
                <p className="ns-eyebrow">Chapter IV · {clock(CHAPTERS[3].start)}</p>
                <h2 id="ns-seal" className="ns-h2">
                  The Seal
                </h2>
                <p className="ns-copy">
                  Press your seal and the spirit folds into paper. Every card you keep has a name, a habit and a weakness
                  written on the back.
                </p>
                <a href="#top" className="ns-play" onClick={playFrom(CHAPTERS[3].start)}>
                  <PlayIcon />
                  <span>Play from {clock(CHAPTERS[3].start)}</span>
                </a>
                <p className="ns-note">Cards are stamped as the trailer passes their chapter.</p>
              </div>
              <div className="ns-fan">
                <img className="ns-fan__pool" src={inkPool} alt="" />
                <ul className="ns-fan__cards" aria-label="Spirit cards">
                  {SPIRITS.map((s, i) => {
                    const live = playing && current === s.chapter;
                    const stamped = !live && seen.has(s.chapter);
                    return (
                      <li key={s.name} className={`ns-card ns-card--${i}${live ? ' is-playing' : ''}`}>
                        <img className="ns-card__bg" src={cardFront} alt="" />
                        <Yokai name={s.name} label={s.alt} />
                        <span className="ns-card__name">{s.title}</span>
                        <span className="ns-card__kanji" lang="ja">
                          {s.kanji}
                        </span>
                        {stamped && <img className="ns-card__stamp" src={stampSeen} alt="Seen" />}
                        {live && <img className="ns-card__stamp ns-card__stamp--playing" src={stampPlaying} alt="Playing" />}
                      </li>
                    );
                  })}
                  <li className="ns-card ns-card--4">
                    <img className="ns-card__bg" src={cardBack} alt="An unturned card: a spirit not met yet" />
                  </li>
                </ul>
              </div>
            </section>

            {/* V · press your seal */}
            <section id="wishlist" className="ns-panel ns-panel--wish" aria-labelledby="ns-wish">
              <div className="ns-panel__text">
                <p className="ns-eyebrow">Chapter V · {clock(CHAPTERS[4].start)}</p>
                <h2 id="ns-wish" className="ns-h2">
                  Press your seal
                </h2>
                <p className="ns-copy">Leave your name on the scroll and we will send word when Nine Strokes is ready to play.</p>
                {sent ? (
                  <p className="ns-done" role="status">
                    Your seal is on the scroll. We will write when the ink is dry.
                  </p>
                ) : (
                  <form id="ns-wish-form" className="ns-form" onSubmit={onSubmit}>
                    <label htmlFor="ns-email">Email</label>
                    <input id="ns-email" type="email" required placeholder="you@example.com" autoComplete="email" />
                  </form>
                )}
                <p className="ns-meta">[PLATFORMS] · [RELEASE WINDOW]</p>
                <a href="#top" className="ns-play" onClick={nav('top')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <path d="M3 4v5h5" />
                  </svg>
                  <span>Roll back to the start</span>
                </a>
              </div>
              <div className="ns-press">
                <img className="ns-decal ns-decal--press" src={decalSpatter} alt="" />
                <button
                  type="submit"
                  form="ns-wish-form"
                  className={`ns-press__seal${sent ? ' is-pressed' : ''}`}
                  disabled={sent}
                  aria-label={sent ? 'Seal pressed' : 'Press your seal to join the wishlist'}
                >
                  <img src={hubPaper} alt="" />
                  <span aria-hidden="true">九</span>
                </button>
                <p className="ns-press__label">{sent ? 'Sealed' : 'Press to wishlist'}</p>
              </div>
              <p className="ns-footer">Nine Strokes is a concept game, made to show the Ink Wheel skin for Video.js.</p>
            </section>

            <div className="ns-rod" aria-hidden="true">
              <span className="ns-rod__bar" />
              <span className="ns-rod__knob ns-rod__knob--a" />
              <span className="ns-rod__knob ns-rod__knob--b" />
            </div>
          </div>
          </div>

          {horizontal && <div className="ns-roll" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}
