import Link from "next/link";
import { Sparkles, PenTool, Brain, Globe2, ArrowRight, CheckCircle2, Feather, Users, ShieldCheck } from "lucide-react";

export default function Landing() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-canvas font-bold text-xl">T</div>
            <span className="font-display text-xl font-bold">Taleora</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted">
            <a href="#features" className="hover:text-ink transition-colors">Features</a>
            <a href="#humanizer" className="hover:text-ink transition-colors">Humanizer</a>
            <a href="#studio" className="hover:text-ink transition-colors">Writing Studio</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted hover:text-ink">Log in</Link>
            <Link href="/register" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-accent-dim">Start Writing</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-20 pb-24 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Imagine. Write. Humanize.</p>
        <h1 className="mt-6 font-display text-5xl md:text-7xl font-bold leading-tight">
          Where Every Story <span className="text-accent">Finds Its Voice</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Taleora is the AI-powered story writing and humanization platform. Create novels,
          humanize awkward AI drafts into natural prose, and keep every detail consistent —
          from character memory to timeline to world-building.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-lg bg-accent px-8 py-4 font-bold text-canvas hover:bg-accent-dim glow-accent">
            Start Writing Free
          </Link>
          <Link href="/login" className="rounded-lg border border-line px-8 py-4 text-ink hover:bg-elevated">
            I have an account
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted">Agnes AI is our primary engine · Your manuscripts are never used for training</p>
      </section>

      <section id="features" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="text-center font-display text-4xl font-bold">Built for serious writers</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Everything you need to go from raw idea to polished manuscript.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Feather} title="AI Story Writer" description="Generate outlines, characters, scenes and complete chapters — sequentially, with memory." />
            <FeatureCard icon={Sparkles} title="AI Humanizer" description="Transform awkward or robotic text into natural, expressive prose — meaning preserved." />
            <FeatureCard icon={Brain} title="Story Memory" description="Character, plot, timeline and world-building memory that keeps long novels consistent." />
            <FeatureCard icon={Users} title="Character Studio" description="Generate and manage character profiles deeply — with portraits." />
            <FeatureCard icon={Globe2} title="Publishing" description="Publish stories publicly or unlisted. Private content stays private." />
            <FeatureCard icon={PenTool} title="Writing Studio" description="A professional rich-text editor with autosave, versions and an AI assistant." />
            <FeatureCard icon={ShieldCheck} title="Private by design" description="Your manuscript never leaves the configured provider. Never used for training." />
            <FeatureCard icon={CheckCircle2} title="Exports" description="PDF, DOCX, EPUB and TXT exports — with table of contents and page numbers." />
          </div>
        </div>
      </section>

      <section id="humanizer" className="border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-24 grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">AI Humanizer</p>
            <h2 className="mt-3 font-display text-4xl font-bold">Not a synonym swap.<br/>A writing pipeline.</h2>
            <p className="mt-4 text-muted">A multi-stage process: input analysis, context-aware planning, careful rewriting, preservation checks and quality evaluation. Natural language, never gimmicks.</p>
            <ul className="mt-6 space-y-2 text-sm">
              <Li>Natural, Emotional, Literary, Conversational, Cinematic, Simple, Professional, Deep Rewrite</Li>
              <Li>Light / Balanced / Deep intensity control</Li>
              <Li>Character names, places, events and timeline preserved</Li>
              <Li>Side-by-side comparison, accept/reject, version history</Li>
            </ul>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-bold text-canvas hover:bg-accent-dim">
              Try the humanizer <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-8">
            <p className="text-xs uppercase tracking-wide text-muted">Before</p>
            <p className="mt-2 font-display text-lg text-ink">The wolf appears. The boy observes. He thinks the wolf is scared.</p>
            <div className="my-4 border-t border-line" />
            <p className="text-xs uppercase tracking-wide text-accent">After — natural</p>
            <p className="mt-2 font-display text-lg text-ink">You can hear the wolf. Waiting in the brush. The boy freezes — and realizes what the wolf is so afraid of.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-canvas font-bold">T</div>
            <span className="font-display text-base font-bold text-ink">Taleora</span>
          </div>
          <p>Imagine. Write. Humanize.</p>
          <p>© {new Date().getFullYear()} Taleora</p>
        </div>
      </footer>
    </main>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="h-4 w-4 mt-0.5 text-accent flex-shrink-0" />
      <span className="text-ink">{children}</span>
    </li>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-5 hover:border-accent/40 transition-colors">
      <Icon className="h-6 w-6 text-accent" />
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}
