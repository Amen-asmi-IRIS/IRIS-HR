import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import type { Me } from "@/api/types";
import { patternFor } from "@/app/navigation";
import { Toaster } from "@/components/toast";
import { meKey, useMe } from "@/features/auth/api";
import { makeMe } from "./fixtures";

/** Stands in for RequireAuth: once the user is gone, so is the page. */
function SignedInOnly({ children }: { children: ReactElement }) {
  const me = useMe();
  return me.data ? children : <p data-testid="signed-out" />;
}

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/** Shown for any address other than the page under test, so a test can see where the page went. */
function Elsewhere() {
  const location = useLocation();
  return <p data-testid="elsewhere">{location.pathname + location.search}</p>;
}

interface RenderAppOptions {
  /** The address the page is opened at. */
  route?: string;
  /** Its route pattern. By default, the registered pattern that matches `route`. */
  path?: string;
  /** The signed-in user; null for nobody. */
  me?: Me | null;
  queryClient?: QueryClient;
}

/** Renders a page with the query client, a router and a signed-in user. */
export function renderApp(ui: ReactElement, options: RenderAppOptions = {}) {
  const { route = "/", queryClient = makeTestQueryClient() } = options;
  const me = options.me === undefined ? makeMe() : options.me;
  const path = options.path ?? patternFor(route.split(/[?#]/)[0]);
  queryClient.setQueryData(meKey, me);
  const router = createMemoryRouter(
    [
      { path, element: me === null ? ui : <SignedInOnly>{ui}</SignedInOnly> },
      { path: "*", element: <Elsewhere /> },
    ],
    { initialEntries: [route] },
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
