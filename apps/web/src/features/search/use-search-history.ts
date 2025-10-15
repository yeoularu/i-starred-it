import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export type SearchHistoryItem = {
  id: string;
  originalQuery: string;
  keywords: string[];
  model: string;
  createdAt: Date;
};

const DAILY_SEARCH_LIMIT = 20;

function countSearchesToday(history: SearchHistoryItem[]): number {
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  return history.filter((item) => {
    const createdAt = new Date(item.createdAt);
    return createdAt >= todayUTC;
  }).length;
}

export function useSearchHistory() {
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const isAuthenticated = Boolean(session?.user);

  const { data, isLoading, error, refetch } = useQuery({
    ...orpc.getSearchHistory.queryOptions(),
    enabled: isAuthenticated && !isSessionPending,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (queryId: string) =>
      await orpc.deleteSearchQuery.call({ queryId }),
    onMutate: async (queryId) => {
      // Optimistic update
      await queryClient.cancelQueries(orpc.getSearchHistory.queryOptions());

      const previousData = queryClient.getQueryData(
        orpc.getSearchHistory.queryOptions().queryKey
      );

      queryClient.setQueryData(
        orpc.getSearchHistory.queryOptions().queryKey,
        (old: SearchHistoryItem[] | undefined) => {
          if (!old) {
            return [];
          }
          return old.filter((item) => item.id !== queryId);
        }
      );

      return { previousData };
    },
    onError: (_err, _queryId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          orpc.getSearchHistory.queryOptions().queryKey,
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(orpc.getSearchHistory.queryOptions());
    },
  });

  const history = data ?? [];
  const searchesInLast24Hours = countSearchesToday(history);
  const hasReachedLimit = searchesInLast24Hours >= DAILY_SEARCH_LIMIT;

  return {
    history,
    isLoading,
    error,
    deleteQuery: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    refetch,
    searchesInLast24Hours,
    dailyLimit: DAILY_SEARCH_LIMIT,
    hasReachedLimit,
  };
}
