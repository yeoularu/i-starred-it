import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import {
  fetchStarredRepositoriesForUser,
  GithubResourceLimitError,
  MissingGithubTokenError,
} from "../services/github";

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
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
