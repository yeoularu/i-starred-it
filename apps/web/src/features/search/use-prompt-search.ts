import { useCallback, useEffect, useMemo, useState } from "react";

import { useGithubStarredRepositories } from "@/features/github/use-github-starred-repositories";
import type { RepositorySearchResult } from "./repository-search-engine";
import { useRepositorySearch } from "./use-repository-search";
import { type KeywordResult, useSearchKeywords } from "./use-search-keywords";

type PromptSearchRepositoryStatusArgs = {
  isLoading: boolean;
  error: string | null;
  indexedCount: number;
};

export type PromptSearchState = {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: () => void;
  handleClear: () => void;
  isGenerating: boolean;
  canSubmit: boolean;
  canClear: boolean;
  repositoryStatus: string;
  repositoryError: string | null;
  keywordError: string | null;
  showKeywordSpinner: boolean;
  keywords: string[];
  keywordResult: KeywordResult | null;
  searchResults: RepositorySearchResult[];
  indexedCount: number;
  hasSubmitted: boolean;
  originalQuery: string | null;
};

function resolveErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeMessage = (value as { message?: unknown }).message;
  if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
    return maybeMessage;
  }

  return null;
}

function describeRepositoryStatus({
  isLoading,
  error,
  indexedCount,
}: PromptSearchRepositoryStatusArgs): string {
  if (isLoading) {
    return "Indexing starred repositories…";
  }

  if (error) {
    return "Failed to load repositories.";
  }

  if (!indexedCount) {
    return "No repositories indexed yet.";
  }

  return `Indexed ${indexedCount} repositories.`;
}

export function usePromptSearchState(): PromptSearchState {
  const github = useGithubStarredRepositories();
  const repositorySearch = useRepositorySearch({
    repositories: github.repositories,
  });
  const keywords = useSearchKeywords();
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (keywords.isPending) {
      return;
    }

    const trimmed = keywords.input.trim();
    if (!trimmed) {
      return;
    }

    setHasSubmitted(true);
    keywords.submit();
  }, [keywords]);

  const handleClear = useCallback(() => {
    keywords.setInput("");
    keywords.reset();
    setHasSubmitted(false);
  }, [keywords]);

  useEffect(() => {
    if (keywords.result) {
      setHasSubmitted(true);
    }
  }, [keywords.result]);

  const searchResults = useMemo(() => {
    if (!(keywords.result && repositorySearch.isReady)) {
      return [];
    }

    return repositorySearch.search(keywords.result.keywords, { limit: 20 });
  }, [keywords.result, repositorySearch]);

  const repositoryError = resolveErrorMessage(github.error);
  const repositoryStatus = describeRepositoryStatus({
    isLoading: github.isLoading || github.isFetching,
    error: repositoryError,
    indexedCount: repositorySearch.indexedCount,
  });

  const keywordError = keywords.error?.message ?? null;
  const canSubmit = keywords.input.trim().length > 0 && !keywords.isPending;
  const canClear = Boolean(keywords.input || keywords.result || hasSubmitted);

  return {
    input: keywords.input,
    setInput: keywords.setInput,
    handleSubmit,
    handleClear,
    isGenerating: keywords.isPending,
    canSubmit,
    canClear,
    repositoryStatus,
    repositoryError,
    keywordError,
    showKeywordSpinner: keywords.isPending && !keywords.result,
    keywords: keywords.result?.keywords ?? [],
    keywordResult: keywords.result,
    searchResults,
    indexedCount: repositorySearch.indexedCount,
    hasSubmitted,
    originalQuery: keywords.result?.originalQuery ?? null,
  };
}
