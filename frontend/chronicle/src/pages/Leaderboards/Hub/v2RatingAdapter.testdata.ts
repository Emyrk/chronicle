import type {
  LeaderboardConfiguration,
  LeaderboardConfigurationRow,
} from "@/api/typesGenerated";
const row = (
  data: Partial<LeaderboardConfigurationRow>,
): LeaderboardConfigurationRow => ({
  kind: "boss",
  instance_name: "Raid",
  encounter_name: "",
  difficulty_name: "",
  max_players: 0,
  set_key: "",
  set_name: "",
  position: 0,
  points: 0,
  has_points: false,
  ...data,
});
export const configuration: LeaderboardConfiguration = {
  tenant_id: "tenant",
  tenant_name: "Tenant",
  tenants: [],
  dataset_id: "dataset",
  dataset_name: "Vanilla",
  dataset_flavor: ["vanilla"],
  additional_flavor: [],
  effective_flavor: ["vanilla"],
  leaderboard_flavor: ["vanilla"],
  layers: [],
  conflict: "",
  rows: [
    row({ kind: "instance" }),
    row({ encounter_name: "A" }),
    row({ encounter_name: "B" }),
    row({ kind: "set", set_key: "default", set_name: "Normal" }),
    row({ kind: "member", set_key: "default", encounter_name: "A" }),
    row({ kind: "set", set_key: "empty", set_name: "Empty" }),
  ],
};
