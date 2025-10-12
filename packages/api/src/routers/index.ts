import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import {
  fetchStarredRepositoriesForUser,
  GithubResourceLimitError,
  MissingGithubTokenError,
} from "../services/github";
import { generateKeywords } from "../services/search";

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
      const result = await generateKeywords({
        query: input.query,
        userId: context.session?.user?.id,
      });

      return result;
    }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
