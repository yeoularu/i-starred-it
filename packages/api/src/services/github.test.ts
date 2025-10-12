import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchStarredRepositories,
  fetchStarredRepositoriesForUser,
  MissingGithubTokenError,
} from "./github";

vi.mock("@i-starred-it/db", () => {
  const mockLimit = vi.fn(async () => []);
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    db: {
      select: mockSelect,
    },
  } as unknown as Partial<typeof import("@i-starred-it/db")>;
});

type GitHubClient = Parameters<typeof fetchStarredRepositories>[0];

type MockGitHubClient = {
  client: GitHubClient;
  graphql: ReturnType<typeof vi.fn>;
  getReadme: ReturnType<typeof vi.fn>;
};

const HTTP_STATUS_NOT_FOUND = 404;

const createMockGitHubClient = (): MockGitHubClient => {
  const graphql = vi.fn();
  const getReadme = vi.fn();

  const client = {
    graphql: graphql as unknown as GitHubClient["graphql"],
    rest: {
      repos: {
        getReadme,
      },
    },
  } as unknown as GitHubClient;

  return { client, graphql, getReadme };
};

const createGraphqlResponse = ({
  hasNextPage = false,
  endCursor = null,
  edges = [],
}: {
  hasNextPage?: boolean;
  endCursor?: string | null;
  edges?: unknown[];
}) => ({
  viewer: {
    starredRepositories: {
      pageInfo: {
        hasNextPage,
        endCursor,
      },
      edges,
    },
  },
});

const createEdge = ({
  owner,
  name,
  description,
  starredAt,
}: {
  owner: string;
  name: string;
  description: string | null;
  starredAt: string;
}) => ({
  starredAt,
  node: {
    owner: {
      login: owner,
    },
    name,
    description,
    stargazerCount: 0,
    forkCount: 0,
    pushedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});

describe("fetchStarredRepositories", () => {
  let graphql: ReturnType<typeof vi.fn>;
  let getReadme: ReturnType<typeof vi.fn>;
  let client: GitHubClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    const mocks = createMockGitHubClient();
    graphql = mocks.graphql;
    getReadme = mocks.getReadme;
    client = mocks.client;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch as unknown as typeof global.fetch;
  });

  it("returns repositories from a single page when README is present", async () => {
    graphql.mockResolvedValueOnce(
      createGraphqlResponse({
        edges: [
          createEdge({
            owner: "octocat",
            name: "hello-world",
            description: "First repo",
            starredAt: new Date().toISOString(),
          }),
        ],
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "# Hello",
    });

    const result = await fetchStarredRepositories(client);

    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "hello-world",
        description: "First repo",
        readme: "# Hello",
      }),
    ]);
    expect(getReadme).not.toHaveBeenCalled();
    expect(result.metrics.cdnReadme.requests).toBe(1);
    expect(result.metrics.restReadme.requests).toBe(0);
  });

  it("fetches README via REST when GraphQL does not include it", async () => {
    graphql.mockResolvedValueOnce(
      createGraphqlResponse({
        edges: [
          createEdge({
            owner: "octocat",
            name: "hello-world",
            description: "First repo",
            starredAt: new Date().toISOString(),
          }),
        ],
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: HTTP_STATUS_NOT_FOUND,
      text: async () => "",
    });

    getReadme.mockResolvedValueOnce({ data: "# Hello" });

    const result = await fetchStarredRepositories(client);

    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "hello-world",
        description: "First repo",
        readme: "# Hello",
      }),
    ]);
    expect(getReadme).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "hello-world",
      mediaType: {
        format: "raw",
      },
    });
    expect(result.metrics.cdnReadme.requests).toBe(1);
    expect(result.metrics.restReadme.requests).toBe(1);
  });

  it("continues fetching when pagination indicates more pages", async () => {
    const now = new Date().toISOString();
    graphql
      .mockResolvedValueOnce(
        createGraphqlResponse({
          hasNextPage: true,
          endCursor: "cursor-1",
          edges: [
            createEdge({
              owner: "octocat",
              name: "repo-1",
              description: "Repo 1",
              starredAt: now,
            }),
          ],
        })
      )
      .mockResolvedValueOnce(
        createGraphqlResponse({
          edges: [
            createEdge({
              owner: "octocat",
              name: "repo-2",
              description: "Repo 2",
              starredAt: now,
            }),
          ],
        })
      );

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS_NOT_FOUND,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS_NOT_FOUND,
        text: async () => "",
      });

    const createRestNotFoundError = () => {
      const error = new Error("Not found") as Error & { status: number };
      error.status = HTTP_STATUS_NOT_FOUND;
      return error;
    };

    getReadme
      .mockRejectedValueOnce(createRestNotFoundError())
      .mockRejectedValueOnce(createRestNotFoundError());

    const result = await fetchStarredRepositories(client);

    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "repo-1",
      }),
      expect.objectContaining({
        owner: "octocat",
        name: "repo-2",
      }),
    ]);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("returns null README when REST request responds with 404", async () => {
    graphql.mockResolvedValueOnce(
      createGraphqlResponse({
        edges: [
          createEdge({
            owner: "octocat",
            name: "hello-world",
            description: "First repo",
            starredAt: new Date().toISOString(),
          }),
        ],
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: HTTP_STATUS_NOT_FOUND,
      text: async () => "",
    });

    const error = new Error("Not found") as Error & { status: number };
    error.status = HTTP_STATUS_NOT_FOUND;
    getReadme.mockRejectedValueOnce(error);

    const result = await fetchStarredRepositories(client);

    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "hello-world",
        readme: null,
      }),
    ]);
  });
});

describe("fetchStarredRepositoriesForUser", () => {
  it("uses provided token provider and client factory", async () => {
    const tokenProvider = vi.fn().mockResolvedValue("token");
    const mocks = createMockGitHubClient();
    const graphqlMock = mocks.graphql;
    const getReadmeMock = mocks.getReadme;

    graphqlMock.mockResolvedValue(
      createGraphqlResponse({
        edges: [
          createEdge({
            owner: "octocat",
            name: "repo",
            description: "Repo",
            starredAt: new Date().toISOString(),
          }),
        ],
      })
    );
    const clientFactory = vi.fn(() => mocks.client);

    const localFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: HTTP_STATUS_NOT_FOUND,
      text: async () => "",
    });
    global.fetch = localFetchMock as unknown as typeof global.fetch;
    getReadmeMock.mockResolvedValueOnce({
      data: "README",
    });

    const result = await fetchStarredRepositoriesForUser("user-1", {
      tokenProvider,
      clientFactory,
    });

    expect(tokenProvider).toHaveBeenCalledWith("user-1");
    expect(clientFactory).toHaveBeenCalledWith("token");
    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "repo",
        readme: "README",
      }),
    ]);
  });

  it("throws MissingGithubTokenError when token provider resolves to void", async () => {
    await expect(
      fetchStarredRepositoriesForUser("user-1", {
        tokenProvider: async () => "",
        clientFactory: () => createMockGitHubClient().client,
      })
    ).rejects.toThrow(MissingGithubTokenError);
  });
});
