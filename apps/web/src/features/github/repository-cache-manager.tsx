import {
  ClockIcon,
  DatabaseIcon,
  RepoIcon,
  StarIcon,
  SyncIcon,
} from "@primer/octicons-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGithubStarredRepositories } from "./use-github-starred-repositories";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateWithTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function RepositoryCacheManager() {
  const github = useGithubStarredRepositories();
  const [open, setOpen] = useState(false);

  const handleRefresh = async () => {
    try {
      await github.refetch();
      toast.success("Repositories refreshed successfully");
    } catch {
      toast.error("Failed to refresh repositories");
    }
  };

  const isLoading = github.isLoading || github.isFetching;
  const repositories = github.repositories;
  const repositoryCount = repositories.length;
  const lastUpdated = repositories[0]?.starredAt;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="icon" variant="outline">
              <DatabaseIcon size={16} />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Manage stored data</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:pr-8">
            <div className="flex-1 text-center md:text-left">
              <DialogTitle>Starred Repositories</DialogTitle>
              <DialogDescription className="mt-1 flex items-center justify-center gap-3 md:justify-start">
                <span className="flex items-center gap-1.5">
                  <RepoIcon size={14} />
                  {repositoryCount.toLocaleString()}
                </span>
                {lastUpdated ? (
                  <span className="flex items-center gap-1.5">
                    <ClockIcon size={14} />
                    {formatDate(lastUpdated)}
                  </span>
                ) : null}
              </DialogDescription>
            </div>
            <Button
              className="w-full md:w-auto"
              disabled={isLoading}
              onClick={handleRefresh}
              size="sm"
              variant="outline"
            >
              {isLoading ? (
                <>
                  <Spinner className="size-3" />
                  <span className="ml-1.5">Refreshing...</span>
                </>
              ) : (
                <>
                  <SyncIcon size={12} />
                  <span className="ml-1.5">Refresh</span>
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(80vh-8rem)] overflow-y-auto">
          {isLoading && repositories.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-6" />
            </div>
          )}
          {!isLoading && repositories.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No repositories found. Click Refresh to fetch your starred
              repositories.
            </div>
          )}
          {repositories.length > 0 && (
            <div className="grid gap-3">
              {repositories.map((repo, index) => (
                <Fragment key={`${repo.owner}/${repo.name}`}>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <a
                        className="hover:underline"
                        href={`https://github.com/${repo.owner}/${repo.name}`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="font-semibold text-sm tracking-[0.01em]">
                          {repo.owner}/{repo.name}
                        </span>
                      </a>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <StarIcon size={12} />
                        <span>{repo.stargazerCount.toLocaleString()}</span>
                      </div>
                    </div>
                    {repo.description ? (
                      <p className="line-clamp-2 text-muted-foreground text-xs">
                        {repo.description}
                      </p>
                    ) : null}
                    <div className="text-muted-foreground text-xs">
                      Starred {formatDateWithTime(repo.starredAt)}
                    </div>
                  </div>
                  {index < repositories.length - 1 ? <Separator /> : null}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
