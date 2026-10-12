/**
 * vbt-ref-fx-core / types.ts
 *
 * The canonical types every vbt-fx-* skill imports.
 *
 * Authority is references/layer-contract.md. Where this file and that document
 * disagree, the document wins and this file is the bug.
 *
 * Pure types plus a handful of consts and identity helpers. Zero side effects on
 * import: nothing here reads `window`, `document`, `navigator`, or the GPU, so it
 * is safe in an RSC / SSR / Node script graph.
 */

// Type-only import. Erased at compile time, emits no runtime `require`/`import`.
import type { ReactNode } from 'react'

/* ────────────────────────────────────────────────────────────────────────────
   1. The layer boundary
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The contract's spine. Every layer is exactly one of these.
 *
 * 'dom'     an element in the page, composited by the browser.
 * 'texture' an R3F <Layer> inside the shared <FxCanvas>, composited by us.
 *
 * A 'texture' layer exports an R3F node and never its own <canvas> (law 1: one
 * canvas per hero). A 'dom' layer can never read the pixels beneath it.
 */
export type LayerKind = 'dom' | 'texture'

/** The z-stack is closed. A tenth layer is a design conversation, not a number. */
export type ZIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * The named z-stack. layer-contract §1.
 *
 * `scroll` and `reveal` are absent on purpose: they drive other layers' progress
 * and own no z-index. A cross-cutting skill that claims one is a bug.
 */
export const Z = {
  /** vbt-fx-backdrop. Full-bleed, always present. */
  BACKDROP: 0,
  /** vbt-fx-webgl-3d | vbt-fx-motion-video | <img>. Optional source imagery. */
  PLATE: 1,
  /** vbt-fx-cursor. Reads z1, writes a flowmap uniform. */
  DISPLACEMENT: 2,
  /** vbt-fx-dither. Reads the z0+z1+z2 composite, so always 'texture'. */
  QUANTIZE: 3,
  /** vbt-fx-postfx. Additive, and always after QUANTIZE (law 4). */
  LIGHT: 4,
  /** vbt-fx-grain. Absolute last, blend 'soft-light'. */
  GRAIN: 5,
  /** vbt-fx-type. DOM, never inside the canvas (law 3). */
  TYPE: 6,
  /** vbt-fx-wordmark. DOM/SVG. */
  WORDMARK: 7,
  /** vbt-fx-avatars. DOM. */
  SOCIAL_PROOF: 8,
} as const satisfies Record<string, ZIndex>

/** Judgement call: the contract writes z4 as "LIGHT/DECAY"; a slash is not an identifier. */
export type ZName = keyof typeof Z

/**
 * Exactly five. W3C Compositing and Blending Level 1, under the W3C Software and
 * Document License. Provenance is the spec, never an implementation: we do not
 * vendor anyone's blend-mode file.
 *
 * PHOENIX and HARD_MIX will never appear in a paid template. Do not add them.
 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light'

/**
 * The only Porter-Duff operator we ship. Exported so the assembler can name it
 * rather than assume it. `destination-atop` is not art direction, it is a bug
 * that looks intentional.
 */
export const PORTER_DUFF_OPERATOR = 'source-over' as const
export type PorterDuffOperator = typeof PORTER_DUFF_OPERATOR

/**
 * 'off'  poster only. Forced by any gate in FxGate.
 * 'low'  dpr 1, half-res FBO, effect count <= 2, frameloop 'demand'.
 * 'high' dpr [1,2], full stack; PerformanceMonitor auto-regresses to 'low' on frame drop.
 *
 * The numbers above are global and owned by the FxCanvas, not by a recipe. A
 * recipe declares its cost (FxBudget) and its gates (FxGate), never its own dpr.
 */
export type Tier = 'off' | 'low' | 'high'

/** The tiers that actually render. 'off' has no cost because it has no frame. */
export type ActiveTier = Exclude<Tier, 'off'>

/** A value measured or configured per rendering tier. */
export type FxPerTier<T> = { readonly [K in ActiveTier]: T }

/** Layer-owning skills only. vbt-ref-fx-core is not a layer and does not match. */
export type FxSkillId = `vbt-fx-${string}`

