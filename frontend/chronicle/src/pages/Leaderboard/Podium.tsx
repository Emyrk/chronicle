import { Link } from "react-router-dom"
import { Users } from "lucide-react"
import { useEffect, useRef } from "react"
import type { SpeedrunLeaderboardEntry } from "../../api/typesGenerated"
import { guildAttributes, speedrunClearAttributes } from "@/components/EntityMenu/leaderboardEntities"

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

const MEDAL_COLORS = [
  { bg: "from-yellow-500/25 to-yellow-600/5", border: "border-yellow-500/40", text: "text-yellow-400", glow: "shadow-yellow-500/20 shadow-lg", medal: "🥇" },
  { bg: "from-slate-300/15 to-slate-400/5", border: "border-slate-400/30", text: "text-slate-300", glow: "", medal: "🥈" },
  { bg: "from-amber-700/15 to-amber-800/5", border: "border-amber-700/30", text: "text-amber-600", glow: "", medal: "🥉" },
] as const

// Display order: 2nd, 1st, 3rd
const PODIUM_ORDER = [1, 0, 2] as const
const PODIUM_STYLES = [
  { minH: "min-h-[180px]", width: "w-56", logo: "h-10 w-10", medal: "text-2xl", duration: "text-xl", name: "text-base", pad: "p-4" },   // 2nd
  { minH: "min-h-[260px]", width: "w-72", logo: "h-16 w-16", medal: "text-4xl", duration: "text-3xl", name: "text-xl", pad: "p-6" },     // 1st
  { minH: "min-h-[160px]", width: "w-52", logo: "h-9 w-9", medal: "text-xl", duration: "text-lg", name: "text-sm", pad: "p-4" },         // 3rd
] as const

// Per-instance glow/particle themes for #1
type ParticleStyle = "embers" | "spores" | "sand" | "smoke" | "voodoo" | "arcane" | "frost"

interface InstanceTheme {
  glow: string
  particles: string[]
  border: string
  particleStyle: ParticleStyle
}

const INSTANCE_THEMES: Record<string, InstanceTheme> = {
  "Molten Core": {
    glow: "rgba(239, 68, 68, 0.35)",
    particles: ["#ef4444", "#f97316", "#fbbf24", "#dc2626"],
    border: "rgba(239, 68, 68, 0.5)",
    particleStyle: "embers",
  },
  "Blackwing Lair": {
    glow: "rgba(139, 92, 246, 0.35)",
    particles: ["#8b5cf6", "#6366f1", "#a78bfa", "#312e81"],
    border: "rgba(139, 92, 246, 0.5)",
    particleStyle: "embers",
  },
  "Hateforge Quarry": {
    glow: "rgba(239, 120, 50, 0.35)",
    particles: ["#ef7832", "#f97316", "#fb923c", "#c2410c"],
    border: "rgba(239, 120, 50, 0.5)",
    particleStyle: "embers",
  },
  "Temple of Ahn'Qiraj": {
    glow: "rgba(217, 170, 66, 0.35)",
    particles: ["#d9aa42", "#c9880c", "#e8cc6a", "#a67c00"],
    border: "rgba(217, 170, 66, 0.5)",
    particleStyle: "sand",
  },
  "Ruins of Ahn'Qiraj": {
    glow: "rgba(200, 160, 80, 0.3)",
    particles: ["#c8a050", "#b8903a", "#d4b06a", "#a07830"],
    border: "rgba(200, 160, 80, 0.45)",
    particleStyle: "sand",
  },
  "Naxxramas": {
    glow: "rgba(130, 200, 180, 0.3)",
    particles: ["#a3e4d7", "#d5f5e3", "#82c8b4", "#5dade2"],
    border: "rgba(130, 200, 180, 0.45)",
    particleStyle: "frost",
  },
  "Emerald Sanctum": {
    glow: "rgba(52, 211, 153, 0.3)",
    particles: ["#34d399", "#10b981", "#6ee7b7", "#065f46"],
    border: "rgba(52, 211, 153, 0.45)",
    particleStyle: "spores",
  },
  "Zul'Gurub": {
    glow: "rgba(234, 88, 12, 0.35)",
    particles: ["#ea580c", "#16a34a", "#f97316", "#22c55e"],
    border: "rgba(234, 88, 12, 0.5)",
    particleStyle: "voodoo",
  },
  "Onyxia's Lair": {
    glow: "rgba(15, 15, 25, 0.9)",
    particles: ["#3a3a52", "#52526e", "#6a6a80", "#2a2a3e"],
    border: "rgba(90, 90, 120, 0.7)",
    particleStyle: "smoke",
  },
  "Karazhan Crypts": {
    glow: "rgba(40, 30, 50, 0.7)",
    particles: ["#4a3a5e", "#5e4e72", "#3a2a4e", "#6e5e82"],
    border: "rgba(80, 60, 100, 0.6)",
    particleStyle: "arcane",
  },
  "Tower of Karazhan": {
    glow: "rgba(120, 80, 220, 0.3)",
    particles: ["#7850dc", "#a78bfa", "#6366f1", "#c4b5fd"],
    border: "rgba(120, 80, 220, 0.45)",
    particleStyle: "arcane",
  },
  "Frostmane Hollow": {
    glow: "rgba(147, 197, 253, 0.3)",
    particles: ["#93c5fd", "#bfdbfe", "#dbeafe", "#60a5fa"],
    border: "rgba(147, 197, 253, 0.45)",
    particleStyle: "frost",
  },
  "Upper Blackrock Spire": {
    glow: "rgba(180, 83, 9, 0.3)",
    particles: ["#92400e", "#b45309", "#d97706", "#78350f"],
    border: "rgba(180, 83, 9, 0.45)",
    particleStyle: "embers",
  },
}

