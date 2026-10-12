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

export type RaidLevel = 80 | 70 | 60

export interface RaidLevelGroup<T> {
  level: RaidLevel | null
  items: T[]
}

export function getRaidLevel(
  name: string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): RaidLevel | null {
  const order = getRaidProgressionOrder(name, supportedInstances)
  if (order >= 2000) return 80
  if (order >= 1000) return 70
  if (order > 0) return 60
  return null
}

export function groupByRaidLevel<T>(
  items: readonly T[],
  getName: (item: T) => string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): RaidLevelGroup<T>[] {
  const levels: (RaidLevel | null)[] = [80, 70, 60, null]
  return levels
    .map((level) => ({
      level,
      items: items
        .filter((item) => getRaidLevel(getName(item), supportedInstances) === level)
        .sort((left, right) =>
          compareByRaidProgression(
            getName(left),
            getName(right),
            supportedInstances,
          ),
        ),
    }))
    .filter((group) => group.items.length > 0)
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
