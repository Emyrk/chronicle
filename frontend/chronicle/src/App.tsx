import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Login } from "./pages/Login/Login"
import { Home } from "./pages/Home"
import { Contact } from "./pages/Contact"
import { Privacy } from "./pages/Privacy"
import { Disclaimer } from "./pages/Disclaimer"
import { SupportedInstances } from "./pages/SupportedInstances"
import { Terms } from "./pages/Terms"
import { ParsingPage } from "./pages/Parsing/ParsingPage"
import { CohortViewerPage } from "./pages/Parsing/CohortViewerPage"
import { Empty } from "./pages/Empty"
import { Upload } from "./pages/Upload/Upload"
import { LogsList } from "./pages/Logs/LogsList"
import { LogDetail, LogDetailByHash } from "./pages/Logs/LogDetail"
import { InstancePage } from "./pages/Instance/InstancePage"
import { PopulationComparisonPage } from "./pages/Instance/Overview/PopulationComparisonPage"
import { SharedViewRedirect } from "./pages/SharedViewRedirect"
import { RecentRaids } from "./pages/Recent/RecentRaids"
import { ProtoDecode } from "./pages/Debug/ProtoDecode"
import { YouTubeSyncPage } from "./pages/YouTubeSync/YouTubeSyncPage"
import { YouTubeSyncV2Page } from "./pages/YouTubeSyncV2/YouTubeSyncV2Page"
import { YouTubeSyncV3Page } from "./pages/YouTubeSyncV3/YouTubeSyncV3Page"
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
import { AdminCacheStatsPage } from "./pages/Admin/AdminCacheStatsPage"
import { AdminParsingPage } from "./pages/Admin/AdminParsingPage"
import { GearLayout } from "./pages/Gear/GearLayout"
import { GearListsPage } from "./pages/Gear/GearListsPage"
import { GearListPage } from "./pages/Gear/builder/GearListPage"
import { GearTrendsPage } from "./pages/Gear/trends/GearTrendsPage"
import { GearProgressionsPage } from "./pages/Gear/progression/GearProgressionsPage"
import { GearProgressionPage } from "./pages/Gear/progression/builder/GearProgressionPage"
import { StatWeightsPage } from "./pages/Gear/weights/StatWeightsPage"
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
  PetTargetingAbilitiesPage,
  ConsumablesPage,
  CooldownSpellsPage,
} from "./pages/Technical"
import {
  AccountLayout,
  ProfileSettings,
  CharacterSettings,
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
import { RaidPlannerPage } from "./pages/RaidPlanner"
import { TalentCalculatorPage } from "./pages/TalentCalculator/TalentCalculatorPage"
import { GameDataLayout } from "./pages/GameData/GameDataPage"
import { WDBTab } from "./pages/GameData/WDBTab"
import { ImportSQLTab } from "./pages/GameData/ImportSQLTab"
import { DBCTab } from "./pages/GameData/DBCTab"
import { DatasetsTab } from "./pages/GameData/DatasetsTab"
import { LeaderboardsPage, LeaderboardRedirect, RankingsRedirect } from "./pages/Leaderboards/LeaderboardsPage"
import { CensusPage } from "./pages/Census/CensusPage"
import { APIExplorer } from "./pages/APIExplorer/APIExplorer"
import { Layout } from "./components/Layout/Layout"
import { TenantDatasetLayout } from "./components/Layout/TenantDatasetLayout"

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
      <Route path="/youtube-sync-v2" element={<YouTubeSyncV2Page />} />
      <Route path="/youtube-sync-v3" element={<YouTubeSyncV3Page />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/recent" element={<RecentRaids />} />
        <Route path="/empty" element={<Empty />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/logs" element={<LogsList />} />
        <Route path="/logs/:logId" element={<LogDetail />} />
        <Route path="/logs/file/:fileHash" element={<LogDetailByHash />} />
        <Route path="/instances/compare" element={<PopulationComparisonPage />} />
        <Route path="/instances/:instanceId" element={<InstancePage />} />
        <Route path="/s/:code" element={<SharedViewRedirect />} />
        <Route path="/guilds" element={<GuildSearchPage />} />
        <Route path="/armory" element={<ArmorySearchPage />} />
        <Route path="/armory/:realmName/:playerIdentifier" element={<ArmoryPage />} />
        <Route path="/sim" element={<SimPage />} />
        <Route path="/talents" element={<TalentCalculatorPage />} />
        {/* Unlinked while in development — reachable by URL only. */}
        <Route path="/raidplanner" element={<RaidPlannerPage />} />
        <Route path="/talents/:classSlug" element={<TalentCalculatorPage />} />
        <Route path="/leaderboards" element={<LeaderboardsPage />} />
        <Route path="/leaderboard" element={<LeaderboardRedirect />} />
        <Route path="/rankings" element={<RankingsRedirect />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/:id" element={<ApplicationPage />} />
        <Route path="/census" element={<CensusPage />} />
        <Route path="/developers/api" element={<APIExplorer />} />
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
          <Route path="cache-stats" element={<AdminCacheStatsPage />} />
          <Route path="parsing" element={<AdminParsingPage />} />
        </Route>
        <Route path="/servers" element={<ServersLayout />}>
          <Route index element={<ServersPage />} />
          <Route path="keys" element={<UploadKeysPage />} />
          <Route path="retention" element={<RetentionPage />} />
        </Route>
        <Route element={<TenantDatasetLayout />}>
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
          <Route path="/gear" element={<GearLayout />}>
            <Route index element={<GearListsPage />} />
            <Route path="weights" element={<StatWeightsPage />} />
            <Route path="trends" element={<GearTrendsPage />} />
            <Route path="progression" element={<GearProgressionsPage />} />
          </Route>
          <Route path="/gear/lists/:listID" element={<GearListPage />} />
          <Route path="/gear/progression/:progressionID" element={<GearProgressionPage />} />
        </Route>
        <Route path="/technical" element={<TenantDatasetLayout />}>
          <Route index element={<TechnicalDetailsPage />} />
          <Route path="extra-attack-spells" element={<ExtraAttackSpellsPage />} />
          <Route path="vulnerability-spells" element={<VulnerabilitySpellsPage />} />
          <Route path="periodic-spells" element={<PeriodicSpellsPage />} />
          <Route path="aura-duration-modifiers" element={<AuraDurationModifiersPage />} />
          <Route path="class-spells" element={<ClassSpellsPage />} />
          <Route path="pet-targeting-abilities" element={<PetTargetingAbilitiesPage />} />
          <Route path="talent-trees" element={<TalentTreesPage />} />
          <Route path="consumables" element={<ConsumablesPage />} />
          <Route path="cooldowns" element={<CooldownSpellsPage />} />
        </Route>
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/supported" element={<SupportedInstances />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/parsing" element={<ParsingPage />} />
        <Route path="/parsing/cohorts" element={<CohortViewerPage />} />
        <Route path="/g/:guildId" element={<GuildPage />} />
        <Route path="/g/:guildId/:tabSlug" element={<GuildPage />} />
        <Route path="/g/:guildId/edit" element={<GuildPageEditor />} />
        <Route path="/g/:guildId/roster" element={<GuildRoster />} />
        <Route path="/g/:guildId/settings" element={<GuildSettings />} />
        <Route path="/game-data" element={<GameDataLayout />}>
          <Route index element={<Navigate to="/game-data/datasets" replace />} />
          <Route path="datasets" element={<DatasetsTab />} />
          <Route path="consumables" element={<Navigate to="/technical/consumables" replace />} />
          <Route path="wdb" element={<WDBTab />} />
          <Route path="import-sql" element={<ImportSQLTab />} />
          <Route path="dbc" element={<DBCTab />} />
        </Route>
        <Route path="/account" element={<AccountLayout />}>
          <Route index element={<Navigate to="/account/settings" replace />} />
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="characters" element={<CharacterSettings />} />
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