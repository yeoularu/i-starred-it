import type { StarredRepository } from "@i-starred-it/api/services/github";

type FieldName = "owner" | "name" | "description" | "readme";

type EngineConfig = {
  fieldWeights: Record<FieldName, number>;
  k1: number;
  b: number;
  k: number;
  delta: number;
  maxReadmeTokens: number;
  maxKeywords: number;
};

type RepositoryDocument = {
  id: string;
  repository: StarredRepository;
  termFrequency: Map<string, number>;
  length: number;
};

export type SearchOptions = {
  limit?: number;
};

export type RepositorySearchResult = {
  id: string;
  repository: StarredRepository;
  score: number;
  matchedTokens: string[];
};

const DEFAULT_KEYWORD_LIMIT = 64;
const DEFAULT_README_TOKEN_LIMIT = Number.POSITIVE_INFINITY;
const MIN_SEARCH_RESULTS = 1;
const BM25_IDF_SMOOTHING = 0.5;

const defaultConfig: EngineConfig = {
  fieldWeights: {
    owner: 0.5,
    name: 2,
    description: 1.2,
    readme: 0.4,
  },
  k1: 1.2,
  b: 0.75,
  k: 1,
  delta: 0.5,
  maxReadmeTokens: DEFAULT_README_TOKEN_LIMIT,
  maxKeywords: DEFAULT_KEYWORD_LIMIT,
};

function composeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  if (!overrides) {
    return defaultConfig;
  }
  return {
    fieldWeights: {
      ...defaultConfig.fieldWeights,
      ...(overrides.fieldWeights ?? {}),
    },
    k1: overrides.k1 ?? defaultConfig.k1,
    b: overrides.b ?? defaultConfig.b,
    k: overrides.k ?? defaultConfig.k,
    delta: overrides.delta ?? defaultConfig.delta,
    maxReadmeTokens: overrides.maxReadmeTokens ?? defaultConfig.maxReadmeTokens,
    maxKeywords: overrides.maxKeywords ?? defaultConfig.maxKeywords,
  };
}

function tokenize(value: string, limit?: number): string[] {
  const lowered = value.toLowerCase();
  const tokens = lowered.match(/[a-z0-9]+/g);
  if (!tokens) {
    return [];
  }
  if (limit && tokens.length > limit) {
    return tokens.slice(0, limit);
  }
  return tokens;
}

function uniqueTokens(tokens: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const token of tokens) {
    set.add(token);
  }
  return Array.from(set);
}

function buildRepositoryId(repository: StarredRepository): string {
  return `${repository.owner}/${repository.name}`;
}

function normalizeKeywords(keywords: string[], limit: number): string[] {
  const collected: string[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const tokens = tokenize(trimmed);
    for (const token of tokens) {
      collected.push(token);
    }
    if (limit && collected.length >= limit) {
      break;
    }
  }
  return uniqueTokens(limit ? collected.slice(0, limit) : collected);
}

export class RepositorySearchEngine {
  private readonly config: EngineConfig;
  private readonly documents = new Map<string, RepositoryDocument>();
  private readonly invertedIndex = new Map<string, Set<string>>();
  private readonly documentFrequency = new Map<string, number>();
  private readonly inverseDocumentFrequency = new Map<string, number>();
  private totalCorpusLength = 0;
  private averageDocumentLength = 0;

  constructor(overrides?: Partial<EngineConfig>) {
    this.config = composeConfig(overrides);
  }

  get size(): number {
    return this.documents.size;
  }

  reset(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.documentFrequency.clear();
    this.inverseDocumentFrequency.clear();
    this.totalCorpusLength = 0;
    this.averageDocumentLength = 0;
  }

  add(repository: StarredRepository): void {
    const id = buildRepositoryId(repository);
    if (this.documents.has(id)) {
      return;
    }

    const doc: RepositoryDocument = {
      id,
      repository,
      termFrequency: new Map(),
      length: 0,
    };

    const { fieldWeights, maxReadmeTokens } = this.config;
    this.ingestText(doc, repository.owner, fieldWeights.owner);
    this.ingestText(doc, repository.name, fieldWeights.name);
    this.ingestField(
      doc,
      repository.description ?? "",
      fieldWeights.description
    );
    this.ingestField(
      doc,
      repository.readme ?? "",
      fieldWeights.readme,
      maxReadmeTokens
    );

    this.totalCorpusLength += doc.length;
    this.documents.set(id, doc);
  }

