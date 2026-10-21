import type { ComponentType } from "react";
import type { SceneOperation, Viewport } from "../protocol";
import type { DungeonMeshRequest } from "../../Instance/EventsPanels/Map/MapScene3D";
import type { MapPositionSample } from "../../Instance/EventsPanels/Map/map.processor";
import type { MapPoint } from "../../Instance/EventsPanels/Map/mapModel";
import type { MapViewRequest } from "../../Instance/EventsPanels/Map/MapView2D";
import type { PlanItem } from "../../Instance/EventsPanels/Map/plan/mapPlan";
import type { MapSceneGround, MapSceneMarker } from "../../Instance/EventsPanels/Map/useMapScene";

export interface GuideManifestLike {
  id: string;
  name: string;
  entrypoint: string;
  map_id?: number;
  mapId?: number;
  capabilities: readonly string[];
  assets: readonly string[];
  description?: string;
}

export interface GuidePackageLike {
  manifest: GuideManifestLike;
  paths?: readonly string[];
  read(path: string): Uint8Array;
  readText(path: string): string;
}

export interface GuideRuntimeCallbacks {
  onReady(): void;
  onBatch(operations: readonly SceneOperation[]): void;
  onError(error: Error): void;
}

export interface GuideRuntimeStart {
  guide: GuidePackageLike;
  viewport: Viewport;
}

export interface GuideRuntimeEvent {
  nodeId: string;
  event: "click";
  x?: number;
  y?: number;
  button?: number;
}

export interface GuideRuntimeControllerLike {
  start(input: GuideRuntimeStart): void;
  stop(reason?: string): void;
  resize(viewport: Viewport): void;
  event(input: GuideRuntimeEvent): void;
}

export type GuideRuntimeFactory = (callbacks: GuideRuntimeCallbacks) => GuideRuntimeControllerLike;

export interface GuideResolvedMap {
  ground: MapSceneGround;
  dungeonMesh: DungeonMeshRequest | null;
  projectSample(sample: MapPositionSample): MapPoint | null;
  normalizedToWorld(x: number, y: number): { x: number; y: number; z?: number };
  normalizedRadiusToYards(radius: number): number;
}

export interface GuideMapRenderProps {
  ground: MapSceneGround;
  markers: MapSceneMarker[];
  projectSample: (sample: MapPositionSample) => MapPoint | null;
  view: MapViewRequest;
  planItems: readonly PlanItem[];
  dungeonMesh: DungeonMeshRequest | null;
  onUnitClick?(guid: string): void;
  onUnavailable(): void;
}

export type GuideMapRenderer = ComponentType<GuideMapRenderProps>;
export type GuideMapResolver = (mapId: number, iconBaseUrl: string) => Promise<GuideResolvedMap | null>;
