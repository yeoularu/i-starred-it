import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { useGithubStarredRepositories } from "@/features/github/use-github-starred-repositories";
import type { RepositorySearchResult } from "./repository-search-engine";
import { useRepositorySearch } from "./use-repository-search";
import { useSearchKeywords } from "./use-search-keywords";

type PromptSearchResultsDetail = {
  query: string;
  keywords: string[];
  results: RepositorySearchResult[];
};

export function PromptSearch() {
  const github = useGithubStarredRepositories();
  const { search, isReady } = useRepositorySearch({
    repositories: github.repositories,
  });

  const {
    input,
    setInput,
    submit,
    isPending,
    result: keywordResult,
    reset,
  } = useSearchKeywords();

  const handleSubmit = useCallback(() => {
    if (isPending) {
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    submit();
  }, [input, isPending, submit]);

  const isGenerating = isPending;
  const actionTooltip = isGenerating ? "Stop generation" : "Send message";

  useEffect(() => {
    if (!(keywordResult && isReady)) {
      return;
    }

    const results = search(keywordResult.keywords, { limit: 20 });
    const detail: PromptSearchResultsDetail = {
      query: keywordResult.originalQuery,
      keywords: keywordResult.keywords,
      results,
    };

    window.dispatchEvent(
      new CustomEvent<PromptSearchResultsDetail>("prompt-search:results", {
        detail,
      })
    );
  }, [isReady, keywordResult, search]);

  const handleAction = useCallback(() => {
    if (isGenerating) {
      reset();
      return;
    }
    handleSubmit();
  }, [handleSubmit, isGenerating, reset]);

  return (
    <PromptInput
      className="w-full max-w-(--breakpoint-md)"
      isLoading={isGenerating}
      onSubmit={handleSubmit}
      onValueChange={setInput}
      value={input}
    >
      <PromptInputTextarea placeholder="Ask me anything..." />
      <PromptInputActions className="justify-end pt-2">
        <PromptInputAction tooltip={actionTooltip}>
          <Button
            className="h-8 w-8 rounded-full"
            onClick={handleAction}
            size="icon"
            variant="default"
          >
            {isGenerating ? (
              <Square className="size-5 fill-current" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </PromptInputAction>
      </PromptInputActions>
    </PromptInput>
  );
}
