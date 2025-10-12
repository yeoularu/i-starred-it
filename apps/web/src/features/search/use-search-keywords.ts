import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

export type KeywordResult = {
  keywords: string[];
  originalQuery: string;
  model: string;
};

type MutationVariables = {
  query: string;
};

type UseSearchKeywordsState = {
  input: string;
  setInput: (value: string) => void;
  submit: () => void;
  isPending: boolean;
  error: Error | null;
  result: KeywordResult | null;
  reset: () => void;
};

export function useSearchKeywords(): UseSearchKeywordsState {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<KeywordResult | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ query }: MutationVariables) =>
      await orpc.generateSearchKeywords.call({
        query,
      }),
    onSuccess: (data) => {
      setResult({
        keywords: data.keywords,
        originalQuery: data.originalQuery,
        model: data.model,
      });
    },
  });

  const submit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    setResult(null);
    mutation.mutate({ query: trimmed });
  }, [input, mutation]);

  const reset = useCallback(() => {
    setResult(null);
    mutation.reset();
  }, [mutation]);

  const error = useMemo(() => {
    const value = mutation.error;
    if (!value) {
      return null;
    }

    return value instanceof Error ? value : new Error("Unknown error");
  }, [mutation.error]);

  return useMemo(
    () => ({
      input,
      setInput,
      submit,
      isPending: mutation.isPending,
      error,
      result,
      reset,
    }),
    [error, input, mutation.isPending, reset, result, submit]
  );
}
