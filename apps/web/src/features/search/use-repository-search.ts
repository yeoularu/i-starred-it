import type { StarredRepository } from "@i-starred-it/api/services/github";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  RepositorySearchEngine,
  type RepositorySearchResult,
  type SearchOptions,
} from "./repository-search-engine";

type UseRepositorySearchArgs = {
  repositories: StarredRepository[];
};

type UseRepositorySearchResult = {
  isReady: boolean;
  indexedCount: number;
  search: (
    keywords: string[],
    options?: SearchOptions
  ) => RepositorySearchResult[];
};

export function useRepositorySearch({
  repositories,
}: UseRepositorySearchArgs): UseRepositorySearchResult {
  const engineRef = useRef<RepositorySearchEngine | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);

  useEffect(() => {
    if (!repositories || repositories.length === 0) {
      engineRef.current = null;
      setIsReady(false);
      setIndexedCount(0);
      return;
    }

    const engine = new RepositorySearchEngine();

    for (const repository of repositories) {
      engine.add(repository);
    }

    engine.consolidate();
    engineRef.current = engine;
    setIndexedCount(engine.size);
    setIsReady(true);
  }, [repositories]);

  const search = useCallback(
    (keywords: string[], options?: SearchOptions) => {
      const engine = engineRef.current;
      if (!(engine && isReady)) {
        return [];
      }

      return engine.search(keywords, options);
    },
    [isReady]
  );

  return {
    isReady,
    indexedCount,
    search,
  };
}
