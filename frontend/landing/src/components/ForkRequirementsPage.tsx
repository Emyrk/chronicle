import {
  ArrowLeft,
  ExternalLink,
  HeartHandshake,
  PanelTop,
  ShieldAlert,
} from "lucide-react";

export function SelfHostedRequirementsPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgb(95 143 166 / 0.22), transparent 28rem), radial-gradient(circle at 82% 35%, rgb(180 130 45 / 0.13), transparent 24rem)",
        }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <a
          href="../"
          className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Chronicle home
        </a>

        <header className="max-w-3xl">
          <div className="mb-5 flex items-center gap-3">
            <img src="../chronicle-logo.png" alt="" className="h-12 w-12 object-contain" />
            <span className="font-wow text-sm uppercase tracking-[0.22em] text-[#d9b46b]">
              Project requirements
            </span>
          </div>
          <h1 className="font-wow text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Self Hosted Requirements
          </h1>
        </header>

        <section className="mt-10 overflow-hidden rounded-xl border border-amber-400/30 bg-amber-400/8 shadow-2xl shadow-black/20">
          <div className="flex gap-4 p-5 sm:p-6">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <h2 className="font-wow text-lg font-bold text-amber-100">These requirements do not grant permission</h2>
              <p className="mt-2 leading-7 text-amber-50/75">
                The Chronicle license permits non-commercial hosting, subject to these requirements. It does not
                permit commercial use, redistribution, derivative works, or competing products. These requirements
                do not grant any additional permission beyond the license. If you want to support a larger server,
                contact Chronicle on Discord to discuss it first.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                <a
                  href="https://github.com/Emyrk/chronicle/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-amber-200 underline decoration-amber-300/40 underline-offset-4 transition-colors hover:text-amber-100"
                >
                  Read the Chronicle license
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <a
                  href="https://discord.gg/gz97ABFVAj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-amber-200 underline decoration-amber-300/40 underline-offset-4 transition-colors hover:text-amber-100"
                >
                  Contact Chronicle on Discord
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mt-10 rounded-xl border border-[#5f8fa6]/35 bg-[#5f8fa6]/8 p-6 sm:p-8"
          aria-labelledby="larger-servers-heading"
        >
          <p className="font-wow text-sm uppercase tracking-[0.18em] text-[#9fc5d6]">Working together</p>
          <h2 id="larger-servers-heading" className="mt-2 font-wow text-2xl font-bold text-foreground">
            Self hosting larger servers
          </h2>
          <div className="mt-4 max-w-3xl space-y-4 leading-7 text-muted-foreground">
            <p>
              Chronicle does not demand payment from communities that self host. Chronicle does expect clear
              attribution and credit for the work that makes the service possible.
            </p>
            <p>
              Chronicle also intends to solicit voluntary support from your user base to help sustain ongoing
              development. The Chronicle branding, footer attribution, and support banner ensure users can identify
              the project and choose to support its continued work.
            </p>
            <p>
              If you want to support a larger server, contact Chronicle on Discord so expectations can be discussed
              before launch.
            </p>
          </div>
          <a
            href="https://discord.gg/gz97ABFVAj"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 font-semibold text-[#9fc5d6] transition-colors hover:text-white"
          >
            Contact Chronicle on Discord
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>

        <section className="mt-14" aria-labelledby="requirements-heading">
          <div className="mb-6">
            <p className="font-wow text-sm uppercase tracking-[0.18em] text-[#d9b46b]">Required on every deployment</p>
            <h2 id="requirements-heading" className="mt-2 font-wow text-2xl font-bold sm:text-3xl">
              Keep these Chronicle elements intact
            </h2>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-border bg-[#211d18] p-6 sm:p-8" aria-labelledby="navbar-example-heading">
              <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex items-center gap-2 text-[#d9b46b]">
                    <PanelTop className="h-4 w-4" aria-hidden="true" />
                    <p className="font-wow text-sm uppercase tracking-[0.18em]">Required navbar treatment</p>
                  </div>
                  <h3 id="navbar-example-heading" className="mt-2 font-wow text-2xl font-bold text-foreground">
                    Keep Chronicle visible in the navbar
                  </h3>
                  <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
                    The square Chronicle “C” logo must appear somewhere in the navigation bar at the top of the
                    Chronicle application. It must remain recognizable alongside any server-specific branding.
                  </p>
                </div>

                <div className="flex min-w-64 items-center rounded-lg border border-white/10 bg-[#171717] px-5 py-4 shadow-lg shadow-black/20">
                  <img src="../chronicle-logo.png" alt="Chronicle" className="h-10 w-10 shrink-0 object-contain" />
                  <div className="ml-auto flex gap-2" aria-hidden="true">
                    <span className="h-2 w-8 rounded-full bg-white/10" />
                    <span className="h-2 w-8 rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-[#211d18] p-6 sm:p-8" aria-labelledby="footer-example-heading">
              <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-wow text-sm uppercase tracking-[0.18em] text-[#d9b46b]">Required footer treatment</p>
                  <h3 id="footer-example-heading" className="mt-2 font-wow text-2xl font-bold text-foreground">
                    Use the complete linked attribution
                  </h3>
                  <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
                    “Powered by” and the Chronicle logo must appear together. The logo must remain recognizable and
                    must link to Chronicle’s official site at http://chronicleclassic.com/.
                  </p>
                </div>

                <a
                  href="https://chronicleclassic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-64 items-center justify-center gap-3 rounded-lg border border-[#8a6a2a]/60 bg-black/20 px-6 py-5 transition-colors hover:border-[#d9b46b]"
                  aria-label="Powered by Chronicle"
                >
                  <span className="text-sm text-[#b7aa99]">Powered by</span>
                  <img src="../chronicle-logo.svg" alt="Chronicle" className="h-10 w-32 object-contain" />
                </a>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-[#211d18] p-6 sm:p-8" aria-labelledby="support-banner-example-heading">
              <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex items-center gap-2 text-[#d9b46b]">
                    <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                    <p className="font-wow text-sm uppercase tracking-[0.18em]">Required support treatment</p>
                  </div>
                  <h3 id="support-banner-example-heading" className="mt-2 font-wow text-2xl font-bold text-foreground">
                    Keep the support banner available
                  </h3>
                  <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
                    The Chronicle support banner and its link must not be removed, hidden, or disabled. It gives users
                    a direct way to support the continued development of Chronicle.
                  </p>
                </div>

                <div className="min-w-64 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                  <div className="flex items-center gap-3">
                    <img src="../chronicle-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
                    <div>
                      <p className="font-wow text-sm font-bold text-foreground">Chronicle runs on donations, not ads.</p>
                      <p className="mt-1 text-xs text-muted-foreground">Help keep Chronicle development going.</p>
                    </div>
                  </div>
                  <span className="mt-3 block rounded-md bg-rose-500 px-3 py-2 text-center text-xs font-bold text-white">
                    Support Chronicle
                  </span>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="mt-14 border-l-2 border-[#5f8fa6] pl-5 sm:pl-7">
          <h2 className="font-wow text-xl font-bold">Questions or compliance concerns?</h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
            Contact the Chronicle project before modifying protected branding or support surfaces. Existing use of
            Chronicle code does not imply permission or approval.
          </p>
          <a
            href="https://discord.gg/gz97ABFVAj"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-semibold text-[#9fc5d6] transition-colors hover:text-white"
          >
            Contact Chronicle on Discord
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>
      </div>
    </div>
  );
}
