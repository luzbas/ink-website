/** @jsxImportSource react */

'use client';

import '../styles/video/base.css';
import './skin.css';
import '../styles/ink.css';
import type { ComponentProps } from 'react';

import { Container } from '../ui/container';
import { cn } from '../lib/resolve-class-name';

import { VideoHotkeys } from './behaviors/hotkeys';
import { InkStage, type InkStageProps } from './ink/stage';

export type { Orientation } from './ink/layout';

export interface VideoSkinProps extends Omit<NonNullable<ComponentProps<typeof Container>>, 'children'>, InkStageProps {}

/** IM Fell English SC and Inter (SIL Open Font License) from Google Fonts. React hoists the link into the head once. */
const FONT_URL = 'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Inter:wght@400;500;600&display=swap';

/**
 * Ink Wheel: a video player whose controls sit on a painted sumi-ink wheel, like a game's radial menu.
 *
 * - While the video plays, a medium wheel rests in the bottom-right corner and works as it is. Pause (Space, K, a click
 *   on the video or the Pause slot) and the full wheel comes to the middle while the picture turns to grey ink.
 * - Turn the outer ring to scrub from wherever the playhead is: one full turn is the whole video, and it turns freely
 *   from chapter to chapter (a click marks each boundary). With Volume highlighted the ring becomes a 300° volume dial.
 * - Chapters open as paper cards on a 3D carousel, with a frame from each chapter in its window.
 * - The layout follows the video's shape (read from its metadata) and the room it has: wide videos fill the player or,
 *   on a narrow screen, stack above the wheel; tall videos stand beside the wheel on a wide screen.
 *
 * Keys, on top of the usual Video.js ones: [ and ] for the previous and next chapter, Esc to step back out. On the
 * wheel, the arrow keys move between slots and turn the focused ring.
 */
export function VideoSkin({
  children,
  className,
  renderPoster,
  orientation,
  fill,
  rememberProgress,
  progressKey,
  ...props
}: VideoSkinProps = {}) {
  return (
    <Container className={cn('video-skin', 'ink-skin', className)} data-theme="default" data-preset="video" {...props}>
      <link rel="stylesheet" href={FONT_URL} precedence="default" />
      <InkStage
        renderPoster={renderPoster}
        orientation={orientation}
        fill={fill}
        rememberProgress={rememberProgress}
        progressKey={progressKey}
      >
        {children}
      </InkStage>
      <VideoHotkeys />
    </Container>
  );
}
