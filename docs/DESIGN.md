# Hamster Nap: implemented design

## Overview

An English, mobile-first page for an unofficial Sepolia last-buyer game. The implemented character is a quiet hamster bedroom: a navy canvas, warm cream type, a pale gold primary action, a local sleeping-hamster illustration and restrained mint/lilac status cues. Dense contract data stays readable beside plain action labels.

The source of truth is `web/src/styles.css`, with composition in `App.tsx`, `Trade.tsx` and `Wallet.tsx`. The design is deliberately dark-only; there is no theme toggle. This document is under `docs/` because the assignment’s overriding path budget forbids creating a root `DESIGN.md`.

## Colors

Primitive and semantic variables are declared at `styles.css:1`. The canonical notation is sRGB hex. Components use semantic roles; illustration colors are contained in the local SVG.

| Role                       | Token                             | Implemented value |
| -------------------------- | --------------------------------- | ----------------- |
| Page                       | `--color-bg` → `--night-950`      | `#141923`         |
| Panels                     | `--color-surface` → `--night-900` | `#191f2b`         |
| Inputs / selected controls | `--color-input` → `--night-800`   | `#222a38`         |
| Structural borders         | `--color-border` → `--night-700`  | `#303b4d`         |
| Primary text               | `--color-text` → `--cream-100`    | `#f5f0e4`         |
| Secondary text             | `--color-muted` → `--night-300`   | `#adb7c9`         |
| Primary fill / links       | `--color-accent` → `--gold-300`   | `#f3ce85`         |
| Hover / focus              | `--color-accent-hover`, `--focus` | `#ffe1a8`         |
| Text on primary            | `--color-on-accent`               | `#141923`         |
| Settled / running          | `--color-success`                 | `#a5dec6`         |
| Errors                     | `--color-error`                   | `#ffb1ae`         |

The scene uses `#202636`; resting and crescent decorations use `#d2bfea`. Settled meter segments use `#2b3d3c`. Labels/checkmarks carry meaning alongside color. There are no gradients or text shadows.

Actual browser-computed contrast measurements are in `frontend/render-evidence.json`: body 15.48:1, muted intro 8.71:1, primary button 11.72:1, muted panel data 8.17:1, scene heading 13.27:1, scene link 10.04:1. The pinned probe passed its contrast threshold for all measured text. These are measurements of the inspected states, not a claim about every possible future state.

## Typography

The local `web/src/nunito-latin.woff2` is Nunito’s Latin variable upright face, with `ui-rounded, system-ui, sans-serif` fallbacks. The page uses 400 for prose, 600 for controls/data/section headings and 800 for the main headline. The `@font-face` weight range is 400–800; browser checks confirmed loading at the three used weights. No italic face is requested.

The six semantic sizes are `--text-sm` 0.875rem (14px), `--text-base` 1rem (16px), `--text-lg` 1.25rem (20px), `--text-xl` 1.5rem (24px), `--text-2xl` 2rem (32px), and `--text-display` 3rem (48px), at the default root size. The desktop headline is 48px/1.1/800 with -0.035em tracking; mobile uses 32px. Section headings use 24px or 20px/1.25/600. Body line height is 1.5; longer instruction text uses 1.6. Inputs remain at least 24px on mobile.

Headings balance their wrapping, short descriptions use pretty wrapping, long IDs can break, and changing numeric values use `font-variant-numeric: tabular-nums`. There are no tracked uppercase section labels. Instruction paragraphs have bounded measures. Full checksummed addresses remain available in explorer links, accessible names/tooltips and copy controls even when the displayed address is shortened.

## Layout

The main content, header and footer share a 1200px maximum width. Desktop padding is 2rem, reduced to 1.5rem at 64rem and 1rem at 46rem. Common grouping gaps are 0.5, 0.75, 1, 1.5, 2 and 3rem. Small custom icon gaps are optical adjustments, not an extra spacing system.

At desktop the arena is a two-column `1.45fr / 1fr` grid with a 1.5rem gap. The live scene/pot occupy the leading column; the trade panel occupies the other column and spans both grid rows. The nap meter is below the game board. At 64rem the ratio becomes `1.2fr / 1fr`, with tighter gaps and stacked game stats. At 46rem the arena becomes a single column in this order: game board, trade, nap meter. The mobile scene is shorter, its secondary paragraph is hidden, and the long smart-wallet explanation stays after the main action.

