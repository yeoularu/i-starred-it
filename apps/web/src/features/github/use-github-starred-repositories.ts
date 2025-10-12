import type {
  FetchMetrics,
  StarredRepository,
} from "@i-starred-it/api/services/github";
import { useQuery } from "@tanstack/react-query";
import { get, set } from "idb-keyval";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const STORAGE_PREFIX = "github-starred-repositories";

type CachedEntry = {
  repositories: StarredRepository[];
  metrics: FetchMetrics;
};

type CachedValue = CachedEntry | null;

type CacheState = {
  value: CachedValue;
  isReady: boolean;
  save: (entry: CachedEntry) => Promise<void>;
};

const DEFAULT_METRICS: FetchMetrics = {
  totalDurationMs: 0,
  graphql: {
    requests: 0,
    durationMs: 0,
  },
  restReadme: {
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

export function useGithubStarredRepositories() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const { value: cachedEntry, isReady, save } = useCachedRepositories(userId);
  const hasUser = userId !== null;
  const enabled = hasUser && isReady && !cachedEntry;
  const staleTime = cachedEntry ? Number.POSITIVE_INFINITY : 0;
  const gcTime = cachedEntry ? Number.POSITIVE_INFINITY : 0;

  const query = useQuery({
    ...orpc.githubStarredRepositories.queryOptions(),
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
