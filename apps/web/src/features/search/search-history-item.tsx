import { ChevronRight, Quote, Target, ThumbsUp, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RepositorySearchResult } from "./repository-search-engine";
import { useCheckIfLiked, useRepositoryLike } from "./use-repository-like";
import type { SearchHistoryItem as HistoryItem } from "./use-search-history";

const MAX_PREVIEW_TOKENS = 5;
const MAX_PREVIEW_KEYWORDS = 8;
const STAGGER_DELAY = 0.03;
const CHEVRON_ROTATION_DEGREES = 90;
const SKELETON_ITEMS_COUNT = 1;
const EXPAND_DURATION = 0.2;
const COLLAPSE_DURATION = 0.15;
const EXPAND_OPACITY_RATIO = 0.7;
const COLLAPSE_OPACITY_RATIO = 0.5;
// biome-ignore lint/style/noMagicNumbers: Cubic bezier 값
const SMOOTH_EASE = [0.4, 0, 0.2, 1] as const;

type SearchHistoryItemProps = {
  item: HistoryItem;
  searchResults: RepositorySearchResult[];
  onDelete: (id: string) => void;
  isSearchReady?: boolean;
};

function SearchResultItem({
  result,
  rank,
  searchQueryId,
  allSearchResults,
  showTokens = true,
}: {
  result: RepositorySearchResult;
  rank: number;
  searchQueryId: string;
  allSearchResults: RepositorySearchResult[];
  showTokens?: boolean;
}) {
  const { repository, matchedTokens, score } = result;
  const repoUrl = `https://github.com/${repository.owner}/${repository.name}`;
  const { like, unlike, isLiking, isUnliking } = useRepositoryLike();

  // TanStack Query가 캐싱하므로 직접 사용
  const { data: isLiked = false } = useCheckIfLiked(
    searchQueryId,
    repository.owner,
    repository.name
  );

  const handleLikeToggle = async () => {
    try {
      if (isLiked) {
        await unlike({
          searchQueryId,
          likedOwner: repository.owner,
          likedName: repository.name,
        });
      } else {
        await like({
          searchQueryId,
          searchResults: allSearchResults,
          likedOwner: repository.owner,
          likedName: repository.name,
          likedRank: rank,
        });
      }
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 translate-y-0.5 items-center justify-center",
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
              <span className="font-semibold text-sm">
                {repository.owner}/{repository.name}
              </span>
            </a>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-primary text-xs">
                  <Target className="size-3 text-primary/60" />
                  {score.toFixed(2)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Relevance score</TooltipContent>
            </Tooltip>
          </div>
          {repository.description ? (
            <p className="line-clamp-2 text-muted-foreground text-xs">
              {repository.description}
            </p>
          ) : null}
          {showTokens && (
            <div className="flex flex-wrap gap-1.5">
              {matchedTokens.slice(0, MAX_PREVIEW_TOKENS).map((token) => (
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
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className={cn(
                "size-8 shrink-0 transition-colors",
                isLiked
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground hover:text-primary"
              )}
              disabled={isLiking || isUnliking}
              onClick={handleLikeToggle}
              size="icon"
              variant="ghost"
            >
              <ThumbsUp className={cn("size-4", isLiked && "fill-current")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isLiked ? "Cancel" : "Found it!"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function SearchHistoryItem({
  item,
  searchResults,
  onDelete,
  isInitiallyExpanded = false,
  isSearchReady = true,
}: SearchHistoryItemProps & { isInitiallyExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleDelete = () => {
    onDelete(item.id);
  };

  return (
    <Card className="rounded-3xl border-dashed">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 items-start gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-8 shrink-0"
                  onClick={handleToggle}
                  size="icon"
                  variant="ghost"
                >
                  <motion.div
                    animate={{
                      rotate: isExpanded ? CHEVRON_ROTATION_DEGREES : 0,
                    }}
                    transition={{
                      duration: isExpanded
                        ? EXPAND_DURATION
                        : COLLAPSE_DURATION,
                      ease: "easeOut",
                    }}
                  >
                    <ChevronRight className="size-4" />
                  </motion.div>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isExpanded ? "Collapse" : "Expand"}
              </TooltipContent>
            </Tooltip>
            <div className="min-w-0 flex-1 translate-y-1">
              <CardTitle className="flex items-start gap-2 text-base">
                <Quote className="size-4 shrink-0 translate-y-1 text-muted-foreground" />
                <span
                  className={cn(
                    "flex-1 break-words",
                    !isExpanded && "line-clamp-1"
                  )}
                >
                  {item.originalQuery}
                </span>
              </CardTitle>
              <CardDescription className="mt-1">
                <div className="flex flex-wrap gap-1.5">
                  {item.keywords
                    .slice(0, MAX_PREVIEW_KEYWORDS)
                    .map((keyword) => (
                      <span
                        className={cn(
                          "rounded-md",
                          "bg-muted",
                          "px-2 py-0.5",
                          "font-mono text-xs"
                        )}
                        key={keyword}
                      >
                        {keyword}
                      </span>
                    ))}
                  {item.keywords.length > MAX_PREVIEW_KEYWORDS && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-muted-foreground text-xs underline decoration-dotted">
                          +{item.keywords.length - MAX_PREVIEW_KEYWORDS} more
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="flex flex-wrap gap-1.5">
                          {item.keywords
                            .slice(MAX_PREVIEW_KEYWORDS)
                            .map((keyword) => (
                              <span
                                className={cn(
                                  "rounded-md",
                                  "bg-background/20",
                                  "px-2 py-0.5",
                                  "font-mono text-xs"
                                )}
                                key={keyword}
                              >
                                {keyword}
                              </span>
                            ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </CardDescription>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      {!isSearchReady && (
        <CardContent>
          <Separator className="mb-4" />
          <div className="grid gap-3">
            {/* Loading skeleton */}
            {Array.from({ length: SKELETON_ITEMS_COUNT }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items
              <div className="flex flex-col gap-2" key={i}>
                <div className="flex items-start gap-3">
                  <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="flex gap-1.5">
                      <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </div>
                {i < SKELETON_ITEMS_COUNT - 1 && <Separator />}
              </div>
            ))}
          </div>
        </CardContent>
      )}

      {isSearchReady && searchResults.length > 0 && (
        <CardContent>
          <Separator className="mb-4" />
          <div>
            {/* First item always visible - no animation */}
            <SearchResultItem
              allSearchResults={searchResults}
              rank={1}
              result={searchResults[0]}
              searchQueryId={item.id}
              showTokens={true}
            />

            {/* Rest of items with animation when expanded */}
            <AnimatePresence initial={false}>
              {isExpanded &&
                searchResults.slice(1).map((result, index) => (
                  <motion.div
                    animate={{
                      opacity: 1,
                      height: "auto",
                      scaleY: 1,
                    }}
                    className="overflow-hidden"
                    exit={{
                      opacity: 0,
                      height: 0,
                      scaleY: 0.8,
                    }}
                    initial={{ opacity: 0, height: 0, scaleY: 0.8 }}
                    key={result.id}
                    style={{
                      transformOrigin: "top",
                      willChange: "height, opacity, transform",
                    }}
                    transition={{
                      delay: isExpanded ? index * STAGGER_DELAY : 0,
                      height: {
                        duration: isExpanded
                          ? EXPAND_DURATION
                          : COLLAPSE_DURATION,
                        ease: SMOOTH_EASE,
                      },
                      opacity: {
                        duration: isExpanded
                          ? EXPAND_DURATION * EXPAND_OPACITY_RATIO
                          : COLLAPSE_DURATION * COLLAPSE_OPACITY_RATIO,
                        ease: "easeOut",
                      },
                      scaleY: {
                        duration: isExpanded
                          ? EXPAND_DURATION
                          : COLLAPSE_DURATION,
                        ease: SMOOTH_EASE,
                      },
                    }}
                  >
                    <div className="mt-3">
                      <Separator className="mb-3" />
                      <SearchResultItem
                        allSearchResults={searchResults}
                        rank={index + 2}
                        result={result}
                        searchQueryId={item.id}
                        showTokens={true}
                      />
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </CardContent>
      )}

      {isSearchReady && searchResults.length === 0 && (
        <CardContent>
          <Separator className="mb-4" />
          <div className="py-4 text-center text-muted-foreground text-sm">
            No repositories found for this search.
          </div>
        </CardContent>
      )}
    </Card>
  );
}
