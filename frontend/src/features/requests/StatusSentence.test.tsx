import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequest } from "@/features/requests/fixtures";
import { StatusSentence } from "./StatusSentence";
import { TypeTag } from "./TypeTag";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const sickWithoutCertificate = makeRequest({
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
});

describe("StatusSentence", () => {
  it("shows one sentence in a list", () => {
    renderApp(<StatusSentence request={sickWithoutCertificate} />, { route: "/me/requests", me });
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
    expect(screen.queryByText("En attente des RH")).not.toBeInTheDocument();
  });

  it("shows every sentence on a detail page", () => {
    renderApp(<StatusSentence request={sickWithoutCertificate} detail />, { route: "/me/requests/req-1", me });
    expect(screen.getByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("never shows a status code", () => {
    renderApp(<StatusSentence request={makeRequest()} detail />, { route: "/me/requests/req-1", me });
    expect(screen.queryByText(/waiting_manager|pending/)).not.toBeInTheDocument();
  });
});

describe("TypeTag", () => {
  it("shows the name of the type and carries its code for styling", () => {
    renderApp(<TypeTag code="sick" name="Congé maladie" />, { route: "/me", me });
    expect(screen.getByText("Congé maladie")).toHaveAttribute("data-type", "sick");
  });

  it("styles a type added later by HR like a neutral one", () => {
    renderApp(<TypeTag code="training_day" name="Journée de formation" />, { route: "/me", me });
    expect(screen.getByText("Journée de formation").className).toContain("bg-type-remote-bg");
  });
});
