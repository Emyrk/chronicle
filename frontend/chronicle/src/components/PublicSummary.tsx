import { useLocation } from "react-router-dom";

// Keep this copy in sync with the pre-rendered sections in chronicle/index.html.
// The server version remains visible if JavaScript never runs.
export function PublicSummary() {
  const { pathname } = useLocation();
  const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content || "Chronicle";

  if (pathname !== "/" && pathname !== "/leaderboards/statistics") return null;

  return pathname === "/" ? (
    <section className="public-summary" aria-label="About Chronicle">
      <h2>{siteName} combat log analysis</h2>
      <p>Upload combat logs to explore raid damage, healing, deaths, and performance. Browse public reports and compare players and guilds.</p>
      <nav aria-label="Explore raid analysis"><a href="/recent">Recent raids</a><a href="/leaderboards/statistics">Raid statistics</a><a href="/guilds">Guilds</a></nav>
    </section>
  ) : (
    <section className="public-summary" aria-label="About raid statistics">
      <h2>{siteName} raid statistics</h2>
      <p>Explore combat log rankings and raid performance statistics. Compare damage and healing across encounters, then open a public raid report for more detail.</p>
      <nav aria-label="Explore raid analysis"><a href="/recent">Recent raids</a><a href="/leaderboards/speedruns">Speedrun leaderboards</a><a href="/guilds">Guilds</a></nav>
    </section>
  );
}
