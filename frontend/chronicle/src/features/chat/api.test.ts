import { describe, expect, it } from "vitest";
import { InferenceAPIError, isInferenceServiceUnavailable } from "./api";

describe("isInferenceServiceUnavailable", () => {
  it("recognizes an inference API 503 response", () => {
    expect(isInferenceServiceUnavailable(new InferenceAPIError("Inference is not configured.", 503))).toBe(true);
  });

  it("does not hide the feature for unrelated errors", () => {
    expect(isInferenceServiceUnavailable(new InferenceAPIError("Provider failed.", 502))).toBe(false);
    expect(isInferenceServiceUnavailable(new Error("Network failed."))).toBe(false);
  });
});
