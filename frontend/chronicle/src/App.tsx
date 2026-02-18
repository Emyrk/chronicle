import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Login } from "./pages/Login/Login"
import { Home } from "./pages/Home"
import { Contact } from "./pages/Contact"
import { Privacy } from "./pages/Privacy"
import { Disclaimer } from "./pages/Disclaimer"
import { SupportedInstances } from "./pages/SupportedInstances"
import { Terms } from "./pages/Terms"
import { Empty } from "./pages/Empty"
import { Upload } from "./pages/Upload/Upload"
import { LogsList } from "./pages/Logs/LogsList"
import { LogDetail, LogDetailByHash } from "./pages/Logs/LogDetail"
import { InstancePage } from "./pages/Instance/InstancePage"
import { RecentRaids } from "./pages/Recent/RecentRaids"
import { ProtoDecode } from "./pages/Debug/ProtoDecode"
import { YouTubeSyncPage } from "./pages/YouTubeSync/YouTubeSyncPage"
import { AdminPage } from "./pages/Admin/AdminPage"
import { SpellPage } from "./pages/WoWDB/SpellPage"
import { 
  AccountLayout, 
  ProfileSettings, 
  NotificationSettings, 
  PrivacySettings, 
  AppearanceSettings 
} from "./pages/Settings"
import { GuildPage, GuildPageEditor } from "./pages/GuildPage"
import { Layout } from "./components/Layout/Layout"

// Backend-handled paths that should bypass React Router
const BACKEND_PATHS = ["/saffron", "/river", "/api", "/auth"]

function CatchAllRoute() {
  const location = useLocation()
  
  // If this is a backend path, do a full page reload to let the server handle it
  if (BACKEND_PATHS.some(p => location.pathname.startsWith(p))) {
    window.location.reload()
    return null
  }
  
  // Otherwise redirect to login
  return <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/youtube-sync" element={<YouTubeSyncPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/recent" element={<RecentRaids />} />
        <Route path="/empty" element={<Empty />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/logs" element={<LogsList />} />
        <Route path="/logs/:logId" element={<LogDetail />} />
        <Route path="/logs/file/:fileHash" element={<LogDetailByHash />} />
        <Route path="/instances/:instanceId" element={<InstancePage />} />
        <Route path="/debug/proto" element={<ProtoDecode />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/wowdb/spell" element={<SpellPage />} />
        <Route path="/wowdb/spell/:spellId" element={<SpellPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/supported" element={<SupportedInstances />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/g/:guildId" element={<GuildPage />} />
        <Route path="/g/:guildId/:tabSlug" element={<GuildPage />} />
        <Route path="/guilds/:guildId/edit" element={<GuildPageEditor />} />
        <Route path="/account" element={<AccountLayout />}>
          <Route index element={<Navigate to="/account/settings" replace />} />
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="notifications" element={<NotificationSettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  )
}

export default App