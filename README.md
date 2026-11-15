# Nine Strokes

The landing page of a (fictional) game, an ink-painted yōkai hunt, built on the **Ink Wheel** skin for Video.js v10.
The page is a handscroll (emakimono): on a wide screen, scrolling down slides the painted paper sideways, panel by
panel, while the rolled-up end of the scroll gets thinner. Each panel is one chapter of the 15-second reveal trailer
playing in the Ink Wheel player: the hero with the trailer, The Hunt, The Wheel (the nine strokes around the skin's
own ink wheel), The Seal (a bestiary of the skin's paper cards, stamped as the trailer plays through their chapter)
and Press your seal (a wishlist form with a seal for a button). "Play from" links seek the trailer, and once it has
been played the player follows the reader into a corner as the hero slides away.

On a phone, or with reduced motion, the same panels stack as an ordinary vertical page.

The trailer is streamed from Mux; its chapters and captions VTTs are served from `public/nine-strokes/`.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # type-checks, then outputs to dist/
```

## Deploy (Vercel)

Import this repo in Vercel. `vercel.json` sets it up as a Vite project: build command `npm run build`, output
directory `dist`. No environment variables are needed.

## Structure

- `src/sites/nine-strokes/` — the page (`NineStrokesPage.tsx`), the handscroll (`use-handscroll.ts`), the yōkai
  drawings, its styles and the trailer still
- `src/skins/ink-wheel/skin/` — the Ink Wheel Video.js skin (its standalone repo is
  [ink-game-skin](https://github.com/luzbas/ink-game-skin))
- `public/nine-strokes/` — chapters and captions for the Nine Strokes trailer

Nine Strokes is a concept game, made to show the Ink Wheel skin.
