import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./useDebounced";
import { useSingleFlight } from "./useSingleFlight";

afterEach(() => {
  vi.useRealTimers();
});

describe("useSingleFlight", () => {
  it("runs once however many times it is called while busy", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = vi.fn(async () => {
      await gate;
    });
    const { result } = renderHook(() => useSingleFlight(work));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current[0]();
      second = result.current[0]();
    });
    expect(result.current[1]).toBe(true);
    await act(async () => {
      release();
      await Promise.all([first, second]);
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current[1]).toBe(false);
  });

  it("can run again once the first run has finished", async () => {
    const work = vi.fn(async () => undefined);
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await result.current[0]();
    });
    await act(async () => {
      await result.current[0]();
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("is free again after a failure", async () => {
    const work = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow("boom");
    });
    expect(result.current[1]).toBe(false);
    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow("boom");
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("passes its arguments through", async () => {
    const work = vi.fn<(count: number, label: string) => Promise<void>>(async () => undefined);
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await result.current[0](3, "x");
    });
    expect(work).toHaveBeenCalledWith(3, "x");
  });
});

describe("useDebounced", () => {
  it("gives the value only once it has stopped changing", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 300), { initialProps: { value: "a" } });
    expect(result.current).toBe("a");
    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("abc");
  });
});
