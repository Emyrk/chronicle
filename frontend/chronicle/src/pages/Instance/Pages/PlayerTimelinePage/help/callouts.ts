/**
 * Annotations for the Player Timeline help page. Each one points at the first
 * visible element carrying its data-help token (see RotationTimeline.tsx and
 * AuraSection.tsx); ones without an anchor are listed as tips only.
 */

/** ?explain= value that opens the Player Timeline help instead of a panel explainer. */
export const PLAYER_TIMELINE_HELP = "player_timeline";

export interface Callout {
  /** data-help token to point at; matched with [data-help~="token"]. */
  anchor?: string;
  title: string;
  body: string;
  /** Shown when the anchor only appears after an interaction. */
  reveal?: string;
}

export interface CalloutSection {
  title: string;
  callouts: Callout[];
}

export const CALLOUT_SECTIONS: CalloutSection[] = [
  {
    title: "Header",
    callouts: [
      {
        anchor: "players",
        title: "Players A and B",
        body: "Pick who to compare. A is always drawn in the primary color and B in the accent; the arrows swap them.",
      },
      {
        anchor: "metric",
        title: "DPS or HPS",
        body: "Switches the overview, the lead and the number under each cast between damage and healing.",
      },
      {
        anchor: "ignored",
        title: "Ignored spells",
        body: "Ctrl+click any spell to hide it from the lanes; it still counts for idle time. Hover one here to see how many casts it hides, click it to bring it back.",
      },
      { anchor: "keybinds", title: "Shortcuts", body: "Every mouse and keyboard shortcut the timeline understands." },
    ],
  },
  {
    title: "Overview",
    callouts: [
      {
        anchor: "overview",
        title: "DPS over the fight",
        body: "Each player's DPS line, with the damage lead shaded behind it: above the middle while A is ahead, below while B is. Drag across it to zoom the lanes to that window.",
      },
      {
        anchor: "scoreboard",
        title: "Scoreboard",
        body: "Each player's DPS, the gap between them and the running lead, at the indicator or for the whole fight.",
      },
    ],
  },
  {
    title: "View controls",
    callouts: [
      {
        anchor: "zoom",
        title: "Zoom",
        body: "Zoom in and out, or Fit the whole fight. The mouse wheel over the lanes zooms too, and dragging the lanes pans.",
      },
      { anchor: "follow", title: "Follow", body: "Keeps the lanes centered on the overview's cursor as you move over it (F)." },
      {
        anchor: "align",
        title: "Align",
        body: "Pull compares both players at the same fight time. First cast lines up their first actions, to compare openers.",
      },
      { anchor: "icons", title: "Icon size", body: "Auto grows the icons as you zoom in; S, M and L fix the size." },
      {
        anchor: "ruler",
        title: "Time axis and indicator",
        body: "Hover anywhere to move the yellow indicator; click to pin it there, and click again or press Esc to unpin.",
      },
    ],
  },
  {
    title: "Cast lanes",
    callouts: [
      { anchor: "player-label", title: "Player row", body: "The player's name in their class color, and their DPS (or HPS) for the fight." },
      {
        anchor: "idle-pct",
        title: "Idle %",
        body: "How much of the fight the player spent with nothing cast and no global cooldown running.",
      },
      {
        anchor: "hardcast",
        title: "Cast with a cast time",
        body: "The bar is the cast time, leading into the icon where the spell landed. The number under the icon is the damage it did. Hover any icon for its details.",
      },
      {
        anchor: "instant",
        title: "Instant cast",
        body: "The icon sits where it was cast. The global cooldown it started keeps the player busy.",
      },
      {
        anchor: "channel",
        title: "Channel",
        body: "The icon sits at the start and the bar trails out for the channel, notched at every tick.",
      },
      {
        anchor: "failed",
        title: "Failed cast",
        body: "Faded: the cast started but never landed (moved, interrupted, out of range). It counts as busy until it failed.",
      },
      { anchor: "crit", title: "Crit", body: "A yellow ring: the cast crit at least once." },
      { anchor: "busy", title: "Busy", body: "The solid line under the casts: the player was casting or on the global cooldown." },
      {
        anchor: "idle-gap",
        title: "Idle",
        body: "Dashed red: no cast and no global cooldown for 400ms or more. Longer gaps are labelled with their length.",
      },
      {
        anchor: "tint",
        title: "Cooldown window",
        body: "A cooldown tints the lane for as long as its buff really lasted, with a strip in its color along the top.",
      },
      {
        anchor: "swings",
        title: "Auto attacks",
        body: "One tick per swing: white hit, yellow crit, grey glancing, red miss, pink dodge, dark red parry. Logs from the 1.12a addon split main hand (top) from off hand (bottom).",
      },
      {
        anchor: "readout",
        title: "Around the indicator",
        body: "While the indicator is on the lanes: time since the last action, whether the player was idle or busy right then, and time to the next action.",
        reveal: "Hover the lanes to see it",
      },
      {
        anchor: "bracket",
        title: "Last and next action",
        body: "Ticks mark the last and next action around the indicator; the line turns red while the player was idle.",
        reveal: "Hover the lanes to see it",
      },
    ],
  },
  {
    title: "Rail",
    callouts: [
      { anchor: "cd", title: "Cooldown", body: "A ringed square in the cooldown's color, where it was used." },
      { anchor: "proc", title: "Proc", body: "A small circle: something that went off without a press, like Holy Strength or Clearcasting." },
      { anchor: "consume", title: "Consumable", body: "A green ring: a potion, rune or other consumable." },
      { anchor: "cluster", title: "Stacked events", body: "Events close together stack up; hover the stack for the full list with timings." },
    ],
  },
  {
    title: "Buffs & debuffs",
    callouts: [
      { anchor: "auras", title: "Buffs & debuffs", body: "Collapse or expand the section. Its rows share the lanes' time axis." },
      {
        anchor: "aura-bar",
        title: "Aura bar",
        body: "One bar per application: A on top, B below. Hover for when it started and ended, its share of the fight and who applied it.",
      },
      { anchor: "uptime", title: "Uptime", body: "A's and B's uptime for the whole fight." },
      {
        anchor: "raised",
        title: "Raised buff",
        body: "Click a buff's name to raise it onto the cast lanes: each gain shows as a proc and tints the lane. Raised rows are yellow; click the name again to drop it.",
      },
      {
        anchor: "whole-fight",
        title: "Whole fight",
        body: "Buffs that were up the entire fight, or not at all, for every player, grouped as icons.",
      },
      {
        anchor: "debuff-target",
        title: "Debuffs on",
        body: "Debuffs A and B put on the chosen target, the most damaged one first.",
      },
    ],
  },
  {
    title: "More",
    callouts: [
      {
        title: "Rules and assumptions",
        body: "Shift+click the timeline to flip it over: every spell A and B used, how it is drawn and why, plus the constants behind idle time.",
      },
      {
        title: "Panels tray",
        body: "The collapsed Panels row above the timeline opens two regular panels, for anything the timeline does not show.",
      },
    ],
  },
];
