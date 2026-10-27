import { lazy, Suspense } from "react"
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Home } from "./pages/Home"
import { NitroPayRuntime } from "./components/Ads/NitroPayRuntime"
import { Layout } from "./components/Layout/Layout"
import { RouteLoadingFallback } from "./components/Layout/RouteLoadingFallback"

const Login = lazy(() => import("./pages/Login/Login").then(({ Login }) => ({ default: Login })))
const Contact = lazy(() => import("./pages/Contact").then(({ Contact }) => ({ default: Contact })))
const BecomeSupporter = lazy(() => import("./pages/BecomeSupporter").then(({ BecomeSupporter }) => ({ default: BecomeSupporter })))
const Privacy = lazy(() => import("./pages/Privacy").then(({ Privacy }) => ({ default: Privacy })))
const RefundPolicy = lazy(() => import("./pages/RefundPolicy").then(({ RefundPolicy }) => ({ default: RefundPolicy })))
const Disclaimer = lazy(() => import("./pages/Disclaimer").then(({ Disclaimer }) => ({ default: Disclaimer })))
const SupportedInstances = lazy(() => import("./pages/SupportedInstances").then(({ SupportedInstances }) => ({ default: SupportedInstances })))
const Terms = lazy(() => import("./pages/Terms").then(({ Terms }) => ({ default: Terms })))
const ParsingPage = lazy(() => import("./pages/Parsing/ParsingPage").then(({ ParsingPage }) => ({ default: ParsingPage })))
const CohortViewerPage = lazy(() => import("./pages/Parsing/CohortViewerPage").then(({ CohortViewerPage }) => ({ default: CohortViewerPage })))
const Empty = lazy(() => import("./pages/Empty").then(({ Empty }) => ({ default: Empty })))
const Upload = lazy(() => import("./pages/Upload/Upload").then(({ Upload }) => ({ default: Upload })))
const LogsList = lazy(() => import("./pages/Logs/LogsList").then(({ LogsList }) => ({ default: LogsList })))
const LogDetail = lazy(() => import("./pages/Logs/LogDetail").then(({ LogDetail }) => ({ default: LogDetail })))
const LogDetailByHash = lazy(() => import("./pages/Logs/LogDetail").then(({ LogDetailByHash }) => ({ default: LogDetailByHash })))
const InstancePage = lazy(() => import("./pages/Instance/InstancePage").then(({ InstancePage }) => ({ default: InstancePage })))
const PopulationComparisonPage = lazy(() => import("./pages/Instance/Overview/PopulationComparisonPage").then(({ PopulationComparisonPage }) => ({ default: PopulationComparisonPage })))
const SharedViewRedirect = lazy(() => import("./pages/SharedViewRedirect").then(({ SharedViewRedirect }) => ({ default: SharedViewRedirect })))
const RecentRaids = lazy(() => import("./pages/Recent/RecentRaids").then(({ RecentRaids }) => ({ default: RecentRaids })))
const ProtoDecode = lazy(() => import("./pages/Debug/ProtoDecode").then(({ ProtoDecode }) => ({ default: ProtoDecode })))
const YouTubeSyncV3Page = lazy(() => import("./pages/YouTubeSyncV3/YouTubeSyncV3Page").then(({ YouTubeSyncV3Page }) => ({ default: YouTubeSyncV3Page })))
const AdminLayout = lazy(() => import("./pages/Admin/AdminLayout").then(({ AdminLayout }) => ({ default: AdminLayout })))
const AdminUsersOverview = lazy(() => import("./pages/Admin/AdminUsersOverview").then(({ AdminUsersOverview }) => ({ default: AdminUsersOverview })))
const AdminLogsPage = lazy(() => import("./pages/Admin/AdminLogsPage").then(({ AdminLogsPage }) => ({ default: AdminLogsPage })))
const AdminLeaderboardPage = lazy(() => import("./pages/Admin/AdminLeaderboardPage").then(({ AdminLeaderboardPage }) => ({ default: AdminLeaderboardPage })))
const AdminSiteSettingsPage = lazy(() => import("./pages/Admin/AdminSiteSettingsPage").then(({ AdminSiteSettingsPage }) => ({ default: AdminSiteSettingsPage })))
const AdminStoragePage = lazy(() => import("./pages/Admin/AdminStoragePage").then(({ AdminStoragePage }) => ({ default: AdminStoragePage })))
const AdminUsersPage = lazy(() => import("./pages/Admin/AdminUsersPage").then(({ AdminUsersPage }) => ({ default: AdminUsersPage })))
const ProofReview = lazy(() => import("./pages/Admin/ProofReview").then(({ ProofReview }) => ({ default: ProofReview })))
const RegressionPage = lazy(() => import("./pages/Admin/RegressionPage").then(({ RegressionPage }) => ({ default: RegressionPage })))
const AdminOutdatedInstancesPage = lazy(() => import("./pages/Admin/AdminOutdatedInstancesPage").then(({ AdminOutdatedInstancesPage }) => ({ default: AdminOutdatedInstancesPage })))
const AdminApplicationsListPage = lazy(() => import("./pages/Admin/AdminApplicationsListPage").then(({ AdminApplicationsListPage }) => ({ default: AdminApplicationsListPage })))
const AdminCacheStatsPage = lazy(() => import("./pages/Admin/AdminCacheStatsPage").then(({ AdminCacheStatsPage }) => ({ default: AdminCacheStatsPage })))
const AdminParsingPage = lazy(() => import("./pages/Admin/AdminParsingPage").then(({ AdminParsingPage }) => ({ default: AdminParsingPage })))
const AdminCustomPanelsPage = lazy(() => import("./pages/Admin/AdminCustomPanelsPage").then(({ AdminCustomPanelsPage }) => ({ default: AdminCustomPanelsPage })))
const AdminBillingPage = lazy(() => import("./pages/Admin/AdminBillingPage").then(({ AdminBillingPage }) => ({ default: AdminBillingPage })))
const GearLayout = lazy(() => import("./pages/Gear/GearLayout").then(({ GearLayout }) => ({ default: GearLayout })))
const GearListPage = lazy(() => import("./pages/Gear/builder/GearListPage").then(({ GearListPage }) => ({ default: GearListPage })))
const GearTrendsPage = lazy(() => import("./pages/Gear/trends/GearTrendsPage").then(({ GearTrendsPage }) => ({ default: GearTrendsPage })))
const GearProgressionsPage = lazy(() => import("./pages/Gear/progression/GearProgressionsPage").then(({ GearProgressionsPage }) => ({ default: GearProgressionsPage })))
const GearProgressionPage = lazy(() => import("./pages/Gear/progression/builder/GearProgressionPage").then(({ GearProgressionPage }) => ({ default: GearProgressionPage })))
const StatWeightsPage = lazy(() => import("./pages/Gear/weights/StatWeightsPage").then(({ StatWeightsPage }) => ({ default: StatWeightsPage })))
const ServersLayout = lazy(() => import("./pages/Servers").then(({ ServersLayout }) => ({ default: ServersLayout })))
const ServersPage = lazy(() => import("./pages/Servers").then(({ ServersPage }) => ({ default: ServersPage })))
const UploadKeysPage = lazy(() => import("./pages/Servers").then(({ UploadKeysPage }) => ({ default: UploadKeysPage })))
const TenantsPage = lazy(() => import("./pages/Servers").then(({ TenantsPage }) => ({ default: TenantsPage })))
const RetentionPage = lazy(() => import("./pages/Servers").then(({ RetentionPage }) => ({ default: RetentionPage })))
const SpellPage = lazy(() => import("./pages/WoWDB/SpellPage").then(({ SpellPage }) => ({ default: SpellPage })))
const SpellByNamePage = lazy(() => import("./pages/WoWDB/SpellByNamePage").then(({ SpellByNamePage }) => ({ default: SpellByNamePage })))
const ItemPage = lazy(() => import("./pages/WoWDB/ItemPage").then(({ ItemPage }) => ({ default: ItemPage })))
const ItemExplorerPage = lazy(() => import("./pages/WoWDB/ItemExplorerPage").then(({ ItemExplorerPage }) => ({ default: ItemExplorerPage })))
const SpellExplorerPage = lazy(() => import("./pages/WoWDB/SpellExplorerPage").then(({ SpellExplorerPage }) => ({ default: SpellExplorerPage })))
const CreatureExplorerPage = lazy(() => import("./pages/WoWDB/CreatureExplorerPage").then(({ CreatureExplorerPage }) => ({ default: CreatureExplorerPage })))
const ItemSetExplorerPage = lazy(() => import("./pages/WoWDB/ItemSetExplorerPage").then(({ ItemSetExplorerPage }) => ({ default: ItemSetExplorerPage })))
const ItemSetDetailPage = lazy(() => import("./pages/WoWDB/ItemSetDetailPage").then(({ ItemSetDetailPage }) => ({ default: ItemSetDetailPage })))
const WoWDBLayout = lazy(() => import("./pages/WoWDB/WoWDBLayout").then(({ WoWDBLayout }) => ({ default: WoWDBLayout })))
const TechnicalDetailsPage = lazy(() => import("./pages/Technical").then(({ TechnicalDetailsPage }) => ({ default: TechnicalDetailsPage })))
const TechnicalHintsPage = lazy(() => import("./pages/Technical").then(({ TechnicalHintsPage }) => ({ default: TechnicalHintsPage })))
const CosmeticSandboxPage = lazy(() => import("./pages/Technical").then(({ CosmeticSandboxPage }) => ({ default: CosmeticSandboxPage })))
const PeriodicSpellsPage = lazy(() => import("./pages/Technical").then(({ PeriodicSpellsPage }) => ({ default: PeriodicSpellsPage })))
const ExtraAttackSpellsPage = lazy(() => import("./pages/Technical").then(({ ExtraAttackSpellsPage }) => ({ default: ExtraAttackSpellsPage })))
const VulnerabilitySpellsPage = lazy(() => import("./pages/Technical").then(({ VulnerabilitySpellsPage }) => ({ default: VulnerabilitySpellsPage })))
const AuraDurationModifiersPage = lazy(() => import("./pages/Technical").then(({ AuraDurationModifiersPage }) => ({ default: AuraDurationModifiersPage })))
const ClassSpellsPage = lazy(() => import("./pages/Technical").then(({ ClassSpellsPage }) => ({ default: ClassSpellsPage })))
const ClassBuffsPage = lazy(() => import("./pages/Technical").then(({ ClassBuffsPage }) => ({ default: ClassBuffsPage })))
const SpecClassIconsPage = lazy(() => import("./pages/Technical").then(({ SpecClassIconsPage }) => ({ default: SpecClassIconsPage })))
const TalentTreesPage = lazy(() => import("./pages/Technical").then(({ TalentTreesPage }) => ({ default: TalentTreesPage })))
const PetTargetingAbilitiesPage = lazy(() => import("./pages/Technical").then(({ PetTargetingAbilitiesPage }) => ({ default: PetTargetingAbilitiesPage })))
const ConsumablesPage = lazy(() => import("./pages/Technical").then(({ ConsumablesPage }) => ({ default: ConsumablesPage })))
const CooldownSpellsPage = lazy(() => import("./pages/Technical").then(({ CooldownSpellsPage }) => ({ default: CooldownSpellsPage })))
const MapGalleryPage = lazy(() => import("./pages/Technical").then(({ MapGalleryPage }) => ({ default: MapGalleryPage })))
const MiniaturesPage = lazy(() => import("./pages/Technical").then(({ MiniaturesPage }) => ({ default: MiniaturesPage })))
const AccountLayout = lazy(() => import("./pages/Settings").then(({ AccountLayout }) => ({ default: AccountLayout })))
const ProfileSettings = lazy(() => import("./pages/Settings").then(({ ProfileSettings }) => ({ default: ProfileSettings })))
const BillingSettings = lazy(() => import("./pages/Settings").then(({ BillingSettings }) => ({ default: BillingSettings })))
const CharacterSettings = lazy(() => import("./pages/Settings").then(({ CharacterSettings }) => ({ default: CharacterSettings })))
const StorageSettings = lazy(() => import("./pages/Settings").then(({ StorageSettings }) => ({ default: StorageSettings })))
const SidekickSettings = lazy(() => import("./pages/Settings").then(({ SidekickSettings }) => ({ default: SidekickSettings })))
const NotificationSettings = lazy(() => import("./pages/Settings").then(({ NotificationSettings }) => ({ default: NotificationSettings })))
const PrivacySettings = lazy(() => import("./pages/Settings").then(({ PrivacySettings }) => ({ default: PrivacySettings })))
const AppearanceSettings = lazy(() => import("./pages/Settings").then(({ AppearanceSettings }) => ({ default: AppearanceSettings })))
const CustomPanelSettings = lazy(() => import("./pages/Settings").then(({ CustomPanelSettings }) => ({ default: CustomPanelSettings })))
const LayoutBookSettings = lazy(() => import("./pages/Settings").then(({ LayoutBookSettings }) => ({ default: LayoutBookSettings })))
const LayoutLabSettings = lazy(() => import("./pages/Settings").then(({ LayoutLabSettings }) => ({ default: LayoutLabSettings })))
const GuildAnalytics = lazy(() => import("./pages/GuildPage").then(({ GuildAnalytics }) => ({ default: GuildAnalytics })))
const GuildPage = lazy(() => import("./pages/GuildPage").then(({ GuildPage }) => ({ default: GuildPage })))
const GuildPageEditor = lazy(() => import("./pages/GuildPage").then(({ GuildPageEditor }) => ({ default: GuildPageEditor })))
const GuildRoster = lazy(() => import("./pages/GuildPage").then(({ GuildRoster }) => ({ default: GuildRoster })))
const GuildSettings = lazy(() => import("./pages/GuildPage").then(({ GuildSettings }) => ({ default: GuildSettings })))
const ArmoryAnalysisRedirect = lazy(() => import("./pages/ArmoryPage").then(({ ArmoryAnalysisRedirect }) => ({ default: ArmoryAnalysisRedirect })))
const ArmoryPage = lazy(() => import("./pages/ArmoryPage").then(({ ArmoryPage }) => ({ default: ArmoryPage })))
const PerformanceComparisonPage = lazy(() => import("./pages/ArmoryPage").then(({ PerformanceComparisonPage }) => ({ default: PerformanceComparisonPage })))
const ArmorySearchPage = lazy(() => import("./pages/ArmorySearch").then(({ ArmorySearchPage }) => ({ default: ArmorySearchPage })))
const GuildSearchPage = lazy(() => import("./pages/GuildSearch").then(({ GuildSearchPage }) => ({ default: GuildSearchPage })))
const ApplyPage = lazy(() => import("./pages/Apply/ApplyPage").then(({ ApplyPage }) => ({ default: ApplyPage })))
const ApplicationPage = lazy(() => import("./pages/Apply/ApplicationPage").then(({ ApplicationPage }) => ({ default: ApplicationPage })))
const SimPage = lazy(() => import("./pages/Sim").then(({ SimPage }) => ({ default: SimPage })))
const RaidPlannerPage = lazy(() => import("./pages/RaidPlanner").then(({ RaidPlannerPage }) => ({ default: RaidPlannerPage })))
const TalentCalculatorPage = lazy(() => import("./pages/TalentCalculator/TalentCalculatorPage").then(({ TalentCalculatorPage }) => ({ default: TalentCalculatorPage })))
const GameDataLayout = lazy(() => import("./pages/GameData/GameDataPage").then(({ GameDataLayout }) => ({ default: GameDataLayout })))
const WDBTab = lazy(() => import("./pages/GameData/WDBTab").then(({ WDBTab }) => ({ default: WDBTab })))
const ImportSQLTab = lazy(() => import("./pages/GameData/ImportSQLTab").then(({ ImportSQLTab }) => ({ default: ImportSQLTab })))
const DBCTab = lazy(() => import("./pages/GameData/DBCTab").then(({ DBCTab }) => ({ default: DBCTab })))
const DatasetsTab = lazy(() => import("./pages/GameData/DatasetsTab").then(({ DatasetsTab }) => ({ default: DatasetsTab })))
const LeaderboardsPage = lazy(() => import("./pages/Leaderboards/LeaderboardsPage").then(({ LeaderboardsPage }) => ({ default: LeaderboardsPage })))
const LegacyLeaderboardsRedirect = lazy(() => import("./pages/Leaderboards/LeaderboardsPage").then(({ LegacyLeaderboardsRedirect }) => ({ default: LegacyLeaderboardsRedirect })))
const CensusPage = lazy(() => import("./pages/Census/CensusPage").then(({ CensusPage }) => ({ default: CensusPage })))
const APIExplorer = lazy(() => import("./pages/APIExplorer/APIExplorer").then(({ APIExplorer }) => ({ default: APIExplorer })))
const LuaProjectsPage = lazy(() => import("./pages/LuaProjects/LuaProjectsPage").then(({ LuaProjectsPage }) => ({ default: LuaProjectsPage })))
const LuaProjectPage = lazy(() => import("./pages/LuaProjects/LuaProjectsPage").then(({ LuaProjectPage }) => ({ default: LuaProjectPage })))
const LuaProjectWorkspacePage = lazy(() => import("./pages/LuaProjects/LuaProjectWorkspacePage"))
const LuaPanelApiPage = lazy(() => import("./pages/LuaProjects/LuaPanelApiPage"))
const AssistantDebugPage = lazy(() => import("./pages/AssistantDebug/AssistantDebugPage"))
const CustomPanelsPage = lazy(() => import("./pages/Tools/CustomPanelsPage").then(({ CustomPanelsPage }) => ({ default: CustomPanelsPage })))
const ToolsPage = lazy(() => import("./pages/Tools/ToolsPage").then(({ ToolsPage }) => ({ default: ToolsPage })))
const SpeedrunningPage = lazy(() => import("./pages/Speedrunning/SpeedrunningPage").then(({ SpeedrunningPage }) => ({ default: SpeedrunningPage })))
const MapLegendPage = lazy(() => import("./pages/MapLegend/MapLegendPage").then(({ MapLegendPage }) => ({ default: MapLegendPage })))
const ClassDetailsPage = lazy(() => import("./pages/ClassDetails/ClassDetailsPage").then(({ ClassDetailsPage }) => ({ default: ClassDetailsPage })))
const SubspecsPage = lazy(() => import("./pages/Subspecs/SubspecsPage").then(({ SubspecsPage }) => ({ default: SubspecsPage })))
const TenantDatasetLayout = lazy(() => import("./components/Layout/TenantDatasetLayout").then(({ TenantDatasetLayout }) => ({ default: TenantDatasetLayout })))

