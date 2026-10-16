import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { api, call } from "@/api/client";
import { server } from "@/test/server";
import i18n, { isLang, setLanguage } from "./index";

describe("i18n", () => {
  it("starts each test in French", () => {
    expect(i18n.language).toBe("fr");
    expect(i18n.t("common:actions.save")).toBe("Enregistrer");
  });

  it("switches at once, marks the document and remembers the choice", async () => {
    await setLanguage("en");
    expect(i18n.t("common:actions.save")).toBe("Save");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("iris.language")).toBe("en");
  });

  it("tells the API which language to answer in", async () => {
    await setLanguage("en");
    let seen: string | null = null;
    server.use(
      http.get("/api/v1/notifications/unread-count", ({ request }) => {
        seen = request.headers.get("accept-language");
        return HttpResponse.json({ count: 0 });
      }),
    );
    await call(api.GET("/api/v1/notifications/unread-count"));
    expect(seen).toBe("en");
  });

  it("knows only French and English", () => {
    expect(isLang("fr")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it("fails loudly in tests when a key does not exist", () => {
    expect(() => i18n.t("common:doesNotExist")).toThrow("Missing translation common:doesNotExist");
  });
});
