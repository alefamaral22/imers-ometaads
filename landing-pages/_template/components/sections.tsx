// Section renderers — one per the 17-section catalog (mirrors @template/lp-render sections).
// Each reads its validated `fields` from the content-spec artifact. Content is data, not code:
// it was bounded + escaped upstream by the serializer/skill; here we render it as text/JSX.
import type { ReactElement } from 'react';
import type { ContentSpecSection, SectionType } from '../lib/spec';
import { formatCents } from '../lib/spec';

type IconName =
  | 'check'
  | 'star'
  | 'shield'
  | 'bolt'
  | 'heart'
  | 'clock'
  | 'gift'
  | 'trophy'
  | 'lock'
  | 'sparkles';

interface Cta {
  label: string;
  action: 'checkout' | 'url' | 'anchor';
  href?: string;
}

// Page-level context the CTA needs to resolve a "checkout" action to a real URL.
interface PageCtx {
  checkoutUrl?: string;
  currency: string;
}

const ICONS: Record<IconName, string> = {
  check: '✓',
  star: '★',
  shield: '🛡',
  bolt: '⚡',
  heart: '♥',
  clock: '⏰',
  gift: '🎁',
  trophy: '🏆',
  lock: '🔒',
  sparkles: '✨',
};

function Icon({ name }: { name?: IconName | undefined }): ReactElement | null {
  if (name === undefined) return null;
  return (
    <span className="icon" aria-hidden="true">
      {ICONS[name]}
    </span>
  );
}

function ctaHref(cta: Cta, ctx: PageCtx): string {
  if (cta.action === 'checkout') return ctx.checkoutUrl ?? '#';
  return cta.href ?? '#';
}

function CtaButton({
  cta,
  ctx,
  variant = 'primary',
}: {
  cta: Cta;
  ctx: PageCtx;
  variant?: 'primary' | 'secondary';
}): ReactElement {
  return (
    <a className={`btn btn-${variant}`} href={ctaHref(cta, ctx)} data-cta-action={cta.action}>
      {cta.label}
    </a>
  );
}

// --- Per-section field shapes (subset rendered; mirrors the Zod schemas) -------------------

interface HeroFields {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  cta: Cta;
  secondaryCta?: Cta;
  image?: string;
}
interface LogosFields {
  title?: string;
  logos: { alt: string; src: string }[];
}
interface ProblemFields {
  headline: string;
  items: { icon?: IconName; text: string }[];
}
interface SolutionFields {
  headline: string;
  body: string;
  image?: string;
}
interface FeaturesFields {
  headline: string;
  features: { icon?: IconName; title: string; description: string }[];
}
interface BenefitsFields {
  headline: string;
  benefits: { icon?: IconName; text: string }[];
}
interface HowItWorksFields {
  headline: string;
  steps: { title: string; description: string }[];
}
interface TestimonialsFields {
  headline?: string;
  testimonials: { quote: string; author: string; role?: string; avatar?: string }[];
}
interface VideoFields {
  headline?: string;
  embedUrl: string;
  poster?: string;
}
interface PricingFields {
  headline: string;
  plans: {
    name: string;
    priceCents: number;
    period?: string;
    features: string[];
    cta: Cta;
    highlighted?: boolean;
  }[];
}
interface OfferFields {
  headline: string;
  valueItems: { label: string; valueCents: number }[];
  anchorPriceCents?: number;
  priceCents: number;
  cta: Cta;
}
interface FaqFields {
  headline?: string;
  items: { question: string; answer: string }[];
}
interface GuaranteeFields {
  headline: string;
  body: string;
  badge?: string;
}
interface AboutFields {
  headline: string;
  body: string;
  image?: string;
}
interface LeadFormFields {
  headline: string;
  submitLabel: string;
  collectEmail: boolean;
  collectPhone: boolean;
  consentText?: string;
}
interface UrgencyFields {
  headline: string;
  countdownSeconds?: number;
  note?: string;
}
interface FooterFields {
  copyright: string;
  links?: { label: string; href: string }[];
}

// --- Renderers ------------------------------------------------------------------------------

function Hero(f: HeroFields, ctx: PageCtx): ReactElement {
  return (
    <section className="section hero">
      <div className="container">
        {f.eyebrow !== undefined && <p className="eyebrow">{f.eyebrow}</p>}
        <h1>{f.headline}</h1>
        {f.subheadline !== undefined && <p className="lead">{f.subheadline}</p>}
        <div className="cta-row">
          <CtaButton cta={f.cta} ctx={ctx} />
          {f.secondaryCta !== undefined && (
            <CtaButton cta={f.secondaryCta} ctx={ctx} variant="secondary" />
          )}
        </div>
        {f.image !== undefined && (
          <figure className="hero-media">
            <img src={f.image} alt="" loading="eager" />
          </figure>
        )}
      </div>
    </section>
  );
}

