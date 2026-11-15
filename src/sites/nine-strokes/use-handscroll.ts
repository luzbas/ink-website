import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Wide enough for the sideways scroll (the hero needs room for the title beside a player at least 640 px wide, where
 * the skin keeps its overlay layout), and the viewer has not asked for less motion.
 */
const QUERY = '(min-width: 1180px) and (min-height: 680px) and (prefers-reduced-motion: no-preference)';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * The handscroll: scrolling down slides a long strip of paper sideways inside a pinned viewport. The track is made as
 * tall as the strip is long, so the page's own scrollbar, keyboard and wheel all keep working. The strip moves by
 * scrolling its (overflow-hidden) scroller rather than by a transform, so nothing inside it loses `position: fixed`
 * (the player lifts out of the hero into a corner that way). The progress (0–1) is written to `--p` on the viewport for
 * the shrinking roll; nothing re-renders while scrolling.
 *
 * When the screen is narrow or the viewer prefers reduced motion, `horizontal` is false and the panels simply stack.
 */
export function useHandscroll() {
  const horizontal = useMedia(QUERY);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const distance = useRef(0);
  /** The scrollLeft this hook last set, to tell its own strip scrolls from the browser's. */
  const setLeft = useRef(0);

  const apply = useCallback(() => {
    const track = trackRef.current;
    const scroller = scrollerRef.current;
    const view = viewRef.current;
    if (!track || !scroller || !view) return;
    const d = distance.current;
    const y = window.scrollY - track.offsetTop;
    const p = d > 0 ? Math.min(1, Math.max(0, y / d)) : 0;
    scroller.scrollLeft = p * d;
    setLeft.current = scroller.scrollLeft;
    view.style.setProperty('--p', p.toFixed(4));
  }, []);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const scroller = scrollerRef.current;
    const strip = stripRef.current;
    const view = viewRef.current;
    if (!track || !scroller || !strip || !view) return;
    if (!horizontal) {
      track.style.height = '';
      scroller.scrollLeft = 0;
      view.style.removeProperty('--p');
      distance.current = 0;
      return;
    }
    distance.current = Math.max(0, strip.scrollWidth - scroller.clientWidth);
    track.style.height = `${view.clientHeight + distance.current}px`;
    apply();
  }, [horizontal, apply]);

  useLayoutEffect(() => {
    measure();
    if (!horizontal) return;
    const scroller = scrollerRef.current;
    const ro = new ResizeObserver(measure);
    if (stripRef.current) ro.observe(stripRef.current);
    if (viewRef.current) ro.observe(viewRef.current);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    // The browser scrolls the strip itself when keyboard focus moves to a link off screen: follow it with the page,
    // so the roll, the progress and the page position stay in step.
    const onStripScroll = () => {
      const track = trackRef.current;
      if (!track || !scroller) return;
      if (Math.abs(scroller.scrollLeft - setLeft.current) < 2) return;
      const top = track.offsetTop + scroller.scrollLeft;
      if (Math.abs(window.scrollY - top) > 2) window.scrollTo({ top, behavior: 'auto' });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    scroller?.addEventListener('scroll', onStripScroll, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      scroller?.removeEventListener('scroll', onStripScroll);
    };
  }, [horizontal, measure, apply]);

  /** Scrolls the page so the panel with this id is in view (the start of the scroll for `top`). */
  const goTo = useCallback(
    (id: string) => {
      const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
      const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
      const track = trackRef.current;
      const el = id === 'top' ? null : document.getElementById(id);
      if (!horizontal || !track) {
        if (el) el.scrollIntoView({ behavior, block: 'start' });
        else window.scrollTo({ top: track ? track.offsetTop : 0, behavior });
        return;
      }
      // The strip starts after the mounting strip, which stays over the paper: land each panel just clear of it.
      const inset = parseFloat(getComputedStyle(stripRef.current!).paddingLeft) || 0;
      const left = el ? Math.min(Math.max(0, el.offsetLeft - inset), distance.current) : 0;
      window.scrollTo({ top: track.offsetTop + left, behavior });
    },
    [horizontal],
  );

  return { horizontal, trackRef, viewRef, scrollerRef, stripRef, goTo };
}
