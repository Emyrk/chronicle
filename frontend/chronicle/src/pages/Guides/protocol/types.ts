export const NODE_KINDS = [
  "frame",
  "text",
  "texture",
  "button",
  "unit",
  "icon",
  "map-text",
  "line",
  "arrow",
  "circle",
  "cone",
  "polygon",
] as const

export type NodeKind = (typeof NODE_KINDS)[number]
export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right"
export type GuideEvent = "click"
export type GuideCapability = "ui" | "map" | "input" | "timers"
export type SceneProps = Readonly<Record<string, unknown>>

export interface CreateOperation {
  op: "create"
  id: string
  kind: NodeKind
  parentId: string | null
  props: Record<string, unknown>
}

export interface SetOperation {
  op: "set"
  id: string
  parentId?: string | null
  props: Record<string, unknown>
}

export interface ListenOperation {
  op: "listen"
  id: string
  event: GuideEvent
  enabled: boolean
}

export interface DestroyOperation {
  op: "destroy"
  id: string
}

export interface CameraOperation {
  op: "camera"
  x: number
  y: number
  zoom: number
}

export type SceneOperation = CreateOperation | SetOperation | ListenOperation | DestroyOperation | CameraOperation

export interface SceneNode {
  readonly id: string
  readonly kind: NodeKind
  readonly parentId: string | null
  readonly props: SceneProps
  readonly listeners: readonly GuideEvent[]
}

export interface CameraState {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface RetainedScene {
  readonly nodes: ReadonlyMap<string, SceneNode>
  readonly camera: CameraState
}

export interface Viewport {
  width: number
  height: number
}

export type HostMessage =
  | {
      type: "start"
      requestId: string
      guide: {
        id: string
        entrypoint: string
        capabilities: readonly GuideCapability[]
        files: Readonly<Record<string, Uint8Array>>
      }
      viewport: Viewport
    }
  | { type: "event"; eventId: string; nodeId: string; event: GuideEvent; x?: number; y?: number; button?: number }
  | { type: "stop"; reason?: string }
  | { type: "resize"; viewport: Viewport }
  | { type: "timer"; timerId: string }

export type WorkerMessage =
  | { type: "ready"; protocolVersion: 1 }
  | { type: "batch"; batchId: string; operations: readonly SceneOperation[] }
  | { type: "error"; code: string; message: string; fatal: boolean }
  | { type: "ack"; eventId: string }
