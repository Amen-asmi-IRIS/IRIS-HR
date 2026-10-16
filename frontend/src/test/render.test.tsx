import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigate, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { useCurrentUser, useMe } from "@/features/auth/api";
import { makeMe } from "./fixtures";
import { renderApp } from "./render";

function Probe() {
  const { id } = useParams();
  const me = useCurrentUser();
  const navigate = useNavigate();
  return (
    <div>
      <p>param:{id ?? "none"}</p>
      <p>user:{me.name}</p>
      <button onClick={() => navigate("/admin/accounts?state=locked")}>go</button>
    </div>
  );
}

function AnonymousProbe() {
  const me = useMe();
  return <p>{me.data === null ? "anonymous" : "signed in"}</p>;
}

describe("renderApp", () => {
  it("mounts a page under a route pattern with a signed-in user", () => {
    renderApp(<Probe />, { route: "/things/42", path: "/things/:id", me: makeMe({ name: "Samia Admin" }) });
    expect(screen.getByText("param:42")).toBeInTheDocument();
    expect(screen.getByText("user:Samia Admin")).toBeInTheDocument();
  });

  it("shows where the page went when it navigates away", async () => {
    const { router } = renderApp(<Probe />, { route: "/things/42", path: "/things/:id" });
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/admin/accounts?state=locked");
    expect(router.state.location.pathname).toBe("/admin/accounts");
  });

  it("can render for nobody", () => {
    renderApp(<AnonymousProbe />, { me: null });
    expect(screen.getByText("anonymous")).toBeInTheDocument();
  });
});
