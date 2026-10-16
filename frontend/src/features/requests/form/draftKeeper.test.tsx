import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it } from "vitest";
import { keeperKey, purgeOthers, useDraftKeeper } from "./draftKeeper";
import { EMPTY, type FormValues } from "./schema";

function Probe({ viewer = "user-1", formId }: { viewer?: string; formId: string }) {
  const form = useForm<FormValues>({ defaultValues: EMPTY });
  const keeper = useDraftKeeper(viewer, formId, form);
  return (
    <form>
      <label>
        Début
        <input {...form.register("start_date")} />
      </label>
      <label>
        Commentaire
        <input {...form.register("comment")} />
      </label>
      {keeper.restored && <p>restauré</p>}
      <button type="button" onClick={() => form.setValue("file", new File(["x"], "certificat.pdf"))}>
        fichier
      </button>
      <button type="button" onClick={keeper.clear}>
        effacer
      </button>
    </form>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the keeper of unsent values (UI 3.4, session end)", () => {
  it("keeps what was typed and gives it back", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Début"), "2026-11-09");
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage en famille");
    first.unmount();

    render(<Probe formId="new:annual" />);
    expect(await screen.findByText("restauré")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Commentaire")).toHaveValue("Voyage en famille");
  });

  it("says nothing was kept for a form nobody touched", () => {
    render(<Probe formId="new:annual" />);
    expect(screen.queryByText("restauré")).not.toBeInTheDocument();
  });

  it("keeps each form apart", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage");
    first.unmount();
    render(<Probe formId="new:sick" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
    expect(screen.queryByText("restauré")).not.toBeInTheDocument();
  });

  it("forgets once cleared", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage");
    await userEvent.click(screen.getByRole("button", { name: "effacer" }));
    first.unmount();
    render(<Probe formId="new:annual" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
  });

  it("never stores the chosen file", async () => {
    render(<Probe formId="new:sick" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Grippe");
    await userEvent.click(screen.getByRole("button", { name: "fichier" }));
    const stored = window.sessionStorage.getItem(keeperKey("user-1", "new:sick")) ?? "";
    expect(stored).toContain("Grippe");
    expect(stored).not.toContain("certificat.pdf");
    expect(JSON.parse(stored)).not.toHaveProperty("file");
  });

  it("removes what another person left in this tab", async () => {
    const first = render(<Probe viewer="user-1" formId="new:sick" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Grippe");
    first.unmount();
    render(<Probe viewer="user-2" formId="new:sick" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
    expect(window.sessionStorage.getItem(keeperKey("user-1", "new:sick"))).toBeNull();
  });

  it("leaves other things in the tab's storage alone", () => {
    window.sessionStorage.setItem("something-else", "1");
    purgeOthers("user-2");
    expect(window.sessionStorage.getItem("something-else")).toBe("1");
  });
});
