import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.JWT_SECRET = "test-only-secret";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis.BroadcastChannel === "undefined") {
  class TestBroadcastChannel {
    constructor(name: string) {
      void name;
    }
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  Object.defineProperty(globalThis, "BroadcastChannel", {
    writable: true,
    value: TestBroadcastChannel,
  });
}

if (typeof window !== "undefined") {
  const map = new Map<string, string>();
  const mockStorage: Storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: mockStorage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: mockStorage,
  });
}
