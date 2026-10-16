import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeRequest, makeRequestDetail, makeStep } from "@/features/requests/fixtures";
import type { Translate } from "./platform";
import {
  allSentences, amendmentSentence, angleOf, certificateSentence, headline, nextStep, stateSentence,
} from "./status";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

const asActor = { relation: "approver" as const, actions: ["decide" as const], step_id: 7 };
const asObserver = { relation: "overview" as const, actions: [], step_id: null };

describe("the angle a request is read from", () => {
  it("is the requester's for one's own request, whatever else one may do", () => {
    expect(angleOf(makeRequest())).toBe("requester");
  });
  it("is the actor's for the person who can decide", () => {
    expect(angleOf(makeRequest({ viewer: asActor }))).toBe("actor");
  });
  it("is an observer's for everyone else", () => {
    expect(angleOf(makeRequest({ viewer: asObserver }))).toBe("observer");
    expect(angleOf(makeRequest({ viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null } }))).toBe("observer");
  });
});

describe("status sentences to the requester (UI 3.5)", () => {
  it.each([
    ["a draft", makeRequest({ status: "draft", state: { key: "draft", waiting_on: [] } }), "Pas encore envoyée", "Not sent yet"],
    ["waiting on the manager", makeRequest(), "En attente de Sami Ben Ali", "Waiting for Sami Ben Ali"],
    [
      "waiting on the manager and a delegate",
      makeRequest({ state: { waiting_on: ["Sami Ben Ali", "Nadia Karoui"] } }),
      "En attente de Sami Ben Ali, Nadia Karoui",
      "Waiting for Sami Ben Ali, Nadia Karoui",
    ],
    [
      "waiting on nobody who can act",
      makeRequest({ state: { waiting_on: [] } }),
      "En attente d'une décision",
      "Waiting for a decision",
    ],
    [
      "waiting on HR after the manager",
      makeRequest({ state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" } }),
      "Approuvée par Sami Ben Ali ; en attente des RH",
      "Approved by Sami Ben Ali; waiting for HR",
    ],
    [
      "waiting on HR with no earlier decision",
      makeRequest({ state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: null } }),
      "En attente des RH",
      "Waiting for HR",
    ],
    [
      "sent back",
      makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" } }),
      "Renvoyée vers vous : Trop long",
      "Sent back to you: Trop long",
    ],
    [
      "sent back without a comment",
      makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: null } }),
      "Renvoyée vers vous",
      "Sent back to you",
    ],
    ["approved", makeRequest({ status: "approved", state: { key: "approved", waiting_on: [] } }), "Approuvée", "Approved"],
    [
      "refused",
      makeRequest({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" } }),
      "Refusée : Effectif insuffisant",
      "Refused: Effectif insuffisant",
    ],
    [
      "withdrawn",
      makeRequest({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] } }),
      "Retirée par vous",
      "Withdrawn by you",
    ],
    ["cancelled", makeRequest({ status: "cancelled", state: { key: "cancelled", waiting_on: [] } }), "Annulée", "Cancelled"],
  ])("%s", (_name, request, french, english) => {
    expect(stateSentence(request, fr).text).toBe(french);
    expect(stateSentence(request, en).text).toBe(english);
  });

  it("shows a note with an apostrophe as typed", () => {
    const request = makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: "Décalez d'une semaine" } });
    expect(stateSentence(request, fr).text).toBe("Renvoyée vers vous : Décalez d'une semaine");
  });
});

