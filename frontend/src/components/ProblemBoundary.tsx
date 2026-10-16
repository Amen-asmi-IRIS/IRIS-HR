import { useQueryClient } from "@tanstack/react-query";
import { Component, useCallback, type ReactNode } from "react";
import { ProblemError } from "@/api/problem";
import { BeingUpdated } from "./BeingUpdated";
import { NotAvailable } from "./NotAvailable";
import { SomethingWentWrong } from "./SomethingWentWrong";

interface Props {
  children: ReactNode;
  /** When this changes (a new address), the boundary forgets the error. */
  resetKey?: string;
}

interface State {
  error: unknown;
  failed: boolean;
}

const isAway = (error: unknown): boolean => error instanceof ProblemError && error.unavailable;

/**
 * The application went away under an open page (an upgrade, a lost connection). The frame stays; the page says so
 * and asks again by itself. What could not be read is read again first, then the page is drawn again: a reading
 * keeps its failure until it succeeds, so a page drawn before that would only fail once more.
 */
function Away({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    void queryClient.refetchQueries({ predicate: (query) => isAway(query.state.error) }).then(onBack);
  }, [queryClient, onBack]);
  return <BeingUpdated inShell onRetry={retry} />;
}

/** Catches what a page throws and shows the matching page of UI 10.4. */
export class ProblemBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.reset();
  }

  reset = (): void => {
    this.setState({ error: null, failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { error } = this.state;
    if (error instanceof ProblemError && (error.status === 403 || error.status === 404)) return <NotAvailable />;
    if (isAway(error)) return <Away onBack={this.reset} />;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }
}
