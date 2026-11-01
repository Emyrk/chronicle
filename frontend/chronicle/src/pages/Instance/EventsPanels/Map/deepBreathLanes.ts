/**
 * Turtle WoW's authoritative Onyxia Phase 2 Deep Breath spell chains, imported
 * from `onyxia-turtle-wow-phase2-breath-ground-coordinates.csv` extracted from
 * the restored server encounter script and spell data.
 * Coordinates are server world coordinates on map 249 and remain in server order.
 * Every chain spell's SchoolDMG effect uses SpellRadius ID 10 in the Octo
 * dataset, which resolves to a 30-yard radius around its destination point.
 */

export const ONYXIA_DEEP_BREATH_RADIUS_YARDS = 30;

export type DeepBreathDirection =
  | "NORTH_TO_SOUTH"
  | "SOUTH_TO_NORTH"
  | "EAST_TO_WEST"
  | "WEST_TO_EAST"
  | "SE_TO_NW"
  | "NW_TO_SE"
  | "SW_TO_NE"
  | "NE_TO_SW";

export interface DeepBreathGroundPoint {
  sequence: number;
  spellId: number;
  mapId: 249;
  x: number;
  y: number;
  z: number;
  orientation: number;
}

export interface DeepBreathPath {
  key: DeepBreathDirection;
  displayName: string;
  primarySpellId: number;
  mapId: 249;
  points: readonly DeepBreathGroundPoint[];
}

