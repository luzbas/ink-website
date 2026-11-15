/** @jsxImportSource react */

'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * A blurred, dimmed copy of the video behind a tall video on a wide player, so the sides glow with the picture instead
 * of sitting in black bars. It copies a tiny frame a few times a second; the blur hides how small it is.
 */
export function Ambient({ screenRef, on }: { screenRef: RefObject<HTMLElement | null>; on: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!on) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    let timer = 0;
    const draw = () => {
      const video = screenRef.current?.querySelector('video');
      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          /* a frame we cannot read: keep the last one */
        }
      }
      timer = window.setTimeout(draw, 250);
    };
    draw();
    return () => window.clearTimeout(timer);
  }, [on, screenRef]);

  return <canvas ref={canvasRef} className={'ink-ambient'} width={36} height={20} aria-hidden="true" data-on={on ? '' : undefined} />;
}
