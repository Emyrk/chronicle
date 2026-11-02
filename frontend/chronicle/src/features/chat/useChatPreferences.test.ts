import { describe, expect, it } from "vitest";
import { chatPreferencesStorageKey } from "./useChatPreferences";

describe("chatPreferencesStorageKey", () => {
  it("scopes preferences by user and chat", () => {
    expect(chatPreferencesStorageKey("user/1", "lua-project:panel/2"))
      .toBe("inference-chat:user%2F1:lua-project%3Apanel%2F2:preferences");
    expect(chatPreferencesStorageKey("user/1", "site-help"))
      .not.toBe(chatPreferencesStorageKey("user/1", "instance-1"));
    expect(chatPreferencesStorageKey("user/1", "site-help"))
      .not.toBe(chatPreferencesStorageKey("user/2", "site-help"));
  });
});
