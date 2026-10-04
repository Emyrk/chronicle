import { describe, expect, it } from "vitest";
import {
  PUBLIC_NOTICE_EMPTY_TTL_MS,
  recordPublicNoticeResult,
  shouldFetchPublicNotices,
} from "./publicNoticeCache";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("public notice cache", () => {
  it("fetches when no previous result is cached", () => {
    expect(shouldFetchPublicNotices(new MemoryStorage(), 1_000)).toBe(true);
  });

  it("skips fetching for one hour after an empty result", () => {
    const storage = new MemoryStorage();
    recordPublicNoticeResult(false, storage, 1_000);

    expect(shouldFetchPublicNotices(storage, 1_000 + PUBLIC_NOTICE_EMPTY_TTL_MS - 1)).toBe(false);
    expect(shouldFetchPublicNotices(storage, 1_000 + PUBLIC_NOTICE_EMPTY_TTL_MS)).toBe(true);
  });

  it("always fetches again when the previous result contained notices", () => {
    const storage = new MemoryStorage();
    recordPublicNoticeResult(true, storage, 1_000);

    expect(shouldFetchPublicNotices(storage, 1_001)).toBe(true);
  });

  it("fetches when the cached value is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem("chronicle-public-notice-cache", "not-json");

    expect(shouldFetchPublicNotices(storage, 1_000)).toBe(true);
  });
});
