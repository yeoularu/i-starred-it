import { db } from "@i-starred-it/db";
import { repositoryLikes } from "@i-starred-it/db/schema/likes";
import { and, desc, eq } from "drizzle-orm";

export class LikeError extends Error {}

export type LikeRepositoryInput = {
  userId: string;
  searchQueryId: string;
  likedOwner: string;
  likedName: string;
  likedRank: number;
  compressedSnapshot: Buffer;
};

export type LikedRepository = {
  id: string;
  userId: string;
  searchQueryId: string;
  likedOwner: string;
  likedName: string;
  likedRank: number;
  createdAt: Date;
};

export type RepositoryIdentifier = {
  owner: string;
  name: string;
};

export async function likeRepository(
  input: LikeRepositoryInput
): Promise<string> {
  const { userId, searchQueryId, likedOwner, likedName } = input;

  if (!userId) {
    throw new LikeError("User ID is required");
  }

  if (!searchQueryId) {
    throw new LikeError("Search query ID is required");
  }

  if (!(likedOwner && likedName)) {
    throw new LikeError("Repository owner and name are required");
  }

  // Check if already liked in this search context
  const existing = await db
    .select()
    .from(repositoryLikes)
    .where(
      and(
        eq(repositoryLikes.userId, userId),
        eq(repositoryLikes.searchQueryId, searchQueryId),
        eq(repositoryLikes.likedOwner, likedOwner),
        eq(repositoryLikes.likedName, likedName)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new LikeError("Repository already liked in this search context");
  }

  const likeId = crypto.randomUUID();

  await db.insert(repositoryLikes).values({
    id: likeId,
    userId,
    searchQueryId,
    likedOwner,
    likedName,
    likedRank: input.likedRank,
    compressedSnapshot: input.compressedSnapshot,
  });

  return likeId;
}

export async function unlikeRepository(
  userId: string,
  searchQueryId: string,
  likedOwner: string,
  likedName: string
): Promise<void> {
  if (!searchQueryId) {
    throw new LikeError("Search query ID is required");
  }

  if (!userId) {
    throw new LikeError("User ID is required");
  }

  if (!(likedOwner && likedName)) {
    throw new LikeError("Repository owner and name are required");
  }

  const [like] = await db
    .select()
    .from(repositoryLikes)
    .where(
      and(
        eq(repositoryLikes.userId, userId),
        eq(repositoryLikes.searchQueryId, searchQueryId),
        eq(repositoryLikes.likedOwner, likedOwner),
        eq(repositoryLikes.likedName, likedName)
      )
    )
    .limit(1);

  if (!like) {
    throw new LikeError("Like not found");
  }

  await db.delete(repositoryLikes).where(eq(repositoryLikes.id, like.id));
}

export async function getLikedRepositories(
  userId: string
): Promise<LikedRepository[]> {
  if (!userId) {
    throw new LikeError("User ID is required");
  }

  const likes = await db
    .select({
      id: repositoryLikes.id,
      userId: repositoryLikes.userId,
      searchQueryId: repositoryLikes.searchQueryId,
      likedOwner: repositoryLikes.likedOwner,
      likedName: repositoryLikes.likedName,
      likedRank: repositoryLikes.likedRank,
      createdAt: repositoryLikes.createdAt,
    })
    .from(repositoryLikes)
    .where(eq(repositoryLikes.userId, userId))
    .orderBy(desc(repositoryLikes.createdAt));

  return likes;
}

export async function checkIfRepositoryLiked(
  userId: string,
  searchQueryId: string,
  likedOwner: string,
  likedName: string
): Promise<boolean> {
  if (!(searchQueryId && userId && likedOwner && likedName)) {
    return false;
  }

  const existing = await db
    .select()
    .from(repositoryLikes)
    .where(
      and(
        eq(repositoryLikes.userId, userId),
        eq(repositoryLikes.searchQueryId, searchQueryId),
        eq(repositoryLikes.likedOwner, likedOwner),
        eq(repositoryLikes.likedName, likedName)
      )
    )
    .limit(1);

  return existing.length > 0;
}

export async function getLikeStatusForRepositories(
  userId: string,
  searchQueryId: string,
  repositories: RepositoryIdentifier[]
): Promise<Record<string, boolean>> {
  if (!userId) {
    return {};
  }

  if (!searchQueryId) {
    return {};
  }

  if (repositories.length === 0) {
    return {};
  }

  const likes = await db
    .select({
      owner: repositoryLikes.likedOwner,
      name: repositoryLikes.likedName,
    })
    .from(repositoryLikes)
    .where(
      and(
        eq(repositoryLikes.userId, userId),
        eq(repositoryLikes.searchQueryId, searchQueryId)
      )
    );

  const likedSet = new Set(likes.map((like) => `${like.owner}/${like.name}`));

  const result: Record<string, boolean> = {};
  for (const repo of repositories) {
    const key = `${repo.owner}/${repo.name}`;
    result[key] = likedSet.has(key);
  }

  return result;
}
