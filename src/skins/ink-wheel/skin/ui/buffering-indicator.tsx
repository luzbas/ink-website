/** @jsxImportSource react */

'use client';

import '../styles/base.css';
import '../styles/audio/theme.css';
import '../styles/video/captions.css';
import '../styles/video/theme.css';
import '../styles/indicators.css';
import { BufferingIndicator as BufferingIndicatorPrimitive } from '@videojs/react';

import { cn, resolveClassName } from '../lib/resolve-class-name';

export type BufferingIndicatorProps = Omit<BufferingIndicatorPrimitive.Props, 'children'>;

export function BufferingIndicator({ className, ...props }: BufferingIndicatorProps = {}) {
  return (
    <BufferingIndicatorPrimitive
      className={(state) => cn('media-buffering-indicator', resolveClassName(className, state))}
      {...props}
    >
      {/* Ink Wheel: an ensō, a brush circle that draws itself, in place of the default spinner. */}
      <span className={'media-buffering-indicator-spinner-icon ink-enso'} aria-hidden="true">
        <span className={'ink-enso-stroke'} />
      </span>
    </BufferingIndicatorPrimitive>
  );
}
