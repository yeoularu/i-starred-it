import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressSnapshot } from "@/lib/compression";
import { orpc } from "@/utils/orpc";
import type { RepositorySearchResult } from "./repository-search-engine";

// biome-ignore lint/style/noMagicNumbers: 밀리초 변환
const LIKE_STATUS_STALE_TIME = 60 * 1000; // 1분
// biome-ignore lint/style/noMagicNumbers: 밀리초 변환
const LIKE_STATUS_GC_TIME = 10 * 60 * 1000; // 10분

export function useRepositoryLike() {
  const queryClient = useQueryClient();

  const likeMutation = useMutation({
    mutationFn: async ({
      searchQueryId,
      searchResults,
      likedOwner,
      likedName,
      likedRank,
    }: {
      searchQueryId: string;
      searchResults: RepositorySearchResult[];
      likedOwner: string;
      likedName: string;
      likedRank: number;
    }) => {
      const compressedSnapshot = await compressSnapshot(
        searchResults,
        likedOwner,
        likedName
      );

      // @ts-expect-error Browser Blob vs Node.js Buffer.Blob type mismatch
      return await orpc.likeRepository.query({
        input: {
          searchQueryId,
          likedOwner,
          likedName,
          likedRank,
          compressedSnapshot,
        },
      });
    },
    onSuccess: () => {
      // ORPC 자동 쿼리 키 사용
      queryClient.invalidateQueries({
        queryKey: orpc.getLikedRepositories.key(),
      });
      queryClient.invalidateQueries({
        queryKey: orpc.checkIfRepositoryLiked.key(),
      });
    },
  });

  const unlikeMutation = useMutation(
    orpc.unlikeRepository.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.getLikedRepositories.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.checkIfRepositoryLiked.key(),
        });
      },
    })
  );

  return {
    like: likeMutation.mutateAsync,
    unlike: unlikeMutation.mutateAsync,
    isLiking: likeMutation.isPending,
    isUnliking: unlikeMutation.isPending,
  };
}

export function useCheckIfLiked(
  searchQueryId: string,
  likedOwner: string,
  likedName: string
) {
  return useQuery(
    orpc.checkIfRepositoryLiked.queryOptions({
      input: { searchQueryId, likedOwner, likedName },
      select: (data) => data.isLiked,
      staleTime: LIKE_STATUS_STALE_TIME,
      gcTime: LIKE_STATUS_GC_TIME,
    })
  );
}

export function useRepositoryLikes(
  searchQueryId: string,
  repositories: Array<{ owner: string; name: string }>
) {
  return useQuery(
    orpc.getRepositoryLikes.queryOptions({
      input: { searchQueryId, repositories },
    })
  );
}

export function useLikedRepositories() {
  return useQuery(orpc.getLikedRepositories.queryOptions());
}
