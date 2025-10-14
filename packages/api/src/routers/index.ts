import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import {
  fetchReadmesForRepositoriesForUser,
  fetchStarredRepositoriesForUser,
  fetchStarredRepositoriesWithoutReadmeForUser,
  GithubResourceLimitError,
  MissingGithubTokenError,
} from "../services/github";
import {
  checkIfRepositoryLiked,
  getLikedRepositories,
  getLikeStatusForRepositories,
  LikeError,
  likeRepository,
  unlikeRepository,
} from "../services/likes";
import {
  generateKeywords,
  getSearchHistory,
  RateLimitError,
  SearchHistoryError,
  softDeleteSearchQuery,
} from "../services/search";

const MAX_KEYWORD_QUERY_LENGTH = 1000;
const MAX_REPOSITORIES_PER_REQUEST = 50;

const repositoryIdentifierSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
});

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  githubStarredRepositories: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session?.user?.id;

    if (!userId) {
      throw new ORPCError("UNAUTHORIZED");
    }

    try {
      const data = await fetchStarredRepositoriesForUser(userId);
      return data;
    } catch (error) {
      if (error instanceof MissingGithubTokenError) {
        throw new ORPCError("NOT_FOUND", {
          message: error.message,
        });
      }

      if (error instanceof GithubResourceLimitError) {
        throw new ORPCError("FAILED_PRECONDITION", {
          message: error.message,
        });
      }

      throw error;
    }
  }),
  githubStarredRepositoriesWithoutReadme: protectedProcedure.handler(
    async ({ context }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      try {
        const data = await fetchStarredRepositoriesWithoutReadmeForUser(userId);
        return data;
      } catch (error) {
        if (error instanceof MissingGithubTokenError) {
          throw new ORPCError("NOT_FOUND", {
            message: error.message,
          });
        }

        if (error instanceof GithubResourceLimitError) {
          throw new ORPCError("FAILED_PRECONDITION", {
            message: error.message,
          });
        }

        throw error;
      }
    }
  ),
  githubFetchReadmes: protectedProcedure
    .input(
      z.object({
        repositories: z
          .array(repositoryIdentifierSchema)
          .min(1)
          .max(MAX_REPOSITORIES_PER_REQUEST),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      try {
        const data = await fetchReadmesForRepositoriesForUser(
          userId,
          input.repositories
        );
        return data;
      } catch (error) {
        if (error instanceof MissingGithubTokenError) {
          throw new ORPCError("NOT_FOUND", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  generateSearchKeywords: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(MAX_KEYWORD_QUERY_LENGTH),
      })
    )
    .handler(async ({ context, input }) => {
      try {
        const result = await generateKeywords({
          query: input.query,
          userId: context.session?.user?.id,
        });

        return result;
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw new ORPCError("RESOURCE_EXHAUSTED", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  getSearchHistory: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session?.user?.id;

    if (!userId) {
      throw new ORPCError("UNAUTHORIZED");
    }

    try {
      const history = await getSearchHistory(userId);
      return history;
    } catch (error) {
      if (error instanceof SearchHistoryError) {
        throw new ORPCError("BAD_REQUEST", {
          message: error.message,
        });
      }

      throw error;
    }
  }),
  deleteSearchQuery: protectedProcedure
    .input(
      z.object({
        queryId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      try {
        await softDeleteSearchQuery(input.queryId, userId);
        return { success: true };
      } catch (error) {
        if (error instanceof SearchHistoryError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  likeRepository: protectedProcedure
    .input(
      z.object({
        searchQueryId: z.string().min(1),
        likedOwner: z.string().min(1),
        likedName: z.string().min(1),
        likedRank: z.number(),
        compressedSnapshot: z.instanceof(Blob),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      try {
        const buffer = Buffer.from(
          await input.compressedSnapshot.arrayBuffer()
        );

        const likeId = await likeRepository({
          userId,
          searchQueryId: input.searchQueryId,
          likedOwner: input.likedOwner,
          likedName: input.likedName,
          likedRank: input.likedRank,
          compressedSnapshot: buffer,
        });
        return { likeId };
      } catch (error) {
        if (error instanceof LikeError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  unlikeRepository: protectedProcedure
    .input(
      z.object({
        searchQueryId: z.string().min(1),
        likedOwner: z.string().min(1),
        likedName: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      try {
        await unlikeRepository(
          userId,
          input.searchQueryId,
          input.likedOwner,
          input.likedName
        );
        return { success: true };
      } catch (error) {
        if (error instanceof LikeError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  getLikedRepositories: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session?.user?.id;

    if (!userId) {
      throw new ORPCError("UNAUTHORIZED");
    }

    try {
      const likes = await getLikedRepositories(userId);
      return likes;
    } catch (error) {
      if (error instanceof LikeError) {
        throw new ORPCError("BAD_REQUEST", {
          message: error.message,
        });
      }

      throw error;
    }
  }),
  checkIfRepositoryLiked: protectedProcedure
    .input(
      z.object({
        searchQueryId: z.string().min(1),
        likedOwner: z.string().min(1),
        likedName: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const isLiked = await checkIfRepositoryLiked(
        userId,
        input.searchQueryId,
        input.likedOwner,
        input.likedName
      );
      return { isLiked };
    }),
  getRepositoryLikes: protectedProcedure
    .input(
      z.object({
        searchQueryId: z.string().min(1),
        repositories: z.array(repositoryIdentifierSchema),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const likes = await getLikeStatusForRepositories(
        userId,
        input.searchQueryId,
        input.repositories
      );
      return likes;
    }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
