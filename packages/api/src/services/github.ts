import { db } from "@i-starred-it/db";
import { accounts } from "@i-starred-it/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { Octokit } from "octokit";

const GITHUB_PROVIDER_ID = "github";
const PAGE_SIZE = 100;
const HTTP_STATUS_NOT_FOUND = 404;
const LINK_HEADER_LAST_PAGE_REGEX = /<[^>]*[?&]page=(\d+)[^>]*>; rel="last"/;

export type StarredRepository = {
  owner: string;
  name: string;
  description: string | null;
  readme: string | null;
  stargazerCount: number;
  pushedAt: string;
  updatedAt: string;
  starredAt: string;
  forkCount: number;
};

export class MissingGithubTokenError extends Error {
  constructor(userId: string) {
    super(`GitHub access token not found for user ${userId}`);
  }
}

export class GithubResourceLimitError extends Error {
  constructor() {
    super("Resource limits for this GitHub query were exceeded");
  }
}

type GitHubClient = Pick<Octokit, "graphql" | "rest">;

export type FetchMetrics = {
  totalDurationMs: number;
  graphql: {
    requests: number;
    durationMs: number;
  };
  rest: {
    requests: number;
    durationMs: number;
  };
  restReadme: {
    requests: number;
    durationMs: number;
  };
  cdnReadme: {
    requests: number;
    durationMs: number;
  };
};

export type FetchStarredRepositoriesResult = {
  repositories: StarredRepository[];
  metrics: FetchMetrics;
};

export type RepositoryIdentifier = {
  owner: string;
  name: string;
};

export type FetchReadmesResult = {
  readmes: Array<{
    owner: string;
    name: string;
    readme: string | null;
  }>;
  metrics: Pick<FetchMetrics, "restReadme">;
};

type StarredRepositoriesQuery = {
  viewer: {
    starredRepositories: {
      pageInfo: {
        endCursor: string | null;
        hasNextPage: boolean;
      };
      edges: {
        starredAt: string;
        node: {
          name: string;
          description: string | null;
          owner: {
            login: string;
          };
          stargazerCount: number;
          forkCount: number;
          pushedAt: string;
          updatedAt: string;
        };
      }[];
    };
  };
};

const STARRED_REPOSITORIES_QUERY = `
  query ($cursor: String, $pageSize: Int!) {
    viewer {
      starredRepositories(first: $pageSize, after: $cursor, orderBy: { field: STARRED_AT, direction: DESC }) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          starredAt
          node {
            name
            description
            owner {
              login
            }
            stargazerCount
            forkCount
            pushedAt
            updatedAt
          }
        }
      }
    }
  }
`;

type TokenProvider = (userId: string) => Promise<string>;
type ClientFactory = (token: string) => GitHubClient;

export async function fetchStarredRepositoriesForUser(
  userId: string,
  options?: {
    tokenProvider?: TokenProvider;
    clientFactory?: ClientFactory;
    onMetrics?: (metrics: FetchMetrics) => void;
  }
): Promise<FetchStarredRepositoriesResult> {
  const provider = options?.tokenProvider ?? getGithubAccessToken;
  const token = await provider(userId);

  if (!token) {
    throw new MissingGithubTokenError(userId);
  }

  const client = options?.clientFactory?.(token) ?? createOctokit(token);
  return await fetchStarredRepositories(client, {
    onMetrics: options?.onMetrics,
  });
}

export async function fetchStarredRepositoriesWithoutReadmeForUser(
  userId: string,
  options?: {
    tokenProvider?: TokenProvider;
    clientFactory?: ClientFactory;
    onMetrics?: (metrics: FetchMetrics) => void;
  }
): Promise<FetchStarredRepositoriesResult> {
  const provider = options?.tokenProvider ?? getGithubAccessToken;
  const token = await provider(userId);

  if (!token) {
    throw new MissingGithubTokenError(userId);
  }

  const client = options?.clientFactory?.(token) ?? createOctokit(token);
  return await fetchStarredRepositoriesWithoutReadme(client, {
    onMetrics: options?.onMetrics,
  });
}

export async function fetchReadmesForRepositoriesForUser(
  userId: string,
  repositories: RepositoryIdentifier[],
  options?: {
    tokenProvider?: TokenProvider;
    clientFactory?: ClientFactory;
  }
): Promise<FetchReadmesResult> {
  const provider = options?.tokenProvider ?? getGithubAccessToken;
  const token = await provider(userId);

  if (!token) {
    throw new MissingGithubTokenError(userId);
  }

  const client = options?.clientFactory?.(token) ?? createOctokit(token);
  return await fetchReadmesForRepositories(client, repositories);
}