describe("status sentences to the person who must act and to observers", () => {
  it("tells the approver the request waits for them", () => {
    const request = makeRequest({ viewer: asActor });
    expect(stateSentence(request, fr).text).toBe("En attente de votre décision");
    expect(stateSentence(request, en).text).toBe("Waiting for your decision");
  });

  it("tells HR the request is to validate", () => {
    const request = makeRequest({
      state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" },
      viewer: { relation: "hr", actions: ["decide"], step_id: 8 },
    });
    expect(stateSentence(request, fr).text).toBe("À valider");
    expect(stateSentence(request, en).text).toBe("To validate");
  });

  it("names the requester when a request was sent back or withdrawn", () => {
    const returned = makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: "Trop long" }, viewer: asObserver });
    const withdrawn = makeRequest({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] }, viewer: asObserver });
    expect(stateSentence(returned, fr).text).toBe("Renvoyée à Amal Trabelsi");
    expect(stateSentence(returned, en).text).toBe("Sent back to Amal Trabelsi");
    expect(stateSentence(withdrawn, fr).text).toBe("Retirée par Amal Trabelsi");
    expect(stateSentence(withdrawn, en).text).toBe("Withdrawn by Amal Trabelsi");
  });

  it("does not repeat the refusal reason to others", () => {
    const request = makeRequest({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: asObserver });
    expect(stateSentence(request, fr).text).toBe("Refusée");
  });

  it("tells an observer who the request waits for", () => {
    expect(stateSentence(makeRequest({ viewer: asObserver }), en).text).toBe("Waiting for Sami Ben Ali");
  });
});

describe("tones", () => {
  it.each([
    ["draft", "neutral"],
    ["waiting_manager", "waiting"],
    ["waiting_hr", "waiting"],
    ["waiting_person", "waiting"],
    ["returned", "info"],
    ["approved", "approved"],
    ["rejected", "refused"],
    ["withdrawn", "neutral"],
    ["cancelled", "neutral"],
  ] as const)("%s is %s", (key, tone) => {
    expect(stateSentence(makeRequest({ state: { key, waiting_on: ["Sami Ben Ali"] } }), fr).tone).toBe(tone);
  });
});

