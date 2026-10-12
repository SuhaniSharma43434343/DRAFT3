/**
 * fx-core barrel. The single import surface for every vbt-fx-* skill:
 *
 *
 * NO top-level 'use client' here, deliberately: the directive would turn every
 * barrel consumer (types, oklab, palette - all server-safe) into a client
 * reference and make resolveTier uncallable from a Server Component. Hook
 * callers (useReducedMotion) carry the directive at THEIR call site.
 *
 * Every export is named explicitly. `export *` from both ./types and ./drivers
 * would collide on the driver type names (types.ts re-exports them), and ESM
 * silently DROPS ambiguous star re-exports rather than erroring - a vanishing
 * export is a worse failure than a long file.
 *
 * compose.css cannot ship through a TS barrel: import it directly
 * (`import '.../fx-core/compose.css'`) from the hero's root layout, once.
 */

// ── contract vocabulary (types.ts) ──────────────────────────────────────────
export { Z, PORTER_DUFF_OPERATOR, defineLayer, satisfiesReadBackRule, isTextureLayer } from './types'
export type {
  LayerKind,
  ZIndex,
  ZName,
  BlendMode,
  PorterDuffOperator,
  Tier,
  ActiveTier,
  FxPerTier,
  FxSkillId,
  FxLayer,
  FxLayerInput,
  FxComponentProps,
  FxEngine,
  FxGate,
  FxLicenseCategory,
  FxDependency,
  FxProvenance,
  FxBudget,
  FxConflict,
  FxFallbackRender,
  FxFallback,
  FxA11y,
  FxParamValue,
  FxManifestLayer,
  FxRecipeManifest,
} from './types'

// ── the single shared ticker (law 2) ────────────────────────────────────────
export { subscribe, start, stop, isRunning } from './ticker'
export type { TickFn, Unsubscribe } from './ticker'

// ── the single motion + capability gate ─────────────────────────────────────
export {
  prefersReducedMotion,
  useReducedMotion,
  isCoarsePointer,
  hasWebGL2,
  saveData,
  deviceMemoryLow,
  resolveTier,
} from './motion'
export type { TierGateOptions } from './motion'

// ── the property-driver layer ───────────────────────────────────────────────
export {
  createDriver,
  createExpDecay,
  createOneEuro,
  uniformSink,
  cssVarSink,
  callbackSink,
  shapes,
  clamp,
  clamp01,
  map,
  smoothstep,
} from './drivers'
export type {
  DriverSource,
  DriverSink,
  DriverConfig,
  Driver,
  Remap,
  ShapeFn,
  ShapeName,
  SmoothFn,
  Smoothing,
  TimeSource,
  PointerSource,
  ScrollSource,
  StateSource,
} from './drivers'

// ── colour (Oklab / OKLCH, Ottosson public domain) ──────────────────────────
export {
  srgbToLinear,
  linearToSrgb,
  linearSrgbToOklab,
  oklabToLinearSrgb,
  hexToRgb,
  rgbToHex,
  toRgb,
  oklchToHex,
  mixOklab,
  rampOklab,
  oklabGlsl,
} from './oklab'
export type { Rgb, Oklab, Color } from './oklab'

// ── seeded palette ──────────────────────────────────────────────────────────
export { generatePalette, fnv1a, mulberry32 } from './palette'
export type { Harmony, Palette } from './palette'

// ── the Paper Shaders safety wrapper (the default engine throws; wrap it) ───