export async function fetchStarredRepositories(
  client: GitHubClient,
  options?: {
    onMetrics?: (metrics: FetchMetrics) => void;
  }
): Promise<FetchStarredRepositoriesResult> {
  const metrics: FetchMetrics = {
    totalDurationMs: 0,
    graphql: {
      requests: 0,
      durationMs: 0,
    },
    rest: {
      requests: 0,
      durationMs: 0,
    },
    restReadme: {
      requests: 0,
      durationMs: 0,
    },
    cdnReadme: {
      requests: 0,
      durationMs: 0,
    },
  };
  const startedAt = Date.now();
  const repositories = await collectStarredRepositories(
    client,
    null,
    [],
    metrics
  );
  metrics.totalDurationMs = Date.now() - startedAt;

  if (options?.onMetrics) {
    options.onMetrics(metrics);
  }

  return {
    repositories,
    metrics,
  };
}

export async function fetchStarredRepositoriesWithoutReadme(
  client: GitHubClient,
  options?: {
    onMetrics?: (metrics: FetchMetrics) => void;
  }
): Promise<FetchStarredRepositoriesResult> {
  const metrics: FetchMetrics = {
    totalDurationMs: 0,
    graphql: {
      requests: 0,
      durationMs: 0,
    },
    rest: {
      requests: 0,
      durationMs: 0,
    },
    restReadme: {
      requests: 0,
      durationMs: 0,
    },
    cdnReadme: {
      requests: 0,
      durationMs: 0,
    },
  };
  const startedAt = Date.now();
  const repositories = await collectStarredRepositoriesViaRest(client, metrics);
  metrics.totalDurationMs = Date.now() - startedAt;

  if (options?.onMetrics) {
    options.onMetrics(metrics);
  }

  return {
    repositories,
    metrics,
  };
}

export async function fetchReadmesForRepositories(
  client: GitHubClient,
  repositories: RepositoryIdentifier[]
): Promise<FetchReadmesResult> {
  const MAX_REPOS = 50;
  const toFetch = repositories.slice(0, MAX_REPOS);

  const metrics = {
    restReadme: {
      requests: 0,
      durationMs: 0,
    },
  };

  const readmes = await Promise.all(
    toFetch.map(async ({ owner, name }) => {
      const readme = await fetchReadmeViaRest(client, owner, name, metrics);
      return {
        owner,
        name,
        readme,
      };
    })
  );

  return {
    readmes,
    metrics,
  };
}

async function getGithubAccessToken(userId: string): Promise<string> {
  const rows = await db
    .select({ token: accounts.accessToken })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, GITHUB_PROVIDER_ID)
      )
    )
    .limit(1);

  const token = rows[0]?.token;
  if (!token) {
    throw new MissingGithubTokenError(userId);
  }

  return token;
}

function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
  });
}

async function collectStarredRepositories(
  client: GitHubClient,
  cursor: string | null,
  acc: StarredRepository[],
  metrics: FetchMetrics
): Promise<StarredRepository[]> {
  const graphqlStartedAt = Date.now();
  let response: StarredRepositoriesQuery;
  try {
    response = await client.graphql<StarredRepositoriesQuery>(
      STARRED_REPOSITORIES_QUERY,
      {
        cursor,
        pageSize: PAGE_SIZE,
      }
    );
  } catch (error) {
    if (isResourceLimitError(error)) {
      throw new GithubResourceLimitError();
    }

    throw error;
  }
  metrics.graphql.requests += 1;
  metrics.graphql.durationMs += Date.now() - graphqlStartedAt;

  const {
    pageInfo: { endCursor, hasNextPage },
    edges,
  } = response.viewer.starredRepositories;
  const mapped = await Promise.all(
    edges.map(async (edge) => await mapEdgeToRepository(client, edge, metrics))
  );
  const nextAcc = acc.concat(mapped);

  if (!hasNextPage) {
    return nextAcc;
  }

  if (!endCursor) {
    return nextAcc;
  }

  return await collectStarredRepositories(client, endCursor, nextAcc, metrics);
}

type RestStarredResponse = Array<{
  starred_at: string;
  repo: {
    name: string;
    owner: {
      login: string;
    };
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    pushed_at: string;
    updated_at: string;
  };
}>;

