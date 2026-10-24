import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { InferenceRuntimeProvider } from "./runtime";
import type { AssistantChatController } from "./useAssistantChat";

const controller: AssistantChatController = {
  messages: [],
  debugSnapshots: [],
  clientToolRequests: [],
  status: "idle",
  isRunning: false,
  submit: vi.fn(async () => true),
  startNewChat: vi.fn(async () => true),
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

  it("renders markdown typography, links, and a new chat action", () => {
    const markup = renderToStaticMarkup(
      <ChatPanel
        debugAvailable
        controller={{
          ...controller,
          messages: [{
            id: "assistant-1",
            role: "assistant",
            content: "## Summary\n\n- One\n- Two\n\n[Details](https://example.com)",
          }],
        }}
      />,
    );
    expect(markup).toContain("prose prose-sm");
    expect(markup).toContain("<h2>Summary</h2>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain("New chat");
    expect(markup).toContain("/debug");
    expect(markup).toContain("/clear");
  });

  it("renders GitHub-flavored markdown tables and strikethrough", () => {
    const markup = renderToStaticMarkup(
      <ChatPanel
        controller={{
          ...controller,
          messages: [{
            id: "assistant-1",
            role: "assistant",
            content: "| Player | DPS |\n| --- | ---: |\n| Kresh | 1200 |\n\n~~old~~",
          }],
        }}
      />,
    );
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("<th>Player</th>");
    expect(markup).toContain("<td>Kresh</td>");
    expect(markup).toContain("<del>old</del>");
  });
});
