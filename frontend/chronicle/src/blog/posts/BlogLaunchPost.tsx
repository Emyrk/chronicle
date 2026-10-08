import { Link } from "react-router-dom";

export function BlogLaunchPost() {
  return (
    <article className="mx-auto w-full max-w-4xl px-6 pb-24 pt-14 sm:px-10 sm:pt-20">
      <header className="max-w-3xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-primary">October 8, 2026</p>
        <h1 className="mt-5 font-[Libre_Baskerville] text-4xl leading-[1.08] font-bold tracking-[-0.035em] text-foreground sm:text-6xl">
          A home for what is new in Chronicle
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Chronicle changes quickly. This journal gives new features enough room to be explained, demonstrated, and found again later.
        </p>
      </header>

      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {[
          ["Release notes", "A concise record of the features and improvements that change how Chronicle is used."],
          ["Feature tours", "Longer explanations, examples, and videos for tools that deserve more than a tooltip."],
          ["A durable archive", "A chronological history that remains available after an in-app announcement is dismissed."],
        ].map(([title, body], index) => (
          <section key={title} className="bg-card p-7">
            <span className="font-mono text-xs text-primary">0{index + 1}</span>
            <h2 className="mt-8 text-lg font-semibold text-card-foreground">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>

      <section className="mt-16 border-l-2 border-primary/70 pl-6 sm:pl-9">
        <h2 className="font-[Libre_Baskerville] text-2xl font-bold text-foreground">Built feature by feature</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          These are intentionally custom pages rather than entries forced through one rigid article template. A release can be a short note, a visual walkthrough, an embedded Chronicle lesson, or something we have not designed yet.
        </p>
      </section>

      <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-border pt-8">
        <Link
          to="/blog/custom-panels"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Read the latest feature story
        </Link>
        <Link to="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Browse all posts
        </Link>
      </div>
    </article>
  );
}