function Logos(f: LogosFields): ReactElement {
  return (
    <section className="section logos">
      <div className="container">
        {f.title !== undefined && <p className="muted center">{f.title}</p>}
        <div className="logo-strip">
          {f.logos.map((l, i) => (
            <img key={i} src={l.src} alt={l.alt} className="logo" />
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem(f: ProblemFields): ReactElement {
  return (
    <section className="section problem">
      <div className="container">
        <h2>{f.headline}</h2>
        <ul className="icon-list">
          {f.items.map((it, i) => (
            <li key={i}>
              <Icon name={it.icon} />
              {it.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Text + optional image become a two-column split (image right); without an image it's a plain
// single column. Shared by solution/about so the media treatment is consistent.
function MediaSplit({
  sectionClass,
  headline,
  body,
  image,
}: {
  sectionClass: string;
  headline: string;
  body: string;
  image?: string | undefined;
}): ReactElement {
  if (image === undefined) {
    return (
      <section className={`section ${sectionClass}`}>
        <div className="container">
          <h2>{headline}</h2>
          <p>{body}</p>
        </div>
      </section>
    );
  }
  return (
    <section className={`section ${sectionClass} has-media`}>
      <div className="container media-split">
        <div className="media-copy">
          <h2>{headline}</h2>
          <p>{body}</p>
        </div>
        <figure className="media-figure">
          <img src={image} alt="" loading="lazy" />
        </figure>
      </div>
    </section>
  );
}

function Solution(f: SolutionFields): ReactElement {
  return <MediaSplit sectionClass="solution" headline={f.headline} body={f.body} image={f.image} />;
}

function Features(f: FeaturesFields): ReactElement {
  return (
    <section className="section features">
      <div className="container">
        <h2>{f.headline}</h2>
        <div className="grid">
          {f.features.map((feat, i) => (
            <div key={i} className="card">
              <Icon name={feat.icon} />
              <h3>{feat.title}</h3>
              <p>{feat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits(f: BenefitsFields): ReactElement {
  return (
    <section className="section benefits">
      <div className="container">
        <h2>{f.headline}</h2>
        <ul className="icon-list">
          {f.benefits.map((b, i) => (
            <li key={i}>
              <Icon name={b.icon} />
              {b.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks(f: HowItWorksFields): ReactElement {
  return (
    <section className="section how-it-works">
      <div className="container">
        <h2>{f.headline}</h2>
        <ol className="steps">
          {f.steps.map((s, i) => (
            <li key={i}>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Testimonials(f: TestimonialsFields): ReactElement {
  return (
    <section className="section testimonials">
      <div className="container">
        {f.headline !== undefined && <h2>{f.headline}</h2>}
        <div className="grid">
          {f.testimonials.map((t, i) => (
            <figure key={i} className="card">
              <blockquote>{t.quote}</blockquote>
              <figcaption>
                {t.avatar !== undefined && (
                  <img src={t.avatar} alt="" className="avatar" loading="lazy" />
                )}
                <span>
                  <strong>{t.author}</strong>
                  {t.role !== undefined && <span className="muted"> · {t.role}</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Video(f: VideoFields): ReactElement {
  return (
    <section className="section video">
      <div className="container">
        {f.headline !== undefined && <h2>{f.headline}</h2>}
        <div className="video-frame">
          <iframe src={f.embedUrl} title={f.headline ?? 'video'} allowFullScreen loading="lazy" />
        </div>
      </div>
    </section>
  );
}

function Pricing(f: PricingFields, ctx: PageCtx): ReactElement {
  return (
    <section className="section pricing">
      <div className="container">
        <h2>{f.headline}</h2>
        <div className="grid">
          {f.plans.map((p, i) => (
            <div key={i} className={`card plan${p.highlighted === true ? ' highlighted' : ''}`}>
              <h3>{p.name}</h3>
              <p className="price">
                {formatCents(p.priceCents, ctx.currency)}
                {p.period !== undefined && <span className="muted">/{p.period}</span>}
              </p>
              <ul className="icon-list">
                {p.features.map((feat, j) => (
                  <li key={j}>
                    <Icon name="check" />
                    {feat}
                  </li>
                ))}
              </ul>
              <CtaButton cta={p.cta} ctx={ctx} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Offer(f: OfferFields, ctx: PageCtx): ReactElement {
  const total = f.valueItems.reduce((sum, v) => sum + v.valueCents, 0);
  return (
    <section className="section offer">
      <div className="container">
        <h2>{f.headline}</h2>
        <ul className="value-stack">
          {f.valueItems.map((v, i) => (
            <li key={i}>
              <span>{v.label}</span>
              <span className="muted">{formatCents(v.valueCents, ctx.currency)}</span>
            </li>
          ))}
          <li className="total">
            <span>Valor total</span>
            <span>{formatCents(total, ctx.currency)}</span>
          </li>
        </ul>
        <p className="price">
          {f.anchorPriceCents !== undefined && (
            <s className="muted">{formatCents(f.anchorPriceCents, ctx.currency)}</s>
          )}{' '}
          <strong>{formatCents(f.priceCents, ctx.currency)}</strong>
        </p>
        <CtaButton cta={f.cta} ctx={ctx} />
      </div>
    </section>
  );
}

function Faq(f: FaqFields): ReactElement {
  return (
    <section className="section faq">
      <div className="container">
        {f.headline !== undefined && <h2>{f.headline}</h2>}
        <div className="faq-list">
          {f.items.map((it, i) => (
            <details key={i}>
              <summary>{it.question}</summary>
              <p>{it.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Guarantee(f: GuaranteeFields): ReactElement {
  return (
    <section className="section guarantee">
      <div className="container">
        {f.badge !== undefined && <img src={f.badge} alt="" className="badge" loading="lazy" />}
        <h2>{f.headline}</h2>
        <p>{f.body}</p>
      </div>
    </section>
  );
}

function About(f: AboutFields): ReactElement {
  return <MediaSplit sectionClass="about" headline={f.headline} body={f.body} image={f.image} />;
}

function LeadForm(f: LeadFormFields): ReactElement {
  // Static export: the form posts to the tracking Worker (Onda 10). NO PII is rendered here.
  return (
    <section className="section lead-form">
      <div className="container">
        <h2>{f.headline}</h2>
        <form className="form" data-lp-form>
          {f.collectEmail && <input type="email" name="email" placeholder="Seu e-mail" required />}
          {f.collectPhone && <input type="tel" name="phone" placeholder="Seu telefone" />}
          <button type="submit" className="btn btn-primary">
            {f.submitLabel}
          </button>
          {f.consentText !== undefined && <p className="muted small">{f.consentText}</p>}
        </form>
      </div>
    </section>
  );
}

function Urgency(f: UrgencyFields): ReactElement {
  return (
    <section className="section urgency">
      <div className="container">
        <h2>{f.headline}</h2>
        {f.countdownSeconds !== undefined && (
          <p className="countdown" data-countdown-seconds={f.countdownSeconds} />
        )}
        {f.note !== undefined && <p className="muted">{f.note}</p>}
      </div>
    </section>
  );
}

function Footer(f: FooterFields): ReactElement {
  return (
    <footer className="section footer">
      <div className="container">
        {f.links !== undefined && (
          <nav className="footer-links">
            {f.links.map((l, i) => (
              <a key={i} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <p className="muted small">{f.copyright}</p>
      </div>
    </footer>
  );
}

// Dispatch a content-spec section to its renderer. Unknown/disabled types are skipped upstream.
export function renderSection(section: ContentSpecSection, ctx: PageCtx): ReactElement | null {
  const t: SectionType = section.type;
  const fields = section.fields;
  switch (t) {
    case 'hero':
      return Hero(fields as HeroFields, ctx);
    case 'logos':
      return Logos(fields as LogosFields);
    case 'problem':
      return Problem(fields as ProblemFields);
    case 'solution':
      return Solution(fields as SolutionFields);
    case 'features':
      return Features(fields as FeaturesFields);
    case 'benefits':
      return Benefits(fields as BenefitsFields);
    case 'how_it_works':
      return HowItWorks(fields as HowItWorksFields);
    case 'testimonials':
      return Testimonials(fields as TestimonialsFields);
    case 'video':
      return Video(fields as VideoFields);
    case 'pricing':
      return Pricing(fields as PricingFields, ctx);
    case 'offer':
      return Offer(fields as OfferFields, ctx);
    case 'faq':
      return Faq(fields as FaqFields);
    case 'guarantee':
      return Guarantee(fields as GuaranteeFields);
    case 'about':
      return About(fields as AboutFields);
    case 'lead_form':
      return LeadForm(fields as LeadFormFields);
    case 'urgency':
      return Urgency(fields as UrgencyFields);
    case 'footer':
      return Footer(fields as FooterFields);
    default: {
      // Exhaustiveness guard: adding a SectionType without a renderer fails the build.
      const _never: never = t;
      return _never;
    }
  }
}
