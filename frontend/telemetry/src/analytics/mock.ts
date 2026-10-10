import type { AnalyticsDashboard } from "./types";

const DAY_MS = 86_400_000;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function metric(value: number, previous: number) {
  return {
    value,
    previous,
    changePercent: previous === 0 ? null : ((value - previous) / previous) * 100,
  };
}

export function createMockAnalyticsDashboard(days: number): AnalyticsDashboard {
  const factor = days / 30;
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_MS);

  const pointCount = Math.min(days, 30);
  const timeseries = Array.from({ length: pointCount }, (_, index) => {
    const date = new Date(start.getTime() + index * ((days - 1) / Math.max(pointCount - 1, 1)) * DAY_MS);
    const rhythm = 0.86 + Math.sin(index * 0.72) * 0.12 + Math.sin(index * 0.21) * 0.08;
    const launchLift = index > pointCount * 0.62 ? 1.13 : 1;
    return {
      date: isoDate(date),
      pageViews: Math.round((527_165 / pointCount) * rhythm * launchLift),
      activeUsers: Math.round((7_527 / pointCount) * (0.91 + Math.sin(index * 0.51) * 0.09)),
    };
  });

  const productBase = [
    ["leaderboards", "Leaderboards & rankings", 160_196],
    ["instance_reports", "Instance reports", 121_419],
    ["armory_search", "Armory search", 67_036],
    ["armory_players", "Armory players", 60_685],
    ["home", "Home", 34_074],
    ["recent", "Recent activity", 22_240],
    ["talents", "Talent calculator", 13_323],
    ["guilds", "Guild pages", 11_960],
    ["other", "Rest / uncategorized", 9_378],
    ["performance", "Performance history", 6_607],
    ["logs_collection", "My Logs", 5_881],
    ["log_detail", "Log details", 5_208],
    ["upload", "Upload", 4_926],
    ["gear", "Gear planner", 2_622],
    ["account", "Account & settings", 1_604],
    ["instance_collection", "Instance collection", 6],
  ] as const;
  const productFamilies = productBase.map(([id, label, pageViews]) => ({
    id,
    label,
    pageViews: Math.round(pageViews * factor),
    share: pageViews / 527_165,
  }));
  const scaleFamilies = (families: Record<string, number | undefined>) =>
    Object.fromEntries(
      Object.entries(families).map(([id, pageViews]) => [id, Math.round((pageViews ?? 0) * factor)])
    );
  const serverProducts = [
    {
      hostname: "octo.chronicleclassic.com",
      pageViews: 257_359,
      families: { leaderboards:64_917, instance_reports:59_524, armory_search:43_357, armory_players:39_947, home:12_556, recent:9_336, talents:7_307, guilds:5_317, performance:4_150, other:4_294, gear:1_917, log_detail:1_511, logs_collection:1_369, upload:1_352, account:502, instance_collection:3 },
    },
    {
      hostname: "capy.chronicleclassic.com",
      pageViews: 235_773,
      families: { leaderboards:88_863, instance_reports:50_256, armory_search:21_726, armory_players:19_410, home:18_917, recent:10_980, guilds:6_093, talents:4_040, logs_collection:3_881, other:3_393, upload:2_790, log_detail:2_554, performance:1_476, account:763, gear:630, instance_collection:1 },
    },
    {
      hostname: "chromie.chronicleclassic.com",
      pageViews: 19_174,
      families: { instance_reports:7_729, leaderboards:4_480, home:1_033, armory_search:991, other:980, performance:761, recent:691, armory_players:615, log_detail:609, upload:378, guilds:297, logs_collection:253, talents:159, account:147, gear:51 },
    },
    {
      hostname: "legacy.chronicleclassic.com",
      pageViews: 5_565,
      families: { leaderboards:1_212, instance_reports:1_082, armory_search:675, home:618, armory_players:478, other:321, log_detail:230, recent:224, guilds:195, upload:170, account:159, logs_collection:145, performance:36, gear:14, talents:6 },
    },
    {
      hostname: "crusader-storm.chronicleclassic.com",
      pageViews: 2_314,
      families: { instance_reports:788, talents:515, recent:410, logs_collection:142, performance:105, upload:80, log_detail:76, leaderboards:67, other:34, home:33, armory_search:31, armory_players:26, guilds:4, account:2, instance_collection:1 },
    },
    {
      hostname: "kronos.chronicleclassic.com",
      pageViews: 1_769,
      families: { instance_reports:952, leaderboards:264, home:186, recent:90, log_detail:76, other:72, upload:57, logs_collection:26, armory_search:20, guilds:16, armory_players:6, account:4 },
    },
  ].map((server) => ({
    hostname: server.hostname,
    pageViews: Math.round(server.pageViews * factor),
    families: scaleFamilies(server.families),
  }));
  const leaderboardTotal = Math.round(160_196 * factor);
  const leaderboardClassified = Math.round(160_179 * factor);
  const leaderboardServers = [
    ["capy.chronicleclassic.com", 88_863, 88_849, [["Upper Tower of Karazhan",30_353],["Blackwing Lair",18_858],["Temple of Ahn'Qiraj",16_607],["Naxxramas",7_219],["Molten Core",5_822],["No instance selected",5_650],["Onyxia's Lair",1_237],["Lower Tower of Karazhan",1_183],["Zul'Gurub",865],["Emerald Sanctum",787],["Ruins of Ahn'Qiraj",182],["Deadmines",75],["Other instances",11]]],
    ["octo.chronicleclassic.com", 64_917, 64_914, [["Molten Core",43_234],["No instance selected",7_458],["Onyxia's Lair",6_059],["Zul'Gurub",4_278],["Lower Tower of Karazhan",3_693],["Deadmines",142],["Other instances",50]]],
    ["chromie.chronicleclassic.com", 4_480, 4_480, [["Ulduar",2_805],["Naxxramas",1_045],["No instance selected",577],["Temple of Ahn'Qiraj",31],["Other instances",18],["Onyxia's Lair",4]]],
    ["legacy.chronicleclassic.com", 1_212, 1_212, [["Molten Core",635],["Blackwing Lair",206],["Onyxia's Lair",116],["No instance selected",115],["Temple of Ahn'Qiraj",81],["Upper Tower of Karazhan",42],["Naxxramas",17]]],
    ["kronos.chronicleclassic.com", 264, 264, [["Molten Core",126],["Onyxia's Lair",107],["No instance selected",31]]],
    ["vanillaplus.chronicleclassic.com", 133, 133, [["Molten Core",42],["Blackwing Lair",34],["No instance selected",22],["Zul'Gurub",17],["Onyxia's Lair",16],["Other instances",2]]],
    ["infrya.chronicleclassic.com", 105, 105, [["Other instances",66],["No instance selected",33],["Molten Core",6]]],
    ["faebright.chronicleclassic.com", 98, 98, [["Other instances",67],["No instance selected",31]]],
    ["crusader-storm.chronicleclassic.com", 67, 67, [["Other instances",40],["No instance selected",27]]],
    ["lunatic.chronicleclassic.com", 41, 41, [["Other instances",19],["No instance selected",12],["Deadmines",10]]],
    ["isitsimon.chronicleclassic.com", 8, 8, [["Molten Core",8]]],
    ["forever.chronicleclassic.com", 6, 6, [["No instance selected",6]]],
    ["moonwell.chronicleclassic.com", 2, 2, [["No instance selected",2]]],
  ].map(([hostname, totalPageViews, classifiedPageViews, instances]) => ({
    hostname: String(hostname),
    totalPageViews: Math.round(Number(totalPageViews) * factor),
    classifiedPageViews: Math.round(Number(classifiedPageViews) * factor),
    coverage: Number(totalPageViews) === 0 ? 0 : Number(classifiedPageViews) / Number(totalPageViews),
    instances: (instances as Array<[string, number]>).map(([label, pageViews]) => ({
      label,
      pageViews: Math.round(pageViews * factor),
      share: Number(classifiedPageViews) === 0 ? 0 : pageViews / Number(classifiedPageViews),
    })),
  }));
  const leaderboards = {
    totalPageViews: leaderboardTotal,
    classifiedPageViews: leaderboardClassified,
    coverage: leaderboardTotal === 0 ? 0 : leaderboardClassified / leaderboardTotal,
    modes: [
      { label: "Statistics", pageViews: Math.round(145_406 * factor), share: 145_406 / 160_179 },
      { label: "Speedruns", pageViews: Math.round(14_773 * factor), share: 14_773 / 160_179 },
    ],
    instances: [
      ["Molten Core", 49_873],
      ["Upper Tower of Karazhan", 30_395],
      ["Blackwing Lair", 19_098],
      ["Temple of Ahn'Qiraj", 16_719],
      ["No instance selected", 13_964],
      ["Naxxramas", 8_281],
      ["Onyxia's Lair", 7_539],
      ["Zul'Gurub", 5_160],
      ["Lower Tower of Karazhan", 4_876],
      ["Ulduar", 2_805],
      ["Emerald Sanctum", 787],
      ["Other instances", 273],
      ["Deadmines", 227],
      ["Ruins of Ahn'Qiraj", 182],
    ].map(([label, pageViews]) => ({
      label: String(label),
      pageViews: Math.round(Number(pageViews) * factor),
      share: Number(pageViews) / 160_179,
    })),
    servers: leaderboardServers,
  };

  return {
    period: {
      days,
      start: isoDate(start),
      end: isoDate(end),
      previousStart: isoDate(previousStart),
      previousEnd: isoDate(previousEnd),
    },
    generatedAt: new Date().toISOString(),
    timezone: "America/Chicago",
    mock: true,
    overview: {
      pageViews: metric(Math.round(527_165 * factor), Math.round(487_220 * factor)),
      activeUsers: metric(Math.round(7_527 * factor), Math.round(7_104 * factor)),
      sessions: metric(Math.round(33_601 * factor), Math.round(30_882 * factor)),
      engagedSessions: metric(Math.round(29_513 * factor), Math.round(25_741 * factor)),
    },
    timeseries,
    hosts: [
      ["octo.chronicleclassic.com", 257_359, 3_208, 17_580],
      ["capy.chronicleclassic.com", 235_773, 3_492, 12_905],
      ["chromie.chronicleclassic.com", 19_174, 517, 2_236],
      ["legacy.chronicleclassic.com", 5_565, 284, 538],
      ["crusader-storm.chronicleclassic.com", 2_314, 55, 226],
      ["kronos.chronicleclassic.com", 1_769, 91, 306],
      ["forever.chronicleclassic.com", 1_568, 32, 94],
    ].map(([hostname, pageViews, activeUsers, sessions]) => ({
      hostname: String(hostname),
      pageViews: Math.round(Number(pageViews) * factor),
      activeUsers: Math.round(Number(activeUsers) * factor),
      sessions: Math.round(Number(sessions) * factor),
    })),
    acquisition: [
      ["Direct / untagged", "—", 25_464, 21_443],
      ["discord.com", "referral", 3_099, 2_638],
      ["google", "organic", 3_095, 2_699],
      ["kookapp.cn", "referral", 654, 583],
      ["bing", "organic", 185, 166],
      ["octowow.st", "referral", 184, 162],
    ].map(([source, medium, sessions, engagedSessions]) => ({
      source: String(source),
      medium: String(medium),
      sessions: Math.round(Number(sessions) * factor),
      engagedSessions: Math.round(Number(engagedSessions) * factor),
    })),
    countries: [
      ["China", 142_641, 2_686],
      ["United States", 64_235, 1_033],
      ["Germany", 48_096, 549],
      ["Russia", 28_877, 406],
      ["Hong Kong", 19_204, 266],
      ["Sweden", 14_384, 185],
      ["Netherlands", 13_262, 252],
      ["Canada", 12_816, 207],
    ].map(([country, pageViews, activeUsers]) => ({
      country: String(country),
      pageViews: Math.round(Number(pageViews) * factor),
      activeUsers: Math.round(Number(activeUsers) * factor),
    })),
    productFamilies,
    serverProducts,
    leaderboards,
  };
}
