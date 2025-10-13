import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import {
  fetchStarredRepositoriesForUser,
  GithubResourceLimitError,
  MissingGithubTokenError,
} from "../services/github";
import {
  generateKeywords,
  getSearchHistory,
  RateLimitError,
  SearchHistoryError,
  softDeleteSearchQuery,
} from "../services/search";

const MAX_KEYWORD_QUERY_LENGTH = 1000;

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
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
