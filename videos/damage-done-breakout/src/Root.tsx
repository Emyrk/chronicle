import "../../../frontend/chronicle/src/index.css";
import "./index.css";
import { Composition, Folder } from "remotion";
import PinBreakoutVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/PinBreakout.video";
import ReadChartVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/ReadChart.video";
import TotalVsDpsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/TotalVsDps.video";
import ParseScoresVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/ParseScores.video";
import BreakoutTourVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/BreakoutTour.video";
import SpellRanksVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/SpellRanks.video";
import FiltersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/Filters.video";
import CompareAbilitiesVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/CompareAbilities.video";
import ReadHealingChartVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/ReadHealingChart.video";
import HealingModesVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/HealingModes.video";
import TotalVsHpsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/TotalVsHps.video";
import HealerBreakoutVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/HealerBreakout.video";
import HealingRanksVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/HealingRanks.video";
import CompareHealersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/CompareHealers.video";
import HealingFiltersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/HealingFilters.video";
import ReadLineChartVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/ReadLineChart.video";
import TimeRangeSelectVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/TimeRangeSelect.video";
import LegendToggleVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/LegendToggle.video";
import AggregationsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/Aggregations.video";
import EditSeriesVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/EditSeries.video";
import RaidDurabilityVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/explain/videos/RaidDurability.video";
import ReadDeathLogVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Deaths/explain/videos/ReadDeathLog.video";
import DeathRecapExpandVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Deaths/explain/videos/DeathRecapExpand.video";
import FloatingRecapVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Deaths/explain/videos/FloatingRecap.video";
import HealthBarAnatomyVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Deaths/explain/videos/HealthBarAnatomy.video";
import AllActivityStreamsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/AllActivity/explain/videos/Streams.video";
import AllActivityQuickFiltersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/AllActivity/explain/videos/QuickFilters.video";
import AllActivityTimeFormatsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/AllActivity/explain/videos/TimeFormats.video";
import AllActivityAdvancedFiltersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/AllActivity/explain/videos/AdvancedFilters.video";
import FocusPlayerVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/videos/FocusPlayer.video";
import FocusPlayerHealingVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/HealingDone/explain/videos/FocusPlayerHealing.video";
import UnderstandGearVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Equipment/explain/videos/UnderstandGear.video";
import ReadTalentsVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Equipment/explain/videos/ReadTalents.video";
import ComparePlayersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/Equipment/explain/videos/ComparePlayers.video";
import LeaderboardReadProofVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/LeaderboardPanel/explain/videos/ReadProof.video";
import LeaderboardEligibilityChecksVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/LeaderboardPanel/explain/videos/EligibilityChecks.video";
import LeaderboardFindBlockersVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/LeaderboardPanel/explain/videos/FindBlockers.video";
import VulnerabilityEstimateVideo from "../../../frontend/chronicle/src/pages/Instance/EventsPanels/VulnerabilityEffect/explain/videos/Estimate.video";

