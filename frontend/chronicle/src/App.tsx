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
import { SharedViewRedirect } from "./pages/SharedViewRedirect"
import { RecentRaids } from "./pages/Recent/RecentRaids"
import { ProtoDecode } from "./pages/Debug/ProtoDecode"
import { YouTubeSyncPage } from "./pages/YouTubeSync/YouTubeSyncPage"
import { AdminPage } from "./pages/Admin/AdminPage"
import { AdminStoragePage } from "./pages/Admin/AdminStoragePage"
import { AdminUsersPage } from "./pages/Admin/AdminUsersPage"
import { SpellPage } from "./pages/WoWDB/SpellPage"
import { SpellByNamePage } from "./pages/WoWDB/SpellByNamePage"
import { ItemPage } from "./pages/WoWDB/ItemPage"
import {
  TechnicalDetailsPage,
  PeriodicSpellsPage,
  ExtraAttackSpellsPage,
  VulnerabilitySpellsPage,
  AuraDurationModifiersPage,
  ClassSpellsPage,
} from "./pages/Technical"
import {
  AccountLayout,
  ProfileSettings,
  StorageSettings,
  NotificationSettings,
  PrivacySettings,
  AppearanceSettings,
  LayoutBookSettings,
  LayoutLabSettings,
} from "./pages/Settings"
import { GuildPage, GuildPageEditor, GuildRoster, GuildSettings } from "./pages/GuildPage"
import { ArmoryPage } from "./pages/ArmoryPage"
import { ArmorySearchPage } from "./pages/ArmorySearch"
import { SimPage } from "./pages/Sim"
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
        <Route path="/s/:code" element={<SharedViewRedirect />} />
        <Route path="/armory" element={<ArmorySearchPage />} />
        <Route path="/armory/:realmName/:playerIdentifier" element={<ArmoryPage />} />
        <Route path="/sim" element={<SimPage />} />
        <Route path="/debug/proto" element={<ProtoDecode />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/storage" element={<AdminStoragePage />} />
        <Route path="/wowdb/spell" element={<SpellPage />} />
        <Route path="/wowdb/spell/:spellId" element={<SpellPage />} />
        <Route path="/wowdb/spell-by-name" element={<SpellByNamePage />} />
        <Route path="/wowdb/spell-by-name/:name" element={<SpellByNamePage />} />
        <Route path="/wowdb/item" element={<ItemPage />} />
        <Route path="/technical" element={<TechnicalDetailsPage />} />
        <Route path="/technical/extra-attack-spells" element={<ExtraAttackSpellsPage />} />
        <Route path="/technical/vulnerability-spells" element={<VulnerabilitySpellsPage />} />
        <Route path="/technical/periodic-spells" element={<PeriodicSpellsPage />} />
        <Route path="/technical/aura-duration-modifiers" element={<AuraDurationModifiersPage />} />
        <Route path="/technical/class-spells" element={<ClassSpellsPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/supported" element={<SupportedInstances />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/g/:guildId" element={<GuildPage />} />
        <Route path="/g/:guildId/:tabSlug" element={<GuildPage />} />
        <Route path="/guilds/:guildId/edit" element={<GuildPageEditor />} />
        <Route path="/guilds/:guildId/roster" element={<GuildRoster />} />
        <Route path="/guilds/:guildId/settings" element={<GuildSettings />} />
        <Route path="/account" element={<AccountLayout />}>
          <Route index element={<Navigate to="/account/settings" replace />} />
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="storage" element={<StorageSettings />} />
          <Route path="notifications" element={<NotificationSettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="layout-book" element={<LayoutBookSettings />} />
          <Route path="layout-lab" element={<LayoutLabSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  )
}

export default App