const DEFAULT_THEME: InstanceTheme = {
  glow: "rgba(234, 179, 8, 0.3)",
  particles: ["#eab308", "#facc15", "#ca8a04", "#fde68a"],
  border: "rgba(234, 179, 8, 0.45)",
  particleStyle: "embers",
}

// ─── Particle system ───────────────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; alpha: number; color: string
  life: number; maxLife: number
  wobbleAmp?: number; wobbleSpeed?: number; wobbleOffset?: number
  prevX?: number; prevY?: number
  angle?: number; radius?: number; angularV?: number
}

function pickColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)]
}

// ── Style: embers ──
function embersSpawn(rect: DOMRect, colors: string[]): Particle {
  const cx = rect.width / 2
  const spread = rect.width * 0.35
  return {
    x: cx + (Math.random() - 0.5) * spread,
    y: rect.height + Math.random() * 4,
    vy: -(0.4 + Math.random() * 0.8),
    vx: (Math.random() - 0.5) * 0.2,
    size: 2 + Math.random() * 3.5,
    alpha: 0.7 + Math.random() * 0.3,
    color: pickColor(colors), life: 0,
    maxLife: 50 + Math.random() * 70,
    wobbleAmp: 0.3 + Math.random() * 0.8,
    wobbleSpeed: 0.03 + Math.random() * 0.04,
    wobbleOffset: Math.random() * Math.PI * 2,
  }
}
function embersUpdate(p: Particle): boolean {
  p.life++
  p.vy *= 0.998
  p.y += p.vy
  p.x += p.vx + Math.sin(p.life * (p.wobbleSpeed ?? 0.03) + (p.wobbleOffset ?? 0)) * (p.wobbleAmp ?? 0.5)
  return p.life < p.maxLife
}
function embersDraw(ctx: CanvasRenderingContext2D, p: Particle, colors: string[]): boolean {
  const progress = p.life / p.maxLife
  const alpha = p.alpha * (progress < 0.1 ? progress / 0.1 : 1 - (progress - 0.1) / 0.9)
  if (alpha <= 0.01) return false
  const size = p.size * (1 - progress * 0.6)
  const colorIdx = Math.min(Math.floor(progress * colors.length), colors.length - 1)
  const color = colors[colorIdx]
  // Soft glow
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.5)
  grad.addColorStop(0, color)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = alpha * 0.3
  ctx.fillStyle = grad
  ctx.fillRect(p.x - size * 2.5, p.y - size * 2.5, size * 5, size * 5)
  // Core
  ctx.beginPath()
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  ctx.fill()
  // Hot white center on young particles
  if (progress < 0.3) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(255,255,255,0.8)"
    ctx.globalAlpha = alpha * (1 - progress / 0.3)
    ctx.fill()
  }
  return true
}