// Backend-handled paths that should bypass React Router
const BACKEND_PATHS = ["/saffron", "/river", "/api", "/auth"]

function LegacyYouTubeSyncRedirect() {
  const location = useLocation()
  return <Navigate to={`/youtube-sync-v3${location.search}${location.hash}`} replace />
}

/** Moves a renamed section (e.g. /lua-projects → /addons), keeping the rest of the path, query and hash. */
function RenamedPathRedirect({ from, to }: { from: string; to: string }) {
  const location = useLocation()
  return <Navigate to={`${to}${location.pathname.slice(from.length)}${location.search}${location.hash}`} replace />
}

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
    <>
      <NitroPayRuntime />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/youtube-sync" element={<LegacyYouTubeSyncRedirect />} />
      <Route path="/youtube-sync-v2" element={<LegacyYouTubeSyncRedirect />} />
      <Route path="/youtube-sync-v3" element={<YouTubeSyncV3Page />} />
      {/* Pop-out window opened from a chat's Prompt inspector; no site chrome. */}
      <Route path="/debug/assistant" element={<AssistantDebugPage />} />
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
        <Route path="/performance-history" element={<PerformanceComparisonPage />} />
        <Route path="/armory/:realmName/:playerIdentifier/analysis" element={<ArmoryAnalysisRedirect />} />
        <Route path="/armory/:realmName/:playerIdentifier" element={<ArmoryPage />} />
        <Route path="/sim" element={<SimPage />} />
        <Route path="/raidplanner" element={<RaidPlannerPage />} />
        <Route path="/leaderboards" element={<LegacyLeaderboardsRedirect />} />
        <Route path="/leaderboards/statistics" element={<LeaderboardsPage mode="statistics" />} />
        <Route path="/leaderboards/speedruns" element={<LeaderboardsPage mode="speedruns" />} />
        <Route path="/leaderboards/parsing" element={<LeaderboardsPage mode="parsing" />} />
        <Route path="/leaderboard" element={<LegacyLeaderboardsRedirect />} />
        <Route path="/rankings" element={<LegacyLeaderboardsRedirect />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/:id" element={<ApplicationPage />} />
        <Route path="/census" element={<CensusPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/addons" element={<LuaProjectsPage />} />
        <Route path="/addons/api" element={<LuaPanelApiPage />} />
        <Route path="/addons/:projectId" element={<LuaProjectPage />} />
        <Route path="/addons/:projectId/edit" element={<LuaProjectWorkspacePage />} />
        <Route path="/lua-projects/*" element={<RenamedPathRedirect from="/lua-projects" to="/addons" />} />
        <Route path="/tools/developer-panels" element={<CustomPanelsPage />} />
        <Route path="/tools/custom-panels" element={<RenamedPathRedirect from="/tools/custom-panels" to="/tools/developer-panels" />} />
        <Route path="/developers/api" element={<APIExplorer />} />
        <Route path="/debug/proto" element={<ProtoDecode />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/users-overview" replace />} />
          <Route path="users-overview" element={<AdminUsersOverview />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="leaderboard" element={<AdminLeaderboardPage />} />
          <Route path="site-settings" element={<AdminSiteSettingsPage />} />
          <Route path="photo-proofs" element={<ProofReview />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="storage" element={<AdminStoragePage />} />
          <Route path="regression" element={<RegressionPage />} />
          <Route path="outdated-instances" element={<AdminOutdatedInstancesPage />} />
          <Route path="applications" element={<AdminApplicationsListPage />} />
          <Route path="cache-stats" element={<AdminCacheStatsPage />} />
          <Route path="custom-panels" element={<AdminCustomPanelsPage />} />
          <Route path="billing" element={<AdminBillingPage />} />
          <Route path="parsing" element={<AdminParsingPage />} />
        </Route>
        <Route path="/servers" element={<ServersLayout />}>
          <Route index element={<ServersPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="keys" element={<UploadKeysPage />} />
          <Route path="retention" element={<RetentionPage />} />
        </Route>
        <Route element={<TenantDatasetLayout />}>
          <Route path="/talents" element={<TalentCalculatorPage />} />
          <Route path="/talents/:classSlug" element={<TalentCalculatorPage />} />
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
            <Route index element={<Navigate to="progression" replace />} />
            <Route path="weights" element={<StatWeightsPage />} />
            <Route path="trends" element={<GearTrendsPage />} />
            <Route path="progression" element={<GearProgressionsPage />} />
          </Route>
          <Route path="/gear/lists/:listID" element={<GearListPage />} />
          <Route path="/gear/progression/:progressionID" element={<GearProgressionPage />} />
        </Route>
        <Route path="/technical" element={<TenantDatasetLayout />}>
          <Route index element={<TechnicalDetailsPage />} />
          <Route path="hints" element={<TechnicalHintsPage />} />
          <Route path="cosmetic" element={<CosmeticSandboxPage />} />
          <Route path="extra-attack-spells" element={<ExtraAttackSpellsPage />} />
          <Route path="vulnerability-spells" element={<VulnerabilitySpellsPage />} />
          <Route path="periodic-spells" element={<PeriodicSpellsPage />} />
          <Route path="aura-duration-modifiers" element={<AuraDurationModifiersPage />} />
          <Route path="class-spells" element={<ClassSpellsPage />} />
          <Route path="class-buffs" element={<ClassBuffsPage />} />
          <Route path="pet-targeting-abilities" element={<PetTargetingAbilitiesPage />} />
          <Route path="spec-class-icons" element={<SpecClassIconsPage />} />
          <Route path="talent-trees" element={<TalentTreesPage />} />
          <Route path="consumables" element={<ConsumablesPage />} />
          <Route path="cooldowns" element={<CooldownSpellsPage />} />
          <Route path="maps" element={<MapGalleryPage />} />
          <Route path="miniatures" element={<MiniaturesPage />} />
        </Route>
        <Route path="/contact" element={<Contact />} />
        <Route path="/supporter" element={<BecomeSupporter />} />
        <Route path="/revered" element={<Navigate to="/supporter" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/supported" element={<SupportedInstances />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/parsing" element={<ParsingPage />} />
        <Route path="/parsing/cohorts" element={<CohortViewerPage />} />
        <Route path="/speedrunning" element={<SpeedrunningPage />} />
        <Route path="/map-legend" element={<MapLegendPage />} />
        <Route path="/subspecs" element={<SubspecsPage />} />
        <Route path="/class-details" element={<ClassDetailsPage />} />
        <Route path="/g/:guildId" element={<GuildPage />} />
        <Route path="/g/:guildId/:tabSlug" element={<GuildPage />} />
        <Route path="/g/:guildId/edit" element={<GuildPageEditor />} />
        <Route path="/g/:guildId/roster" element={<GuildRoster />} />
        <Route path="/g/:guildId/analytics" element={<GuildAnalytics />} />
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
          <Route path="billing" element={<BillingSettings />} />
          <Route path="characters" element={<CharacterSettings />} />
          <Route path="storage" element={<StorageSettings />} />
          <Route path="sidekick" element={<SidekickSettings />} />
          <Route path="notifications" element={<NotificationSettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="developer-panels" element={<CustomPanelSettings />} />
          <Route path="custom-panels" element={<Navigate to="/account/developer-panels" replace />} />
          <Route path="layout-book" element={<LayoutBookSettings />} />
          <Route path="layout-lab" element={<LayoutLabSettings />} />
        </Route>
      </Route>
        <Route path="*" element={<CatchAllRoute />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App