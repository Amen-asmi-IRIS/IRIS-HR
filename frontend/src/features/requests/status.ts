import type { Lang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import type { Translate } from "./platform";
import type { RequestDetail, RequestOut, StateKey } from "./types";

export type Tone = "waiting" | "approved" | "refused" | "info" | "neutral";
export type Angle = "requester" | "actor" | "observer";

export interface Sentence {
  tone: Tone;
  text: string;
}

const TONES: Record<StateKey, Tone> = {
  draft: "neutral",
  waiting_manager: "waiting",
  waiting_hr: "waiting",
  waiting_person: "waiting",
  returned: "info",
  approved: "approved",
  rejected: "refused",
  withdrawn: "neutral",
  cancelled: "neutral",
};

/** From whose side the request is read (UI 3.5, R3). */
export function angleOf(request: RequestOut): Angle {
  if (request.viewer.relation === "owner") return "requester";
  return request.viewer.actions.includes("decide") ? "actor" : "observer";
}

export function stateSentence(request: RequestOut, t: Translate): Sentence {
  const { key, waiting_on: waitingOn, last_actor: lastActor, note } = request.state;
  const angle = angleOf(request);
  const tone = TONES[key];
  const requester = request.employee.name;

  if (key === "waiting_manager" || key === "waiting_person") {
    if (angle === "actor") return { tone, text: t("status.actor.waiting") };
    return {
      tone,
      text: waitingOn.length > 0 ? t("status.waitingFor", { names: waitingOn.join(", ") }) : t("status.waitingNobody"),
    };
  }
  if (key === "waiting_hr") {
    if (angle === "actor") return { tone, text: t("status.actor.toValidate") };
    return { tone, text: lastActor ? t("status.approvedByWaitingHr", { actor: lastActor }) : t("status.waitingHr") };
  }
  if (key === "returned") {
    if (angle !== "requester") return { tone, text: t("status.observer.returned", { requester }) };
    return { tone, text: note ? t("status.requester.returned", { note }) : t("status.requester.returnedNoNote") };
  }
  if (key === "rejected") {
    return { tone, text: angle === "requester" && note ? t("status.requester.rejected", { note }) : t("status.rejected") };
  }
  if (key === "withdrawn") {
    return {
      tone,
      text: angle === "requester" ? t("status.requester.withdrawn") : t("status.observer.withdrawn", { requester }),
    };
  }
  return { tone, text: t(`status.${key}`) };
}

/** "Certificate due by ...". Null when nothing is expected, or when the viewer is not told (certificate is null). */
export function certificateSentence(request: RequestOut, t: Translate, lang: Lang): Sentence | null {
  const certificate = request.certificate;
  if (!certificate) return null;
  if (certificate.status === "due" && certificate.due_at) {
    return { tone: "waiting", text: t("certificate.due", { date: formatDateTime(certificate.due_at, lang) }) };
  }
  if (certificate.status === "overdue" && certificate.due_at) {
    return { tone: "refused", text: t("certificate.overdue", { date: formatDateTime(certificate.due_at, lang) }) };
  }
  if (certificate.status === "missing") return { tone: "waiting", text: t("certificate.missing") };
  return null;
}

export function amendmentSentence(request: RequestOut, t: Translate): Sentence | null {
  const amendment = request.amendment;
  if (!amendment || amendment.status !== "pending") return null;
  const angle = angleOf(request);
  if (angle === "actor") return { tone: "waiting", text: t("amendment.actor") };
  const who = amendment.state_key === "waiting_hr" ? t("common.hr") : amendment.waiting_on.join(", ");
  return { tone: "waiting", text: t(angle === "requester" ? "amendment.requester" : "amendment.observer", { who }) };
}

/** The one sentence shown in a list: the open change, else the certificate of a pending request, else the state. */
export function headline(request: RequestOut, t: Translate, lang: Lang): Sentence {
  return (
    amendmentSentence(request, t) ??
    (request.status === "pending" ? certificateSentence(request, t, lang) : null) ??
    stateSentence(request, t)
  );
}

/** Every sentence of the detail page, the state first. Without the certificate when the page states it elsewhere. */
export function allSentences(request: RequestOut, t: Translate, lang: Lang, withCertificate = true): Sentence[] {
  const certificate = withCertificate && request.status === "pending" ? certificateSentence(request, t, lang) : null;
  return [stateSentence(request, t), certificate, amendmentSentence(request, t)].filter(
    (sentence): sentence is Sentence => sentence !== null,
  );
}

/** What happens after the current state, told to the requester only (U2). */
export function nextStep(request: RequestDetail, t: Translate): string | null {
  if (angleOf(request) !== "requester") return null;
  if (request.status === "draft") return t("next.draft");
  if (request.status === "returned") return t("next.returned");
  if (request.status === "approved") return request.viewer.actions.includes("amend") ? t("next.approved") : null;
  if (request.status !== "pending") return null;

  const own = request.steps.filter((step) => step.amendment_public_id === null);
  const round = Math.max(0, ...own.map((step) => step.round));
  const upcoming = own
    .filter((step) => step.round === round && step.status === "waiting" && step.mode === "approve")
    .sort((a, b) => a.position - b.position)[0];
  if (!upcoming) return t("next.last");
  if (upcoming.rule === "hr_role") return t("next.thenHr");
  return upcoming.approvers.length > 0
    ? t("next.thenPerson", { names: upcoming.approvers.join(", ") })
    : t("next.thenSomeone");
}
