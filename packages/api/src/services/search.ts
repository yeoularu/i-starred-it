import { env } from "cloudflare:workers";
import { db } from "@i-starred-it/db";
import { searchQueries } from "@i-starred-it/db/schema/search";
import { sql } from "drizzle-orm";

const DEFAULT_MODEL = "@cf/openai/gpt-oss-20b";
const REQUEST_TIMEOUT_MS = 10_000;

export type GenerateKeywordsInput = {
  query: string;
  userId?: string;
};

export type GenerateKeywordsResult = {
  originalQuery: string;
  keywords: string[];
  model: string;
};

export class KeywordGenerationError extends Error {}

export type WorkersAi = typeof env.AI;

type PersistArgs = {
  originalQuery: string;
  keywords: string[];
  model: string;
  userId?: string;
};

export async function generateKeywords(
  { query, userId }: GenerateKeywordsInput,
  ai: WorkersAi = env.AI
): Promise<GenerateKeywordsResult> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new KeywordGenerationError("Query must not be empty");
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const prompt = buildPrompt(normalizedQuery);
    const response = await ai.run(DEFAULT_MODEL, {
      input: prompt,
      reasoning: {
        effort: "low",
        summary: "auto",
      },
      signal: abortController.signal,
    });

    const keywords = parseKeywordsResponse(response);

    await persistSearchRecord({
      originalQuery: normalizedQuery,
      keywords,
      userId,
      model: DEFAULT_MODEL,
    });

    return {
      originalQuery: normalizedQuery,
      keywords,
      model: DEFAULT_MODEL,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new KeywordGenerationError("Keyword generation timed out");
    }

    if (error instanceof KeywordGenerationError) {
      throw error;
    }

    throw new KeywordGenerationError(
      error instanceof Error ? error.message : "Failed to generate keywords"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getLatestKeywordsForUser(
  userId: string,
  ai: WorkersAi = env.AI
): Promise<GenerateKeywordsResult | null> {
  if (!userId) {
    throw new KeywordGenerationError("User ID required");
  }

  const [record] = await db
    .select()
    .from(searchQueries)
    .where(sql`${searchQueries.userId} = ${userId}`)
    .orderBy(sql`${searchQueries.createdAt} DESC`)
    .limit(1);

  if (!record) {
    return null;
  }

  try {
    const parsedKeywords = JSON.parse(record.generatedKeywords) as unknown;

    if (!Array.isArray(parsedKeywords)) {
      throw new Error("parsed keywords is not array");
    }

    const keywords = parsedKeywords
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (keywords.length === 0) {
      throw new Error("keywords empty after normalization");
    }

    return {
      originalQuery: record.originalQuery,
      keywords,
      model: record.model ?? DEFAULT_MODEL,
    };
  } catch {
    await regenerateKeywords(
      {
        query: record.originalQuery,
        userId,
      },
      ai
    );

    return await getLatestKeywordsForUser(userId, ai);
  }
}

async function regenerateKeywords(
  input: GenerateKeywordsInput,
  ai: WorkersAi = env.AI
) {
  await generateKeywords(input, ai);
}

async function persistSearchRecord({
  originalQuery,
  keywords,
  model,
  userId,
}: PersistArgs) {
  await db.insert(searchQueries).values({
    id: crypto.randomUUID(),
    originalQuery,
    generatedKeywords: JSON.stringify(keywords),
    model,
    userId,
  });
}

function buildPrompt(query: string): string {
  return `BM25 ranks documents by exact keyword matches, so we need clean, high-signal tokens. Analyze the following natural language query and produce a JSON array of representative keywords or short phrases optimized for BM25 scoring.

Search target:
- GitHub repositories, including repository names, descriptions, READMEs, topics, languages, and owner.

Return a response with this exact JSON schema:
{
  "keywords": ["keyword1", "keyword2", ...]
}

Requirements:
- Remove stop words.
- Prefer nouns and important modifiers.
- Keep each keyword to a single word.
- Use English keywords.
- Add additional keywords that improve retrieval even if they are not explicitly mentioned in the query.

Query: "${query}"`;
}

function parseKeywordsResponse(response: unknown): string[] {
  if (!response || typeof response !== "object") {
    throw new KeywordGenerationError("Invalid AI response");
  }

  const output = (
    response as {
      result?: {
        output_text?: unknown;
        response?: unknown;
        output?: unknown;
      };
      output_text?: unknown;
      response?: unknown;
      output?: unknown;
    }
  ).result;

  const candidates: unknown[] = [
    output?.output_text,
    output?.response,
    output?.output,
    (response as { output_text?: unknown }).output_text,
    (response as { response?: unknown }).response,
    (response as { output?: unknown }).output,
  ];

  const collectStrings = (value: unknown): string[] => {
    if (!value) {
      return [];
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => collectStrings(item));
    }

    if (typeof value === "object") {
      const maybeText = (value as { text?: unknown }).text;
      const maybeContent = (value as { content?: unknown }).content;

      return [...collectStrings(maybeText), ...collectStrings(maybeContent)];
    }

    return [];
  };

  const text = candidates
    .flatMap((candidate) => collectStrings(candidate))
    .find((candidate) => candidate.startsWith("{"));

  if (!text) {
    throw new KeywordGenerationError("AI response missing output text");
  }

  try {
    const parsed = JSON.parse(text) as { keywords?: unknown };

    if (!Array.isArray(parsed.keywords)) {
      throw new Error("Missing keywords array");
    }

    const keywords = parsed.keywords
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => item.toLowerCase());

    if (keywords.length === 0) {
      throw new Error("Keywords array empty");
    }

    return Array.from(new Set(keywords));
  } catch (error) {
    throw new KeywordGenerationError(
      error instanceof Error ? error.message : "Failed to parse AI response"
    );
  }
}
