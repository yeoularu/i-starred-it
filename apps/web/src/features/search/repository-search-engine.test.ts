import type { StarredRepository } from "@i-starred-it/api/services/github";
import { beforeEach, describe, expect, it } from "vitest";
import { RepositorySearchEngine } from "./repository-search-engine";

const createMockRepository = (
  owner: string,
  name: string,
  description: string | null = null,
  readme: string | null = null
): StarredRepository => ({
  owner,
  name,
  description,
  readme,
  stargazerCount: 100,
  forkCount: 10,
  pushedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  starredAt: new Date().toISOString(),
});

describe("RepositorySearchEngine", () => {
  let engine: RepositorySearchEngine;

  beforeEach(() => {
    engine = new RepositorySearchEngine();
  });

  describe("basic operations", () => {
    it("initializes with zero documents", () => {
      expect(engine.size).toBe(0);
    });

    it("adds a repository", () => {
      const repo = createMockRepository("facebook", "react");
      engine.add(repo);
      expect(engine.size).toBe(1);
    });

    it("does not add duplicate repositories", () => {
      const repo = createMockRepository("facebook", "react");
      engine.add(repo);
      engine.add(repo);
      expect(engine.size).toBe(1);
    });

    it("resets the engine", () => {
      const repo = createMockRepository("facebook", "react");
      engine.add(repo);
      engine.reset();
      expect(engine.size).toBe(0);
    });
  });

  describe("search functionality", () => {
    beforeEach(() => {
      engine.add(
        createMockRepository(
          "facebook",
          "react",
          "A JavaScript library for building user interfaces",
          "# React\nReact is a JavaScript library for building user interfaces."
        )
      );
      engine.add(
        createMockRepository(
          "vercel",
          "next.js",
          "The React Framework for Production",
          "# Next.js\nNext.js is a React framework for production."
        )
      );
      engine.add(
        createMockRepository(
          "angular",
          "angular",
          "The modern web developer's platform",
          "# Angular\nAngular is a platform for building web applications."
        )
      );
      engine.consolidate();
    });

    it("returns empty results for empty keywords", () => {
      const results = engine.search([]);
      expect(results).toEqual([]);
    });

    it("finds repositories by name", () => {
      const results = engine.search(["react"]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].repository.name).toBe("react");
    });

    it("finds repositories by description", () => {
      const results = engine.search(["framework"]);
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.repository.name);
      expect(names).toContain("next.js");
    });

    it("finds repositories by owner", () => {
      const results = engine.search(["facebook"]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].repository.owner).toBe("facebook");
    });

    it("finds repositories by readme content", () => {
      const results = engine.search(["production"]);
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.repository.name);
      expect(names).toContain("next.js");
    });

    it("ranks results by relevance", () => {
      const results = engine.search(["react"]);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("handles multiple keywords", () => {
      const results = engine.search(["react", "framework"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("limits results based on options", () => {
      const results = engine.search(["javascript", "framework"], { limit: 1 });
      expect(results.length).toBe(1);
    });

    it("returns matched tokens", () => {
      const results = engine.search(["react"]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedTokens).toContain("react");
    });

    it("is case-insensitive", () => {
      const upperResults = engine.search(["REACT"]);
      const lowerResults = engine.search(["react"]);
      expect(upperResults.length).toBe(lowerResults.length);
    });

    it("handles special characters in search", () => {
      const results = engine.search(["next.js"]);
      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.repository.name);
      expect(names).toContain("next.js");
    });
  });

  describe("field weighting", () => {
    beforeEach(() => {
      engine.add(
        createMockRepository(
          "owner-with-keyword",
          "regular-name",
          "Regular description",
          "Regular readme"
        )
      );
      engine.add(
        createMockRepository(
          "regular-owner",
          "name-with-keyword",
          "Regular description",
          "Regular readme"
        )
      );
      engine.add(
        createMockRepository(
          "regular-owner",
          "regular-name",
          "Description with keyword",
          "Regular readme"
        )
      );
      engine.consolidate();
    });

    it("prioritizes name over description", () => {
      const results = engine.search(["keyword"]);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].repository.name).toBe("name-with-keyword");
    });
  });

  describe("edge cases", () => {
    it("returns empty results when no documents added", () => {
      engine.consolidate();
      const results = engine.search(["test"]);
      expect(results).toEqual([]);
    });

    it("handles repositories without description", () => {
      const repo = createMockRepository("owner", "name", null);
      engine.add(repo);
      engine.consolidate();
      const results = engine.search(["name"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles repositories without readme", () => {
      const repo = createMockRepository("owner", "name", "description", null);
      engine.add(repo);
      engine.consolidate();
      const results = engine.search(["name"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles empty strings gracefully", () => {
      const repo = createMockRepository("owner", "name", "", "");
      engine.add(repo);
      engine.consolidate();
      const results = engine.search(["name"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles whitespace-only keywords", () => {
      engine.add(createMockRepository("owner", "test"));
      engine.consolidate();
      const results = engine.search(["   "]);
      expect(results).toEqual([]);
    });

    it("returns at least 1 result when limit is less than 1", () => {
      engine.add(createMockRepository("owner", "test"));
      engine.consolidate();
      const results = engine.search(["test"], { limit: 0 });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("tokenization", () => {
    beforeEach(() => {
      engine.add(
        createMockRepository(
          "owner",
          "test-repo-name",
          "Description with CamelCase and snake_case",
          "Readme with numbers123 and special-chars"
        )
      );
      engine.consolidate();
    });

    it("tokenizes hyphenated words", () => {
      const results = engine.search(["test"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("tokenizes underscores", () => {
      const results = engine.search(["snake"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("extracts numbers from text", () => {
      const results = engine.search(["numbers123"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles CamelCase", () => {
      const results = engine.search(["camelcase"]);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("keyword normalization", () => {
    beforeEach(() => {
      engine.add(
        createMockRepository("owner", "repository", "test description")
      );
      engine.consolidate();
    });

    it("normalizes multi-word keywords", () => {
      const results = engine.search(["test description"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("removes duplicate tokens from keywords", () => {
      const results1 = engine.search(["test", "test", "test"]);
      const results2 = engine.search(["test"]);
      expect(results1.length).toBe(results2.length);
      expect(results1[0]?.score).toBeCloseTo(results2[0]?.score ?? 0);
    });

    it("handles empty keyword strings in array", () => {
      const results = engine.search(["test", "", "  "]);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("custom configuration", () => {
    it("respects custom field weights", () => {
      const customEngine = new RepositorySearchEngine({
        fieldWeights: {
          owner: 10,
          name: 1,
          description: 1,
          readme: 1,
        },
      });

      customEngine.add(
        createMockRepository("test-owner", "name", "description")
      );
      customEngine.add(
        createMockRepository("owner", "test-name", "description")
      );
      customEngine.consolidate();

      const results = customEngine.search(["test"]);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].repository.owner).toBe("test-owner");
    });

    it("respects maxReadmeTokens limit", () => {
      const limitedEngine = new RepositorySearchEngine({
        maxReadmeTokens: 5,
      });

      const longReadme = Array.from({ length: 100 }, (_, i) => `word${i}`).join(
        " "
      );
      limitedEngine.add(
        createMockRepository("owner", "name", null, longReadme)
      );
      limitedEngine.consolidate();

      const results = limitedEngine.search(["word99"]);
      expect(results).toEqual([]);
    });

    it("respects maxKeywords limit", () => {
      const limitedEngine = new RepositorySearchEngine({
        maxKeywords: 2,
      });

      limitedEngine.add(
        createMockRepository("owner", "name", "first second third fourth fifth")
      );
      limitedEngine.consolidate();

      const results = limitedEngine.search([
        "first",
        "second",
        "third",
        "fourth",
        "fifth",
      ]);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("consolidation", () => {
    it("can be called multiple times safely", () => {
      engine.add(createMockRepository("owner", "test"));
      engine.consolidate();
      engine.consolidate();
      const results = engine.search(["test"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles consolidation with zero documents", () => {
      expect(() => engine.consolidate()).not.toThrow();
    });

    it("updates IDF after adding more documents", () => {
      engine.add(createMockRepository("owner1", "test"));
      engine.consolidate();
      const results1 = engine.search(["test"]);

      engine.add(createMockRepository("owner2", "test"));
      engine.add(createMockRepository("owner3", "other"));
      engine.consolidate();
      const results2 = engine.search(["test"]);

      expect(results2.length).toBeGreaterThan(results1.length);
    });
  });
});
