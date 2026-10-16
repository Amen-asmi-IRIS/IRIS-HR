import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { clearToasts } from "@/components/toast";
import { resetSessionMemory } from "@/features/auth/session";
import i18n from "@/i18n";
import { server } from "./server";
import { installViewport, setPhoneViewport } from "./viewport";

installViewport();

// Radix menus and popovers need these in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

beforeEach(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(() => {
  cleanup();
  clearToasts();
  resetSessionMemory();
  server.resetHandlers();
  setPhoneViewport(false);
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

afterAll(() => server.close());