// ── Style: spores ──
function sporesSpawn(rect: DOMRect, colors: string[]): Particle {
  return {
    x: Math.random() * rect.width,
    y: Math.random() * rect.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: 3 + Math.random() * 3,
    alpha: 0.4 + Math.random() * 0.3,
    color: pickColor(colors), life: 0,
    maxLife: 120 + Math.random() * 80,
    wobbleSpeed: 0.05 + Math.random() * 0.03,
  }
}
function sporesUpdate(p: Particle): boolean {
  p.life++
  p.x += p.vx
  p.y += p.vy
  return p.life < p.maxLife
}
function sporesDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  const fadeIn = Math.min(p.life / 20, 1)
  const fadeOut = 1 - Math.max((progress - 0.7) / 0.3, 0)
  const alpha = p.alpha * fadeIn * fadeOut
  if (alpha <= 0.01) return false
  const pulse = 1 + 0.25 * Math.sin(p.life * (p.wobbleSpeed ?? 0.05))
  const size = p.size * pulse
  // Glow halo
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3)
  grad.addColorStop(0, p.color)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = alpha * 0.2
  ctx.fillStyle = grad
  ctx.fillRect(p.x - size * 3, p.y - size * 3, size * 6, size * 6)
  // Core orb
  ctx.beginPath()
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
  ctx.fillStyle = p.color
  ctx.globalAlpha = alpha
  ctx.fill()
  return true
}

// ── Style: sand ──
function sandSpawn(rect: DOMRect, colors: string[]): Particle {
  return {
    x: -2,
    y: Math.random() * rect.height,
    vx: 1 + Math.random() * 1.5,
    vy: 0.1 + Math.random() * 0.2,
    size: 1 + Math.random(),
    alpha: 0.4 + Math.random() * 0.4,
    color: pickColor(colors), life: 0,
    maxLife: 80 + Math.random() * 40,
  }
}
function sandUpdate(p: Particle, rect: DOMRect): boolean {
  p.life++
  p.x += p.vx
  p.y += p.vy
  return p.life < p.maxLife && p.x < rect.width + 10
}
function sandDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  const alpha = p.alpha * (1 - progress * 0.8)
  if (alpha <= 0.01) return false
  ctx.globalAlpha = alpha
  ctx.strokeStyle = p.color
  ctx.lineWidth = p.size
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3)
  ctx.stroke()
  return true
}

// ── Style: smoke ──
function smokeSpawn(rect: DOMRect, colors: string[]): Particle {
  return {
    x: rect.width * 0.15 + Math.random() * rect.width * 0.7,
    y: rect.height + 5,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -(0.6 + Math.random() * 0.6),
    size: 10 + Math.random() * 8,
    alpha: 0.35 + Math.random() * 0.15,
    color: pickColor(colors), life: 0,
    maxLife: 140 + Math.random() * 80,
    wobbleSpeed: 0.01 + Math.random() * 0.01,
    wobbleAmp: 0.2 + Math.random() * 0.3,
    wobbleOffset: Math.random() * Math.PI * 2,
  }
}
function smokeUpdate(p: Particle): boolean {
  p.life++
  p.x += p.vx + Math.sin(p.life * (p.wobbleSpeed ?? 0.01) + (p.wobbleOffset ?? 0)) * (p.wobbleAmp ?? 0.2)
  p.y += p.vy
  p.vy *= 0.997 // slow deceleration
  p.size += 0.2 // expand as it rises
  return p.life < p.maxLife
}
function smokeDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  // Thick at bottom, very transparent at top
  const fadeIn = Math.min(p.life / 15, 1)
  const fadeOut = Math.pow(1 - progress, 2.5) // aggressive exponential fade
  const alpha = p.alpha * fadeIn * fadeOut
  if (alpha <= 0.01) return false
  // Large soft blob
  const grad = ctx.createRadialGradient(p.x, p.y, p.size * 0.1, p.x, p.y, p.size)
  grad.addColorStop(0, p.color)
  grad.addColorStop(0.5, p.color)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = alpha
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  ctx.fill()
  // Inner lighter wisp — stronger when young
  ctx.globalAlpha = alpha * 0.4 * (1 - progress)
  ctx.fillStyle = "rgba(255,255,255,0.1)"
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2)
  ctx.fill()
  return true
}

// ── Style: voodoo ──
// Mix of rising fireflies + hex flashes across the whole card
type VoodooKind = 0 | 1  // 0 = firefly, 1 = hex flash