/**
 * A layer in an assembled hero. Field-for-field as written in layer-contract §7.
 * Do not reorder, rename, or add to this without changing the contract first.
 */
export interface FxLayer {
  id: string
  skill: FxSkillId
  z: ZIndex
  kind: LayerKind
  blend: BlendMode
  /** true implies kind MUST be 'texture'. See ReadBackRule / satisfiesReadBackRule. */
  readsBeneath: boolean
  tier: Tier
}

/* ────────────────────────────────────────────────────────────────────────────
   2. The read-back assertion: readsBeneath: true implies kind: 'texture'
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Compile-time half of the assertion, expressed as the shape of a layer rather
 * than a check bolted onto one: a 'dom' layer simply has nowhere to put
 * `readsBeneath: true`.
 *
 * There is no CSS floor for a read-back effect. mix-blend-mode blends, but it
 * never hands you the composited pixels as an input you can quantize, so an
 * effect that must read what is underneath is 'texture', full stop.
 *
 * Assignable to FxLayer in every case; FxLayer stays the wire type.
 */
export type FxLayerInput =
  | (Omit<FxLayer, 'kind' | 'readsBeneath'> & { kind: 'texture'; readsBeneath: boolean })
  | (Omit<FxLayer, 'kind' | 'readsBeneath'> & { kind: 'dom'; readsBeneath: false })

/**
 * Identity function. Exists only so tsc enforces the read-back rule on layers
 * authored in TypeScript: `defineLayer({ ..., kind: 'dom', readsBeneath: true })`
 * fails to compile, where the same literal typed as FxLayer would not.
 */
export function defineLayer(layer: FxLayerInput): FxLayer {
  return layer
}

/**
 * Runtime half. Manifests arrive as parsed JSON, where tsc cannot help, so the
 * assemble gate needs a value-level check. Callers decide how to fail; this file
 * does not throw. `scripts/manifest-check.mjs` enforces the same rule at the
 * schema level and is the authoritative gate.
 */
export function satisfiesReadBackRule(layer: Pick<FxLayer, 'kind' | 'readsBeneath'>): boolean {
  return !layer.readsBeneath || layer.kind === 'texture'
}

