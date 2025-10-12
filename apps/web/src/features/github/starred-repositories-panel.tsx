import { Fragment } from "react";
import { GitHubIcon } from "@/components/github-icon";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGithubStarredRepositories } from "./use-github-starred-repositories";

type RepositoriesListProps = {
  items: ReturnType<typeof useGithubStarredRepositories>["repositories"];
};

function RepositoriesList({ items }: RepositoriesListProps) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No starred repositories found yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((repo) => (
        <Fragment key={`${repo.owner}/${repo.name}`}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "border border-border",
                  "rounded-full",
                  "px-2",
                  "py-0.5",
                  "text-xs",
                  "uppercase",
                  "text-muted-foreground"
                )}
              >
                {repo.owner}
              </span>
              <span className="font-semibold">{repo.name}</span>
            </div>
            {repo.description ? (
              <p className="text-muted-foreground text-sm">
                {repo.description}
              </p>
            ) : null}
          </div>
          <div className="h-px bg-border" />
        </Fragment>
      ))}
    </div>
  );
}

export function StarredRepositoriesPanel() {
  const query = useGithubStarredRepositories();
  const showLoader = query.isLoading || query.isFetching;
  const errorMessage = resolveErrorMessage(query.error);

  const renderContent = () => {
    if (errorMessage) {
      return (
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
          {errorMessage}
        </div>
      );
    }

    if (showLoader) {
      return <Loader />;
    }

    return <RepositoriesList items={query.repositories} />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitHubIcon className="size-7" />
          <div>
            <CardTitle>Starred repositories</CardTitle>
            <CardDescription>
              Synced from GitHub and cached locally for offline access.
            </CardDescription>
          </div>
        </div>
        <Button
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          variant="outline"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">{renderContent()}</CardContent>
      <CardFooter>
        {query.hasCache ? null : (
          <div
            className={cn(
              "border border-border border-dashed",
              "rounded-md",
              "p-3",
              "text-muted-foreground",
              "text-sm"
            )}
          >
            Your starred repositories will be stored locally after the first
            successful refresh.
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

type QueryError = unknown;

function resolveErrorMessage(error: QueryError): string | null {
  if (error && typeof error === "object") {
    const maybeCode = (error as { code?: unknown }).code;
    const maybeMessage = (error as { message?: unknown }).message;

    if (maybeCode === "FAILED_PRECONDITION") {
      return typeof maybeMessage === "string"
        ? maybeMessage
        : "GitHub reported that the resource limits for this query were exceeded. Please try again later.";
    }

    if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
      return maybeMessage;
    }
  }

  return null;
}