function voodooSpawn(rect: DOMRect, colors: string[]): Particle {
  const kind: VoodooKind = Math.random() < 0.6 ? 0 : 1

  if (kind === 0) {
    // Firefly: rises from random spot along the bottom
    return {
      x: Math.random() * rect.width,
      y: rect.height + 2,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(0.3 + Math.random() * 0.5),
      size: 2 + Math.random() * 2,
      alpha: 0.7 + Math.random() * 0.3,
      color: pickColor(colors), life: 0,
      maxLife: 70 + Math.random() * 60,
      wobbleAmp: 0.6 + Math.random() * 1.0,
      wobbleSpeed: 0.04 + Math.random() * 0.03,
      wobbleOffset: Math.random() * Math.PI * 2,
      angularV: 0, // kind marker
    }
  }
  // Hex flash: appears anywhere, bright burst
  return {
    x: Math.random() * rect.width,
    y: Math.random() * rect.height,
    vx: 0, vy: 0,
    size: 3 + Math.random() * 3,
    alpha: 0.9,
    color: pickColor(colors), life: 0,
    maxLife: 20 + Math.random() * 15,
    angularV: 1, // kind marker
    angle: Math.random() * Math.PI * 2, // rotation for hex shape
  }
}
function voodooUpdate(p: Particle): boolean {
  p.life++
  if ((p.angularV ?? 0) === 0) {
    // Firefly: wobble + rise
    p.y += p.vy
    p.x += p.vx + Math.sin(p.life * (p.wobbleSpeed ?? 0.04) + (p.wobbleOffset ?? 0)) * (p.wobbleAmp ?? 0.8)
    p.vy *= 0.998
  }
  return p.life < p.maxLife
}
function voodooDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  const kind = p.angularV ?? 0

  if (kind === 0) {
    // Firefly: pulsing glow
    const pulse = 0.6 + 0.4 * Math.sin(p.life * 0.12 + (p.wobbleOffset ?? 0))
    const fade = progress < 0.1 ? progress / 0.1 : 1 - Math.max((progress - 0.7) / 0.3, 0)
    const alpha = p.alpha * pulse * fade
    if (alpha <= 0.01) return false
    // Glow halo
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
    grad.addColorStop(0, p.color)
    grad.addColorStop(1, "transparent")
    ctx.globalAlpha = alpha * 0.35
    ctx.fillStyle = grad
    ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6)
    // Core
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * pulse, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.globalAlpha = alpha
    ctx.fill()
    return true
  }

  // Hex flash: sharp flash in, quick fade
  const flash = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8
  const alpha = p.alpha * flash
  if (alpha <= 0.01) return false
  const s = p.size * (0.6 + flash * 0.4)
  const rot = p.angle ?? 0
  // Draw hexagon
  ctx.globalAlpha = alpha
  ctx.fillStyle = p.color
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = rot + (Math.PI * 2 * i) / 6
    const px = p.x + Math.cos(a) * s
    const py = p.y + Math.sin(a) * s
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  // Glow burst
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3)
  grad.addColorStop(0, p.color)
  grad.addColorStop(1, "transparent")
  ctx.globalAlpha = alpha * 0.4
  ctx.fillStyle = grad
  ctx.fillRect(p.x - s * 3, p.y - s * 3, s * 6, s * 6)
  return true
}

// ── Style: arcane ──
function arcaneSpawn(rect: DOMRect, colors: string[]): Particle {
  const cx = rect.width / 2, cy = rect.height / 2
  const radius = 20 + Math.random() * Math.min(cx, cy) * 0.7
  const angle = Math.random() * Math.PI * 2
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    vx: 0, vy: 0,
    size: 1 + Math.random(),
    alpha: 0.6 + Math.random() * 0.4,
    color: pickColor(colors), life: 0,
    maxLife: 100 + Math.random() * 80,
    angle, radius,
    angularV: (0.015 + Math.random() * 0.02) * (Math.random() < 0.5 ? 1 : -1),
    prevX: cx + Math.cos(angle) * radius,
    prevY: cy + Math.sin(angle) * radius,
  }
}
function arcaneUpdate(p: Particle, rect: DOMRect): boolean {
  p.life++
  p.prevX = p.x; p.prevY = p.y
  const cx = rect.width / 2, cy = rect.height / 2
  p.angle = (p.angle ?? 0) + (p.angularV ?? 0.02)
  p.x = cx + Math.cos(p.angle) * (p.radius ?? 40)
  p.y = cy + Math.sin(p.angle) * (p.radius ?? 40)
  return p.life < p.maxLife
}
function arcaneDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  const alphaOsc = 0.5 + 0.5 * Math.sin(p.life * 0.1)
  const fade = progress < 0.1 ? progress / 0.1 : 1 - Math.max((progress - 0.8) / 0.2, 0)
  const alpha = p.alpha * alphaOsc * fade
  if (alpha <= 0.01) return false
  if (p.prevX !== undefined && p.prevY !== undefined) {
    ctx.globalAlpha = alpha * 0.3
    ctx.strokeStyle = p.color
    ctx.lineWidth = p.size * 0.6
    ctx.beginPath()
    ctx.moveTo(p.prevX, p.prevY)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  ctx.fillStyle = p.color
  ctx.globalAlpha = alpha
  ctx.fill()
  return true
}

