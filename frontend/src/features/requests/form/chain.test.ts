import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { Translate } from "../platform";
import type { ChainStepPreview } from "../types";
import { chainSentence } from "./chain";

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

const manager: ChainStepPreview = { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] };
const hr: ChainStepPreview = { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] };

describe("who will decide, in order and by name (UI 5.3)", () => {
  it("names the manager, then HR", () => {
    expect(chainSentence([manager, hr], fr, "me")).toBe("Votre responsable, Sami Ben Ali, puis les RH");
    expect(chainSentence([manager, hr], en, "me")).toBe("Your manager, Sami Ben Ali, then HR");
  });

  it("names the manager and the delegate who can act for them", () => {
    const withDelegate = { ...manager, approvers: ["Sami Ben Ali", "Nadia Karoui"] };
    expect(chainSentence([withDelegate, hr], en, "me")).toBe("Your manager, Sami Ben Ali, Nadia Karoui, then HR");
  });

  it("speaks of the employee's manager when HR fills the form", () => {
    expect(chainSentence([manager, hr], fr, "hr")).toBe("Son responsable, Sami Ben Ali, puis les RH");
    expect(chainSentence([manager, hr], en, "hr")).toBe("Their manager, Sami Ben Ali, then HR");
  });

  it("says when the manager is only informed, as for sick leave", () => {
    const informed = { ...manager, mode: "notify" as const };
    expect(chainSentence([informed, hr], fr, "me")).toBe("Votre responsable, Sami Ben Ali (pour information), puis les RH");
    expect(chainSentence([informed, hr], en, "me")).toBe("Your manager, Sami Ben Ali (for information), then HR");
  });

  it("says when there is no manager to ask", () => {
    const none = { ...manager, approvers: [] };
    expect(chainSentence([none, hr], en, "me")).toBe("No manager (step skipped), then HR");
  });

  it("names a named person as they are", () => {
    const named: ChainStepPreview = { position: 1, rule: "named_person", mode: "approve", approvers: ["Hatem Jlassi"] };
    expect(chainSentence([named, hr], en, "me")).toBe("Hatem Jlassi, then HR");
  });

  it("says so when nobody is set to decide", () => {
    expect(chainSentence([], en, "me")).toBe("Nobody for now");
  });
});
