// Small ink drawings for the bestiary cards: four yōkai from Japanese folklore, drawn as blots of sumi ink.

const INK = '#141210';
const PAPER = '#EDE8DF';
const RED = '#D9472B';

export type YokaiName = 'kitsune' | 'kappa' | 'chochin' | 'umibozu';

export function Yokai({ name, label }: { name: YokaiName; label: string }) {
  return (
    <svg viewBox="0 0 150 170" role="img" aria-label={label} className="ns-card__art">
      {name === 'kitsune' && (
        <>
          <path d="M45 100 C40 66 58 50 75 50 C92 50 110 66 105 100 C100 130 50 130 45 100Z" fill={INK} />
          <path d="M50 70 L46 30 L70 56Z M100 70 L104 30 L80 56Z" fill={INK} />
          <path d="M100 124 C142 116 148 72 126 54 C138 88 122 110 96 112Z" fill={INK} />
          <path d="M58 90 L70 94 M92 90 L80 94" stroke={RED} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {name === 'kappa' && (
        <>
          <path d="M35 104 C35 70 55 56 75 56 C95 56 115 70 115 104 C115 138 35 138 35 104Z" fill={INK} />
          <ellipse cx="75" cy="58" rx="28" ry="9" fill={PAPER} stroke={INK} strokeWidth="4" />
          <circle cx="62" cy="92" r="8" fill={PAPER} />
          <circle cx="88" cy="92" r="8" fill={PAPER} />
          <circle cx="63" cy="94" r="3.5" fill={INK} />
          <circle cx="89" cy="94" r="3.5" fill={INK} />
          <path d="M66 108 L75 120 L84 108Z" fill={RED} />
        </>
      )}
      {name === 'chochin' && (
        <>
          <rect x="56" y="22" width="38" height="12" rx="2" fill={INK} />
          <path d="M46 34 C30 66 30 118 46 144 L104 144 C120 118 120 66 104 34Z" fill={INK} />
          <path d="M38 64 Q75 72 112 64 M34 92 Q75 100 116 92 M38 120 Q75 128 112 120" stroke={PAPER} strokeWidth="2" fill="none" opacity="0.4" />
          <ellipse cx="75" cy="76" rx="13" ry="15" fill={PAPER} />
          <circle cx="77" cy="79" r="5" fill={INK} />
          <path d="M54 108 Q75 124 96 108" stroke={PAPER} strokeWidth="3" fill="none" />
          <path d="M71 115 Q82 140 70 152 Q64 132 71 115Z" fill={RED} />
        </>
      )}
      {name === 'umibozu' && (
        <>
          <path d="M15 160 C15 72 45 30 75 30 C105 30 135 72 135 160Z" fill={INK} />
          <circle cx="60" cy="72" r="4.5" fill={PAPER} />
          <circle cx="90" cy="72" r="4.5" fill={PAPER} />
          <path d="M0 150 Q20 136 40 150 T80 150 T120 150 T160 150" stroke={PAPER} strokeWidth="5" fill="none" />
        </>
      )}
    </svg>
  );
}
