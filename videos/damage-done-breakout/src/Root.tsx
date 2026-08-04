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
      </Folder>
    </>
  );
};
