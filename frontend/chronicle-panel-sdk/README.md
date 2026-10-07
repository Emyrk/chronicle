# @emyrk/chronicle-panel-sdk

TypeScript contracts and binary event-stream helpers for trusted Chronicle custom panels.

## Install

```sh
pnpm add @emyrk/chronicle-panel-sdk
```

## Host API

```ts
import type {
  ChroniclePanelPluginV1,
  ChroniclePanelSnapshotV1,
} from "@emyrk/chronicle-panel-sdk/v1";
```

## Event streams and protobuf

```ts
import { decodeEncounterPayloads } from "@emyrk/chronicle-panel-sdk/v1/events";
import { DamageSchema } from "@emyrk/chronicle-panel-sdk/v1/protobuf";
```

`decodeEncounterPayloads()` decodes Chronicle's `chronicle-event-stream-v1`
framing and the generated protobuf schema exports decode individual events.
The canonical protobuf source is published with the package under
`proto/chronicle.proto`.

Custom panel bundles must remain self-contained. Bundle this package into the
panel's entry or worker artifact rather than leaving npm imports for Chronicle
to resolve at runtime.

## Floating breakouts

Chronicle owns the floating shell, dragging, resizing, mobile presentation, and
lifecycle. Panels render their content into an isolated ShadowRoot:

```ts
const breakout = api.breakouts.open({
  title: "Warlock damage",
  initialPosition: { x: 200, y: 120 },
  initialSize: { width: 420, height: 300 },
});

breakout.root.append(content);
// Optional; Chronicle also closes it when the panel unmounts.
breakout.close();
```

A panel instance may open up to eight simultaneous breakouts. `closeAll()` only
closes breakouts owned by that mounted panel instance.

## Compatibility

- Host API: `1`
- Manifest schema: `1`
- Event framing: `chronicle-event-stream-v1`

Breaking changes to a versioned host or stream contract require a new versioned
entry point. Additive protobuf fields remain wire-compatible.