describe("certificate and amendment sentences", () => {
  const sick = { code: "sick", name: "Congé maladie" };

  it("says when the certificate is due", () => {
    const request = makeRequest({ type: sick, certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" } });
    expect(certificateSentence(request, fr, "fr")).toEqual({
      tone: "waiting",
      text: "Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)",
    });
    expect(certificateSentence(request, en, "en")?.text).toBe("Certificate due by T(2026-11-11T09:00:00+01:00)");
  });

  it("says when the certificate is overdue and when a proof is missing", () => {
    const overdue = makeRequest({ type: sick, certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" } });
    const missing = makeRequest({ certificate: { status: "missing", due_at: null } });
    expect(certificateSentence(overdue, fr, "fr")).toEqual({
      tone: "refused",
      text: "Certificat en retard, attendu le T(2026-11-11T09:00:00+01:00)",
    });
    expect(certificateSentence(missing, en, "en")?.text).toBe("Proof not provided yet");
  });

  it("says nothing when no document is expected, when it is attached, or when the viewer may not know", () => {
    expect(certificateSentence(makeRequest(), fr, "fr")).toBeNull();
    expect(certificateSentence(makeRequest({ certificate: { status: "attached", due_at: null } }), fr, "fr")).toBeNull();
    expect(certificateSentence(makeRequest({ certificate: null }), fr, "fr")).toBeNull();
  });

  it("reads an open change from each angle", () => {
    const amendment = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: ["Leila Gharbi"] };
    const approved = { status: "approved" as const, state: { key: "approved" as const, waiting_on: [] } };
    expect(amendmentSentence(makeRequest({ ...approved, amendment }), fr)?.text).toBe("Votre modification attend les RH");
    expect(amendmentSentence(makeRequest({ ...approved, amendment }), en)?.text).toBe("Your change is waiting for HR");
    expect(
      amendmentSentence(makeRequest({ ...approved, amendment: { ...amendment, state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] } }), en)?.text,
    ).toBe("Your change is waiting for Sami Ben Ali");
    expect(amendmentSentence(makeRequest({ ...approved, amendment, viewer: asActor }), fr)?.text).toBe("Modification à décider");
    expect(amendmentSentence(makeRequest({ ...approved, amendment, viewer: asObserver }), en)?.text).toBe("A change is waiting for HR");
  });

  it("ignores a change that is no longer open", () => {
    const amendment = { public_id: "am-1", kind: "change" as const, status: "rejected" as const, state_key: "rejected" as const, waiting_on: [] };
    expect(amendmentSentence(makeRequest({ amendment }), fr)).toBeNull();
  });
});

describe("the one sentence of a list and the sentences of a detail page", () => {
  const amendment = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: [] };

  it("prefers the open change, then the certificate, then the state", () => {
    const withChange = makeRequest({ status: "approved", state: { key: "approved", waiting_on: [] }, amendment });
    const withCertificate = makeRequest({
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(headline(withChange, en, "en").text).toBe("Your change is waiting for HR");
    expect(headline(withCertificate, en, "en").text).toBe("Certificate due by T(2026-11-11T09:00:00+01:00)");
    expect(headline(makeRequest(), en, "en").text).toBe("Waiting for Sami Ben Ali");
  });

  it("does not put a certificate sentence on a request that is no longer pending", () => {
    const rejected = makeRequest({
      status: "rejected",
      state: { key: "rejected", waiting_on: [], note: "Sans certificat" },
      certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(headline(rejected, en, "en").text).toBe("Refused: Sans certificat");
  });

  it("lists every sentence on the detail page, the state first", () => {
    const request = makeRequest({
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(allSentences(request, en, "en").map((sentence) => sentence.text)).toEqual([
      "Waiting for HR",
      "Certificate due by T(2026-11-11T09:00:00+01:00)",
    ]);
  });
});

describe("what happens next (U2)", () => {
  it("names the step that follows the current one", () => {
    expect(nextStep(makeRequestDetail(), en)).toBe("Then HR validates it.");
    const twoManagers = makeRequestDetail({
      steps: [makeStep(), makeStep({ id: 8, position: 2, rule: "named_person", status: "waiting", approvers: ["Hatem Jlassi"] })],
    });
    expect(nextStep(twoManagers, fr)).toBe("Ensuite, Hatem Jlassi décide.");
  });

  it("says when the current step is the last", () => {
    const atHr = makeRequestDetail({
      state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" },
      steps: [makeStep({ status: "approved" }), makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending" })],
    });
    expect(nextStep(atHr, en)).toBe("This is the last step.");
  });

  it("looks only at the latest round after a request was sent back and sent again", () => {
    const secondRound = makeRequestDetail({
      steps: [
        makeStep({ id: 1, round: 1, status: "returned" }),
        makeStep({ id: 2, round: 1, position: 2, rule: "hr_role", status: "waiting" }),
        makeStep({ id: 3, round: 2, status: "approved" }),
        makeStep({ id: 4, round: 2, position: 2, rule: "hr_role", status: "pending" }),
      ],
    });
    expect(nextStep(secondRound, en)).toBe("This is the last step.");
  });

  it("guides a draft, a returned request and an approved one that can still change", () => {
    expect(nextStep(makeRequestDetail({ status: "draft", state: { key: "draft", waiting_on: [] } }), en)).toBe(
      "Nothing is reserved until you send it.",
    );
    expect(nextStep(makeRequestDetail({ status: "returned", state: { key: "returned", waiting_on: [] } }), fr)).toBe(
      "Corrigez-la puis renvoyez-la : elle repartira de la première étape.",
    );
    expect(
      nextStep(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } }), en),
    ).toBe("You can still change the dates or cancel it until it starts.");
  });

  it("says nothing to people other than the requester, and nothing once it is over", () => {
    expect(nextStep(makeRequestDetail({ viewer: asActor }), en)).toBeNull();
    expect(nextStep(makeRequestDetail({ status: "rejected", state: { key: "rejected", waiting_on: [] } }), en)).toBeNull();
    expect(
      nextStep(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: [] } }), en),
    ).toBeNull();
  });
});
