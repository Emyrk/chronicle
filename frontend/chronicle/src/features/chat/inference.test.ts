import { describe, expect, it } from "vitest";
import {
  buildInstanceAnalystRunRequest,
  buildSiteHelpRunRequest,
  chooseDefaultModel,
  parseInferenceOAuthResult,
  safeLocalReturnPath,
  toChatMessages,
} from "./inference";

const input = {
  runId: "run-1",
  threadId: "thread-1",
  messages: [
    { id: "message-1", role: "user" as const, content: "Where are rankings?" },
    { id: "message-2", role: "assistant" as const, content: "Open Rankings." },
    { id: "message-3", role: "user" as const, content: "Analyze this raid." },
  ],
};
const selection = { connectionId: "connection-1", modelId: "model-1" };

describe("inference request builders", () => {
  it("sends full browser history for ephemeral site help", () => {
    expect(buildSiteHelpRunRequest(input, selection)).toEqual({
      run_id: "run-1",
      connection_id: "connection-1",
      model: "model-1",
      assistant_id: "site-help",
      messages: input.messages,
    });
  });

  it("sends only the new message and durable thread for instance analysis", () => {
    expect(buildInstanceAnalystRunRequest(input, selection, "instance-1")).toEqual({
      run_id: "run-1",
      connection_id: "connection-1",
      model: "model-1",
      assistant_id: "instance-analyst",
      thread_id: "thread-1",
      instance: "instance-1",
      message: input.messages[2],
    });
  });

  it("only requests debug snapshots when the authorized toggle is enabled", () => {
    expect(buildSiteHelpRunRequest(input, selection, true)).toMatchObject({ debug: true });
    expect(buildInstanceAnalystRunRequest(input, selection, "instance-1", true)).toMatchObject({ debug: true });
    expect(buildSiteHelpRunRequest(input, selection)).not.toHaveProperty("debug");
    expect(buildInstanceAnalystRunRequest(input, selection, "instance-1")).not.toHaveProperty("debug");
  });

  it("maps only visible user and assistant messages from durable history", () => {
    expect(toChatMessages([
      { id: "1", role: "system", content: "hidden" },
      { id: "2", role: "user", content: "hello" },
      { id: "3", role: "assistant", content: "hi" },
    ])).toEqual([
      { id: "2", role: "user", content: "hello" },
      { id: "3", role: "assistant", content: "hi" },
    ]);
  });
});

describe("inference selection and OAuth", () => {
  it("keeps a stored model or otherwise chooses deterministically", () => {
    const models = [
      { id: "z", name: "Zulu", context_length: 1 },
      { id: "a", name: "Alpha", context_length: 1 },
    ];
    expect(chooseDefaultModel(models, "z")).toBe("z");
    expect(chooseDefaultModel(models, "missing")).toBe("a");
  });

  it("parses success and error callback signals", () => {
    expect(parseInferenceOAuthResult(new URLSearchParams("inference_connection=success"))?.type).toBe("success");
    expect(parseInferenceOAuthResult(new URLSearchParams("inference_connection=error"))).toMatchObject({
      type: "error",
      message: "OpenRouter could not be connected.",
    });
  });

  it("only returns a local OAuth return path", () => {
    expect(safeLocalReturnPath("/account/settings", "?tab=ai")).toBe("/account/settings?tab=ai");
    expect(safeLocalReturnPath("//attacker.example", "")).toBe("/account/settings");
  });
});
