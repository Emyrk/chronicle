import { Outlet } from "react-router-dom";
import { NavBar } from "../NavBar/NavBar";
import { Footer } from "../Footer/Footer";
import { SupportBanner } from "../SupportBanner";
import { Toaster } from "../ui/Sonner/Sonner";
import { TooltipProvider } from "../ui/Tooltip/tooltip";
import { usePageTracking } from "@/hooks/usePageTracking";
import { usePublicTelemetryNotices } from "@/api/queries";
import { NoticeBanner } from "../NoticeBanner/NoticeBanner";
import { ForeverAnnouncementBanner } from "../ForeverAnnouncementBanner";

export function Layout() {
  usePageTracking();
  const { data: noticeResponse } = usePublicTelemetryNotices();

  return (
    <TooltipProvider>
      <NoticeBanner notices={noticeResponse?.notices ?? []} />
      <ForeverAnnouncementBanner />
      <SupportBanner />
      <NavBar />
      <main>
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </TooltipProvider>
  );
}
