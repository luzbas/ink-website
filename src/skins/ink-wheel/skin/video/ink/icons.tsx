/** @jsxImportSource react */

import type { ReactNode } from 'react';

export type SlotId = 'play' | 'back' | 'fwd' | 'vol' | 'cc' | 'chap' | 'speed' | 'quality' | 'pip' | 'fs';

function Svg({ children, size = 26, width = 1.9 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SlotIcon({ id, paused, muted, size }: { id: SlotId; paused?: boolean; muted?: boolean; size?: number }) {
  switch (id) {
    case 'play':
      return paused ? (
        <Svg size={size}>
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </Svg>
      ) : (
        <Svg size={size}>
          <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
          <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
        </Svg>
      );
    case 'back':
      return (
        <Svg size={size}>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <path d="M4.5 4.5v4h4" />
          <path d="M10 10v5M13 10h2v5" />
        </Svg>
      );
    case 'fwd':
      return (
        <Svg size={size}>
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M19.5 4.5v4h-4" />
          <path d="M9 10v5M12 10h2v5" />
        </Svg>
      );
    case 'vol':
      return muted ? (
        <Svg size={size}>
          <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        </Svg>
      ) : (
        <Svg size={size}>
          <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
          <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M18 7a7 7 0 0 1 0 10" />
        </Svg>
      );
    case 'cc':
      return (
        <Svg size={size}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M10.5 10.2H9a1.8 1.8 0 0 0 0 3.6h1.5" />
          <path d="M16.5 10.2H15a1.8 1.8 0 0 0 0 3.6h1.5" />
        </Svg>
      );
    case 'chap':
      return (
        <Svg size={size}>
          <rect x="7" y="4" width="10" height="16" rx="1.5" />
          <path d="M4 7v10" />
          <path d="M20 7v10" />
          <path d="M10 9h4" />
        </Svg>
      );
    case 'speed':
      return (
        <Svg size={size}>
          <path d="M4.5 17a8 8 0 1 1 15 0" />
          <path d="M12 13.5l4-4.5" />
          <circle cx="12" cy="14" r="1" />
        </Svg>
      );
    case 'quality':
      return (
        <Svg size={size}>
          <path d="M5 19v-3M9.67 19v-6M14.33 19v-9M19 19V7" />
          <path d="M3.5 19.5h17" strokeWidth={1.4} />
        </Svg>
      );
    case 'pip':
      return (
        <Svg size={size}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" />
        </Svg>
      );
    case 'fs':
      return (
        <Svg size={size}>
          <path d="M4 9V4h5" />
          <path d="M20 9V4h-5" />
          <path d="M4 15v5h5" />
          <path d="M20 15v5h-5" />
        </Svg>
      );
  }
}

export function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <Svg size={20} width={2.2}>
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </Svg>
  );
}

export function PlayGlyph() {
  return (
    <Svg size={18}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </Svg>
  );
}
