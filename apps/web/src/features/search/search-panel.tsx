import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSearchKeywords } from "./use-search-keywords";

function SearchPanel() {
  const { input, setInput, submit, isPending, error, result, reset } =
    useSearchKeywords();
  const hasResult = Boolean(result);
  const canSubmit = useMemo(
    () => input.trim().length > 0 && !isPending,
    [input, isPending]
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    submit();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2">
          <CardTitle>Search keywords</CardTitle>
          <CardDescription>
            Transform natural language into BM25-friendly tokens derived from
            GitHub repository metadata.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form className="grid gap-6" onSubmit={handleSubmit}>
          <FieldSet>
            <FieldLegend>Describe your search intent</FieldLegend>
            <FieldDescription>
              Keywords focus on repository names, descriptions, READMEs, and
              owners.
            </FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="search-query">Search query</FieldLabel>
                <FieldContent>
                  <Textarea
                    aria-invalid={Boolean(error)}
                    id="search-query"
                    onChange={(event) => {
                      setInput(event.target.value);
                    }}
                    placeholder="e.g. github projects for edge ai model serving"
                    value={input}
                  />
                  <FieldDescription>
                    Provide full sentences or bullet points describing what you
                    want to find.
                  </FieldDescription>
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!canSubmit} type="submit">
                {isPending ? (
                  <>
                    <Spinner className="size-4" />
                    Generating…
                  </>
                ) : (
                  "Generate keywords"
                )}
              </Button>
              <Button
                disabled={!(input || hasResult || isPending)}
                onClick={reset}
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          </FieldSet>
        </form>

        <Separator />

        <div className="grid gap-4">
          {isPending && !result ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" /> Preparing keywords…
            </div>
          ) : null}

          {hasResult ? (
            <Card className="border-dashed">
              <CardHeader>
                <div className="flex flex-col gap-1">
                  <CardTitle>Generated keywords</CardTitle>
                  <CardDescription>
                    Model {result?.model} • based on query “
                    {result?.originalQuery}”.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldTitle>Keyword list</FieldTitle>
                    <FieldDescription>
                      Use these tokens for BM25 or keyword-based search flows.
                    </FieldDescription>
                    <ul className="mt-2 grid gap-1 text-sm">
                      {result?.keywords.map((keyword) => (
                        <li
                          className="rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm"
                          key={keyword}
                        >
                          {keyword}
                        </li>
                      ))}
                    </ul>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          ) : null}

          {isPending || hasResult ? null : (
            <p className="text-muted-foreground text-sm">
              Generated keywords will appear here once the request completes.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { SearchPanel };
