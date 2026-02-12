import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Login } from "./pages/Login/Login"
import { Home } from "./pages/Home"
import { Empty } from "./pages/Empty"
import { Upload } from "./pages/Upload/Upload"
import { LogsList } from "./pages/Logs/LogsList"
import { LogDetail, LogDetailByHash } from "./pages/Logs/LogDetail"
import { InstancePage } from "./pages/Instance/InstancePage"
import { ProtoDecode } from "./pages/Debug/ProtoDecode"
import { YouTubeSyncPage } from "./pages/YouTubeSync/YouTubeSyncPage"
import { AdminPage } from "./pages/Admin/AdminPage"
import { 
  AccountLayout, 
  ProfileSettings, 
  NotificationSettings, 
  PrivacySettings, 
  AppearanceSettings 
} from "./pages/Settings"
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
        <Route path="/empty" element={<Empty />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/logs" element={<LogsList />} />
        <Route path="/logs/:logId" element={<LogDetail />} />
        <Route path="/logs/file/:fileHash" element={<LogDetailByHash />} />
        <Route path="/instances/:instanceId" element={<InstancePage />} />
        <Route path="/debug/proto" element={<ProtoDecode />} />
        <Route path="/admin" element={<AdminPage />} />
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