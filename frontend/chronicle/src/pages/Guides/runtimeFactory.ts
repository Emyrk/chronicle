import type { GuideRuntimeFactory } from "./host";
import { GuideRuntimeController } from "./runtime";

export const browserGuideRuntimeFactory: GuideRuntimeFactory = (callbacks) => {
  const controller = new GuideRuntimeController(callbacks);
  let eventSequence = 0;
  return {
    start({ guide, viewport }) {
      const files: Record<string, Uint8Array> = {};
      for (const path of guide.paths ?? []) if (path.endsWith(".lua")) files[path] = guide.read(path);
      controller.start({
        type: "start",
        requestId: crypto.randomUUID(),
        guide: {
          id: guide.manifest.id,
          entrypoint: guide.manifest.entrypoint,
          capabilities: guide.manifest.capabilities as ("ui" | "map" | "input" | "timers")[],
          files,
        },
        viewport,
      });
    },
    stop: (reason) => controller.stop(reason),
    resize: ({ width, height }) => controller.resize(width, height),
    event: (event) => controller.event({
      eventId: `guide-event-${++eventSequence}`,
      nodeId: event.nodeId,
      event: event.event,
      ...(event.x === undefined ? {} : { x: event.x }),
      ...(event.y === undefined ? {} : { y: event.y }),
      ...(event.button === undefined ? {} : { button: event.button }),
    }),
  };
};