// ── Style: frost ──
// Frost has 3 sub-types: snowflakes, shimmer sparkles, and ice cracks
type FrostKind = "snow" | "sparkle" | "crack"

function frostSpawn(rect: DOMRect, colors: string[]): Particle {
  const roll = Math.random()
  let kind: FrostKind
  if (roll < 0.45) kind = "snow"
  else if (roll < 0.75) kind = "sparkle"
  else kind = "crack"

  if (kind === "snow") {
    return {
      x: Math.random() * rect.width,
      y: -2,
      vx: 0, vy: 0.2 + Math.random() * 0.4,
      size: 1.5 + Math.random() * 2,
      alpha: 0.5 + Math.random() * 0.4,
      color: pickColor(colors), life: 0,
      maxLife: 100 + Math.random() * 80,
      wobbleAmp: 0.4 + Math.random() * 0.6,
      wobbleSpeed: 0.02 + Math.random() * 0.02,
      wobbleOffset: Math.random() * Math.PI * 2,
      // encode kind in angularV: 0 = snow
      angularV: 0,
    }
  } else if (kind === "sparkle") {
    return {
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      vx: 0, vy: 0,
      size: 1 + Math.random() * 1.5,
      alpha: 0,
      color: pickColor(colors), life: 0,
      maxLife: 30 + Math.random() * 25,
      wobbleOffset: Math.random() * Math.PI * 2,
      // encode kind: 1 = sparkle
      angularV: 1,
    }
  } else {
    // Ice crack: a line that grows from a random edge point
    const edge = Math.random()
    let sx: number, sy: number, angle: number
    if (edge < 0.25) { // top
      sx = Math.random() * rect.width; sy = 0; angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6
    } else if (edge < 0.5) { // bottom
      sx = Math.random() * rect.width; sy = rect.height; angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6
    } else if (edge < 0.75) { // left
      sx = 0; sy = Math.random() * rect.height; angle = (Math.random() - 0.5) * 0.6
    } else { // right
      sx = rect.width; sy = Math.random() * rect.height; angle = Math.PI + (Math.random() - 0.5) * 0.6
    }
    return {
      x: sx, y: sy,
      vx: Math.cos(angle), vy: Math.sin(angle),
      size: 0, // size = current crack length
      alpha: 0.6 + Math.random() * 0.3,
      color: pickColor(colors), life: 0,
      maxLife: 40 + Math.random() * 30,
      angle,
      // encode kind: 2 = crack
      angularV: 2,
      // store origin
      prevX: sx, prevY: sy,
      // branching potential
      wobbleAmp: Math.random(),
      radius: 25 + Math.random() * 35, // max crack length
    }
  }
}
function frostUpdate(p: Particle): boolean {
  p.life++
  const kind = p.angularV ?? 0
  if (kind === 0) { // snow
    p.y += p.vy
    p.x += Math.sin(p.life * (p.wobbleSpeed ?? 0.02) + (p.wobbleOffset ?? 0)) * (p.wobbleAmp ?? 0.4)
  } else if (kind === 2) { // crack — grow length
    const growSpeed = 1.5 + Math.random() * 0.5
    p.size = Math.min(p.size + growSpeed, p.radius ?? 40)
  }
  // sparkles are stationary
  return p.life < p.maxLife
}
function frostDraw(ctx: CanvasRenderingContext2D, p: Particle): boolean {
  const progress = p.life / p.maxLife
  const kind = p.angularV ?? 0

  if (kind === 0) { // ── Snowflake ──
    const twinkle = 0.5 + 0.5 * Math.sin(p.life * 0.15 + (p.wobbleOffset ?? 0))
    const fade = 1 - Math.max((progress - 0.7) / 0.3, 0)
    const alpha = p.alpha * twinkle * fade
    if (alpha <= 0.01) return false
    // Core dot
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.globalAlpha = alpha
    ctx.fill()
    // Soft glow
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
    grad.addColorStop(0, "rgba(255,255,255,0.35)")
    grad.addColorStop(1, "transparent")
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = grad
    ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6)
    return true
  }

  if (kind === 1) { // ── Sparkle ──
    // Sharp flash in, fade out
    const flash = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7
    const alpha = flash * 0.9
    if (alpha <= 0.01) return false
    // Draw a 4-point star
    const s = p.size * (0.5 + flash * 0.5)
    ctx.globalAlpha = alpha
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.moveTo(p.x, p.y - s * 2)
    ctx.lineTo(p.x + s * 0.3, p.y)
    ctx.lineTo(p.x, p.y + s * 2)
    ctx.lineTo(p.x - s * 0.3, p.y)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(p.x - s * 2, p.y)
    ctx.lineTo(p.x, p.y + s * 0.3)
    ctx.lineTo(p.x + s * 2, p.y)
    ctx.lineTo(p.x, p.y - s * 0.3)
    ctx.closePath()
    ctx.fill()
    // Glow
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3)
    grad.addColorStop(0, p.color)
    grad.addColorStop(1, "transparent")
    ctx.globalAlpha = alpha * 0.3
    ctx.fillStyle = grad
    ctx.fillRect(p.x - s * 3, p.y - s * 3, s * 6, s * 6)
    return true
  }

  // kind === 2: ── Ice crack ──
  const fadeOut = 1 - Math.max((progress - 0.5) / 0.5, 0)
  const alpha = p.alpha * fadeOut
  if (alpha <= 0.01) return false
  const ox = p.prevX ?? p.x, oy = p.prevY ?? p.y
  const angle = p.angle ?? 0
  const endX = ox + Math.cos(angle) * p.size
  const endY = oy + Math.sin(angle) * p.size
  // Main crack line
  ctx.globalAlpha = alpha * 0.7
  ctx.strokeStyle = p.color
  ctx.lineWidth = 1.2
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  ctx.lineTo(endX, endY)
  ctx.stroke()
  // Thinner white highlight
  ctx.globalAlpha = alpha * 0.4
  ctx.strokeStyle = "rgba(255,255,255,0.6)"
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  ctx.lineTo(endX, endY)
  ctx.stroke()
  // Branch lines
  if (p.size > 8 && (p.wobbleAmp ?? 0) > 0.3) {
    const branchCount = Math.floor(p.size / 12)
    for (let b = 0; b < branchCount; b++) {
      const t = (b + 1) / (branchCount + 1)
      const bx = ox + Math.cos(angle) * p.size * t
      const by = oy + Math.sin(angle) * p.size * t
      const bAngle = angle + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5)
      const bLen = 5 + Math.random() * 10
      ctx.globalAlpha = alpha * 0.4
      ctx.strokeStyle = p.color
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(bAngle) * bLen, by + Math.sin(bAngle) * bLen)
      ctx.stroke()
    }
  }
  // Glow at tip
  const tipGrad = ctx.createRadialGradient(endX, endY, 0, endX, endY, 4)
  tipGrad.addColorStop(0, "rgba(255,255,255,0.4)")
  tipGrad.addColorStop(1, "transparent")
  ctx.globalAlpha = alpha * 0.5
  ctx.fillStyle = tipGrad
  ctx.fillRect(endX - 4, endY - 4, 8, 8)
  return true
}

