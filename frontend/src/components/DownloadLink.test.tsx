import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUnauthorizedHandler } from "@/api/client";
import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { DownloadLink } from "./DownloadLink";

const ADDRESS = "/api/v1/attachments/att-1/download";

function mount() {
  renderApp(<DownloadLink href={ADDRESS}>Contrat</DownloadLink>);
  return screen.getByRole("link", { name: "Contrat" });
}

/** What the browser was given to save: jsdom has no object URLs and follows no link. */
let saved: { blob: Blob; name: string }[] = [];

beforeEach(() => {
  saved = [];
  let last: Blob | null = null;
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      last = blob;
      return "blob:iris/1";
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (last) saved.push({ blob: last, name: this.download });
  });
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("DownloadLink", () => {
  it("stays a link with its address", () => {
    expect(mount()).toHaveAttribute("href", ADDRESS);
  });

  it("fetches the file and hands it to the browser under the name the API gives", async () => {
    let language: string | null = null;
    server.use(
      http.get(ADDRESS, ({ request }) => {
        language = request.headers.get("accept-language");
        return new HttpResponse("%PDF-1.4", {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename*=utf-8''contrat%20sign%C3%A9.pdf" },
        });
      }),
    );

    expect(fireEvent.click(mount())).toBe(false);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe("contrat signé.pdf");
    expect(await saved[0].blob.text()).toBe("%PDF-1.4");
    expect(language).toBe("fr");
  });

  it("sends a reader whose session ended to Sign in, and says nothing more", async () => {
    const signedOut = vi.fn();
    setUnauthorizedHandler(signedOut);
    server.use(http.get(ADDRESS, () => problemResponse(401, "core.not_authenticated", "Vous n'êtes pas connecté.")));

    fireEvent.click(mount());

    await waitFor(() => expect(signedOut).toHaveBeenCalledTimes(1));
    expect(saved).toEqual([]);
    expect(screen.queryByText("Vous n'êtes pas connecté.")).not.toBeInTheDocument();
  });

  it("says a refusal in words", async () => {
    server.use(http.get(ADDRESS, () => problemResponse(404, "core.not_found", "Cet élément est introuvable.")));

    fireEvent.click(mount());

    expect(await screen.findByText("Cet élément est introuvable.")).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it("says so when the application cannot be reached", async () => {
    server.use(http.get(ADDRESS, () => HttpResponse.error()));

    fireEvent.click(mount());

    expect(await screen.findByText("L'application est injoignable. Vérifiez votre connexion et réessayez.")).toBeInTheDocument();
  });

  it("leaves a click meant for a new tab to the browser", () => {
    // jsdom has no other tab to open and says so.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(fireEvent.click(mount(), { ctrlKey: true })).toBe(true);
    expect(saved).toEqual([]);
  });
});
