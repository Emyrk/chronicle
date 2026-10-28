import { describe, expect, it } from "vitest";
import {
  assistantEnabled,
  InferenceAPIError,
  inferenceAPIErrorMessage,
  isInferenceAuthorizationError,
  isInferenceServiceUnavailable,
} from "./api";

describe("isInferenceServiceUnavailable", () => {
  it("recognizes an inference API 503 response", () => {
    expect(isInferenceServiceUnavailable(new InferenceAPIError("Inference is not configured.", 503))).toBe(true);
  });

  it("does not hide the feature for unrelated errors", () => {
    expect(isInferenceServiceUnavailable(new InferenceAPIError("Provider failed.", 502))).toBe(false);
    expect(isInferenceServiceUnavailable(new Error("Network failed."))).toBe(false);
  });
});


describe("inference authorization errors", () => {
  it("replaces opaque 401 bodies with a terminal sign-in message", () => {
    expect(inferenceAPIErrorMessage(401, { message: "Unauthorized" }, "Failed")).toBe(
      "Your session has expired or is no longer authorized. Refresh the page or sign in again.",
    );
    expect(isInferenceAuthorizationError(new InferenceAPIError("Unauthorized", 401))).toBe(true);
    expect(isInferenceAuthorizationError(new InferenceAPIError("Forbidden", 403))).toBe(true);
    expect(isInferenceAuthorizationError(new InferenceAPIError("Unavailable", 503))).toBe(false);
  });

  it("preserves useful API detail for non-authorization failures", () => {
    expect(inferenceAPIErrorMessage(409, {
      message: "Run conflict",
      detail: "Another response is still active",
    }, "Failed")).toBe("Run conflict: Another response is still active");
  });
});
describe("assistantEnabled", () => {
  it("waits for settings, honours the user's choice and defaults unknown assistants on", () => {
    const settings = { assistants: [
      { id: "site-help", name: "Ask Chronicle", description: "", enabled: false },
      { id: "addon-workshop-panel", name: "Addon Workshop", description: "", enabled: true },
    ] };
    expect(assistantEnabled(undefined, "site-help")).toBe(false);
    expect(assistantEnabled(settings, "site-help")).toBe(false);
    expect(assistantEnabled(settings, "addon-workshop-panel")).toBe(true);
    expect(assistantEnabled(settings, "instance-analyst")).toBe(true);
  });
});
