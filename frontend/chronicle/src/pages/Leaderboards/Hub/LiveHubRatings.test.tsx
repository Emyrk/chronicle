import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { setBoardPage, setBoardURL } from "@/pages/Leaderboards/Ratings/setBoard"
import { LiveHubRatings, type LiveHubRatingsProps } from "./LiveHubRatings"
import { resolvedHubMetadata } from "./resolvedHubAdapter"
import { configuration } from "./v2RatingAdapter.testdata"

vi.mock("@tanstack/react-query", () => ({
 useQuery: () => ({data:undefined,isPending:true}),
 useQueries: ({queries}:{queries:unknown[]}) => queries.map(()=>({isPending:false,isError:false,data:{params:new URLSearchParams({class:"MAGE",spec:"Frost"}),response:{status:"ready",included_bosses:["A"],entries:[{realm_id:"realm",subject_id:"guid",name:"Actual player",score:0,peak:0,mastery:0,renown:0,sample_count:1,computed_at:"2026-01-01"}]}}})),
}))
const props:LiveHubRatingsProps={instanceName:"Raid",bosses:["A","B"],selected:[],scope:{cls:"MAGE",spec:"Frost"},onScope:vi.fn(),view:"overview",onView:vi.fn(),period:"all",subject:"player",role:"dps",cohort:{difficulty:"",maxPlayers:0},where:"Raid",summary:resolvedHubMetadata(configuration,{instanceName:"Raid",performance:"dps"},[],[{player_class:"MAGE",player_spec:"Frost",player_sub_spec:"",metric:"dps"}])}
describe("existing Hub ratings on current-policy data",()=>{
 it("retains the existing boards and shows real entries with all-time and Renown scope notice",()=>{
  const html=renderToStaticMarkup(<LiveHubRatings {...props}/> )
  expect(html).toContain("Actual player")
  expect(html).toContain("All-time")
  expect(html).toContain("independent of set and class filters")
  expect(html).not.toContain("1,300/s")
 })
 it("explicitly reports a missing configured variant",()=>{
  expect(renderToStaticMarkup(<LiveHubRatings {...props} cohort={undefined}/>)).toContain("No enabled instance variant")
 })
})

describe("set board client", () => {
  it("builds one canonical URL per page and maps rows with all three scores", () => {
    const url = new URL(setBoardURL({ instanceName: "Molten Core", encounters: ["Lucifron", "Ragnaros"], subject: "player", metric: "mastery", period: "all",
      cohort: { difficulty: "", maxPlayers: 0 }, performance: "dps", cls: "MAGE", spec: "Fire", realmIDs: ["b", "a"], query: " zed ", page: 2, limit: 50 }), "http://x")
    expect(url.pathname).toBe("/api/v1/rankings/ratings/set-board")
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ encounter_names: "Lucifron,Ragnaros", rating_metric: "mastery", window: "all",
      class: "MAGE", spec: "Fire", realm_ids: "a,b", query: "zed", page: "2", max_players: "0", difficulty_name: "" })
    const page = setBoardPage({ rows: [{ rank: 7, realm_id: "r", realm_name: "R", subject_id: "g", name: "Zed", guild_name: "G", player_class: "MAGE",
      player_spec: "Fire", player_sub_spec: "", score: 80, peak: 90, mastery: 80, renown: 12, peak_raw: 1500 }], total: 40, page: 2, has_next_page: true }, "mastery")
    expect(page.rows[0].rank).toBe(7)
    expect(page.rows[0].scores?.peak?.raw).toBe(1500)
    expect(page.rows[0].entry.raw).toBeUndefined()
    expect(page.rows[0].entry).toMatchObject({ realm: "R", guid: "g" })
    expect(page.hasPreviousPage && page.hasNextPage).toBe(true)
    const withParts = setBoardPage({ rows: [{ rank: 1, realm_id: "r", realm_name: "R", subject_id: "g", name: "Zed", guild_name: "", player_class: "MAGE",
      player_spec: "Fire", player_sub_spec: "", score: 80, peak: 90, mastery: 80, renown: 0, mastery_parts: { peak: 91, form: 82, floor: 60, eligible_kills: 7 } }],
      total: 1, page: 0, has_next_page: false }, "mastery")
    expect(withParts.rows[0].entry.publishedMastery).toEqual({ peak: 91, form: 82, floor: 60, eligibleKills: 7 })
  })
})
