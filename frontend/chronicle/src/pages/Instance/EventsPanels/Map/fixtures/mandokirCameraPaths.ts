import type { MapCameraMark } from "../cameraPath";

/** First authored announcement shot: wide approach into a Mandokir close-up. */
export const MANDOKIR_ANNOUNCEMENT_OVERVIEW: readonly MapCameraMark[] = [
  {
    position: [26.96126333761854, 14.108315696091811, 27.92064116372552],
    target: [32.74289346802887, 9.770468309106805, 21.62475759413603],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 14028,
    label: "Shot 1",
  },
  {
    position: [33.8213398645645, 12.096891594063115, 25.58324567376855],
    target: [33.49500165865221, 9.770260978407022, 21.77425256964631],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 17621,
    label: "Shot 2",
  },
  {
    position: [36.25053479409542, 10.50597127314593, 19.001686779899995],
    target: [33.99016661918621, 9.787231222527979, 20.399085696573206],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 23000,
    label: "Shot 3",
  },
];

/** Gahz'ranka Slam: grounded raid, airborne knockback, and landing. */
export const GAHZRANKA_ANNOUNCEMENT_SLAM: readonly MapCameraMark[] = [
  {
    position: [21.417186940435414, 1.4000479330127518, -13.770915124821073],
    target: [19.09810699415715, 0.7845186108236939, -18.22176191425188],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 15129,
    label: "Shot 1",
  },
  {
    position: [22.99491254369716, 4.800281344750138, -11.527327623700192],
    target: [19.143674593012594, 0.784518610823694, -18.274239385046513],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 20000,
    label: "Shot 2",
  },
  {
    position: [23.878649608600583, 3.2476595243939164, -17.442779404380392],
    target: [18.823016760376525, 0.7845186108236939, -18.342173006284977],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 23000,
    label: "Shot 3",
  },
];

/** Hakkar ground-level dolly: begin backed off, then approach the raid. */
export const HAKKAR_ANNOUNCEMENT_WALK_START: readonly MapCameraMark[] = [
  {
    position: [9.76871540273903, 4.194150601357598, -14.970447592252441],
    target: [10.136916471620765, 4.024171432086919, -14.042045709707303],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 20200,
    label: "Backed off",
  },
  {
    position: [9.989636044068071, 4.164163099795191, -14.413406462725357],
    target: [10.357837112949806, 3.994183930524512, -13.485004580180217],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 22400,
    label: "Approach",
  },
  {
    position: [10.2289667388412, 4.13167663976925, -13.809945239071016],
    target: [10.597167807722935, 3.961697470498571, -12.881543356525876],
    fov: 45,
    near: 0.5,
    far: 2000,
    timestampMs: 25200,
    label: "Raid line",
  },
];
