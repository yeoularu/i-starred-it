import type { StarredRepository } from "@i-starred-it/api/services/github";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRepositorySearch } from "./use-repository-search";

const EXPECTED_UPDATED_COUNT = 3;

const createMockRepository = (
  owner: string,
  name: string,
  description: string | null = null
): StarredRepository => ({
  owner,
  name,
  description,
  readme: null,
  stargazerCount: 100,
  forkCount: 10,
  pushedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  starredAt: new Date().toISOString(),
});

describe("useRepositorySearch", () => {
  it("initializes with empty state", () => {
    const { result } = renderHook(() =>
      useRepositorySearch({ repositories: [] })
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.indexedCount).toBe(0);
  });

  it("indexes repositories on mount", () => {
    const repositories = [
      createMockRepository("facebook", "react"),
      createMockRepository("vercel", "next.js"),
    ];

    const { result } = renderHook(() => useRepositorySearch({ repositories }));

    expect(result.current.isReady).toBe(true);
    expect(result.current.indexedCount).toBe(2);
  });

  it("searches indexed repositories", () => {
    const repositories = [
      createMockRepository("facebook", "react", "A JavaScript library"),
      createMockRepository("vercel", "next.js", "The React Framework"),
    ];

    const { result } = renderHook(() => useRepositorySearch({ repositories }));

    const results = result.current.search(["react"]);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty results when not ready", () => {
    const { result } = renderHook(() =>
      useRepositorySearch({ repositories: [] })
    );

    const results = result.current.search(["test"]);
    expect(results).toEqual([]);
  });

  it("re-indexes when repositories change", () => {
    const initialRepos = [createMockRepository("facebook", "react")];

    const { result, rerender } = renderHook(
      ({ repositories }) => useRepositorySearch({ repositories }),
      {
        initialProps: { repositories: initialRepos },
      }
    );

    expect(result.current.indexedCount).toBe(1);

    const updatedRepos = [
      createMockRepository("facebook", "react"),
      createMockRepository("vercel", "next.js"),
      createMockRepository("angular", "angular"),
    ];

    rerender({ repositories: updatedRepos });

    expect(result.current.indexedCount).toBe(EXPECTED_UPDATED_COUNT);
  });

  it("resets state when repositories become empty", () => {
    const initialRepositories = [createMockRepository("facebook", "react")];

    const { result, rerender } = renderHook(
      ({ repositories }) => useRepositorySearch({ repositories }),
      {
        initialProps: { repositories: initialRepositories },
      }
    );

    expect(result.current.isReady).toBe(true);
    expect(result.current.indexedCount).toBe(1);

    rerender({ repositories: [] });

    expect(result.current.isReady).toBe(false);
    expect(result.current.indexedCount).toBe(0);
  });

  it("respects search options", () => {
    const repositories = [
      createMockRepository("facebook", "react"),
      createMockRepository("vercel", "next.js"),
      createMockRepository("angular", "angular"),
    ];

    const { result } = renderHook(() => useRepositorySearch({ repositories }));

    const results = result.current.search(["framework"], { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("maintains stable search function reference", () => {
    const repositories = [createMockRepository("facebook", "react")];

    const { result, rerender } = renderHook(() =>
      useRepositorySearch({ repositories })
    );

    const searchFn1 = result.current.search;
    rerender();
    const searchFn2 = result.current.search;

    expect(searchFn1).toBe(searchFn2);
  });

  it("handles null repositories gracefully", () => {
    const { result } = renderHook(() =>
      useRepositorySearch({ repositories: null as unknown as [] })
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.indexedCount).toBe(0);
  });
});
