import { useEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { CanvasShape } from "../widgets/canvas"
import { GuideUiScene } from "./GuideUiScene"
import { applySceneBatch, createInitialScene, UI_ROOT_ID } from "./scene"

/**
 * A Lua Canvas drawing a heal-HUD style radar: rings, a danger zone, players as health pies placed
 * by seconds of safety, mobs on an outer ring with dashed lines, a heal beam, health and mana arcs,
 * and a round spell icon. The scene goes through the same validation as worker output.
 */

const SIZE = 600
const C = SIZE / 2
const R0 = 42, R1 = 168
const TAU = Math.PI * 2
const CLASSES = ["#c79c6e", "#f58cba", "#0070de", "#ff7d0a", "#fff569", "#9482c9", "#69ccf0", "#abd473", "#ffffff"]

const ring = (t: number) => R0 + Math.sqrt(t / 10) * (R1 - R0)
const at = (r: number, a: number) => ({ x: C + r * Math.cos(a), y: C + r * Math.sin(a) })

function radar(phase: number, players = 20): CanvasShape[] {
  const shapes: CanvasShape[] = [
    { kind: "circle", x: C, y: C, r: R1 + 100, fill: "#14162a", alpha: 0.9 },
    { kind: "circle", x: C, y: C, r: ring(3), fill: "#e03b2c", alpha: 0.12 },
  ]
  for (const t of [1, 3, 5, 10]) shapes.push({ kind: "circle", x: C, y: C, r: ring(t), stroke: t === 3 ? "#e03b2c" : "#8c94a8", width: 1.5, alpha: t === 3 ? 0.45 : 0.3 })

  // Players: safety in seconds decides the distance, health the pie.
  const blip = Math.max(5, Math.min(14, (Math.PI * R1) / players / 2))
  const inner = R0 + 4 + blip
  const spots = Array.from({ length: players }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / players
    const safe = 10 * (0.5 + 0.5 * Math.sin(i * 1.7 + phase / 40)) ** 2
    const hp = 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(i * 2.3 + phase / 55))
    return { a, hp, color: CLASSES[i % CLASSES.length], ...at(inner + Math.sqrt(safe / 10) * (R1 - inner), a) }
  })

  // Mobs on the outer ring, a dashed line to their player.
  for (const [i, boss] of [[0, true], [3, false], [11, false]] as const) {
    const p = spots[i]
    const mob = at(R1 + 40, p.a)
    shapes.push({ kind: "line", x1: mob.x, y1: mob.y, x2: p.x, y2: p.y, width: boss ? 2.5 : 1.5, color: "#e03b2c", dash: 4, gap: 4, offset: -phase / 2 })
    shapes.push({ kind: "pie", x: mob.x, y: mob.y, r: boss ? 15 : 6, value: boss ? 0.62 : 0.4, color: "#e03b2c", track: "#e03b2c40" })
    if (boss) shapes.push({ kind: "text", x: mob.x - 20, y: mob.y, text: "Gorethane", size: 12, color: "#e03b2c", align: "right" })
  }

  // Our heal on its way: a flowing dashed green line and a ring round the target.
  const target = spots[5]
  shapes.push({ kind: "line", x1: C, y1: C, x2: target.x, y2: target.y, width: 2, color: "#4fd38a", dash: 6, gap: 5, offset: -phase, glow: 4 })
  shapes.push({ kind: "circle", x: target.x, y: target.y, r: blip + 6, stroke: "#4fd38a", width: 2, glow: 3 })

  for (const p of spots) shapes.push({ kind: "pie", x: p.x, y: p.y, r: blip, value: p.hp, color: p.color, track: `${p.color}40` })
  shapes.push({ kind: "text", x: target.x + blip + 10, y: target.y, text: "Velinde", size: 12, color: target.color })

  // Health on the left, mana on the right, filling from the bottom up.
  const span = Math.PI * 0.18
  const health = 0.8, mana = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(phase / 70))
  shapes.push({ kind: "arc", x: C, y: C, r: R1 + 67, from: Math.PI - span, to: Math.PI + span, width: 7, color: "#8c94a8", alpha: 0.25 })
  shapes.push({ kind: "arc", x: C, y: C, r: R1 + 67, from: Math.PI - span, to: Math.PI - span + 2 * span * health, width: 7, color: "#4fd38a", glow: 6 })
  shapes.push({ kind: "arc", x: C, y: C, r: R1 + 67, from: span, to: -span, width: 7, color: "#8c94a8", alpha: 0.25 })
  shapes.push({ kind: "arc", x: C, y: C, r: R1 + 67, from: span, to: span - 2 * span * mana, width: 7, color: "#3b7cff", glow: 6 })

  // The centre: the spell being cast, its cast filling an arc round it.
  shapes.push({ kind: "icon", x: C, y: C, r: R0 - 4, icon: "spell_nature_healingwavelesser" })
  shapes.push({ kind: "arc", x: C, y: C, r: R0, from: -Math.PI / 2, to: -Math.PI / 2 + TAU * ((phase % 150) / 150), width: 5, color: "#4fd38a", cap: "round", glow: 6 })
  shapes.push({ kind: "text", x: C, y: C + R0 - 12, text: "R6", size: 12, align: "center" })
  return shapes
}

function CanvasHarness({ animate, players }: { animate: boolean; players: number }) {
  const [phase, setPhase] = useState(40)
  useEffect(() => {
    if (!animate) return
    const timer = setInterval(() => setPhase((value) => value + 1), 33)
    return () => clearInterval(timer)
  }, [animate])
  const scene = useMemo(() => applySceneBatch(createInitialScene(), [{
    op: "create", id: "radar", kind: "canvas", parentId: UI_ROOT_ID,
    props: { x: 0, y: 0, width: SIZE, height: SIZE, anchor: "top-left", shapes: radar(phase, players) },
  }]), [phase, players])
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, background: "#1e1b1a" }}>
      <GuideUiScene scene={scene} assets={new Map()} onNodeClick={() => {}} />
    </div>
  )
}

const meta = {
  title: "Pages/Guides/LuaCanvas",
  component: CanvasHarness,
  args: { animate: false, players: 20 },
  argTypes: { players: { control: { type: "range", min: 5, max: 40, step: 1 } } },
} satisfies Meta<typeof CanvasHarness>
export default meta
type Story = StoryObj<typeof meta>

export const Radar: Story = {}

/** Redrawn with SetShapes 30 times a second: the dash offsets flow, the cast arc fills, players drift. */
export const Animated: Story = { args: { animate: true } }

export const FortyPlayers: Story = { args: { players: 40 } }