/** Narrowing guard for the assembler's dom/texture partition. */
export function isTextureLayer<L extends Pick<FxLayer, 'kind'>>(
  layer: L,
): layer is L & { kind: 'texture' } {
  return layer.kind === 'texture'
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Component surface
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every vbt-fx-* component extends this.
 *
 * `tier` is a ceiling, not an instruction. Self-gating is mandatory in the
 * component, never in the caller: passing 'high' must still resolve to 'off'
 * under prefers-reduced-motion or a missing WebGL context.
 */
export interface FxComponentProps {
  tier?: Tier
  /** Rendered at tier 'off'. For canvas-bearing layers this is the poster, and it is the LCP element. */
  fallback?: ReactNode
}

/* ────────────────────────────────────────────────────────────────────────────
   4. Drivers
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * drivers.ts owns the driver contract; this file only re-exports it so there is
 * exactly ONE definition of each name package-wide. The tick shape is ticker.ts's
 * positional `(dt, elapsed)`, both in SECONDS. An earlier draft defined a second,
 * incompatible driver-type model here; that is the "reimplemented twelve times,
 * inconsistently" failure this skill exists to prevent, so the types now live
 * with their implementation.
 */
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
export type { TickFn, Unsubscribe } from './ticker'

/* ────────────────────────────────────────────────────────────────────────────
   5. The recipe manifest
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The primary renderer for a layer. This is a lookup in engine-matrix.md, not a
 * judgement. Every name here is pinned in versions.md; `deps` carries the full
 * install list when a recipe needs more than one.
 *
 * 'paper' is the default (law 5). It is reached only through PaperSafe.tsx:
 * @paper-design/shaders-react throws when getContext('webgl2') returns null and
 * has no WebGL1 fallback, so an unwrapped import kills the whole hero.
 *
 * 'glsl' is the escalation of last resort, legal only when a named Paper
 * parameter does not exist.
 */
export type FxEngine =
  | 'css'
  | 'dom'
  | 'svg'
  | 'paper'
  | 'r3f'
  | 'postprocessing'
  | 'ogl'
  | 'gsap'
  | 'motion'
  | 'lenis'
  | 'glsl'

/**
 * A condition that forces tier 'off'. Any one true means poster only, never a
 * degraded render. These are exactly the triggers named in the contract.
 */
export type FxGate =
  /** matchMedia('(prefers-reduced-motion: reduce)') */
  | 'prefers-reduced-motion'
  /** No WebGL context obtainable. */
  | 'no-webgl'
  /** navigator.connection.saveData */
  | 'save-data'
  /** navigator.deviceMemory < 4 */
  | 'low-memory'
  /** matchMedia('(pointer: coarse)'). Cursor fx only: touch has no hover, so off, not degraded. */
  | 'coarse-pointer'

/** IP firewall categories. 'red' must never reach a shipped manifest. */
export type FxLicenseCategory = 'green' | 'amber' | 'red'

/**
 * One dependency, with the licence as actually read at source. SPDX scanners are
 * unreliable in both directions, so `license` records what a human read, and
 * `source` records where. Pre-1.0 packages pin exact.
 */
export interface FxDependency {
  /** npm specifier, or the URL of a vendored source file. */
  readonly name: string
  /** Exact for anything below 1.0.0. */
  readonly version: string
  /** SPDX id, or 'SEE-SOURCE-HEADER' where the grant lives in the file and not a root LICENSE. */
  readonly license: string
  /**
   * green | amber only. There is no 'red' here on purpose: a red dependency is
   * not a manifest that fails validation, it is a manifest that cannot be
   * written. FxLicenseCategory keeps 'red' because license-check.mjs must be
   * able to classify a dep as red in order to reject it before it reaches here.
   */
  readonly category: Exclude<FxLicenseCategory, 'red'>
  /** URL of the licence text actually read. */
  readonly source?: string
  /** ISO 8601 date the licence was verified at source. */
  readonly verified_at: string
  /** Required for 'amber': state the specific scope limit being respected. */
  readonly note?: string
}

/**
 * Where the technique came from and how it was obtained. The load-bearing field:
 * it is what makes a template sellable. Vocabulary is the schema's, verbatim:
 *
 * 'paper'        a published paper. The maths is not copyrightable; the author's code is
 * 'spec'         derived from a published spec, never from an implementation of it
 * 'article'      a post or talk. Cite it even when the idea feels obvious afterwards
 * 'upstream-oss' vendored verbatim from a green-listed upstream, notice preserved
 * 'clean-room'   reimplemented from the maths, with the original never opened
 * 'original'     ours
 */
export interface FxProvenance {
  readonly source_type: 'paper' | 'spec' | 'article' | 'upstream-oss' | 'clean-room' | 'original'
  /** What was actually read, in a form a human can chase. 'inspired by X' is not a citation. */
  readonly citation: string
  /** Optional only for 'original', which has nothing to point at. */
  readonly url?: string
  /** SPDX id of the source, or the licence name where no SPDX id exists. 'PUBLIC-DOMAIN' for mathematics. */
  readonly license: string
  /** ISO 8601 date. */
  readonly verified_at: string
  /** Where a licence is scoped rather than simply granted, name the scope. */
  readonly note?: string
}

/** Measured cost, summed by the assemble gate before a build is allowed. */
export interface FxBudget {
  /** GPU milliseconds per frame at each active tier, on the reference device. */
  readonly gpu_ms: FxPerTier<number>
  /** Added client bytes, gzipped. */
  readonly bytes?: number
  /**
   * 'none': paints after LCP. 'poster': this layer's poster is the LCP element
   * (correct for any canvas-bearing layer). 'blocking': on the LCP critical
   * path, legal only for DOM layers (type, wordmark) — never for a canvas.
   */
  readonly lcp_impact: 'none' | 'poster' | 'blocking'
}

/** A pairing the assemble gate must reject, with the reason a human can act on. */
export interface FxConflict {
  readonly skill: FxSkillId
  readonly reason: string
  /** How to ship both anyway, where that exists. Absent means the pairing is simply illegal. */
  readonly resolution?: string
}

/** What renders when a gate fires. Keys correspond to entries in `gates`. */
export type FxFallbackRender = 'poster' | 'static' | 'css-floor' | 'off'

export interface FxFallback {
  readonly reduced_motion?: FxFallbackRender
  readonly coarse_pointer?: FxFallbackRender
  readonly no_webgl?: FxFallbackRender
  readonly save_data?: FxFallbackRender
  readonly low_memory?: FxFallbackRender
}

/** Both fields are assertions a human makes, not defaults a manifest drifts past. */
export interface FxA11y {
  readonly contrast_guard: boolean
  readonly motion_pauses: boolean
}

/**
 * A recipe param value. Colours never appear as bare hex literals: they come from
 * CSS custom properties or a '{{dtp.*}}' token, enforced by the schema.
 */
export type FxParamValue = string | number | boolean | null | readonly FxParamValue[] | { readonly [k: string]: FxParamValue }

/**
 * The tier 'off' render, and the LCP element for any canvas-bearing layer. The
 * canvas paints late and must never be the LCP.
 */
export interface FxPoster {
  readonly src: string
  readonly width: number
  readonly height: number
  /** Decorative posters take ''. */
  readonly alt?: string
}

/**
 * The JSON mirror of FxLayer. Deliberately snake_case: the contract writes
 * `requires_canvas` and `gpu_ms` for manifest fields and camelCase `readsBeneath`
 * for the runtime type, so the casing boundary is the JSON boundary. The
 * assembler maps FxManifestLayer to FxLayer; it does not pass one as the other.
 */
export interface FxManifestLayer {
  readonly z: ZIndex
  readonly kind: LayerKind
  readonly blend: BlendMode
  /** true implies kind 'texture'. Rejected at the schema level, not just here. */
  readonly reads_beneath: boolean
}

/**
 * A recipe, as the harness reads it. Mirrors schemas/fx.manifest.schema.json
 * field-for-field; every field is JSON-serializable. The schema is the gate and
 * therefore the authority: if this type and the schema disagree, the schema wins
 * and this type is the bug.
 */
export interface FxRecipeManifest {
  readonly $schema?: string
  /** Stable, unique within a hero. Becomes FxLayer.id. */
  readonly id: string
  readonly skill: FxSkillId
  /** semver of the recipe itself, not of its deps. */
  readonly version: string
  readonly title?: string
  readonly description?: string
  /** Repo-relative path to the .tsx component the assembler imports. */
  readonly component: string

  /**
   * Absent ONLY for the two cross-cutting skills (scroll, reveal), which drive
   * other layers' progress and own no layer at all. Every other skill owns
   * exactly one. The schema enforces the conditional.
   */
  readonly layer?: FxManifestLayer
  /**
   * true means the layer needs a WebGL context, so it exports an R3F <Layer> and
   * is merged into the single shared <FxCanvas>. Implies layer.kind 'texture'.
   * A component that mounts its own <canvas> cannot be merged and dies on mobile.
   */
  readonly requires_canvas: boolean
  readonly engine: FxEngine
  /** The licence THIS recipe ships under ('PROPRIETARY' for sold templates), not its deps'. */
  readonly license: string

  /** Tuneable surface. Values may be literals or '{{dtp.*}}' token refs. Never a bare hex. */
  readonly params?: { readonly [k: string]: FxParamValue }
  /** Advisory ranking of known-good pairings. Does not gate a build. */
  readonly composes_with?: readonly FxSkillId[]
  /** Load-bearing: pairings the assemble gate must reject. */
  readonly conflicts_with?: readonly FxConflict[]

  /** Any gate true forces tier 'off'. The component self-gates on these. */
  readonly gates: readonly FxGate[]
  readonly budget: FxBudget
  /** Required whenever requires_canvas is true; the schema enforces the conditional. */
  readonly poster?: FxPoster
  /** What renders when each gate fires. Keys correspond to `gates` entries. */
  readonly fallback?: FxFallback
  readonly a11y: FxA11y

  readonly deps: readonly FxDependency[]
  readonly provenance: FxProvenance
}
