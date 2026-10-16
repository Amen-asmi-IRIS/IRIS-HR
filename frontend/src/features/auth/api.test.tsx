import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProblemError } from "@/api/problem";
import { backToList } from "@/components/useListParams";
import { keeperKey } from "@/features/requests/form/draftKeeper";
import { clearPending, schedule } from "@/features/requests/undoable";
import { makeMe, problemResponse } from "@/test/fixtures";
import { makeTestQueryClient } from "@/test/render";
import { server } from "@/test/server";
import { completeSignIn, fetchMe, meKey, useChangePassword, useCurrentUser, useLogout, useMe, useUpdateMe } from "./api";
import { signInNoticePending, wasSignedOut } from "./session";

function wrapperFor(queryClient = makeTestQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

describe("fetchMe", () => {
  it("returns the user when a session exists", async () => {
    server.use(http.get("/api/v1/auth/me", () => HttpResponse.json(makeMe({ name: "Samia Admin" }))));
    expect((await fetchMe())?.name).toBe("Samia Admin");
  });

  it("returns null when nobody is signed in", async () => {
    server.use(http.get("/api/v1/auth/me", () => problemResponse(401, "core.not_authenticated", "Connectez-vous.")));
    expect(await fetchMe()).toBeNull();
  });

  it("lets an outage through, so that it is not mistaken for 'signed out'", async () => {
    server.use(http.get("/api/v1/auth/me", () => new HttpResponse("<html></html>", { status: 502 })));
    const error = await fetchMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).unavailable).toBe(true);
  });
});

describe("completeSignIn", () => {
  it("stores the user, drops what a previous user left, and arms the sign-in notice", () => {
    const { queryClient } = wrapperFor();
    queryClient.setQueryData(["accounts", "list"], ["left over"]);
    completeSignIn(queryClient, makeMe({ name: "Leila RH" }));
    expect(queryClient.getQueryData(meKey)).toMatchObject({ name: "Leila RH" });
    expect(queryClient.getQueryData(["accounts", "list"])).toBeUndefined();
    expect(signInNoticePending()).toBe(true);
  });
});

describe("useLogout", () => {
  it("ends the session and forgets everything", async () => {
    server.use(http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    queryClient.setQueryData(["accounts", "list"], ["cached"]);
    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    expect(queryClient.getQueryData(["accounts", "list"])).toBeUndefined();
    expect(wasSignedOut()).toBe(true);
  });

  it("leaves no list filter behind for the next person on this browser", async () => {
    server.use(http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    // What a list keeps so that "back" returns to it as it was (components/useListParams.ts).
    sessionStorage.setItem("iris.list:/hr/employees", "?search=Ben+Salah");
    localStorage.setItem("iris.language", "en");
    expect(backToList("/hr/employees")).toBe("/hr/employees?search=Ben+Salah");
    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    expect(backToList("/hr/employees")).toBe("/hr/employees");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("Ben+Salah");
    // The language of the sign-in page is not about a person: it stays.
    expect(localStorage.getItem("iris.language")).toBe("en");
  });
});

describe("useLogout and the request forms", () => {
  it("leaves no unsent request form behind for the next person on this browser", async () => {
    server.use(http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    // What a request form keeps until it is saved (features/requests/form/draftKeeper.ts).
    sessionStorage.setItem(keeperKey("user-1", "new:sick"), JSON.stringify({ comment: "Grippe et fièvre" }));
    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    expect(sessionStorage.getItem(keeperKey("user-1", "new:sick"))).toBeNull();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("Grippe");
  });
});

describe("useLogout and the actions waiting for their undo", () => {
  it("carries out a discard still waiting for its undo before the session ends", async () => {
    const order: string[] = [];
    server.use(
      http.post("/api/v1/auth/logout", () => {
        order.push("logout");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    // A draft discarded a moment ago: the call waits five seconds for an undo (master D34).
    schedule("req-1", "discard", async () => {
      order.push("discard");
    });
    try {
      const { result } = renderHook(() => useLogout(), { wrapper });
      result.current.mutate();
      await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
      expect(order).toEqual(["discard", "logout"]);
    } finally {
      clearPending();
    }
  });
});

describe("signing out while another call is on its way", () => {
  /** An answer the test lets go when it chooses. */
  function held() {
    let release!: () => void;
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { until, release };
  }

  it("is not undone by the answer to 'remember this workspace'", async () => {
    // The shell stores the workspace in use on its own; the user signs out before that call is answered.
    const answer = held();
    server.use(
      http.patch("/api/v1/auth/me", async () => {
        await answer.until;
        return HttpResponse.json(makeMe({ last_workspace: "admin" }));
      }),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    const { result } = renderHook(() => ({ update: useUpdateMe(), logout: useLogout() }), { wrapper });

    result.current.update.mutate({ last_workspace: "admin" });
    result.current.logout.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    answer.release();
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));

    expect(queryClient.getQueryData(meKey)).toBeNull();
  });

  it("is not undone by a reading of the user that had already started", async () => {
    const answer = held();
    server.use(
      http.get("/api/v1/auth/me", async () => {
        await answer.until;
        return HttpResponse.json(makeMe());
      }),
      http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe());
    const { result } = renderHook(() => ({ me: useMe(), logout: useLogout() }), { wrapper });

    void queryClient.invalidateQueries({ queryKey: meKey });
    await waitFor(() => expect(queryClient.isFetching({ queryKey: meKey })).toBe(1));
    result.current.logout.mutate();
    await waitFor(() => expect(queryClient.getQueryData(meKey)).toBeNull());
    answer.release();
    await waitFor(() => expect(queryClient.isFetching({ queryKey: meKey })).toBe(0));

    expect(queryClient.getQueryData(meKey)).toBeNull();
    expect(result.current.me.data).toBeNull();
  });
});

describe("useChangePassword", () => {
  it("reads the user again, because the obligation to change is now lifted", async () => {
    let asked = 0;
    server.use(
      http.post("/api/v1/auth/password", () => new HttpResponse(null, { status: 204 })),
      http.get("/api/v1/auth/me", () => {
        asked += 1;
        return HttpResponse.json(makeMe({ must_change_password: false }));
      }),
    );
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe({ must_change_password: true }));
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    result.current.mutate({ current_password: "Temp-1234-abcd", new_password: "Correct-Horse-42!" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(queryClient.getQueryState(meKey)?.isInvalidated).toBe(true));
    await queryClient.fetchQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 0 });
    expect(asked).toBe(1);
    expect(queryClient.getQueryData(meKey)).toMatchObject({ must_change_password: false });
  });
});

describe("useCurrentUser", () => {
  it("keeps the user it had for the one drawing between the end of the session and the page being taken away", () => {
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe({ name: "Samia Admin" }));
    const { result, rerender } = renderHook(() => useCurrentUser(), { wrapper });
    expect(result.current.name).toBe("Samia Admin");
    queryClient.setQueryData(meKey, null);
    rerender();
    expect(result.current.name).toBe("Samia Admin");
  });

  it("follows the user when the account changes", async () => {
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, makeMe({ language: "fr" }));
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    queryClient.setQueryData(meKey, makeMe({ language: "en" }));
    await waitFor(() => expect(result.current.language).toBe("en"));
  });

  it("fails on a page that never had a user", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { queryClient, wrapper } = wrapperFor();
    queryClient.setQueryData(meKey, null);
    expect(() => renderHook(() => useCurrentUser(), { wrapper })).toThrow(/RequireAuth/);
  });
});
