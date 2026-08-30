import { ServerGrid } from "./components/ServerGrid";
import { Footer } from "./components/Footer";
import { SupportPage } from "./components/SupportPage";
import { SupportRibbon } from "./components/SupportRibbon";
import { useDiscovery } from "./hooks/useDiscovery";
import { SERVERS, DISCOVERY_URLS } from "./data/servers";

function HomePage() {
  const { servers, loading } = useDiscovery(SERVERS, DISCOVERY_URLS);

  return <ServerGrid servers={servers} loading={loading} />;
}

export function App() {
  const isSupportPage = window.location.pathname.replace(/\/$/, "").endsWith("/support");

  return (
    <div className="flex min-h-dvh flex-col">
      {!isSupportPage && <SupportRibbon />}
      <main className="flex-1">
        {isSupportPage ? <SupportPage /> : <HomePage />}
      </main>
      <Footer />
    </div>
  );
}
