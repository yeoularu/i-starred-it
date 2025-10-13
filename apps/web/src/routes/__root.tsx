import type { AppRouterClient } from "@i-starred-it/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import Header from "@/components/header";
import Loader from "@/components/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { link, type orpc } from "@/utils/orpc";
import "../index.css";

export type RouterAppContext = {
  orpc: typeof orpc;
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "I Starred It",
      },
      {
        name: "description",
        content:
          "I starred it, but I can't find it. Search your GitHub starred repositories using natural language queries powered by AI.",
      },
      {
        name: "keywords",
        content:
          "github, starred repositories, search, AI, natural language, repository search, github stars",
      },
      {
        name: "author",
        content: "yeoularu",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      // Open Graph
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:title",
        content: "I Starred It - AI-Powered GitHub Stars Search",
      },
      {
        property: "og:description",
        content:
          "I starred it, but I can't find it. Search your GitHub starred repositories using natural language queries powered by AI.",
      },
      {
        property: "og:site_name",
        content: "I Starred It",
      },
      {
        property: "og:locale",
        content: "en_US",
      },
      {
        property: "og:image",
        content: "/logo.png",
      },
      {
        property: "og:image:alt",
        content: "I Starred It logo",
      },
      // Twitter Card
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "I Starred It - AI-Powered GitHub Stars Search",
      },
      {
        name: "twitter:description",
        content:
          "I starred it, but I can't find it. Search your GitHub starred repositories using natural language queries powered by AI.",
      },
      {
        name: "twitter:image",
        content: "/logo.png",
      },
      {
        name: "twitter:image:alt",
        content: "I Starred It logo",
      },
      // Theme
      {
        name: "theme-color",
        content: "#0c0c0c",
      },
      {
        name: "color-scheme",
        content: "dark light",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "canonical",
        href: typeof window !== "undefined" ? window.location.origin : "",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "I Starred It",
          description:
            "AI-powered search engine for GitHub starred repositories. Search through your stars using natural language queries.",
          url: typeof window !== "undefined" ? window.location.origin : "",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web Browser",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          featureList: [
            "AI-powered natural language search",
            "BM25 ranking algorithm",
            "Search across repository names, descriptions, and READMEs",
            "GitHub OAuth authentication",
            "Search history management",
          ],
        }),
      },
    ],
  }),
});

function RootComponent() {
  const isFetching = useRouterState({
    select: (s) => s.isLoading,
  });

  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [_orpcUtils] = useState(() => createTanstackQueryUtils(client));

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          {isFetching ? <Loader /> : <Outlet />}
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
    </>
  );
}