At 22rem the header and small data gaps tighten further. Header controls can wrap; the footer’s brand can wrap under text enlargement. The meter segments can wrap their contents instead of forcing horizontal overflow. Native text containers grow rather than clipping content.

The final export was inspected at 320, 390, 768 and 1440 CSS pixels. At 390 × 844, the main button’s measured bottom is 822.70px; the product, pot and wallet control are all visible. Long numeric balances, a full address and 200% root text enlargement were tested separately without horizontal overflow. This was text enlargement, not native browser zoom.

## Elevation & Depth

The page uses flat tonal surfaces instead of shadows. Borders identify fields, selected/control boundaries and section separators. The wallet dialog uses a 65% black backdrop and the browser’s modal top layer. The skip link has z-index 20 and becomes visible only on focus. The hamster SVG is a decorative scene layer with pointer events disabled; text sits on an opaque scene background.

## Shapes

`--radius` is 1.5rem for major panels. Primary buttons, the amount field and segmented-control shell use 1rem corners; secondary controls and wallet rows use 0.85rem. Selected segments use 0.75rem. Status dots are circular. The game board clips only its scene boundary. Controls remain inset from the viewport and never use a screen-edge action bar.

## Components

- **Wallet (`web/src/Wallet.tsx`)**: outlined header trigger; named EIP-6963 rows; branded local icons; mobile wallet-browser rows; connected address/disconnect view; wrong-chain switch action. A native named `<dialog>` traps focus and makes the background inert. Escape, backdrop and the close control dismiss it; focus returns to its trigger. At widths below 46rem it is a bottom sheet with safe-area padding. Rows are at least 52px.
- **Trade (`web/src/Trade.tsx`)**: segmented buy/sell selection, labeled decimal amount, quote/output/rate, slippage selector, frozen transaction review, primary action and credit notice. Controls progress through connect, switch, approve, allow, review and confirm. Disabled states have adjacent explanations. All signing/receipt operations lock immediately and show local status.
- **TxFeedback (`Trade.tsx`) / useTransaction (`transactions.ts`)**: stable polite status region, persistent local error, explorer link, separate state per action. A synchronous lock covers wallet prompt through confirmed/refetched state.
- **Game board and nap meter (`App.tsx`)**: API state text/dot, labeled illustration, authoritative pot, latest buyer and buy age; three certified round segments, frontier, scan position and refresh control. Unknown data is never styled as a measured zero.
- **Claims pattern (`App.tsx`)**: primary nap processing plus a native disclosure for credits, pot claim redemption and the failsafe. Balances, timing, eligibility and transaction feedback stay with the relevant control.
- **AddressLink (`App.tsx`)**: checksummed short display, full accessible name, explorer link and copy feedback. Long values wrap in supporting views.
- **Buttons / links (`styles.css`)**: pale gold filled `.primary`, neutral bordered `.secondary`, underlined `.text-button` and `.copy`, named `.icon-button`. Primary controls are at least 48px, standard actions at least 44px; inline links/copy controls use the spaced inline pattern. Hover is gated by pointer support. Keyboard focus uses an explicit 2px gold outline with 4px offset.

Interactive transitions last 120ms with `cubic-bezier(.2,0,0,1)`, and press scale is 0.96. Motion is enabled only under `prefers-reduced-motion: no-preference`. Reduced motion removes smooth scrolling; there is no autoplay, entrance sequence or endless animation.

## Do’s and Don’ts

Reuse the shared content edges, semantic tokens, type scale and button classes when adding an adjacent view. Start with native headings, labels, links and disclosures; connect transaction controls to the existing verification and pending-state pattern. Keep data units and qualifiers beside the value they explain.

Keep API activity distinct from certified round data, and keep the manifest as the only runtime deployment map. Do not add a second address/RPC file, fictional live values, USD prices without an authorized source, a video-like treatment for the illustration, competing filled action colors, owner controls or an unrequested theme switch.

The documented system was extracted from the final source/export. Native screen-reader sessions, physical phone handoffs, browser-native zoom, forced-colors rendering and slow-motion animation-panel inspection remain unperformed; see `frontend/VALIDATION.md` for the review coverage and limits.
