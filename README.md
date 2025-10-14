# I Starred It

**but I can't find it.** 🔍

AI-powered search engine for GitHub starred repositories. Find what you need with natural language queries.

## Features

- 🤖 **AI Keyword Generation** - Cloudflare Workers AI converts natural language to search keywords
- 🔍 **BM25 Search** - Client-side ranking across repo names, descriptions, and READMEs

## Tech Stack

**Frontend**: React 19, TanStack Router, TanStack Query, Vite, TailwindCSS 4, shadcn/ui  
**Backend**: Hono, ORPC, Cloudflare Workers AI, D1 (SQLite), Drizzle ORM  
**Auth**: better-auth with GitHub OAuth  
**Monorepo**: Turborepo, TypeScript, Biome

## Architecture

```
apps/web     → Frontend (React 19, TanStack Router/Query)
apps/server  → Backend (Hono on Cloudflare Workers)
packages/api → Business logic (ORPC routers, services)
packages/auth→ better-auth config
packages/db  → Drizzle schema & migrations
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 10+
- GitHub OAuth App credentials
- Cloudflare account (for deployment)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/i-starred-it.git  # Repository name
cd i-starred-it
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

**`apps/server/.env`**:

```env
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**`apps/web/.env`**:

```env
VITE_SERVER_URL=http://localhost:3000
```

4. Database & Start:

```bash
pnpm db:generate        # Generate migrations
pnpm db:migrate:local   # Apply to local D1
pnpm dev                # Start dev servers (web:3001, api:3000)
```

## License

MIT

---

Scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack)
