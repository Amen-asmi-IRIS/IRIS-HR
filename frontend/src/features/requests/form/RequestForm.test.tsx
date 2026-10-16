import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, problemResponse, TYPES } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import { setPhoneViewport } from "@/test/viewport";
import type { RequestTypeOut } from "../types";
import { RequestForm, type RequestFormProps } from "./RequestForm";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

function show(type: RequestTypeOut, props: Partial<RequestFormProps> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const formId = props.formId ?? `new:${type.code}`;
  const view = renderApp(
    <RequestForm key={formId} type={type} mode="me" formId={formId} onDone={onDone} onCancel={onCancel} {...props} />,
    { route: "/me/requests/new", me },
  );
  return { onDone, onCancel, view };
}

function fillDates(start = "2026-11-09", end = "2026-11-11") {
  setDate("Début", start);
  setDate("Fin", end);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the form shows only the fields of the chosen type (M7)", () => {
  it("an annual leave asks for dates, half-days and a comment", () => {
    serveRequestForm();
    show(TYPES.annual);
    expect(screen.getByLabelText("Début")).toBeInTheDocument();
    expect(screen.getByLabelText("Fin")).toBeInTheDocument();
    expect(screen.getByLabelText("Commencer à midi le premier jour")).toBeInTheDocument();
    expect(screen.getByLabelText("Finir à midi le dernier jour")).toBeInTheDocument();
    expect(screen.getByLabelText("Commentaire (facultatif)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Événement")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("De")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Certificat médical")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
  });

  it("a permission asks for one date and two times", () => {
    serveRequestForm();
    show(TYPES.permission);
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("À")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fin")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Commencer à midi le premier jour")).not.toBeInTheDocument();
  });

  it("an exceptional leave asks for its event, and for proof when the event needs it", async () => {
    serveRequestForm();
    show(TYPES.exceptional);
    expect(screen.queryByLabelText("Commencer à midi le premier jour")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Justificatif")).not.toBeInTheDocument();
    await screen.findByRole("option", { name: "Mariage" });
    await chooseOption("Événement", "Mariage");
    expect(await screen.findByLabelText("Justificatif")).toBeInTheDocument();
    await chooseOption("Événement", "Naissance");
    await waitFor(() => expect(screen.queryByLabelText("Justificatif")).not.toBeInTheDocument());
  });

  it("a sick leave offers the certificate now or later and says who sees it", () => {
    serveRequestForm();
    show(TYPES.sick);
    expect(screen.getByLabelText("Certificat médical")).toBeInTheDocument();
    expect(screen.getByText(/Vous pouvez l'ajouter maintenant ou plus tard/)).toBeInTheDocument();
    expect(screen.getByText("Votre commentaire et votre certificat ne sont vus que par les RH.")).toBeInTheDocument();
  });
});

describe("the form shows what the system computed (U4)", () => {
  const before = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("puts what was computed before Send on a phone, so it is read first", async () => {
    setPhoneViewport(true);
    serveRequestForm();
    show(TYPES.annual);
    fillDates();
    const panel = screen.getByRole("complementary", { name: "Calculé pour vous" });
    expect(await within(panel).findByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
    expect(before(panel, screen.getByRole("button", { name: "Envoyer" }))).toBe(true);
    expect(before(panel, screen.getByRole("button", { name: "Enregistrer pour plus tard" }))).toBe(true);
  });

  it("keeps it beside the form on a wider screen, after the actions", () => {
    serveRequestForm();
    show(TYPES.annual);
    const panel = screen.getByRole("complementary", { name: "Calculé pour vous" });
    expect(before(screen.getByRole("button", { name: "Envoyer" }), panel)).toBe(true);
  });

  it("counts the days, lists those not counted, gives the balance and says who will decide", async () => {
    const calls = serveRequestForm({
      preview: makePreview({
        quantity: "3.00",
        skipped_days: [
          { date: "2026-11-07", reason: "weekend" },
          { date: "2026-11-10", reason: "holiday" },
        ],
        balance: { now: "12.50", on_start: "15.00", after: "12.00" },
      }),
    });
    show(TYPES.annual);
    fillDates("2026-11-06", "2026-11-12");
    expect(await screen.findByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("D(2026-11-07) (week-end) · D(2026-11-10) (jour férié)")).toBeInTheDocument();
    expect(screen.getByText("12.5 j")).toBeInTheDocument();
    expect(screen.getByText("15 j")).toBeInTheDocument();
    expect(screen.getByText("12 j")).toBeInTheDocument();
    expect(screen.getByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
    expect(calls.preview.at(-1)).toEqual({
      type: "annual",
      start_date: "2026-11-06",
      end_date: "2026-11-12",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
      exceptional_event: null,
      override: false,
    });
  });

  it("shows no balance line when the type does not use the balance", async () => {
    serveRequestForm({ preview: makePreview({ balance: null }) });
    show(TYPES.remote);
    fillDates();
    expect(await screen.findByText("3 j")).toBeInTheDocument();
    expect(screen.queryByText("Solde aujourd'hui")).not.toBeInTheDocument();
  });

  it("shows the remote days already taken and the limit", async () => {
    serveRequestForm({
      preview: makePreview({ quantity: "1.00", usage: { cap: { used: "1.00", limit: "2.00", period: "week" }, month_hours: null, event_days_allowed: null } }),
    });
    show(TYPES.remote);
    fillDates("2026-11-09", "2026-11-09");
    expect(await screen.findByText("Déjà pris cette semaine")).toBeInTheDocument();
    expect(screen.getByText("1 j sur 2 j")).toBeInTheDocument();
  });

  it("shows the hours of a permission and those already taken this month", async () => {
    serveRequestForm({
      preview: makePreview({ quantity: "2.50", usage: { cap: null, month_hours: "4.00", event_days_allowed: null } }),
    });
    show(TYPES.permission);
    setDate("Date", "2026-11-09");
    setTime("De", "14:00");
    setTime("À", "16:30");
    expect(await screen.findByText("2.5 h")).toBeInTheDocument();
    expect(screen.getByText("Heures déjà prises ce mois-ci")).toBeInTheDocument();
    expect(screen.getByText("4 h")).toBeInTheDocument();
  });

  it("shows the days an event allows and when the certificate is due", async () => {
    serveRequestForm({
      preview: makePreview({
        usage: { cap: null, month_hours: null, event_days_allowed: "3.00" },
        certificate_due_at: "2026-11-11T09:00:00+01:00",
      }),
    });
    show(TYPES.exceptional);
    await screen.findByRole("option", { name: "Mariage" });
    await chooseOption("Événement", "Mariage");
    fillDates();
    expect(await screen.findByText("Jours accordés pour cet événement")).toBeInTheDocument();
    expect(screen.getByText("T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("asks the server nothing while the dates cannot be right", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-11", "2026-11-09");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(calls.preview).toHaveLength(0);
    expect(screen.getByText("Indiquez les dates : le décompte apparaîtra ici.")).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("saves the draft, submits it with its version and reports the result", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage en famille");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toEqual([
      {
        type: "annual",
        start_date: "2026-11-09",
        end_date: "2026-11-11",
        starts_at_midday: false,
        ends_at_midday: false,
        start_time: null,
        end_time: null,
        exceptional_event: null,
        comment: "Voyage en famille",
      },
    ]);
    expect(calls.submit).toEqual([{ version: 1 }]);
    expect(onDone.mock.calls[0][0].sent).toBe(true);
    expect(onDone.mock.calls[0][0].request.public_id).toBe("new-1");
  });

  it("a double click on Send creates one request", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    await userEvent.dblClick(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.submit).toHaveLength(1);
  });

  it("saves for later without sending", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer pour plus tard" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.submit).toHaveLength(0);
    expect(onDone.mock.calls[0][0].sent).toBe(false);
  });

  it("uploads the certificate between saving and sending", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.sick);
    fillDates("2026-11-09", "2026-11-10");
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.attach).toBe(1);
    expect(calls.submit).toEqual([{ version: 2 }]);
  });

  it("cancel leaves without saving anything", async () => {
    const calls = serveRequestForm();
    const { onCancel } = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(calls.create).toHaveLength(0);
  });
});

