import type {
  FetchMetrics,
  StarredRepository,
} from "@i-starred-it/api/services/github";
import { useQuery } from "@tanstack/react-query";
import { get, set } from "idb-keyval";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

const STORAGE_PREFIX = "github-starred-repositories";

type ExtendedFetchMetrics = FetchMetrics & {
  restReadme: {
    requests: number;
    durationMs: number;
  };
  cdnReadme: {
    requests: number;
    durationMs: number;
  };
};

type CachedEntry = {
  repositories: StarredRepository[];
  metrics: ExtendedFetchMetrics;
};

type CachedValue = CachedEntry | null;

type CacheState = {
  value: CachedValue;
  isReady: boolean;
  save: (entry: CachedEntry) => Promise<void>;
};

const DEFAULT_METRICS: ExtendedFetchMetrics = {
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

const buildStorageKey = (userId: string) => `${STORAGE_PREFIX}:${userId}`;

async function readCachedEntry(userId: string) {
  return await get<CachedEntry | null>(buildStorageKey(userId));
}

async function persistEntry(userId: string, entry: CachedEntry) {
  await set(buildStorageKey(userId), entry);
}

function useCachedRepositories(userId: string | null): CacheState {
  const [value, setValue] = useState<CachedValue>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (!userId) {
      setValue(null);
      setIsReady(true);
      return;
    }

    const load = async () => {
      setIsReady(false);

      try {
        const cached = await readCachedEntry(userId);
        if (!isCancelled) {
          setValue(cached ?? null);
        }
      } finally {
        if (!isCancelled) {
          setIsReady(true);
        }
      }
    };

    load().catch(() => {
      if (!isCancelled) {
        setValue(null);
        setIsReady(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [userId]);

  const save = useCallback(
    async (entry: CachedEntry) => {
      if (!userId) {
        return;
      }

      await persistEntry(userId, entry);
      setValue(entry);
    },
    [userId]
  );

  return useMemo(
    () => ({
      value,
      isReady,
      save,
    }),
    [isReady, save, value]
  );
}

async function fetchReadmeFromCdn(
  owner: string,
  name: string
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${name}/HEAD/README.md`;

  try {
    const response = await fetch(url);

    if (response.ok) {
      const text = await response.text();
      return text.length > 0 ? text : null;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchAllStarredRepositories(): Promise<{
  repositories: StarredRepository[];
  metrics: ExtendedFetchMetrics;
}> {
  const metrics: ExtendedFetchMetrics = {
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

  const { repositories: reposWithoutReadme, metrics: step1Metrics } =
    await client.githubStarredRepositoriesWithoutReadme();

  metrics.graphql.requests += step1Metrics.graphql.requests;
  metrics.graphql.durationMs += step1Metrics.graphql.durationMs;
  metrics.rest.requests += step1Metrics.rest.requests;
  metrics.rest.durationMs += step1Metrics.rest.durationMs;

  const cdnStartedAt = Date.now();
  const cdnResults = await Promise.all(
    reposWithoutReadme.map(async (repo: StarredRepository) => {
      const readme = await fetchReadmeFromCdn(repo.owner, repo.name);
      metrics.cdnReadme.requests += 1;
      return {
        owner: repo.owner,
        name: repo.name,
        readme,
      };
    })
  );
  metrics.cdnReadme.durationMs = Date.now() - cdnStartedAt;

  const reposNeedingRestFetch = reposWithoutReadme.filter(
    (repo: StarredRepository) => {
      const cdnResult = cdnResults.find(
        (r: { owner: string; name: string; readme: string | null }) =>
          r.owner === repo.owner && r.name === repo.name
      );
      return cdnResult?.readme === null;
    }
  );

  const BATCH_SIZE = 50;
  const batches: StarredRepository[][] = [];
  for (let i = 0; i < reposNeedingRestFetch.length; i += BATCH_SIZE) {
    batches.push(reposNeedingRestFetch.slice(i, i + BATCH_SIZE));
  }

  const restResults = await Promise.all(
    batches.map(async (batch) => {
      if (batch.length === 0) {
        return [];
      }

      const { readmes, metrics: batchMetrics } =
        await client.githubFetchReadmes({
          repositories: batch.map((r: StarredRepository) => ({
            owner: r.owner,
            name: r.name,
          })),
        });

      metrics.restReadme.requests += batchMetrics.restReadme.requests;
      metrics.restReadme.durationMs += batchMetrics.restReadme.durationMs;

      return readmes;
    })
  );

  const restReadmeMap = new Map(
    restResults
      .flat()
      .map((r: { owner: string; name: string; readme: string | null }) => [
        `${r.owner}/${r.name}`,
        r.readme,
      ])
  );

  const repositories: StarredRepository[] = reposWithoutReadme.map(
    (repo: StarredRepository) => {
      const cdnResult = cdnResults.find(
        (r: { owner: string; name: string; readme: string | null }) =>
          r.owner === repo.owner && r.name === repo.name
      );
      const cdnReadme = cdnResult?.readme;

      if (cdnReadme !== null && cdnReadme !== undefined) {
        return {
          ...repo,
          readme: cdnReadme,
        };
      }

      const restReadme = restReadmeMap.get(`${repo.owner}/${repo.name}`);
      return {
        ...repo,
        readme: restReadme ?? null,
      };
    }
  );

  metrics.totalDurationMs = Date.now() - startedAt;

  return {
    repositories,
    metrics,
  };
}

export function useGithubStarredRepositories() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const { value: cachedEntry, isReady, save } = useCachedRepositories(userId);
  const hasUser = userId !== null;
  const enabled = hasUser && isReady && !cachedEntry;
  const staleTime = cachedEntry ? Number.POSITIVE_INFINITY : 0;
  const gcTime = cachedEntry ? Number.POSITIVE_INFINITY : 0;

  const query = useQuery({
    queryKey: ["github-starred-repositories-v2"],
    queryFn: fetchAllStarredRepositories,
    enabled,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    placeholderData: cachedEntry
      ? {
          repositories: cachedEntry.repositories,
          metrics: cachedEntry.metrics,
        }
      : undefined,
    staleTime,
    gcTime,
  });

  const repositories =
    query.data?.repositories ?? cachedEntry?.repositories ?? [];
  const metrics =
    query.data?.metrics ?? cachedEntry?.metrics ?? DEFAULT_METRICS;
  const isLoading = hasUser ? !isReady || query.isLoading : false;

  useEffect(() => {
    if (!hasUser) {
      return;
    }

    if (!query.data) {
      return;
    }

    save(query.data).catch(() => {
      return;
    });
  }, [hasUser, query.data, save]);

  return {
    ...query,
    repositories,
    isLoading,
    metrics,
    hasCache: Boolean(cachedEntry),
    status: query.status,
  };
}
