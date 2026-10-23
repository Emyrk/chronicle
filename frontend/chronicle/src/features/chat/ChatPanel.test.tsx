import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { InferenceRuntimeProvider } from "./runtime";
import type { AssistantChatController } from "./useAssistantChat";

const controller: AssistantChatController = {
  messages: [],
  debugSnapshots: [],
  status: "idle",
  isRunning: false,
  submit: vi.fn(async () => true),
  cancel: vi.fn(),
  clearError: vi.fn(),
};

describe("ChatPanel client tool controls", () => {
  it("shows the session-scoped YOLO control when the runtime provider is mounted", () => {
    const markup = renderToStaticMarkup(
      <InferenceRuntimeProvider>
        <ChatPanel controller={controller} />
      </InferenceRuntimeProvider>,
    );
    expect(markup).toContain("YOLO");
    expect(markup).toContain('aria-label="Enable YOLO mode for client tools"');
    expect(markup).toContain('data-state="unchecked"');
  });
});
