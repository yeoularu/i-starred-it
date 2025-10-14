import { db } from "@i-starred-it/db";
import { accounts } from "@i-starred-it/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { Octokit } from "octokit";

const GITHUB_PROVIDER_ID = "github";
const PAGE_SIZE = 100;
const HTTP_STATUS_NOT_FOUND = 404;

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
  const repositories = await collectStarredRepositoriesWithoutReadme(
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

async function collectStarredRepositoriesWithoutReadme(
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
  const mapped = edges.map((edge) => mapEdgeToRepositoryWithoutReadme(edge));
  const nextAcc = acc.concat(mapped);

  if (!hasNextPage) {
    return nextAcc;
  }

  if (!endCursor) {
    return nextAcc;
  }

  return await collectStarredRepositoriesWithoutReadme(
    client,
    endCursor,
    nextAcc,
    metrics
  );
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

function mapEdgeToRepositoryWithoutReadme(
  edge: StarredEdge
): StarredRepository {
  const { node } = edge;
  const owner = node.owner.login;

  return {
    owner,
    name: node.name,
    description: node.description,
    readme: null,
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
