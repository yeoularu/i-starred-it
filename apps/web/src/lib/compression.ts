import type { RepositorySearchResult } from "@/features/search/repository-search-engine";

export type SearchResultSnapshot = Array<{
  owner: string;
  name: string;
  description: string | null;
  readme: string | null;
  matchedTokens: string[];
  score: number;
  rank: number;
  starredAt: string;
  isLiked: boolean;
}>;

export async function compressSnapshot(
  searchResults: RepositorySearchResult[],
  likedOwner: string,
  likedName: string
): Promise<Blob> {
  const snapshot: SearchResultSnapshot = searchResults.map((result) => ({
    owner: result.repository.owner,
    name: result.repository.name,
    description: result.repository.description,
    readme: result.repository.readme,
    matchedTokens: result.matchedTokens,
    score: result.score,
    rank: Number.parseInt(result.id.split("/")[1], 10) || 0,
    starredAt: result.repository.starredAt,
    isLiked:
      result.repository.owner === likedOwner &&
      result.repository.name === likedName,
  }));

  const json = JSON.stringify(snapshot);
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(json);

  // deflate-raw 압축
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(uint8Array);
      controller.close();
    },
  });

  const compressed = stream.pipeThrough(new CompressionStream("deflate-raw"));

  // ReadableStream을 Blob으로 변환
  return await new Response(compressed).blob();
}

export async function decompressSnapshot(
  compressed: Blob
): Promise<SearchResultSnapshot> {
  // deflate-raw 해제
  const decompressed = compressed
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));

  const arrayBuffer = await new Response(decompressed).arrayBuffer();
  const json = new TextDecoder().decode(arrayBuffer);
  return JSON.parse(json);
}
