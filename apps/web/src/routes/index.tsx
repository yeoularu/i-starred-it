import { createFileRoute } from "@tanstack/react-router";
import { LogOutIcon, SquareIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { GitHubIcon } from "@/components/github-icon";
import Loader from "@/components/loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Stack from "@/components/ui/stack";
import { StarredRepositoriesPanel } from "@/features/github/starred-repositories-panel";
import { SearchPanel } from "@/features/search/search-panel";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { data: session } = authClient.useSession();

  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-2">
      <AboutSection />

      <div className="grid gap-6">
        <AuthSection />
        {session ? (
          <div className="grid gap-6">
            <SearchPanel />
            <StarredRepositoriesPanel />
          </div>
        ) : null}
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
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signIn = async () => {
    setIsSigningIn(true);
    await authClient.signIn.social({
      provider: "github",
      callbackURL: window.location.href,
    });
    setIsSigningIn(false);
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
  if (!isSigningIn && isPending) {
    content = <Loader />;
  } else if (session) {
    content = (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={session.user.image ?? undefined} />
            <AvatarFallback>
              {session.user.name?.[0] ?? session.user.email?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <p className="text-sm">{session.user.name}</p>
            <p className="text-muted-foreground text-xs">
              {session.user.email}
            </p>
          </div>
        </div>

        <Button onClick={signOut} size="icon" variant="outline">
          <LogOutIcon />
        </Button>
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col items-center gap-3">
        <p className="text-muted-foreground text-sm">Continue with GitHub</p>
        <Button
          className="size-24 rounded-3xl border-2"
          disabled={isPending}
          onClick={signIn}
          variant="outline"
        >
          <GitHubIcon className="size-12" />
        </Button>
      </div>
    );
  }

  return <section className="grid place-items-center">{content}</section>;
}
