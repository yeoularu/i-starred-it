import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchReadmesForRepositories,
  fetchStarredRepositories,
  fetchStarredRepositoriesForUser,
  fetchStarredRepositoriesWithoutReadme,
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
  listReposStarredByAuthenticatedUser: ReturnType<typeof vi.fn>;
};

const HTTP_STATUS_NOT_FOUND = 404;
const MAX_REPOSITORIES_PER_BATCH = 50;
const TEST_REPOSITORIES_OVER_LIMIT = 60;
const TEST_PARALLEL_REQUESTS_COUNT = 5;
const TEST_DELAY_MS = 10;
const TEST_TIMEOUT_MS = 100;
const TEST_PAGINATION_TOTAL_PAGES = 3;
const TEST_SINGLE_PAGE = 1;
const TEST_PAGE_TWO = 2;

const createMockGitHubClient = (): MockGitHubClient => {
  const graphql = vi.fn();
  const getReadme = vi.fn();
  const listReposStarredByAuthenticatedUser = vi.fn();

  const client = {
    graphql: graphql as unknown as GitHubClient["graphql"],
    rest: {
      repos: {
        getReadme,
      },
      activity: {
        listReposStarredByAuthenticatedUser,
      },
    },
  } as unknown as GitHubClient;

  return { client, graphql, getReadme, listReposStarredByAuthenticatedUser };
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

const createRestStarredItem = ({
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
  starred_at: starredAt,
  repo: {
    name,
    owner: {
      login: owner,
    },
    description,
    stargazers_count: 0,
    forks_count: 0,
    pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
});

const createRestStarredResponse = (
  items: ReturnType<typeof createRestStarredItem>[],
  page: number,
  totalPages: number
) => ({
  data: items,
  headers: {
    link:
      totalPages > 1
        ? `<https://api.github.com/user/starred?per_page=100&page=${page + 1}>; rel="next", <https://api.github.com/user/starred?per_page=100&page=${totalPages}>; rel="last"`
        : undefined,
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

describe("fetchStarredRepositoriesWithoutReadme", () => {
  let listReposStarredByAuthenticatedUser: ReturnType<typeof vi.fn>;
  let client: GitHubClient;

  beforeEach(() => {
    const mocks = createMockGitHubClient();
    listReposStarredByAuthenticatedUser =
      mocks.listReposStarredByAuthenticatedUser;
    client = mocks.client;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns repositories without fetching README", async () => {
    const now = new Date().toISOString();
    listReposStarredByAuthenticatedUser.mockResolvedValueOnce(
      createRestStarredResponse(
        [
          createRestStarredItem({
            owner: "octocat",
            name: "hello-world",
            description: "First repo",
            starredAt: now,
          }),
          createRestStarredItem({
            owner: "octocat",
            name: "second-repo",
            description: "Second repo",
            starredAt: now,
          }),
        ],
        TEST_SINGLE_PAGE,
        TEST_SINGLE_PAGE
      )
    );

    const result = await fetchStarredRepositoriesWithoutReadme(client);

    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "hello-world",
        description: "First repo",
        readme: null,
      }),
      expect.objectContaining({
        owner: "octocat",
        name: "second-repo",
        description: "Second repo",
        readme: null,
      }),
    ]);
    expect(result.metrics.rest.requests).toBe(TEST_SINGLE_PAGE);
    expect(result.metrics.restReadme.requests).toBe(0);
    expect(result.metrics.cdnReadme.requests).toBe(0);
  });

  it("handles pagination correctly with parallel requests", async () => {
    const now = new Date().toISOString();

    // 첫 페이지 응답 (총 3페이지)
    listReposStarredByAuthenticatedUser.mockResolvedValueOnce(
      createRestStarredResponse(
        [
          createRestStarredItem({
            owner: "octocat",
            name: "repo-1",
            description: "Repo 1",
            starredAt: now,
          }),
        ],
        TEST_SINGLE_PAGE,
        TEST_PAGINATION_TOTAL_PAGES
      )
    );

    // 2, 3페이지 응답 (병렬)
    listReposStarredByAuthenticatedUser
      .mockResolvedValueOnce(
        createRestStarredResponse(
          [
            createRestStarredItem({
              owner: "octocat",
              name: "repo-2",
              description: "Repo 2",
              starredAt: now,
            }),
          ],
          TEST_PAGE_TWO,
          TEST_PAGINATION_TOTAL_PAGES
        )
      )
      .mockResolvedValueOnce(
        createRestStarredResponse(
          [
            createRestStarredItem({
              owner: "octocat",
              name: "repo-3",
              description: "Repo 3",
              starredAt: now,
            }),
          ],
          TEST_PAGINATION_TOTAL_PAGES,
          TEST_PAGINATION_TOTAL_PAGES
        )
      );

    const result = await fetchStarredRepositoriesWithoutReadme(client);

    expect(result.repositories).toHaveLength(TEST_PAGINATION_TOTAL_PAGES);
    expect(result.repositories).toEqual([
      expect.objectContaining({
        owner: "octocat",
        name: "repo-1",
        readme: null,
      }),
      expect.objectContaining({
        owner: "octocat",
        name: "repo-2",
        readme: null,
      }),
      expect.objectContaining({
        owner: "octocat",
        name: "repo-3",
        readme: null,
      }),
    ]);
    expect(listReposStarredByAuthenticatedUser).toHaveBeenCalledTimes(
      TEST_PAGINATION_TOTAL_PAGES
    );
    expect(result.metrics.rest.requests).toBe(TEST_PAGINATION_TOTAL_PAGES);
  });
});

describe("fetchReadmesForRepositories", () => {
  let getReadme: ReturnType<typeof vi.fn>;
  let client: GitHubClient;

  beforeEach(() => {
    const mocks = createMockGitHubClient();
    getReadme = mocks.getReadme;
    client = mocks.client;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches READMEs for provided repositories", async () => {
    getReadme
      .mockResolvedValueOnce({ data: "# Repo 1 README" })
      .mockResolvedValueOnce({ data: "# Repo 2 README" });

    const result = await fetchReadmesForRepositories(client, [
      { owner: "octocat", name: "repo-1" },
      { owner: "octocat", name: "repo-2" },
    ]);

    expect(result.readmes).toEqual([
      {
        owner: "octocat",
        name: "repo-1",
        readme: "# Repo 1 README",
      },
      {
        owner: "octocat",
        name: "repo-2",
        readme: "# Repo 2 README",
      },
    ]);
    expect(result.metrics.restReadme.requests).toBe(2);
    expect(getReadme).toHaveBeenCalledTimes(2);
  });

  it("returns null for repositories without README", async () => {
    const error = new Error("Not found") as Error & { status: number };
    error.status = HTTP_STATUS_NOT_FOUND;

    getReadme
      .mockResolvedValueOnce({ data: "# Repo 1 README" })
      .mockRejectedValueOnce(error);

    const result = await fetchReadmesForRepositories(client, [
      { owner: "octocat", name: "repo-1" },
      { owner: "octocat", name: "repo-2" },
    ]);

    expect(result.readmes).toEqual([
      {
        owner: "octocat",
        name: "repo-1",
        readme: "# Repo 1 README",
      },
      {
        owner: "octocat",
        name: "repo-2",
        readme: null,
      },
    ]);
  });

  it("limits requests to 50 repositories", async () => {
    const repos = Array.from(
      { length: TEST_REPOSITORIES_OVER_LIMIT },
      (_, i) => ({
        owner: "octocat",
        name: `repo-${i}`,
      })
    );

    getReadme.mockResolvedValue({ data: "# README" });

    const result = await fetchReadmesForRepositories(client, repos);

    expect(result.readmes).toHaveLength(MAX_REPOSITORIES_PER_BATCH);
    expect(getReadme).toHaveBeenCalledTimes(MAX_REPOSITORIES_PER_BATCH);
  });

  it("handles parallel requests correctly", async () => {
    const repos = Array.from(
      { length: TEST_PARALLEL_REQUESTS_COUNT },
      (_, i) => ({
        owner: "octocat",
        name: `repo-${i}`,
      })
    );

    let callCount = 0;
    getReadme.mockImplementation(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));
      return { data: `# README ${callCount}` };
    });

    const startTime = Date.now();
    const result = await fetchReadmesForRepositories(client, repos);
    const duration = Date.now() - startTime;

    expect(result.readmes).toHaveLength(TEST_PARALLEL_REQUESTS_COUNT);
    expect(duration).toBeLessThan(TEST_TIMEOUT_MS);
  });
});