export const ONYXIA_DEEP_BREATH_PATHS: readonly DeepBreathPath[] = [
  {
    key: "NORTH_TO_SOUTH",
    displayName: "North To South",
    primarySpellId: 17_086,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 17_086, mapId: 249, x: 20.730539, y: -215.23761, z: -85.254387, orientation: 3.142 },
      { sequence: 2, spellId: 17_087, mapId: 249, x: 7.479571, y: -215.207809, z: -86.075531, orientation: 3.142 },
      { sequence: 3, spellId: 17_088, mapId: 249, x: -2.047405, y: -215.186386, z: -86.279655, orientation: 3.142 },
      { sequence: 4, spellId: 17_089, mapId: 249, x: -11.189384, y: -215.165833, z: -87.817093, orientation: 3.142 },
      { sequence: 5, spellId: 17_090, mapId: 249, x: -20.32436, y: -215.145279, z: -88.963997, orientation: 3.142 },
      { sequence: 6, spellId: 17_091, mapId: 249, x: -28.248341, y: -215.127457, z: -89.19175, orientation: 3.142 },
      { sequence: 7, spellId: 17_092, mapId: 249, x: -35.899323, y: -215.110245, z: -87.196548, orientation: 3.142 },
      { sequence: 8, spellId: 17_093, mapId: 249, x: -42.619305, y: -215.095139, z: -86.663605, orientation: 3.142 },
      { sequence: 9, spellId: 17_094, mapId: 249, x: -53.343277, y: -215.071014, z: -85.597191, orientation: 3.142 },
      { sequence: 10, spellId: 17_095, mapId: 249, x: -61.834255, y: -215.05191, z: -84.673416, orientation: 3.142 },
      { sequence: 11, spellId: 17_097, mapId: 249, x: -68.834236, y: -215.036163, z: -84.018875, orientation: 3.142 },
      { sequence: 12, spellId: 22_267, mapId: 249, x: -75.736046, y: -214.98497, z: -83.394188, orientation: 3.142 },
      { sequence: 13, spellId: 22_268, mapId: 249, x: -84.087578, y: -214.857834, z: -82.640053, orientation: 3.142 },
      { sequence: 14, spellId: 21_132, mapId: 249, x: -90.424416, y: -214.601974, z: -82.482697, orientation: 3.142 },
      { sequence: 15, spellId: 21_133, mapId: 249, x: -96.572411, y: -214.353745, z: -82.239967, orientation: 3.142 },
      { sequence: 16, spellId: 21_135, mapId: 249, x: -102.069931, y: -214.131775, z: -80.57119, orientation: 3.142 },
      { sequence: 17, spellId: 21_136, mapId: 249, x: -107.385597, y: -213.917145, z: -77.447037, orientation: 3.142 },
      { sequence: 18, spellId: 21_137, mapId: 249, x: -114.281258, y: -213.866486, z: -73.851128, orientation: 3.142 },
      { sequence: 19, spellId: 21_138, mapId: 249, x: -123.32856, y: -213.60791, z: -71.559921, orientation: 3.142 },
      { sequence: 20, spellId: 21_139, mapId: 249, x: -130.7883, y: -213.424026, z: -70.751007, orientation: 3.142 },
    ],
  },
  {
    key: "SOUTH_TO_NORTH",
    displayName: "South To North",
    primarySpellId: 18_351,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_351, mapId: 249, x: -68.834236, y: -215.036163, z: -84.018875, orientation: 6.28 },
      { sequence: 2, spellId: 18_352, mapId: 249, x: -61.834255, y: -215.05191, z: -84.673416, orientation: 6.28 },
      { sequence: 3, spellId: 18_353, mapId: 249, x: -53.343277, y: -215.071014, z: -85.597191, orientation: 6.28 },
      { sequence: 4, spellId: 18_354, mapId: 249, x: -42.619305, y: -215.095139, z: -86.663605, orientation: 6.28 },
      { sequence: 5, spellId: 18_355, mapId: 249, x: -35.899323, y: -215.110245, z: -87.196548, orientation: 6.28 },
      { sequence: 6, spellId: 18_356, mapId: 249, x: -28.248341, y: -215.127457, z: -89.19175, orientation: 6.28 },
      { sequence: 7, spellId: 18_357, mapId: 249, x: -20.32436, y: -215.145279, z: -88.963997, orientation: 6.28 },
      { sequence: 8, spellId: 18_358, mapId: 249, x: -11.189384, y: -215.165833, z: -87.817093, orientation: 6.28 },
      { sequence: 9, spellId: 18_359, mapId: 249, x: -2.047405, y: -215.186386, z: -86.279655, orientation: 6.28 },
      { sequence: 10, spellId: 18_360, mapId: 249, x: 7.479571, y: -215.207809, z: -86.075531, orientation: 6.28 },
      { sequence: 11, spellId: 18_361, mapId: 249, x: 20.730539, y: -215.23761, z: -85.254387, orientation: 6.28 },
    ],
  },
  {
    key: "EAST_TO_WEST",
    displayName: "East To West",
    primarySpellId: 18_576,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_576, mapId: 249, x: -37.743851, y: -243.667923, z: -88.217651, orientation: 1.416 },
      { sequence: 2, spellId: 18_578, mapId: 249, x: -35.805332, y: -232.0289, z: -87.749153, orientation: 1.416 },
      { sequence: 3, spellId: 18_579, mapId: 249, x: -34.045738, y: -224.714661, z: -85.529465, orientation: 1.416 },
      { sequence: 4, spellId: 18_580, mapId: 249, x: -32.08157, y: -214.916962, z: -88.327438, orientation: 1.416 },
      { sequence: 5, spellId: 18_581, mapId: 249, x: -36.611721, y: -202.684677, z: -85.653786, orientation: 1.416 },
      { sequence: 6, spellId: 18_582, mapId: 249, x: -37.067261, y: -195.758652, z: -87.745834, orientation: 1.416 },
      { sequence: 7, spellId: 18_583, mapId: 249, x: -37.728523, y: -188.616806, z: -88.074898, orientation: 1.416 },
    ],
  },
  {
    key: "WEST_TO_EAST",
    displayName: "West To East",
    primarySpellId: 18_609,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_609, mapId: 249, x: -37.728523, y: -188.616806, z: -88.074898, orientation: 4.526 },
      { sequence: 2, spellId: 18_611, mapId: 249, x: -37.067261, y: -195.758652, z: -87.745834, orientation: 4.526 },
      { sequence: 3, spellId: 18_612, mapId: 249, x: -36.611721, y: -202.684677, z: -85.653786, orientation: 4.526 },
      { sequence: 4, spellId: 18_613, mapId: 249, x: -32.08157, y: -214.916962, z: -88.327438, orientation: 4.526 },
      { sequence: 5, spellId: 18_614, mapId: 249, x: -34.045738, y: -224.714661, z: -85.529465, orientation: 4.526 },
      { sequence: 6, spellId: 18_615, mapId: 249, x: -35.805332, y: -232.0289, z: -87.749153, orientation: 4.526 },
      { sequence: 7, spellId: 18_616, mapId: 249, x: -37.743851, y: -243.667923, z: -88.217651, orientation: 4.526 },
    ],
  },
  {
    key: "SE_TO_NW",
    displayName: "Se To Nw",
    primarySpellId: 18_564,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_564, mapId: 249, x: -56.559654, y: -241.223923, z: -85.423607, orientation: 0.666 },
      { sequence: 2, spellId: 18_565, mapId: 249, x: -51.067528, y: -228.909988, z: -85.765556, orientation: 0.666 },
      { sequence: 3, spellId: 18_566, mapId: 249, x: -41.762104, y: -221.896545, z: -86.114113, orientation: 0.666 },
      { sequence: 4, spellId: 18_567, mapId: 249, x: -35.439922, y: -217.260284, z: -87.336311, orientation: 0.666 },
      { sequence: 5, spellId: 18_568, mapId: 249, x: -29.495876, y: -213.014359, z: -88.910423, orientation: 0.666 },
      { sequence: 6, spellId: 18_569, mapId: 249, x: -23.650263, y: -221.969086, z: -89.172699, orientation: 0.666 },
      { sequence: 7, spellId: 18_570, mapId: 249, x: -15.602085, y: -216.893936, z: -88.403183, orientation: 0.666 },
      { sequence: 8, spellId: 18_571, mapId: 249, x: -14.321238, y: -199.462219, z: -87.922478, orientation: 0.666 },
      { sequence: 9, spellId: 18_572, mapId: 249, x: -8.449303, y: -193.957962, z: -87.564957, orientation: 0.666 },
      { sequence: 10, spellId: 18_573, mapId: 249, x: -2.52965, y: -188.690491, z: -87.172859, orientation: 0.666 },
      { sequence: 11, spellId: 18_574, mapId: 249, x: 3.86022, y: -183.227249, z: -86.375381, orientation: 0.666 },
      { sequence: 12, spellId: 18_575, mapId: 249, x: 6.016711, y: -181.305771, z: -85.654648, orientation: 0.666 },
    ],
  },
  {
    key: "NW_TO_SE",
    displayName: "Nw To Se",
    primarySpellId: 18_584,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_584, mapId: 249, x: 6.016711, y: -181.305771, z: -85.654648, orientation: 3.776 },
      { sequence: 2, spellId: 18_585, mapId: 249, x: 3.86022, y: -183.227249, z: -86.375381, orientation: 3.776 },
      { sequence: 3, spellId: 18_586, mapId: 249, x: -2.52965, y: -188.690491, z: -87.172859, orientation: 3.776 },
      { sequence: 4, spellId: 18_587, mapId: 249, x: -8.449303, y: -193.957962, z: -87.564957, orientation: 3.776 },
      { sequence: 5, spellId: 18_588, mapId: 249, x: -14.321238, y: -199.462219, z: -87.922478, orientation: 3.776 },
      { sequence: 6, spellId: 18_589, mapId: 249, x: -15.602085, y: -216.893936, z: -88.403183, orientation: 3.776 },
      { sequence: 7, spellId: 18_590, mapId: 249, x: -23.650263, y: -221.969086, z: -89.172699, orientation: 3.776 },
      { sequence: 8, spellId: 18_591, mapId: 249, x: -29.495876, y: -213.014359, z: -88.910423, orientation: 3.776 },
      { sequence: 9, spellId: 18_592, mapId: 249, x: -35.439922, y: -217.260284, z: -87.336311, orientation: 3.776 },
      { sequence: 10, spellId: 18_593, mapId: 249, x: -41.762104, y: -221.896545, z: -86.114113, orientation: 3.776 },
      { sequence: 11, spellId: 18_594, mapId: 249, x: -51.067528, y: -228.909988, z: -85.765556, orientation: 3.776 },
      { sequence: 12, spellId: 18_595, mapId: 249, x: -56.559654, y: -241.223923, z: -85.423607, orientation: 3.776 },
    ],
  },
  {
    key: "SW_TO_NE",
    displayName: "Sw To Ne",
    primarySpellId: 18_596,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_596, mapId: 249, x: -58.2509, y: -189.020004, z: -85.292267, orientation: 5.587 },
      { sequence: 2, spellId: 18_597, mapId: 249, x: -52.006271, y: -193.79657, z: -85.808769, orientation: 5.587 },
      { sequence: 3, spellId: 18_598, mapId: 249, x: -46.135464, y: -198.548553, z: -85.901764, orientation: 5.587 },
      { sequence: 4, spellId: 18_599, mapId: 249, x: -40.500187, y: -203.001053, z: -85.555107, orientation: 5.587 },
      { sequence: 5, spellId: 18_600, mapId: 249, x: -30.907579, y: -211.058197, z: -88.592125, orientation: 5.587 },
      { sequence: 6, spellId: 18_601, mapId: 249, x: -20.098139, y: -218.681427, z: -88.937088, orientation: 5.587 },
      { sequence: 7, spellId: 18_602, mapId: 249, x: -12.223192, y: -224.666168, z: -87.8563, orientation: 5.587 },
      { sequence: 8, spellId: 18_603, mapId: 249, x: -6.475297, y: -229.098724, z: -87.076401, orientation: 5.587 },
      { sequence: 9, spellId: 18_604, mapId: 249, x: -2.010256, y: -232.541992, z: -86.99514, orientation: 5.587 },
      { sequence: 10, spellId: 18_605, mapId: 249, x: 2.7363, y: -236.202347, z: -86.790367, orientation: 5.587 },
      { sequence: 11, spellId: 18_606, mapId: 249, x: 7.197779, y: -239.642868, z: -86.307297, orientation: 5.587 },
      { sequence: 12, spellId: 18_607, mapId: 249, x: 12.120926, y: -243.439407, z: -85.87426, orientation: 5.587 },
    ],
  },
  {
    key: "NE_TO_SW",
    displayName: "Ne To Sw",
    primarySpellId: 18_617,
    mapId: 249,
    points: [
      { sequence: 1, spellId: 18_617, mapId: 249, x: 12.120926, y: -243.439407, z: -85.87426, orientation: 2.428 },
      { sequence: 2, spellId: 18_619, mapId: 249, x: 7.197779, y: -239.642868, z: -86.307297, orientation: 2.428 },
      { sequence: 3, spellId: 18_620, mapId: 249, x: 2.7363, y: -236.202347, z: -86.790367, orientation: 2.428 },
      { sequence: 4, spellId: 18_621, mapId: 249, x: -2.010256, y: -232.541992, z: -86.99514, orientation: 2.428 },
      { sequence: 5, spellId: 18_622, mapId: 249, x: -6.475297, y: -229.098724, z: -87.076401, orientation: 2.428 },
      { sequence: 6, spellId: 18_623, mapId: 249, x: -12.223192, y: -224.666168, z: -87.8563, orientation: 2.428 },
      { sequence: 7, spellId: 18_624, mapId: 249, x: -20.098139, y: -218.681427, z: -88.937088, orientation: 2.428 },
      { sequence: 8, spellId: 18_625, mapId: 249, x: -30.907579, y: -211.058197, z: -88.592125, orientation: 2.428 },
      { sequence: 9, spellId: 18_626, mapId: 249, x: -40.500187, y: -203.001053, z: -85.555107, orientation: 2.428 },
      { sequence: 10, spellId: 18_627, mapId: 249, x: -46.135464, y: -198.548553, z: -85.901764, orientation: 2.428 },
      { sequence: 11, spellId: 18_628, mapId: 249, x: -52.006271, y: -193.79657, z: -85.808769, orientation: 2.428 },
      { sequence: 12, spellId: 18_618, mapId: 249, x: -58.2509, y: -189.020004, z: -85.292267, orientation: 2.428 },
    ],
  },
];