  consolidate(): void {
    if (this.documents.size === 0) {
      return;
    }
    this.averageDocumentLength =
      this.totalCorpusLength / Math.max(this.documents.size, 1);

    this.documentFrequency.clear();
    for (const [token, docIds] of this.invertedIndex.entries()) {
      this.documentFrequency.set(token, docIds.size);
    }

    this.inverseDocumentFrequency.clear();
    const { k } = this.config;
    for (const [token, frequency] of this.documentFrequency.entries()) {
      const idf = Math.log(
        (this.documents.size - frequency + BM25_IDF_SMOOTHING) /
          (frequency + BM25_IDF_SMOOTHING) +
          k
      );
      this.inverseDocumentFrequency.set(token, idf);
    }

    for (const doc of this.documents.values()) {
      const normalized = this.normalizeDocumentFrequencies(doc);
      doc.termFrequency.clear();
      for (const [token, score] of normalized.entries()) {
        doc.termFrequency.set(token, score);
      }
    }
  }

  search(
    keywords: string[],
    options?: SearchOptions
  ): RepositorySearchResult[] {
    if (this.documents.size === 0) {
      return [];
    }

    const normalizedKeywords = normalizeKeywords(
      keywords,
      this.config.maxKeywords
    );
    if (normalizedKeywords.length === 0) {
      return [];
    }

    const scores = new Map<string, number>();
    const matches = new Map<string, Set<string>>();

    for (const keyword of normalizedKeywords) {
      this.updateScoresForKeyword(keyword, scores, matches);
    }

    const limit = Math.max(options?.limit ?? 10, MIN_SEARCH_RESULTS);
    const ranked = Array.from(scores.entries())
      .map(([id, score]) => ({
        id,
        score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const results: RepositorySearchResult[] = ranked.map(({ id, score }) => {
      const doc = this.documents.get(id);
      if (!doc) {
        throw new Error("Invariant violated: missing repository document");
      }
      return {
        id,
        repository: doc.repository,
        score,
        matchedTokens: Array.from(matches.get(id) ?? new Set<string>()),
      };
    });

    return results;
  }

  private updateScoresForKeyword(
    keyword: string,
    scores: Map<string, number>,
    matches: Map<string, Set<string>>
  ): void {
    const docIds = this.invertedIndex.get(keyword);
    if (!docIds) {
      return;
    }

    for (const id of docIds) {
      const doc = this.documents.get(id);
      if (!doc) {
        continue;
      }
      const termScore = doc.termFrequency.get(keyword) ?? 0;
      scores.set(id, (scores.get(id) ?? 0) + termScore);
      if (!matches.has(id)) {
        matches.set(id, new Set());
      }
      matches.get(id)?.add(keyword);
    }
  }

  private ingestText(
    doc: RepositoryDocument,
    rawValue: string,
    weight: number
  ) {
    if (!rawValue) {
      return;
    }
    if (weight <= 0) {
      return;
    }

    const tokens = tokenize(rawValue);
    if (tokens.length === 0) {
      return;
    }

    const docTokens = new Set<string>();
    for (const token of tokens) {
      const weighted = doc.termFrequency.get(token) ?? 0;
      doc.termFrequency.set(token, weighted + weight);
      docTokens.add(token);
    }

    for (const token of docTokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)?.add(doc.id);
    }

    doc.length += tokens.length * weight;
  }

  private ingestField(
    doc: RepositoryDocument,
    rawValue: string,
    weight: number,
    tokenLimit?: number
  ) {
    if (!rawValue) {
      return;
    }
    if (weight <= 0) {
      return;
    }

    const tokens = tokenize(rawValue, tokenLimit);
    if (tokens.length === 0) {
      return;
    }

    const docTokens = new Set<string>();
    for (const token of tokens) {
      const weighted = doc.termFrequency.get(token) ?? 0;
      doc.termFrequency.set(token, weighted + weight);
      docTokens.add(token);
    }

    for (const token of docTokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)?.add(doc.id);
    }

    doc.length += tokens.length * weight;
  }

  private normalizeDocumentFrequencies(
    doc: RepositoryDocument
  ): Map<string, number> {
    const normalized = new Map<string, number>();
    const { k1, b, delta } = this.config;
    const averageLength = this.averageDocumentLength || 1;
    const normalizationFactor = 1 - b + b * (doc.length / averageLength);

    for (const [token, frequency] of doc.termFrequency.entries()) {
      const idf = this.inverseDocumentFrequency.get(token);
      if (typeof idf !== "number") {
        continue;
      }
      if (frequency <= 0) {
        continue;
      }
      const denominator = frequency + k1 * normalizationFactor;
      if (denominator === 0) {
        continue;
      }
      const baseTf = (frequency * (k1 + 1)) / denominator;
      const tf = baseTf + delta;
      normalized.set(token, tf * idf);
    }

    return normalized;
  }
}
