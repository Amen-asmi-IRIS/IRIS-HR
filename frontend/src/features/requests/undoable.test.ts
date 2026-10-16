import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBeforeSignOut } from "@/features/auth/session";
import { clearPending, flushPending, schedule, settlePending, undo, undoConfig } from "./undoable";

beforeEach(() => {
  vi.useFakeTimers();
  undoConfig.delayMs = 5000;
});

afterEach(() => {
  clearPending();
  vi.useRealTimers();
});

describe("actions that wait for an undo (U6)", () => {
  it("commits once the delay has passed", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "discard", commit);
    await vi.advanceTimersByTimeAsync(4999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits nothing when undone in time", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "withdraw", commit);
    await vi.advanceTimersByTimeAsync(3000);
    undo("req-1");
    await vi.advanceTimersByTimeAsync(10000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits at once what is still waiting when the page is left", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    schedule("req-1", "discard", first);
    schedule("req-2", "withdraw", second);
    flushPending();
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("flushes on pagehide", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "discard", commit);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("settles everything waiting, and resolves once it is done", async () => {
    const order: string[] = [];
    schedule("req-1", "withdraw", async () => {
      await Promise.resolve();
      order.push("withdrawn");
    });
    await settlePending();
    expect(order).toEqual(["withdrawn"]);
  });

  it("is settled before the session ends", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "discard", commit);
    await runBeforeSignOut();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps one pending action per request", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    schedule("req-1", "discard", first);
    schedule("req-1", "discard", second);
    await vi.advanceTimersByTimeAsync(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