// ── Style dispatch ──
const STYLE_CONFIG: Record<ParticleStyle, {
  maxParticles: number
  spawnRate: number
  spawn: (rect: DOMRect, colors: string[]) => Particle
  update: (p: Particle, rect: DOMRect) => boolean
  draw: (ctx: CanvasRenderingContext2D, p: Particle, colors: string[]) => boolean
}> = {
  embers: { maxParticles: 30, spawnRate: 0.5, spawn: embersSpawn, update: embersUpdate, draw: embersDraw },
  spores: { maxParticles: 15, spawnRate: 0.15, spawn: sporesSpawn, update: sporesUpdate, draw: (ctx, p) => sporesDraw(ctx, p) },
  sand:   { maxParticles: 25, spawnRate: 0.4, spawn: sandSpawn, update: sandUpdate, draw: (ctx, p) => sandDraw(ctx, p) },
  smoke:  { maxParticles: 15, spawnRate: 0.2, spawn: smokeSpawn, update: smokeUpdate, draw: (ctx, p) => smokeDraw(ctx, p) },
  voodoo: { maxParticles: 25, spawnRate: 0.3, spawn: voodooSpawn, update: voodooUpdate, draw: (ctx, p) => voodooDraw(ctx, p) },
  arcane: { maxParticles: 25, spawnRate: 0.25, spawn: arcaneSpawn, update: arcaneUpdate, draw: (ctx, p) => arcaneDraw(ctx, p) },
  frost:  { maxParticles: 35, spawnRate: 0.4, spawn: frostSpawn, update: frostUpdate, draw: (ctx, p) => frostDraw(ctx, p) },
}

