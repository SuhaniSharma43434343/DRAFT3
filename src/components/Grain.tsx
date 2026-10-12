// Film grain, after the hero kit's GrainOverlay: an feTurbulence tile built once on the server and
// sized in CSS px so the grain keeps its size on high-density screens. The alpha matrix keeps only
// the noise peaks, so it reads as grain without a blend mode. Dark grain, for the ivory ground.
// Styles: .grain in globals.css.
const TILE = 160;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">` +
  `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
  `<feColorMatrix type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.22  0 0 0 0 0.22  1.7 0 0 0 -0.5"/></filter>` +
  `<rect width="${TILE}" height="${TILE}" filter="url(#g)"/></svg>`;

export function Grain() {
  return (
    <div
      aria-hidden="true"
      className="grain"
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundSize: `${TILE}px ${TILE}px`,
      }}
    />
  );
}
