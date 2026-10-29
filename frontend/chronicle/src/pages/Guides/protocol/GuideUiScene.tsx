import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useItemTooltip } from "@/api/gamedata";
import { useSpell } from "@/api/queries";
import { getSpellIconUrl } from "@/api/wowdb";
import { iconUrl } from "@/config/iconUrl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { UI_ROOT_ID } from "./scene";
import type { RetainedScene, SceneNode } from "./types";

function px(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function anchorTransform(anchor: unknown): string | undefined {
  switch (anchor) {
    case "top": return "translateX(-50%)";
    case "top-right": return "translateX(-100%)";
    case "left": return "translateY(-50%)";
    case "center": return "translate(-50%, -50%)";
    case "right": return "translate(-100%, -50%)";
    case "bottom-left": return "translateY(-100%)";
    case "bottom": return "translate(-50%, -100%)";
    case "bottom-right": return "translate(-100%, -100%)";
    default: return undefined;
  }
}

function anchoredPosition(anchor: unknown, x: number, y: number): Pick<CSSProperties, "left" | "top"> {
  const horizontal = anchor === "top" || anchor === "center" || anchor === "bottom"
    ? "50%"
    : anchor === "top-right" || anchor === "right" || anchor === "bottom-right" ? "100%" : "0%";
  const vertical = anchor === "left" || anchor === "center" || anchor === "right"
    ? "50%"
    : anchor === "bottom-left" || anchor === "bottom" || anchor === "bottom-right" ? "100%" : "0%";
  return {
    left: `calc(${horizontal} + ${x}px)`,
    top: `calc(${vertical} - ${y}px)`,
  };
}

function nodeStyle(node: SceneNode): CSSProperties {
  const props = node.props;
  const x = px(props.x) ?? 0;
  const y = px(props.y) ?? 0;
  return {
    position: "absolute",
    ...anchoredPosition(props.anchor, x, y),
    width: px(props.width),
    height: px(props.height),
    transform: anchorTransform(props.anchor),
    zIndex: px(props.zIndex),
    display: props.visible === false ? "none" : undefined,
    opacity: px(props.alpha),
    color: text(props.color) || undefined,
    backgroundColor: text(props.backgroundColor) || undefined,
    borderColor: text(props.borderColor) || undefined,
    borderStyle: props.borderColor ? "solid" : undefined,
    borderWidth: props.borderColor ? 1 : undefined,
    fontSize: px(props.fontSize),
    textAlign: props.align === "left" || props.align === "center" || props.align === "right" ? props.align : undefined,
    pointerEvents: node.kind === "button" || node.listeners.includes("click") || node.props.tooltip === true ? "auto" : "none",
  };
}

function nodeClassName(node: SceneNode): string | undefined {
  if (node.kind === "frame") {
    return node.id === "guide-panel"
      ? "overflow-hidden rounded-xl border border-border/80 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-xl"
      : "rounded-lg";
  }
  if (node.kind === "text") {
    if (node.id === "guide-eyebrow") return "font-semibold uppercase tracking-[0.2em]";
    if (node.id === "guide-title") return "font-serif font-semibold leading-tight tracking-wide";
    if (node.id === "guide-body") return "styled-scrollbar overflow-auto whitespace-pre-wrap leading-relaxed text-muted-foreground";
    if (node.id === "guide-callout") return "styled-scrollbar overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/70 px-3 py-2 font-medium leading-snug shadow-inner";
    if (node.id === "guide-disclaimer") return "rounded-full border border-border/70 bg-card/85 px-3 py-1 text-muted-foreground shadow-lg backdrop-blur-md";
    return "styled-scrollbar overflow-auto whitespace-pre-wrap";
  }
  if (node.kind === "button") {
    const selected = node.id === "guide-correct" || node.id === "guide-incorrect";
    return `rounded-md border border-border/80 px-3 py-1 font-semibold shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:border-ring hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "uppercase tracking-[0.12em]" : ""}`;
  }
  return undefined;
}

function textureId(node: SceneNode): number | null {
  const value = node.props.textureId;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function GuideTextureNode({
  node,
  assets,
  style,
  onClick,
}: {
  node: SceneNode;
  assets: ReadonlyMap<string, string>;
  style: CSSProperties;
  onClick?: (event: ReactMouseEvent) => void;
}) {
  const datasetId = useDatasetId();
  const iconBaseUrl = useIconBaseUrl();
  const type = text(node.props.textureType, "asset");
  const id = textureId(node);
  const spell = useSpell(String(id ?? 0), datasetId, { enabled: type === "spell" && id !== null });
  const item = useItemTooltip(type === "item" && id !== null ? { itemId: id } : null);

  let source = "";
  let alt = "";
  if (type === "asset") source = assets.get(text(node.props.asset)) ?? "";
  else if (type === "icon") source = iconUrl(text(node.props.iconName), iconBaseUrl);
  else if (type === "spell" && spell.data) {
    source = getSpellIconUrl(spell.data.spell_icon, iconBaseUrl);
    alt = spell.data.name?.["0"] ?? `Spell ${id}`;
  } else if (type === "item" && item.data) {
    source = iconUrl(item.data.icon, iconBaseUrl);
    alt = item.data.name;
  }
  if (!source) return null;

  const image = (
    <img
      data-guide-node={node.id}
      src={source}
      alt={alt}
      draggable={false}
      style={{ ...style, objectFit: "contain", filter: node.props.tint ? `drop-shadow(0 0 0 ${text(node.props.tint)})` : undefined }}
      onClick={onClick}
    />
  );
  if (node.props.tooltip !== true) return image;

  const tooltip = type === "spell" && spell.data
    ? <SpellTooltip spell={spell.data} />
    : type === "item" && item.data ? <ItemTooltip item={item.data} /> : null;
  if (!tooltip) return image;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{image}</TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8} className="z-[10000] border-0 bg-transparent p-0" hideArrow>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface GuideUiSceneProps {
  scene: RetainedScene;
  assets: ReadonlyMap<string, string>;
  onNodeClick(node: SceneNode, event: ReactMouseEvent): void;
}

export function GuideUiScene({ scene, assets, onNodeClick }: GuideUiSceneProps) {
  const childrenByParent = new Map<string, SceneNode[]>();
  for (const node of scene.nodes.values()) {
    if (node.parentId === null || node.kind === "unit" || node.kind === "icon" || node.kind === "map-text"
      || node.kind === "line" || node.kind === "arrow" || node.kind === "circle" || node.kind === "cone" || node.kind === "polygon") continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  for (const children of childrenByParent.values()) children.sort((left, right) => (px(left.props.zIndex) ?? 0) - (px(right.props.zIndex) ?? 0));

  const renderNode = (node: SceneNode): ReactNode => {
    const style = nodeStyle(node);
    const click = node.listeners.includes("click") ? (event: ReactMouseEvent) => onNodeClick(node, event) : undefined;
    const children = childrenByParent.get(node.id)?.map(renderNode);
    if (node.kind === "frame") return <div key={node.id} data-guide-node={node.id} className={nodeClassName(node)} style={style} onClick={click}>{children}</div>;
    if (node.kind === "text") {
      return <div key={node.id} data-guide-node={node.id} className={nodeClassName(node)} style={style} onClick={click}>{text(node.props.text)}</div>;
    }
    if (node.kind === "texture") return <GuideTextureNode key={node.id} node={node} assets={assets} style={style} onClick={click} />;
    if (node.kind === "button") {
      return (
        <button
          key={node.id}
          data-guide-node={node.id}
          type="button"
          disabled={node.props.enabled === false}
          style={style}
          onClick={(event) => onNodeClick(node, event)}
          className={nodeClassName(node)}
        >
          {text(node.props.text)}
        </button>
      );
    }
    return null;
  };

  return <TooltipProvider delayDuration={150}>{(childrenByParent.get(UI_ROOT_ID) ?? []).map(renderNode)}</TooltipProvider>;
}
