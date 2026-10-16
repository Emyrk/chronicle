import { Outlet } from "react-router-dom";
import { NavBar } from "../NavBar/NavBar";
import { Footer } from "../Footer/Footer";
import { SupportBanner } from "../SupportBanner";
import { Toaster } from "../ui/Sonner/Sonner";
import { TooltipProvider } from "../ui/Tooltip/tooltip";
import { usePageTracking } from "@/hooks/usePageTracking";
import { usePublicTelemetryNotices } from "@/api/queries";
import { NoticeBanner } from "../NoticeBanner/NoticeBanner";
import { useHideSiteChrome } from "@/hooks/useFocusMode";

export function Layout() {
  usePageTracking();
  const { data: noticeResponse } = usePublicTelemetryNotices();
  // Focus mode on an instance page: only the page itself.
  const hideChrome = useHideSiteChrome();

  return (
    <TooltipProvider>
      {!hideChrome && (
        <>
          <NoticeBanner notices={noticeResponse?.notices ?? []} />
          <SupportBanner />
          <NavBar />
        </>
      )}
      <main>
        <Outlet />
      </main>
      {!hideChrome && <Footer />}
      <Toaster />
    </TooltipProvider>
  );
}