describe("messages (UI 5.3) and what is never lost (U5)", () => {
  const overlap = { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre demande du 10 novembre.", params: {} };

  it("shows a problem the server finds before anything is sent, and does not send", async () => {
    const calls = serveRequestForm({
      preview: (body) => makePreview({ problems: body.start_date === "2026-11-09" ? [overlap] : [] }),
    });
    const { onDone } = show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Ces dates chevauchent votre demande du 10 novembre.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getByText("Ces dates chevauchent votre demande du 10 novembre.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();

    fillDates("2026-11-16", "2026-11-18");
    await waitFor(() =>
      expect(screen.queryByText("Ces dates chevauchent votre demande du 10 novembre.")).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("explains an insufficient balance and that HR can make an exception", async () => {
    serveRequestForm({
      preview: makePreview({
        problems: [{ field: null, code: "request.balance_insufficient", detail: "Il vous manque 1,5 jour.", params: { shortfall: "1.50" } }],
      }),
    });
    show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Il vous manque 1,5 jour.")).toBeInTheDocument();
    expect(screen.getByText("Vous pouvez demander aux RH s'ils peuvent accorder une exception.")).toBeInTheDocument();
  });

  it("puts a problem with no field on screen in the summary", async () => {
    serveRequestForm({
      preview: makePreview({
        problems: [{ field: null, code: "request.type_inactive", detail: "Ce type de demande n'est plus proposé.", params: {} }],
      }),
    });
    show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Ce type de demande n'est plus proposé.")).toBeInTheDocument();
  });

  it("shows a problem with a half-day next to the half-day choices", async () => {
    serveRequestForm({
      preview: (body) =>
        makePreview({
          problems: body.starts_at_midday
            ? [
                {
                  field: "starts_at_midday",
                  code: "request.half_day_on_non_working_day",
                  detail: "Le premier jour n'est pas travaillé : une demi-journée n'y est pas possible.",
                  params: {},
                },
              ]
            : [],
        }),
    });
    show(TYPES.annual);
    fillDates();
    await toggle("Commencer à midi le premier jour");
    expect(
      await screen.findByText("Le premier jour n'est pas travaillé : une demi-journée n'y est pas possible."),
    ).toBeInTheDocument();
  });

  it("refuses a single day flagged at both ends, next to the choices and without sending", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-09", "2026-11-09");
    await toggle("Commencer à midi le premier jour");
    await toggle("Finir à midi le dernier jour");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
  });

  it("refuses an end before the start without calling the server", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-11", "2026-11-09");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("La fin doit être le même jour que le début, ou après.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
  });

  it("a refused file leaves every other field as typed", async () => {
    const calls = serveRequestForm();
    show(TYPES.sick);
    fillDates("2026-11-09", "2026-11-10");
    setText("Commentaire (facultatif)", "Grippe");
    await pickFile("Certificat médical", new File(["notes"], "certificat.pdf.txt", { type: "text/plain" }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-10");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Grippe");
    expect(calls.create).toHaveLength(0);
  });

  it("keeps everything typed when the server refuses on sending, and does not create a second draft", async () => {
    const calls = serveRequestForm();
    server.use(
      http.post("/api/v1/requests/new-1/submit", () =>
        problemResponse(400, "validation", "Prévenez au moins trois jours avant.", [
          { field: "start_date", code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} },
        ]),
      ),
    );
    const { onDone } = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage");
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.update).toHaveLength(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.update[0]).toMatchObject({ version: 1, start_date: "2026-11-09" });
    expect(calls.update[0]).not.toHaveProperty("override_reason");
    // Once the draft exists, the preview names it, so that it is not held against itself.
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ request: "new-1" }));
  });

  it("says in plain words when the request changed elsewhere", async () => {
    serveRequestForm();
    server.use(
      http.post("/api/v1/requests/new-1/submit", () => problemResponse(409, "request.already_processed", "Déjà traité.")),
    );
    show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."),
    ).toBeInTheDocument();
  });
});

