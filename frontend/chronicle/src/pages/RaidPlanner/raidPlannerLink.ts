import type { Instance } from "@/pages/Instance/InstancePage";

export function raidPlannerLink(instance: Pick<Instance, "id" | "guild">): string {
  const params = new URLSearchParams({ raid: instance.id });
  if (instance.guild) {
    params.set("guild", instance.guild.id);
    params.set("guildName", instance.guild.name);
  }
  return `/raidplanner?${params}`;
}
