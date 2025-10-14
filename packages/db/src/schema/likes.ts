import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { users } from "./auth";
import { searchQueries } from "./search";

export const repositoryLikes = sqliteTable("repository_likes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  searchQueryId: text("search_query_id")
    .notNull()
    .references(() => searchQueries.id, { onDelete: "cascade" }),

  // 좋아요한 레포 식별자
  likedOwner: text("liked_owner").notNull(),
  likedName: text("liked_name").notNull(),
  likedRank: integer("liked_rank").notNull(),

  // 전체 검색 결과 스냅샷 (deflate-raw 압축된 JSON)
  compressedSnapshot: blob("compressed_snapshot", { mode: "buffer" }).notNull(),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
