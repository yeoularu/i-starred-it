import { ArrowUp, Square, Star } from "lucide-react";
import { Fragment, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { RepositorySearchResult } from "./repository-search-engine";
import { usePromptSearchState } from "./use-prompt-search";

type SearchResultItemProps = {
  result: RepositorySearchResult;
  rank: number;
};

function SearchResultItem({ result, rank }: SearchResultItemProps) {
  const { repository, score, matchedTokens } = result;
  const repoUrl = `https://github.com/${repository.owner}/${repository.name}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center",
            "rounded-full",
            "bg-muted",
            "font-semibold text-muted-foreground text-xs"
          )}
        >
          {rank}
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <a
              className="hover:underline"
              href={repoUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="font-semibold">
                {repository.owner}/{repository.name}
              </span>
            </a>
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Star className="size-3 fill-current" />
              <span>{repository.stargazerCount.toLocaleString()}</span>
            </div>
          </div>
          {repository.description ? (
            <p className="text-muted-foreground text-sm">
              {repository.description}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {matchedTokens.slice(0, 10).map((token) => (
              <span
                className={cn(
                  "rounded-md",
                  "bg-primary/10",
                  "px-2 py-0.5",
                  "font-mono text-primary text-xs"
                )}
                key={token}
              >
                {token}
              </span>
            ))}
          </div>
          <div className="text-muted-foreground text-xs">
            Score: {score.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

type SearchResultsProps = {
  results: RepositorySearchResult[];
  query: string | null;
};

function SearchResults({ results, query }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm">
        No repositories found matching your search.
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>Search Results</CardTitle>
        <CardDescription>
          Found {results.length} repositories{query ? ` for "${query}"` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {results.map((result, index) => (
            <Fragment key={result.id}>
              <SearchResultItem rank={index + 1} result={result} />
              {index < results.length - 1 ? (
                <Separator className="my-1" />
              ) : null}
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PromptSearch() {
  const state = usePromptSearchState();

  const handleAction = useCallback(() => {
    if (state.isGenerating) {
      state.handleClear();
      return;
    }
    state.handleSubmit();
  }, [state]);

  const actionTooltip = state.isGenerating ? "Stop generation" : "Send message";
  const showSpinner = state.showKeywordSpinner;
  const showResults =
    state.hasSubmitted && state.searchResults.length > 0 && !state.isGenerating;
  const showNoResults =
    state.hasSubmitted &&
    state.searchResults.length === 0 &&
    !state.isGenerating &&
    !state.keywordError;

  return (
    <div className="grid gap-6">
      <PromptInput
        className="w-full max-w-(--breakpoint-md)"
        isLoading={state.isGenerating}
        onSubmit={state.handleSubmit}
        onValueChange={state.setInput}
        value={state.input}
      >
        <PromptInputTextarea placeholder="Search your starred repositories..." />
        <PromptInputActions className="justify-end pt-2">
          <PromptInputAction tooltip={actionTooltip}>
            <Button
              className="h-8 w-8 rounded-full"
              disabled={!state.canSubmit}
              onClick={handleAction}
              size="icon"
              variant="default"
            >
              {state.isGenerating ? (
                <Square className="size-5 fill-current" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>

      {state.repositoryError ? (
        <div
          className={cn(
            "border border-destructive/40",
            "rounded-md",
            "bg-destructive/10",
            "p-3",
            "text-destructive",
            "text-sm"
          )}
        >
          {state.repositoryError}
        </div>
      ) : null}

      {state.keywordError ? (
        <div
          className={cn(
            "border border-destructive/40",
            "rounded-md",
            "bg-destructive/10",
            "p-3",
            "text-destructive",
            "text-sm"
          )}
        >
          {state.keywordError}
        </div>
      ) : null}

      {showSpinner ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <Spinner className="size-5" />
          <span className="text-muted-foreground text-sm">
            Generating keywords and searching...
          </span>
        </div>
      ) : null}

      {showResults ? (
        <SearchResults
          query={state.originalQuery}
          results={state.searchResults}
        />
      ) : null}

      {showNoResults ? (
        <div className="text-center text-muted-foreground text-sm">
          No repositories found matching your search.
        </div>
      ) : null}
    </div>
  );
}
