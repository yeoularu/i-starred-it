import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { users } from "./auth";

export const searchQueries = sqliteTable("search_queries", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .default(sql`NULL`),
  originalQuery: text("original_query").notNull(),
  generatedKeywords: text("generated_keywords").notNull(),
  model: text("model"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