/**
 * Studio registration for the in-app explainer lesson compositions.
 * The app plays these via @remotion/player; this project exists so they can
 * be authored/previewed in Remotion Studio (npx remotion studio --no-open).
 * Keep durations in sync with the LessonVideo entries in
 * frontend/chronicle/src/pages/Instance/EventsPanels/DamageDone/explain/lessons.ts.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Folder name="DamageDoneLessons">
      <Composition
        id="PinBreakout"
        component={PinBreakoutVideo}
        durationInFrames={470}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="ReadChart"
        component={ReadChartVideo}
        durationInFrames={350}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="TotalVsDps"
        component={TotalVsDpsVideo}
        durationInFrames={320}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="ParseScores"
        component={ParseScoresVideo}
        durationInFrames={350}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="BreakoutTour"
        component={BreakoutTourVideo}
        durationInFrames={470}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="SpellRanks"
        component={SpellRanksVideo}
        durationInFrames={380}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="Filters"
        component={FiltersVideo}
        durationInFrames={500}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="CompareAbilities"
        component={CompareAbilitiesVideo}
        durationInFrames={470}
        fps={30}
        width={1280}
        height={720}
      />
    </Folder>
      <Folder name="HealingDoneLessons">
        <Composition id="ReadHealingChart" component={ReadHealingChartVideo} durationInFrames={410} fps={30} width={1280} height={720} />
        <Composition id="HealingModes" component={HealingModesVideo} durationInFrames={440} fps={30} width={1280} height={720} />
        <Composition id="TotalVsHps" component={TotalVsHpsVideo} durationInFrames={320} fps={30} width={1280} height={720} />
        <Composition id="HealerBreakout" component={HealerBreakoutVideo} durationInFrames={530} fps={30} width={1280} height={720} />
        <Composition id="HealingRanks" component={HealingRanksVideo} durationInFrames={380} fps={30} width={1280} height={720} />
        <Composition id="CompareHealers" component={CompareHealersVideo} durationInFrames={470} fps={30} width={1280} height={720} />
        <Composition id="HealingFilters" component={HealingFiltersVideo} durationInFrames={500} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="TimelineLessons">
        <Composition id="ReadLineChart" component={ReadLineChartVideo} durationInFrames={350} fps={30} width={1280} height={720} />
        <Composition id="TimeRangeSelect" component={TimeRangeSelectVideo} durationInFrames={470} fps={30} width={1280} height={720} />
        <Composition id="LegendToggle" component={LegendToggleVideo} durationInFrames={380} fps={30} width={1280} height={720} />
        <Composition id="Aggregations" component={AggregationsVideo} durationInFrames={530} fps={30} width={1280} height={720} />
        <Composition id="EditSeries" component={EditSeriesVideo} durationInFrames={530} fps={30} width={1280} height={720} />
        <Composition id="RaidDurability" component={RaidDurabilityVideo} durationInFrames={530} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="DeathLogLessons">
        <Composition id="ReadDeathLog" component={ReadDeathLogVideo} durationInFrames={410} fps={30} width={1280} height={720} />
        <Composition id="DeathRecapExpand" component={DeathRecapExpandVideo} durationInFrames={470} fps={30} width={1280} height={720} />
        <Composition id="FloatingRecap" component={FloatingRecapVideo} durationInFrames={620} fps={30} width={1280} height={720} />
        <Composition id="HealthBarAnatomy" component={HealthBarAnatomyVideo} durationInFrames={530} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="AllActivityLessons">
        <Composition id="AllActivityStreams" component={AllActivityStreamsVideo} durationInFrames={520} fps={30} width={1280} height={720} />
        <Composition id="AllActivityQuickFilters" component={AllActivityQuickFiltersVideo} durationInFrames={530} fps={30} width={1280} height={720} />
        <Composition id="AllActivityTimeFormats" component={AllActivityTimeFormatsVideo} durationInFrames={470} fps={30} width={1280} height={720} />
        <Composition id="AllActivityAdvancedFilters" component={AllActivityAdvancedFiltersVideo} durationInFrames={500} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="EquipmentLessons">
        <Composition id="EquipmentUnderstandGear" component={UnderstandGearVideo} durationInFrames={380} fps={30} width={1280} height={720} />
        <Composition id="EquipmentReadTalents" component={ReadTalentsVideo} durationInFrames={410} fps={30} width={1280} height={720} />
        <Composition id="EquipmentComparePlayers" component={ComparePlayersVideo} durationInFrames={440} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="LeaderboardLessons">
        <Composition id="LeaderboardReadProof" component={LeaderboardReadProofVideo} durationInFrames={350} fps={30} width={1280} height={720} />
        <Composition id="LeaderboardEligibilityChecks" component={LeaderboardEligibilityChecksVideo} durationInFrames={350} fps={30} width={1280} height={720} />
        <Composition id="LeaderboardFindBlockers" component={LeaderboardFindBlockersVideo} durationInFrames={350} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="FocusLessons">
        <Composition id="FocusPlayer" component={FocusPlayerVideo} durationInFrames={470} fps={30} width={1280} height={720} />
        <Composition id="FocusPlayerHealing" component={FocusPlayerHealingVideo} durationInFrames={470} fps={30} width={1280} height={720} />
      </Folder>
      <Folder name="VulnerabilityEffectLessons">
        <Composition id="VulnerabilityEstimate" component={VulnerabilityEstimateVideo} durationInFrames={650} fps={30} width={1280} height={720} />
      </Folder>
    </>
  );
};
