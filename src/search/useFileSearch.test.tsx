import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fileSearchEnabled, useFileSearch } from "./useFileSearch";
import type { FileHit } from "../lib/types";

const hit = (name: string): FileHit => ({ name, path: `C:\\${name}`, isDir: false });
const shortcuts = [{ keyword: "yt", name: "YouTube", url: "https://y.com?q={q}" }];

afterEach(() => vi.useRealTimers());

describe("fileSearchEnabled", () => {
  it("regras", () => {
    expect(fileSearchEnabled("a", shortcuts)).toBe(false);
    expect(fileSearchEnabled("ab", shortcuts)).toBe(true);
    expect(fileSearchEnabled("2+2", shortcuts)).toBe(false);
    expect(fileSearchEnabled("yt lofi", shortcuts)).toBe(false);
    expect(fileSearchEnabled("relatório final", shortcuts)).toBe(true);
  });
});

describe("useFileSearch", () => {
  it("espera o debounce", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => [hit("a.txt")]);
    const { result } = renderHook(() => useFileSearch("rel", true, fetcher, 150));
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(fetcher).toHaveBeenCalledWith("rel");
    expect(result.current.hits).toEqual([hit("a.txt")]);
    expect(result.current.status).toBeNull();
  });

  it("ignora resposta atrasada", async () => {
    vi.useFakeTimers();
    let resolveSlow: (v: FileHit[]) => void = () => {};
    const fetcher = vi.fn((q: string) =>
      q === "ab" ? new Promise<FileHit[]>((r) => (resolveSlow = r)) : Promise.resolve([hit("novo.txt")]),
    );
    const { result, rerender } = renderHook(({ q }) => useFileSearch(q, true, fetcher, 150), { initialProps: { q: "ab" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    rerender({ q: "abc" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    await act(async () => {
      resolveSlow([hit("velho.txt")]);
    });
    expect(result.current.hits).toEqual([hit("novo.txt")]);
  });

  it("devolve o status quando o Everything não está pronto", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => "notRunning" as const);
    const { result } = renderHook(() => useFileSearch("rel", true, fetcher, 150));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(result.current.status).toBe("notRunning");
    expect(result.current.hits).toEqual([]);
  });

  it("desligado não busca", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => [hit("a.txt")]);
    const { result } = renderHook(() => useFileSearch("2+2", false, fetcher, 150));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.hits).toEqual([]);
  });
});