const PRIMARY_SPELL_TO_PATH = new Map(ONYXIA_DEEP_BREATH_PATHS.map((path) => [path.primarySpellId, path]));
const CHAIN_SPELL_TO_PATH = new Map<number, DeepBreathPath>();
const CHAIN_SPELL_TO_POINT = new Map<number, DeepBreathGroundPoint>();

for (const path of ONYXIA_DEEP_BREATH_PATHS) {
  if (path.mapId !== 249 || path.points.length === 0 || path.points[0].spellId !== path.primarySpellId) {
    throw new Error(`Invalid Onyxia Deep Breath path ${path.key}`);
  }
  path.points.forEach((point, index) => {
    if (point.mapId !== path.mapId || point.sequence !== index + 1) {
      throw new Error(`Invalid Onyxia Deep Breath point ${path.key}:${point.sequence}`);
    }
    if (CHAIN_SPELL_TO_PATH.has(point.spellId)) throw new Error(`Duplicate Onyxia Deep Breath spell ${point.spellId}`);
    CHAIN_SPELL_TO_PATH.set(point.spellId, path);
    CHAIN_SPELL_TO_POINT.set(point.spellId, point);
  });
}

export function deepBreathPathForPrimarySpell(spellId: number): DeepBreathPath | null {
  return PRIMARY_SPELL_TO_PATH.get(spellId) ?? null;
}

export function deepBreathPathForSpell(spellId: number): DeepBreathPath | null {
  return CHAIN_SPELL_TO_PATH.get(spellId) ?? null;
}

export function deepBreathPointForSpell(spellId: number): DeepBreathGroundPoint | null {
  return CHAIN_SPELL_TO_POINT.get(spellId) ?? null;
}

export function isDeepBreathPrimarySpell(spellId: number): boolean {
  return PRIMARY_SPELL_TO_PATH.has(spellId);
}
