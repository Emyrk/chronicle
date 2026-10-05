import { ServerGrid } from "./components/ServerGrid";
import { Footer } from "./components/Footer";
import { SelfHostedRequirementsPage } from "./components/ForkRequirementsPage";
import { SupportPage } from "./components/SupportPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { SupportRibbon } from "./components/SupportRibbon";
import { useDiscovery } from "./hooks/useDiscovery";
import { SERVERS, DISCOVERY_URLS } from "./data/servers";

function HomePage() {
  const { servers, loading } = useDiscovery(SERVERS, DISCOVERY_URLS);

  return <ServerGrid servers={servers} loading={loading} />;
}

export function App() {
  const pathname = window.location.pathname.replace(/\/$/, "");
  const isSupportPage = pathname.endsWith("/support");
  const isSelfHostingPage = pathname.endsWith("/self-hosting");
  const isPrivacyPage = pathname.endsWith("/privacy");

  let page = <HomePage />;
  if (isSupportPage) {
    page = <SupportPage />;
  } else if (isSelfHostingPage) {
    page = <SelfHostedRequirementsPage />;
  } else if (isPrivacyPage) {
    page = <PrivacyPage />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {!isSupportPage && !isSelfHostingPage && !isPrivacyPage && <SupportRibbon />}
      <main className="flex-1">{page}</main>
      <Footer />
    </div>
  );
}
