import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { EnquiryForm } from "@/components/EnquiryForm";
import { type BeatKey, spanOf } from "@/components/world/journey";
import {
  about,
  ahead,
  chapters,
  company,
  contact,
  markets,
  nav,
  products,
  strength,
  vision,
  visionary,
} from "@/content/site";

// The page is a column of beats. Each beat is a tall block whose copy pins to the viewport while
// the reader scrolls through it; the world behind (components/world) moves in step. In static mode
// (no WebGL, reduced motion, Data Saver) the same beats collapse into ordinary page flow.
//
// Display type is sized by the .t-* classes in globals.css, not here, because in the journey it
// answers to the window's height as well as its width.

const pad = (n: number) => String(n).padStart(2, "0");

/** Marks a block of copy for the beat's scroll-driven entrance; `d` staggers it. */
const r = (d = 0) => ({ "data-r": "", style: { "--d": d } as CSSProperties });

function Beat({ k, children, className = "" }: { k: BeatKey; children: ReactNode; className?: string }) {
  return (
    <div className={`beat ${className}`} data-beat={k} style={{ "--span": spanOf(k) } as CSSProperties}>
      <div className="beat-pin">
        <div className="wrap">
          <div className="beat-copy">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A still of the chapter's scene. Only static mode shows it; it is never fetched otherwise. */
function Poster({ name }: { name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="poster" src={`/world/${name}.webp`} alt="" width={1600} height={1000} loading="lazy" decoding="async" />;
}

function Head({ id, index, label }: { id: string; index: number; label: string }) {
  return (
    <header {...r(0)} className="mb-6 md:mb-8">
      <p className="label flex items-center gap-3 text-accent-deep">
        <span>{pad(index)}</span>
        <span aria-hidden="true" className="rule" />
      </p>
      <h2 id={`${id}-label`} className="t-head mt-4 font-display">
        {label}
      </h2>
    </header>
  );
}

function Lead({ children, d = 2, className = "" }: { children: ReactNode; d?: number; className?: string }) {
  return (
    <p
      {...r(d)}
      className={`t-lead font-display text-balance ${className}`}
    >
      {children}
    </p>
  );
}

function Prose({ items, d = 3, className = "" }: { items: string[]; d?: number; className?: string }) {
  return (
    <div className={`space-y-4 text-[1rem] leading-[1.65] text-muted md:text-[1.0625rem] md:leading-[1.7] ${className}`}>
      {items.map((p, i) => (
        <p key={p} {...r(d + i)}>
          {p}
        </p>
      ))}
    </div>
  );
}

export default function Home() {
  // Empty values render as "To be confirmed" until the owner supplies them in src/content/site.ts.
  const contactRows: [string, string, string?][] = [
    ["Email", contact.email, contact.email && `mailto:${contact.email}`],
    ["Phone", contact.phone, contact.phone && `tel:${contact.phone.replace(/[^+\d]/g, "")}`],
    ["Office", contact.address],
  ];
  const [bulk, ...otherTransport] = products.note.split(/(?<=\.)\s+/);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-text focus:px-4 focus:py-2 focus:text-ground"
      >
        Skip to content
      </a>

      <header className="site-header">
        <div className="wrap flex h-16 items-center justify-between gap-6">
          <a href="#top" className="flex items-center gap-4" aria-label={company.name}>
            <Image src="/logo.png" alt="" width={960} height={410} loading="eager" className="h-9 w-auto md:h-10" />
            <span className="label hidden border-l border-line pl-4 text-muted sm:inline">General Trading LLC</span>
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="nav-link text-sm">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href="#contact" className="btn btn-solid btn-small">
              Enquire
            </a>
            <details className="relative lg:hidden">
              <summary className="label flex h-10 cursor-pointer list-none items-center border border-line bg-ground/70 px-3">
                Menu
              </summary>
              <nav aria-label="Sections" className="absolute right-0 top-12 w-56 border border-line bg-panel py-2">
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="block px-4 py-3 text-[0.9375rem] hover:bg-ground-2">
                    {n.label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      {/* The journey's index: where the reader is along the route. */}
      <nav data-rail aria-label="Journey" className="rail">
        <ol>
          {chapters.map((c, i) => (
            <li key={c.id}>
              <a href={`#${c.id}`}>
                <span className="rail-label">{c.label}</span>
                <span className="rail-index">{pad(i + 1)}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main id="main">
        {/* 00 · Above the landscape */}
        <section id="top" aria-label={company.name}>
          <Poster name="hero" />
          <Beat k="hero" className="beat-hero">
            <p {...r(0)} className="label text-accent-deep">
              {company.location} · International trading &amp; commodities
            </p>
            <h1
              aria-label={company.tagline.join(" ")}
              className="t-hero mt-5 font-display md:mt-6"
            >
              {company.tagline.map((line, i) => (
                <span key={line} aria-hidden="true" className="line">
                  <span style={{ "--d": 1 + i * 1.6 } as CSSProperties}>
                    {line.replace(/\.$/, "")}
                    <span className="text-accent-deep">.</span>
                  </span>
                </span>
              ))}
            </h1>
            <p {...r(7)} className="mt-6 max-w-[48ch] text-[1.0625rem] leading-[1.65] text-muted md:mt-8 md:text-lg">
              {about.lead}
            </p>
            <div {...r(9)} className="mt-8 flex flex-wrap gap-3">
              <a href="#products" className="btn btn-solid">
                View our products
              </a>
              <a href="#markets" className="btn btn-line">
                Our global markets
              </a>
            </div>
            <dl className="hero-facts">
              {[
                ["Headquartered", company.location],
                ["Networks across", "Middle East · South Asia · Africa"],
                ["Core strength", "Cement clinker and gypsum, through bulk carrier shipments"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label text-accent-deep">{k}</dt>
                  <dd className="mt-1.5 text-[1rem] leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          </Beat>
        </section>

        {/* 01 · Down between the formations */}
        <section id="about" aria-labelledby="about-label">
          <Poster name="about" />
          <Beat k="about.a">
            <Head id="about" index={1} label="About SAV Prime" />
            <Lead>{about.body[1]}</Lead>
          </Beat>
          <Beat k="about.b">
            <Prose items={[about.body[0]]} d={0} />
            <ol className="strata mt-8">
              {about.timeline.map((t, i) => (
                <li key={t.when} {...r(2 + i * 1.5)}>
                  <span className="label text-accent-deep">{t.when}</span>
                  <span className="font-display text-[1.25rem] leading-snug md:text-[1.5rem]">{t.what}</span>
                </li>
              ))}
            </ol>
          </Beat>
        </section>

        {/* 02 · The stockpiles: one station per segment */}
        <section id="products" aria-labelledby="products-label">
          <Poster name="products" />
          <Beat k="products" className="beat-products">
            <Head id="products" index={2} label="Our Products" />
            <p {...r(2)} className="steps-intro max-w-[40ch] text-[1rem] leading-[1.6] text-muted md:text-[1.0625rem]">
              {products.intro}
            </p>
            <ol {...r(3)} className="steps mt-6 md:mt-8">
              {products.segments.map((s, i) => (
                <li key={s.name} className="step">
                  <div className="step-head">
                    <span className="label">{pad(i + 1)}</span>
                    <h3 className="font-display text-[1.125rem] leading-tight md:text-[1.375rem]">{s.name}</h3>
                  </div>
                  <div className="step-body">
                    <ul>
                      {s.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </Beat>
        </section>

        {/* 03 · The warehouse, then out onto the jetty */}
        <section id="strength" aria-labelledby="strength-label">
          <Poster name="strength" />
          <Beat k="strength.a">
            <Head id="strength" index={3} label="Our Strength" />
            <Lead>{strength.lead}</Lead>
            <ul className="values mt-8">
              {strength.values.map((v, i) => (
                <li key={v} {...r(4 + i)}>
                  <span className="label text-accent-deep">{pad(i + 1)}</span>
                  <span className="font-display text-[1.125rem] leading-tight md:text-[1.375rem]">{v}</span>
                </li>
              ))}
            </ul>
          </Beat>
          <Beat k="strength.b">
            <Prose items={strength.body} d={0} />
          </Beat>
          <Poster name="port" />
          <Beat k="strength.c">
            <p {...r(0)} className="label flex items-center gap-3 text-accent-deep">
              <span>Core strength</span>
              <span aria-hidden="true" className="rule" />
            </p>
            <Lead d={1} className="mt-5">
              {bulk}
            </Lead>
            <Prose items={otherTransport} d={3} className="mt-6" />
          </Beat>
        </section>

        {/* 04 · Following the carrier out to sea */}
        <section id="visionary" aria-labelledby="visionary-label">
          <Poster name="visionary" />
          <Beat k="visionary.a">
            <Head id="visionary" index={4} label="Our Visionary" />
            <p {...r(2)} className="t-name font-display">
              {visionary.name}
            </p>
            <p {...r(3)} className="label mt-4 text-muted">
              {visionary.role}
            </p>
            <p {...r(4)} className="mt-6 text-[1rem] leading-[1.65] text-muted md:text-[1.0625rem] md:leading-[1.7]">
              {visionary.lead}
            </p>
          </Beat>
          <Beat k="visionary.b">
            <Prose items={visionary.body} d={0} />
          </Beat>
        </section>

        {/* 05 · The climb */}
        <section id="vision" aria-labelledby="vision-label">
          <Poster name="vision" />
          <Beat k="vision">
            <Head id="vision" index={5} label="Our Vision" />
            <Lead>{vision.lead}</Lead>
            <Prose items={vision.body} d={3} className="mt-6" />
          </Beat>
        </section>

        {/* 06 · The globe */}
        <section id="markets" aria-labelledby="markets-label">
          <Poster name="markets" />
          <Beat k="markets.intro">
            <Head id="markets" index={6} label="Our Global Markets" />
            <Lead>{markets.intro}</Lead>
            <p {...r(4)} className="label mt-8 text-accent-deep">
              Our key markets include:
            </p>
          </Beat>
          {markets.regions.map((region, i) => (
            <Beat key={region.name} k={`markets.${i}` as BeatKey}>
              <p {...r(0)} className="label flex items-center gap-3 text-accent-deep">
                <span>
                  {pad(i + 1)} / {pad(markets.regions.length)}
                </span>
                <span aria-hidden="true" className="rule" />
              </p>
              <h3 {...r(1)} className="t-region mt-4 font-display">
                {region.name}
              </h3>
              <ul className="ledger mt-5 md:mt-7">
                {region.countries.map((c, n) => (
                  <li key={c} {...r(2 + n * 0.6)}>
                    {c}
                  </li>
                ))}
              </ul>
              {i === markets.regions.length - 1 && (
                <p {...r(6)} className="mt-6 text-[1rem] leading-[1.6] text-muted">
                  {markets.note}
                </p>
              )}
            </Beat>
          ))}
        </section>

        {/* 07 · The globe recedes */}
        <section id="ahead" aria-labelledby="ahead-label">
          <Poster name="ahead" />
          <Beat k="ahead.a">
            <Head id="ahead" index={7} label="Looking Ahead" />
            <Prose items={ahead.body} d={2} />
          </Beat>
          <Beat k="ahead.b">
            <p {...r(0)} className="label flex items-center gap-3 text-accent-deep">
              <span>{ahead.objectiveLabel}</span>
              <span aria-hidden="true" className="rule" />
            </p>
            <p {...r(1)} className="t-objective mt-5 font-display text-balance">
              {ahead.objective}
            </p>
          </Beat>
        </section>

        {/* 08 · Enquiry */}
        <section id="contact" aria-labelledby="contact-label" className="enquiry">
          <div className="wrap grid gap-14 py-20 md:py-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <div>
              <header data-fx-reveal="mask-rise">
                <p className="label flex items-center gap-3 text-accent-deep">
                  <span>{pad(8)}</span>
                  <span aria-hidden="true" className="h-px w-12 bg-accent" />
                </p>
                <h2 id="contact-label" className="mt-4 font-display text-[2.5rem] leading-[1.02] md:text-[4.25rem]">
                  Business enquiries
                </h2>
              </header>
              <p data-fx-reveal="mask-rise" className="mt-8 font-display text-[1.375rem] leading-snug md:text-[1.625rem]">
                {company.name}
              </p>
              <p data-fx-reveal="mask-rise" className="mt-2 text-muted">
                {company.location}
              </p>
              <dl data-fx-reveal="mask-rise" className="ledger mt-9">
                {contactRows.map(([label, value, href]) => (
                  <div key={label}>
                    <dt className="label text-accent-deep">{label}</dt>
                    <dd>
                      {value ? (
                        href ? (
                          <a className="underline decoration-accent underline-offset-4" href={href}>
                            {value}
                          </a>
                        ) : (
                          value
                        )
                      ) : (
                        <span className="text-muted">To be confirmed</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div data-fx-reveal="mask-rise">
              <EnquiryForm
                email={contact.email}
                commodities={products.segments.map((s) => s.name)}
                regions={markets.regions.map((m) => m.name)}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap flex flex-col gap-8 py-12 md:flex-row md:items-end md:justify-between">
          <div>
            <Image src="/logo.png" alt="" width={960} height={410} loading="eager" className="h-14 w-auto" />
            <p className="mt-6 font-display text-2xl">{company.name}</p>
            <p className="mt-3 max-w-[40ch] text-muted">{company.tagline.join(" ")}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="nav-link text-sm">
                {n.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="wrap label py-5 text-muted">
            © {new Date().getFullYear()} {company.name} · {company.location}
          </p>
        </div>
      </footer>
    </>
  );
}