describe("the form after the session ended (UI 3.4)", () => {
  it("restores what was typed after the page is left and reopened", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage en famille");
    first.view.unmount();

    show(TYPES.annual);
    expect(await screen.findByText("Nous avons gardé ce que vous aviez saisi. Vérifiez-le avant d'envoyer.")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage en famille");
  });

  it("lets the user start again from an empty form", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    first.view.unmount();
    show(TYPES.annual);
    await userEvent.click(await screen.findByRole("button", { name: "Repartir d'un formulaire vide" }));
    expect(screen.getByLabelText("Début")).toHaveValue("");
    expect(screen.queryByText(/Nous avons gardé/)).not.toBeInTheDocument();
  });

  it("keeps nothing once the request is sent", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(first.onDone).toHaveBeenCalled());
    first.view.unmount();
    show(TYPES.annual);
    expect(screen.getByLabelText("Début")).toHaveValue("");
  });
});

describe("the form filled by HR for an employee (UI 7.7)", () => {
  it("offers the exception with a mandatory reason and sends both", async () => {
    const calls = serveRequestForm({ draft: { created_by_hr: true, viewer: { relation: "hr", actions: ["edit", "submit", "discard"] } } });
    const { onDone } = show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    expect(screen.getByText("La demande suit ensuite ses étapes normales.")).toBeInTheDocument();
    fillDates();
    await toggle("Autoriser une exception");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: true }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);

    setText("Motif de l'exception", "Accord de la direction");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create[0]).toMatchObject({ employee: "emp-owner", override_reason: "Accord de la direction" });
  });

  it("no longer offers the exception once the request exists, and says why", async () => {
    serveRequestForm({ draft: { created_by_hr: true, has_override: true, viewer: { relation: "hr", actions: ["edit", "submit", "discard"] } } });
    server.use(
      http.post("/api/v1/requests/new-1/submit", () =>
        problemResponse(400, "validation", "Prévenez au moins trois jours avant.", [
          { field: "start_date", code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} },
        ]),
      ),
    );
    show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
    expect(
      screen.getByText("L'exception se décide à la création de la demande : elle ne peut plus être changée ici."),
    ).toBeInTheDocument();
  });

  it("does not offer the exception to an employee, nor send one", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create[0]).not.toHaveProperty("override_reason");
    expect(calls.create[0]).not.toHaveProperty("employee");
  });

  it("speaks of the employee's manager, not of yours", async () => {
    serveRequestForm();
    show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    fillDates();
    expect(await screen.findByText("Son responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
  });
});
