import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useGithubStarredRepositories } from "../github/use-github-starred-repositories";
import { SearchHistoryItem } from "./search-history-item";
import { usePromptSearchState } from "./use-prompt-search";
import { useRepositorySearch } from "./use-repository-search";
import { useSearchHistory } from "./use-search-history";

const HISTORY_ITEM_ANIMATION_DURATION = 0.3;

export function PromptSearch() {
  const state = usePromptSearchState();
  const {
    history,
    isLoading: isHistoryLoading,
    deleteQuery,
    refetch: refetchHistory,
    hasReachedLimit,
    searchesInLast24Hours,
    dailyLimit,
  } = useSearchHistory();
  const github = useGithubStarredRepositories();
  const { search: searchRepositories, isReady } = useRepositorySearch({
    repositories: github.repositories,
  });
  const [latestQueryId, setLatestQueryId] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Mark initial load as complete when history is loaded
  useEffect(() => {
    if (!isHistoryLoading && history.length > 0 && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [isHistoryLoading, history.length, isInitialLoad]);

  // Refresh search history after new search completes
  useEffect(() => {
    if (state.hasSubmitted && !state.isGenerating && state.keywordResult) {
      refetchHistory().then((result) => {
        if (result.data && result.data.length > 0) {
          setLatestQueryId(result.data[0].id);
        }
      });
    }
  }, [
    state.hasSubmitted,
    state.isGenerating,
    state.keywordResult,
    refetchHistory,
  ]);

  const handleAction = useCallback(() => {
    if (state.isGenerating) {
      state.handleClear();
      setLatestQueryId(null);
      return;
    }
    setLatestQueryId(null);
    state.handleSubmit();
  }, [state]);

  const actionTooltip = state.isGenerating ? "Stop generation" : "Send message";
  const showSpinner = state.showKeywordSpinner;

  const isInputDisabled = hasReachedLimit || state.isGenerating;

  return (
    <div className="grid gap-6">
      {hasReachedLimit && (
        <div
          className={cn(
            "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
          )}
        >
          Daily search limit reached ({searchesInLast24Hours}/{dailyLimit}).
          Resets at UTC midnight.
        </div>
      )}
      <PromptInput
        className="w-full max-w-(--breakpoint-md)"
        isLoading={state.isGenerating}
        onSubmit={hasReachedLimit ? undefined : state.handleSubmit}
        onValueChange={state.setInput}
        value={state.input}
      >
        <PromptInputTextarea
          disabled={isInputDisabled}
          placeholder={
            hasReachedLimit
              ? "Daily search limit reached..."
              : "Search your starred repositories..."
          }
        />
        <PromptInputActions className="justify-between pt-2">
          {state.isQueryTooLong ? (
            <span className="text-destructive text-xs">
              Query too long ({state.queryLength}/{state.maxQueryLength})
            </span>
          ) : (
            <span />
          )}
          <PromptInputAction
            tooltip={hasReachedLimit ? "Daily limit reached" : actionTooltip}
          >
            <Button
              className="h-8 w-8 rounded-full"
              disabled={!state.canSubmit || hasReachedLimit}
              onClick={handleAction}
              size="icon"
              variant="default"
            >
              <ArrowUp className="size-5" />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>

      <AnimatePresence>
        {state.repositoryError ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "border border-destructive/40",
              "rounded-md",
              "bg-destructive/10",
              "p-3",
              "text-destructive",
              "text-sm"
            )}
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -10 }}
            key="repository-error"
            transition={{ duration: 0.2 }}
          >
            {state.repositoryError}
          </motion.div>
        ) : null}

        {state.keywordError ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "border border-destructive/40",
              "rounded-md",
              "bg-destructive/10",
              "p-3",
              "text-destructive",
              "text-sm"
            )}
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -10 }}
            key="keyword-error"
            transition={{ duration: 0.2 }}
          >
            {state.keywordError}
          </motion.div>
        ) : null}

        {showSpinner ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-2 py-8"
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.9 }}
            key="spinner"
            transition={{ duration: 0.2 }}
          >
            <Spinner className="size-5" />
            <span className="text-muted-foreground text-sm">
              Generating keywords and searching...
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {history.length > 0 && (
        <div className="grid gap-4">
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {history.map((item, index) => {
                const historyResults = isReady
                  ? searchRepositories(item.keywords, { limit: 20 })
                  : [];

                return (
                  <motion.div
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -100, scale: 0.95 }}
                    initial={
                      isInitialLoad
                        ? false
                        : { opacity: 0, y: -20, scale: 0.95 }
                    }
                    key={item.id}
                    layout
                    transition={{
                      duration: isInitialLoad
                        ? 0
                        : HISTORY_ITEM_ANIMATION_DURATION,
                      delay: index === 0 && item.id === latestQueryId ? 0 : 0,
                    }}
                  >
                    <SearchHistoryItem
                      isInitiallyExpanded={item.id === latestQueryId}
                      isSearchReady={isReady}
                      item={item}
                      onDelete={deleteQuery}
                      searchResults={historyResults}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isHistoryLoading && history.length === 0 && (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 py-4"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="history-loading"
            transition={{ duration: 0.2 }}
          >
            <Spinner className="size-4" />
            <span className="text-muted-foreground text-sm">
              Loading search history...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
