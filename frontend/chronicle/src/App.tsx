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
import { AdminLayout } from "./pages/Admin/AdminLayout"
import { AdminUsersOverview } from "./pages/Admin/AdminUsersOverview"
import { AdminLogsPage } from "./pages/Admin/AdminLogsPage"
import { AdminLeaderboardPage } from "./pages/Admin/AdminLeaderboardPage"
import { AdminSiteSettingsPage } from "./pages/Admin/AdminSiteSettingsPage"
import { AdminStoragePage } from "./pages/Admin/AdminStoragePage"
import { AdminUsersPage } from "./pages/Admin/AdminUsersPage"
import { RegressionPage } from "./pages/Admin/RegressionPage"
import { AdminOutdatedInstancesPage } from "./pages/Admin/AdminOutdatedInstancesPage"
import { AdminApplicationsListPage } from "./pages/Admin/AdminApplicationsListPage"
import { ServersLayout, ServersPage, UploadKeysPage, RetentionPage } from "./pages/Servers"
import { SpellPage } from "./pages/WoWDB/SpellPage"
import { SpellByNamePage } from "./pages/WoWDB/SpellByNamePage"
import { ItemPage } from "./pages/WoWDB/ItemPage"
import { ItemExplorerPage } from "./pages/WoWDB/ItemExplorerPage"
import { SpellExplorerPage } from "./pages/WoWDB/SpellExplorerPage"
import { CreatureExplorerPage } from "./pages/WoWDB/CreatureExplorerPage"
import { ItemSetExplorerPage } from "./pages/WoWDB/ItemSetExplorerPage"
import { ItemSetDetailPage } from "./pages/WoWDB/ItemSetDetailPage"
import { WoWDBLayout } from "./pages/WoWDB/WoWDBLayout"
import {
  TechnicalDetailsPage,
  PeriodicSpellsPage,
  ExtraAttackSpellsPage,
  VulnerabilitySpellsPage,
  AuraDurationModifiersPage,
  ClassSpellsPage,
  TalentTreesPage,
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
import { GuildSearchPage } from "./pages/GuildSearch"
import { ApplyPage } from "./pages/Apply/ApplyPage"
import { ApplicationPage } from "./pages/Apply/ApplicationPage"
import { SimPage } from "./pages/Sim"
import { TalentCalculatorPage } from "./pages/TalentCalculator/TalentCalculatorPage"
import { GameDataLayout } from "./pages/GameData/GameDataPage"
import { WDBTab } from "./pages/GameData/WDBTab"
import { ImportSQLTab } from "./pages/GameData/ImportSQLTab"
import { DBCTab } from "./pages/GameData/DBCTab"
import { LeaderboardsPage, LeaderboardRedirect, RankingsRedirect } from "./pages/Leaderboards/LeaderboardsPage"
import { CensusPage } from "./pages/Census/CensusPage"
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
        <Route path="/guilds" element={<GuildSearchPage />} />
        <Route path="/armory" element={<ArmorySearchPage />} />
        <Route path="/armory/:realmName/:playerIdentifier" element={<ArmoryPage />} />
        <Route path="/sim" element={<SimPage />} />
        <Route path="/talents" element={<TalentCalculatorPage />} />
        <Route path="/talents/:classSlug" element={<TalentCalculatorPage />} />
        <Route path="/leaderboards" element={<LeaderboardsPage />} />
        <Route path="/leaderboard" element={<LeaderboardRedirect />} />
        <Route path="/rankings" element={<RankingsRedirect />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/:id" element={<ApplicationPage />} />
        <Route path="/census" element={<CensusPage />} />
        <Route path="/debug/proto" element={<ProtoDecode />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/users-overview" replace />} />
          <Route path="users-overview" element={<AdminUsersOverview />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="leaderboard" element={<AdminLeaderboardPage />} />
          <Route path="site-settings" element={<AdminSiteSettingsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="storage" element={<AdminStoragePage />} />
          <Route path="regression" element={<RegressionPage />} />
          <Route path="outdated-instances" element={<AdminOutdatedInstancesPage />} />
          <Route path="applications" element={<AdminApplicationsListPage />} />
        </Route>
        <Route path="/servers" element={<ServersLayout />}>
          <Route index element={<ServersPage />} />
          <Route path="keys" element={<UploadKeysPage />} />
          <Route path="retention" element={<RetentionPage />} />
        </Route>
        <Route path="/wowdb" element={<WoWDBLayout />}>
          <Route index element={<ItemExplorerPage />} />
          <Route path="items" element={<ItemExplorerPage />} />
          <Route path="spells" element={<SpellExplorerPage />} />
          <Route path="creatures" element={<CreatureExplorerPage />} />
          <Route path="sets" element={<ItemSetExplorerPage />} />
          <Route path="set" element={<ItemSetDetailPage />} />
          <Route path="item" element={<ItemPage />} />
        </Route>
        <Route path="/wowdb/spell" element={<SpellPage />} />
        <Route path="/wowdb/spell/:spellId" element={<SpellPage />} />
        <Route path="/wowdb/spell-by-name" element={<SpellByNamePage />} />
        <Route path="/wowdb/spell-by-name/:name" element={<SpellByNamePage />} />
        <Route path="/technical" element={<TechnicalDetailsPage />} />
        <Route path="/technical/extra-attack-spells" element={<ExtraAttackSpellsPage />} />
        <Route path="/technical/vulnerability-spells" element={<VulnerabilitySpellsPage />} />
        <Route path="/technical/periodic-spells" element={<PeriodicSpellsPage />} />
        <Route path="/technical/aura-duration-modifiers" element={<AuraDurationModifiersPage />} />
        <Route path="/technical/class-spells" element={<ClassSpellsPage />} />
        <Route path="/technical/talent-trees" element={<TalentTreesPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/supported" element={<SupportedInstances />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/g/:guildId" element={<GuildPage />} />
        <Route path="/g/:guildId/:tabSlug" element={<GuildPage />} />
        <Route path="/g/:guildId/edit" element={<GuildPageEditor />} />
        <Route path="/g/:guildId/roster" element={<GuildRoster />} />
        <Route path="/g/:guildId/settings" element={<GuildSettings />} />
        <Route path="/game-data" element={<GameDataLayout />}>
          <Route index element={<Navigate to="/game-data/wdb" replace />} />
          <Route path="wdb" element={<WDBTab />} />
          <Route path="import-sql" element={<ImportSQLTab />} />
          <Route path="dbc" element={<DBCTab />} />
        </Route>
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