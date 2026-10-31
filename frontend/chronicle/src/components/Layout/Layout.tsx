import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "../NavBar/NavBar";
import { Footer } from "../Footer/Footer";
import { SupportBanner } from "../SupportBanner";
import { ChooseArrivalNotice } from "../ChooseArrivalNotice/ChooseArrivalNotice";
import {
  RootCommunityBanner,
  RootCommunityDialog,
  RootCommunityProvider,
} from "../RootCommunityContext/RootCommunityContext";
import { Toaster } from "../ui/Sonner/Sonner";
import { TooltipProvider } from "../ui/Tooltip/tooltip";
import { EntityMenuProvider } from "../EntityMenu/EntityMenu";
import { usePageTracking } from "@/hooks/usePageTracking";
import { usePublicTelemetryNotices } from "@/api/queries";
import { NoticeBanner } from "../NoticeBanner/NoticeBanner";
import { useHideSiteChrome } from "@/hooks/useFocusMode";
import { GlobalSiteHelpChat } from "@/features/chat/InferenceChats";
import { RouteLoadingFallback } from "./RouteLoadingFallback";

export function Layout() {
  usePageTracking();
  const { data: noticeResponse } = usePublicTelemetryNotices();
  // Focus mode on an instance page: only the page itself.
  const hideChrome = useHideSiteChrome();
  const location = useLocation();
  const isInstancePage = location.pathname.startsWith("/instances/");
  // The Lua workshop embeds its own project chat.
  const hasPageChat = isInstancePage || /^\/modules\/[^/]+\/edit$/.test(location.pathname);

  return (
    <TooltipProvider>
      <RootCommunityProvider>
        <EntityMenuProvider>
          {!hideChrome && (
            <>
              <NoticeBanner notices={noticeResponse?.notices ?? []} />
              <RootCommunityBanner />
              <SupportBanner />
              <NavBar />
            </>
          )}
          <main>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Outlet />
            </Suspense>
          </main>
          {!hideChrome && <Footer />}
          {!hideChrome && !hasPageChat && <GlobalSiteHelpChat />}
          <RootCommunityDialog />
          <ChooseArrivalNotice />
          <Toaster />
        </EntityMenuProvider>
      </RootCommunityProvider>
    </TooltipProvider>
  );
}