export function ParticleEffect({ instanceName }: { instanceName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = INSTANCE_THEMES[instanceName] ?? DEFAULT_THEME

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const config = STYLE_CONFIG[theme.particleStyle]
    const particles: Particle[] = []
    let animId: number

    function tick() {
      ctx!.clearRect(0, 0, rect.width, rect.height)
      if (particles.length < config.maxParticles && Math.random() < config.spawnRate) {
        particles.push(config.spawn(rect, theme.particles))
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        if (!config.update(p, rect) || !config.draw(ctx!, p, theme.particles)) {
          particles.splice(i, 1)
        }
      }
      ctx!.globalAlpha = 1
      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  )
}

// Export for Storybook
export { INSTANCE_THEMES, DEFAULT_THEME }
export type { InstanceTheme, ParticleStyle }

interface PodiumProps {
  entries: SpeedrunLeaderboardEntry[]
  instanceName: string
}

export function Podium({ entries, instanceName }: PodiumProps) {
  if (entries.length === 0) return null
  const theme = INSTANCE_THEMES[instanceName] ?? DEFAULT_THEME

  return (
    <div className="flex items-end justify-center gap-6 mb-10">
      {PODIUM_ORDER.map((rank, displayIdx) => {
        const entry = entries[rank]
        if (!entry) return <div key={rank} className="w-48" />
        const colors = MEDAL_COLORS[rank]
        const style = PODIUM_STYLES[displayIdx]
        const isFirst = rank === 0

        const shadow = isFirst
          ? `0 4px 24px ${theme.glow}, 0 8px 48px ${theme.glow}, 0 0 100px ${theme.glow}`
          : rank === 1
            ? "0 4px 16px rgba(148,163,184,0.15), 0 8px 32px rgba(148,163,184,0.08)"
            : "0 4px 12px rgba(120,80,30,0.12), 0 8px 24px rgba(120,80,30,0.06)"

        return (
          <Link
            key={entry.instance_id}
            to={`/instances/${entry.slug || entry.instance_id}`}
            className={`relative overflow-hidden
              ${style.width} ${style.minH} ${style.pad} rounded-xl border bg-gradient-to-b flex flex-col items-center justify-end text-center
              transition-all duration-200 hover:-translate-y-2
              ${isFirst ? "" : colors.bg} ${isFirst ? "" : colors.border}
            `}
            style={{
              ...(isFirst ? {
                borderColor: theme.border,
                backgroundImage: `linear-gradient(to bottom, ${theme.glow}, transparent)`,
              } : {}),
              boxShadow: shadow,
            }}
          >
            {isFirst && <ParticleEffect instanceName={instanceName} />}
            <div className="relative z-10 flex flex-col items-center w-full">
              {entry.guild_logo_url ? (
                <img
                  src={entry.guild_logo_url}
                  alt=""
                  className={`${style.logo} rounded-full object-cover mb-2 ring-2 ring-white/20`}
                />
              ) : (
                <span className={`${style.medal} mb-2`}>{colors.medal}</span>
              )}
              <span
                className={`${style.name} font-bold ${isFirst ? "text-white" : colors.text} truncate w-full`}
                {...guildAttributes(entry.guild_id, entry.guild_name)}
              >
                {entry.guild_name || "Unknown Guild"}
              </span>
              <span className={`${style.duration} font-mono font-bold text-foreground mt-1`}>
                <span {...speedrunClearAttributes(entry, instanceName)}>{formatDuration(entry.duration_ms)}</span>
              </span>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {entry.player_count}
                </span>
                <span>{entry.realm_name}</span>
              </div>
              <span className="text-xs text-muted-foreground mt-1">
                {formatDate(entry.completion_time)}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
