/** SVG path helpers for the Lua Canvas widget. Angles are radians, 0 pointing right, growing clockwise (y down). */

const TAU = Math.PI * 2

function point(x: number, y: number, r: number, angle: number) {
  return `${x + r * Math.cos(angle)} ${y + r * Math.sin(angle)}`
}

/** SVG path of an arc from `from` to `to` (radians, clockwise when to > from). */
export function arcPath(x: number, y: number, r: number, from: number, to: number): string {
  const sweep = to > from ? 1 : 0
  const large = Math.abs(to - from) > Math.PI ? 1 : 0
  return `M ${point(x, y, r, from)} A ${r} ${r} 0 ${large} ${sweep} ${point(x, y, r, to)}`
}

/** SVG path of a pie slice covering `value` of the circle clockwise from `start`. */
export function piePath(x: number, y: number, r: number, value: number, start: number): string {
  const end = start + value * TAU
  const large = value > 0.5 ? 1 : 0
  return `M ${x} ${y} L ${point(x, y, r, start)} A ${r} ${r} 0 ${large} 1 ${point(x, y, r, end)} Z`
}