async function collectStarredRepositoriesViaRest(
  client: GitHubClient,
  metrics: FetchMetrics
): Promise<StarredRepository[]> {
  // 1. 첫 요청으로 총 페이지 수 파악
  const startedAt = Date.now();
  const firstResponse =
    await client.rest.activity.listReposStarredByAuthenticatedUser({
      per_page: PAGE_SIZE,
      page: 1,
      headers: {
        accept: "application/vnd.github.star+json",
      },
    });
  metrics.rest.requests += 1;
  metrics.rest.durationMs += Date.now() - startedAt;

  // Link 헤더에서 마지막 페이지 번호 파싱
  const totalPages = parseTotalPagesFromLinkHeader(firstResponse.headers.link);

  // 첫 페이지 데이터
  const firstPageData = firstResponse.data as unknown as RestStarredResponse;
  let allRepositories = firstPageData.map(mapRestResponseToRepository);

  // 2페이지 이상이면 병렬로 가져오기
  if (totalPages > 1) {
    const parallelStartedAt = Date.now();
    const pagePromises = Array.from(
      { length: totalPages - 1 },
      (_, i) => i + 2
    ).map((pageNumber) =>
      client.rest.activity.listReposStarredByAuthenticatedUser({
        per_page: PAGE_SIZE,
        page: pageNumber,
        headers: {
          accept: "application/vnd.github.star+json",
        },
      })
    );

    const responses = await Promise.all(pagePromises);
    metrics.rest.requests += responses.length;
    metrics.rest.durationMs += Date.now() - parallelStartedAt;

    for (const response of responses) {
      const data = response.data as unknown as RestStarredResponse;
      allRepositories = allRepositories.concat(
        data.map(mapRestResponseToRepository)
      );
    }
  }

  return allRepositories;
}

function parseTotalPagesFromLinkHeader(linkHeader?: string): number {
  if (!linkHeader) {
    return 1;
  }

  // Link header 예시: <https://api.github.com/user/starred?per_page=100&page=2>; rel="next", <https://api.github.com/user/starred?per_page=100&page=10>; rel="last"
  const lastLinkMatch = linkHeader.match(LINK_HEADER_LAST_PAGE_REGEX);
  const pageNumber = lastLinkMatch?.[1];

  return pageNumber ? Number.parseInt(pageNumber, 10) : 1;
}

function mapRestResponseToRepository(
  item: RestStarredResponse[number]
): StarredRepository {
  return {
    owner: item.repo.owner.login,
    name: item.repo.name,
    description: item.repo.description,
    readme: null,
    stargazerCount: item.repo.stargazers_count,
    forkCount: item.repo.forks_count,
    pushedAt: item.repo.pushed_at,
    updatedAt: item.repo.updated_at,
    starredAt: item.starred_at,
  };
}

type StarredEdge =
  StarredRepositoriesQuery["viewer"]["starredRepositories"]["edges"][number];

async function mapEdgeToRepository(
  client: GitHubClient,
  edge: StarredEdge,
  metrics: FetchMetrics
): Promise<StarredRepository> {
  const { node } = edge;
  const owner = node.owner.login;
  const readme = await resolveReadme(client, owner, node.name, metrics);

  return {
    owner,
    name: node.name,
    description: node.description,
    readme,
    stargazerCount: node.stargazerCount,
    forkCount: node.forkCount,
    pushedAt: node.pushedAt,
    updatedAt: node.updatedAt,
    starredAt: edge.starredAt,
  };
}

async function resolveReadme(
  client: GitHubClient,
  owner: string,
  repo: string,
  metrics: FetchMetrics
): Promise<string | null> {
  const cdnReadme = await fetchReadmeFromCdn(owner, repo, metrics);
  if (typeof cdnReadme === "string") {
    return cdnReadme;
  }

  return await fetchReadmeViaRest(client, owner, repo, metrics);
}

async function fetchReadmeFromCdn(
  owner: string,
  repo: string,
  metrics: FetchMetrics
): Promise<string | null> {
  const startedAt = Date.now();
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;

  metrics.cdnReadme.requests += 1;

  try {
    const response = await fetch(url);
    const elapsed = Date.now() - startedAt;
    metrics.cdnReadme.durationMs += elapsed;

    if (response.ok) {
      const text = await response.text();
      return text.length > 0 ? text : null;
    }

    if (response.status === HTTP_STATUS_NOT_FOUND) {
      return null;
    }

    return null;
  } catch {
    const elapsed = Date.now() - startedAt;
    metrics.cdnReadme.durationMs += elapsed;
    return null;
  }
}

async function fetchReadmeViaRest(
  client: GitHubClient,
  owner: string,
  repo: string,
  metrics: Pick<FetchMetrics, "restReadme">
): Promise<string | null> {
  try {
    const startedAt = Date.now();
    const response = await client.rest.repos.getReadme({
      owner,
      repo,
      mediaType: {
        format: "raw",
      },
    });
    metrics.restReadme.requests += 1;
    metrics.restReadme.durationMs += Date.now() - startedAt;

    const { data } = response;
    return typeof data === "string" ? data : null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): error is { status: number } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if (!("status" in error)) {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status === HTTP_STATUS_NOT_FOUND;
}

type GraphqlError = {
  errors?: Array<{
    type?: string;
  }>;
};

function isResourceLimitError(error: unknown): error is GraphqlError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errors = (error as GraphqlError).errors;
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some((entry) => entry?.type === "RESOURCE_LIMITS_EXCEEDED");
}
