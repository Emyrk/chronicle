import type { SupportedInstance } from "@/api/typesGenerated"

function findSupportedInstance(
  name: string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): SupportedInstance | undefined {
  const normalizedName = name.toLowerCase()
  return supportedInstances?.find(
    (candidate) =>
      candidate.name.toLowerCase() === normalizedName ||
      candidate.derived_names?.some(
        (derivedName) => derivedName.toLowerCase() === normalizedName,
      ),
  )
}

export function getRaidProgressionOrder(
  name: string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): number {
  const instance = findSupportedInstance(name, supportedInstances)
  const derivedOrder = Object.entries(instance?.derived_raid_progression_orders ?? {}).find(
    ([derivedName]) => derivedName.toLowerCase() === name.toLowerCase(),
  )?.[1]
  return derivedOrder ?? instance?.raid_progression_order ?? 0
}

export function compareByRaidProgression(
  leftName: string,
  rightName: string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): number {
  const orderDifference =
    getRaidProgressionOrder(rightName, supportedInstances) -
    getRaidProgressionOrder(leftName, supportedInstances)
  if (orderDifference !== 0) return orderDifference
  return leftName.localeCompare(rightName)
}
