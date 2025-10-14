import { createFileRoute } from "@tanstack/react-router";
import { LogOutIcon, SearchIcon, SquareIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { GitHubIcon } from "@/components/github-icon";
import Loader from "@/components/loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Stack from "@/components/ui/stack";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RepositoryCacheManager } from "@/features/github/repository-cache-manager";
import { PromptSearch } from "@/features/search/prompt-search";
import { useSearchHistory } from "@/features/search/use-search-history";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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
        {session ? <PromptSearch /> : null}
      </div>
    </div>
  );
}

function AboutSection() {
  // biome-ignore lint/style/noMagicNumbers: 이미지 원본 크기
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
        <AnimatePresence mode="wait">
          {isDismissed ? (
            <motion.div
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              initial={{ opacity: 0, rotate: -90 }}
              key="expand-button"
              transition={{ duration: 0.2 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsDismissed(false)}
                    size="icon"
                    variant="ghost"
                  >
                    <SquareIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show about</TooltipContent>
              </Tooltip>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              initial={{ opacity: 0, rotate: 90 }}
              key="close-button"
              transition={{ duration: 0.2 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Close about section"
                    onClick={() => setIsDismissed(true)}
                    size="icon"
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close about</TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {!isDismissed && (
          <motion.section
            animate={{ opacity: 1, scale: 1 }}
            className="-translate-x-2 my-4 grid max-w-[calc(100vw-2rem)] place-items-center"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            key="about-content"
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
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
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function AuthSection() {
  const { data: session, isPending } = authClient.useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { searchesInLast24Hours, dailyLimit } = useSearchHistory();

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

  // Calculate next UTC midnight reset time
  const getResetTime = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  };

  const resetTime = getResetTime();
  const resetTimeString = resetTime.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let content: ReactNode;
  if (!isSigningIn && isPending) {
    content = <Loader />;
  } else if (session) {
    content = (
      <div className="flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1.5",
                  "rounded-md border bg-background px-2.5 py-1.5",
                  "cursor-help"
                )}
              >
                <SearchIcon className="size-4" />
                <span className="font-semibold text-xs">
                  {searchesInLast24Hours}/{dailyLimit}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>Resets at {resetTimeString}</TooltipContent>
          </Tooltip>
          <RepositoryCacheManager />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={signOut} size="icon" variant="outline">
                <LogOutIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
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

  return <section>{content}</section>;
}
