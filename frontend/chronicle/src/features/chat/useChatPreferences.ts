import { useCallback } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface ChatPreferences {
  debugEnabled: boolean;
  yoloEnabled: boolean;
}

const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  debugEnabled: false,
  yoloEnabled: false,
};

export function chatPreferencesStorageKey(userId: string | undefined, chatId: string): string {
  return `inference-chat:${encodeURIComponent(userId ?? "anonymous")}:${encodeURIComponent(chatId)}:preferences`;
}

export function useChatPreferences(userId: string | undefined, chatId: string) {
  const [preferences, setPreferences] = useLocalStorage<ChatPreferences>(
    chatPreferencesStorageKey(userId, chatId),
    DEFAULT_CHAT_PREFERENCES,
  );
  const setDebugEnabled = useCallback((debugEnabled: boolean) => {
    setPreferences((current) => ({ ...DEFAULT_CHAT_PREFERENCES, ...current, debugEnabled }));
  }, [setPreferences]);
  const setYoloEnabled = useCallback((yoloEnabled: boolean) => {
    setPreferences((current) => ({ ...DEFAULT_CHAT_PREFERENCES, ...current, yoloEnabled }));
  }, [setPreferences]);

  return {
    debugEnabled: preferences.debugEnabled ?? false,
    yoloEnabled: preferences.yoloEnabled ?? false,
    setDebugEnabled,
    setYoloEnabled,
  };
}
