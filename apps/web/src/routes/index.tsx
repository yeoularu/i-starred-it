import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SquareIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { GitHubIcon } from "@/components/github-icon";
import { Button } from "@/components/ui/button";
import Stack from "@/components/ui/stack";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  const getStatusText = () => {
    if (healthCheck.isLoading) {
      return "Checking...";
    }
    return healthCheck.data ? "Connected" : "Disconnected";
  };

  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-2">
      <AboutSection />

      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-muted-foreground text-sm">
              {getStatusText()}
            </span>
          </div>
        </section>
        <AuthSection />
      </div>
    </div>
  );
}

function AboutSection() {
  // biome-ignore lint/style/noMagicNumbers: about image sizes
  const imgRatio = 425 / 848;
  const defaultWidth = 480;
  const [isDismissed, setIsDismissed] = useLocalStorage(
    "about-section-dismissed",
    false
  );
  const { width: windowWidth } = useWindowSize();
  const horizontalOffset = 32;
  const availableWidth =
    windowWidth > 0
      ? Math.max(windowWidth - horizontalOffset, 0)
      : defaultWidth;
  const width = Math.min(defaultWidth, availableWidth);
  const height = width * imgRatio;

  return (
    <div>
      <div className="flex justify-end">
        {isDismissed ? (
          <Button
            onClick={() => setIsDismissed(false)}
            size="icon"
            variant="ghost"
          >
            <SquareIcon />
          </Button>
        ) : (
          <Button
            aria-label="Close about section"
            onClick={() => setIsDismissed(true)}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        )}
      </div>
      {!isDismissed && (
        <section className="-translate-x-2 my-4 grid max-w-[calc(100vw-2rem)] place-items-center">
          <div className="relative">
            <Stack
              cardDimensions={{ width, height }}
              cardsData={[
                { id: 1, img: "/about1.webp" },
                { id: 2, img: "/about2.webp" },
              ].reverse()}
              sendToBackOnClick
            />
          </div>
        </section>
      )}
    </div>
  );
}

function AuthSection() {
  const { data: session, isPending } = authClient.useSession();

  const signIn = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: window.location.href,
    });
  };

  const signOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Signed out successfully.");
        },
        onError: () => {
          toast.error("Failed to sign out.");
        },
      },
    });
  };

  let content: ReactNode;
  if (isPending) {
    content = (
      <p className="text-muted-foreground text-sm">Checking session…</p>
    );
  } else if (session) {
    content = (
      <div className="flex flex-col gap-3">
        <div className="text-muted-foreground text-sm">
          Signed in as {session.user.name ?? session.user.email}.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={signOut} type="button" variant="outline">
            Sign out
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <Button
        className="size-24 rounded-3xl border-2"
        disabled={isPending}
        onClick={signIn}
        type="button"
        variant="outline"
      >
        <GitHubIcon className="size-12" />
      </Button>
    );
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 font-medium">Authentication</h2>
      {content}
    </section>
  );
}
