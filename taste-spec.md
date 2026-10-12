# SAV Prime — taste spec: Monumental Earth

The site is one continuous, scroll-driven camera move through the physical world of the trade:
rock formations, a canyon, stockpiles of the commodities the company lists, a bulk warehouse, a jetty
and bulk carrier, open sea, and finally a stone globe carrying the company's routes. The copy is set
over it as a column of pinned "beats". Tokens live in `src/app/globals.css`; the world's material
colours live in `PALETTE` in `src/components/world/kit.ts`.

## Colour
| Token | Hex | Role |
|---|---|---|
| ground | #F4EFE6 | warm ivory: page ground, haze, scrim |
| ground-2 | #E9E1D3 | limestone beige: footer, alternate band |
| panel | #FBF8F2 | menus |
| sandstone | #CBB594 | material reference |
| steel | #8B949A | muted steel grey |
| text | #454A4D | charcoal: all type on light surfaces |
| muted | #666B6D | secondary text (AA on ivory) |
| accent | #C9A962 | SAV Prime gold: rules, the route line, marks. Never small text |
| accent-deep | #7D6124 | the same gold, deep enough for labels on ivory (AA) |

Gold is the only accent and is used sparingly. In the 3D world the gold is the route line and the
globe's arcs, nothing else. Everything else is the natural colour of the material it depicts.

Logo: `public/logo.png` (slate wordmark, light grounds). `public/logo-mark.png`, `src/app/icon.png`.

## Type (all OFL, via next/font)
- Display: Marcellus 400, a Roman inscriptional face. Headlines, leads, names.
- Text: Hanken Grotesk 400/500/600.
- Labels: IBM Plex Mono, uppercase, 0.16em tracking, 11 px.

## Layout
- 1200 px container, 20 px gutter on mobile, 40 px from 768.
- Wide screens: copy in the left third on an ivory scrim, the scene pushed right (the camera's view is
  offset, not turned). Tall screens: copy at the foot of the screen, the scene above it.
- Lists are ruled ledgers, not cards. Radius 0. No shadows, no glass.

## Motion
- Scroll is native. Journey time = beat index + progress through that beat; a critically damped copy
  of it flies the camera along one spline (`src/components/world/journey.ts`).
- Copy enters by a top-down wipe with a rise, and leaves the same way, tied to its beat.
- In-page links cut through the haze instead of flying the whole route.
- The gold route line is drawn by scroll and is continuous from the first formation to Dubai on the globe.
- Static mode (no WebGL2, `prefers-reduced-motion`, Data Saver, under 4 GB memory, or `?static`):
  normal page flow, each chapter opened by a still of its scene from `public/world`.

## Never
Neon, cyberpunk glows, purple gradients, card grids, glass, emoji icons, stock photos, lorem ipsum;
invented metrics, clients, certifications, testimonials, vessels or facilities presented as the
company's own. All copy comes from `content/sav-prime-content.md` via `src/content/site.ts`. The 3D
scenes depict only commodities the content names.
