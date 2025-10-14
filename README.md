# I Starred It

A powerful AI-powered search engine for your GitHub starred repositories. Search through your stars using natural language queries and find exactly what you're looking for.

## Overview

**I Starred It** helps you rediscover and search through your GitHub starred repositories efficiently. Instead of manually browsing through hundreds of stars, simply describe what you're looking for in natural language, and the AI will generate optimized search keywords to find relevant repositories.

### Key Features

- 🤖 **AI-Powered Search**: Converts natural language queries into optimized search keywords using Cloudflare Workers AI
- 🔍 **BM25 Algorithm**: Fast and accurate client-side search using BM25 ranking algorithm
- 📚 **Deep Indexing**: Searches across repository names, descriptions, owners, and README files
- 📝 **Search History**: Automatically saves and manages your search history
- 🔒 **Secure Authentication**: GitHub OAuth integration via better-auth
- ⚡ **Rate Limiting**: Daily search limit (20 searches per day) to manage AI usage
- 🎨 **Modern UI**: Beautiful, responsive interface built with React and shadcn/ui

## How It Works

1. **Authenticate**: Sign in with your GitHub account
2. **Fetch Stars**: Your starred repositories are automatically fetched and indexed
3. **Natural Language Search**: Type queries like "python web framework" or "react component library"
4. **AI Processing**: The AI converts your query into optimized search keywords
5. **BM25 Search**: Client-side search engine ranks repositories by relevance
6. **View Results**: Browse through ranked results with highlighted matches

## Tech Stack

### Frontend

- **React 19** - Modern React with concurrent features
- **TanStack Router** - Type-safe file-based routing
- **Vite** - Fast build tool and dev server
- **TailwindCSS 4** - Utility-first styling
- **shadcn/ui** - High-quality UI components
- **Motion** - Smooth animations

### Backend

- **Hono** - Lightweight edge framework
- **oRPC** - End-to-end type-safe APIs
- **Cloudflare Workers** - Serverless edge runtime
- **Cloudflare Workers AI** - AI keyword generation
- **Drizzle ORM** - Type-safe database queries
- **Cloudflare D1** - SQLite at the edge

### Auth & Database

- **better-auth** - Modern authentication
- **GitHub OAuth** - Social authentication
- **D1 (SQLite)** - Serverless database

### Development

- **Turborepo** - High-performance monorepo
- **TypeScript** - Full type safety
- **Biome** - Fast linting and formatting
- **Husky** - Git hooks

## Project Structure

```
i-starred-it/
├── apps/
│   ├── web/              # Frontend application
│   │   ├── src/
│   │   │   ├── features/ # Feature-based modules
│   │   │   │   ├── search/  # Search functionality
│   │   │   │   └── github/  # GitHub integration
│   │   │   ├── components/  # Reusable UI components
│   │   │   └── routes/      # Application routes
│   │   └── package.json
│   └── server/           # Backend API
│       ├── src/
│       │   └── index.ts  # Hono server entry
│       └── package.json
├── packages/
│   ├── api/              # Business logic & services
│   │   └── src/
│   │       ├── routers/     # API endpoints
│   │       └── services/    # Core services (GitHub, Search)
│   ├── auth/             # Authentication configuration
│   └── db/               # Database schema & migrations
└── package.json
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

4. Set up the database:

```bash
pnpm db:push
```

5. Start the development servers:

```bash
pnpm dev
```

The web app will be available at [http://localhost:3001](http://localhost:3001)  
The API server will run at [http://localhost:3000](http://localhost:3000)

## Available Scripts

### Root Level

- `pnpm dev` - Start all applications in development mode
- `pnpm build` - Build all applications
- `pnpm check` - Run Biome linter and formatter
- `pnpm check-types` - Type check all packages
- `pnpm db:push` - Apply schema changes to database
- `pnpm db:studio` - Open Drizzle Studio
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate` - Run database migrations

### Web App

- `pnpm dev:web` - Start only the web application

### Server

- `pnpm dev:server` - Start only the server
- `cd apps/server && pnpm db:migrate:local` - Run migrations on local D1

### Important Configuration

In `apps/server/src/lib/auth.ts`, uncomment the `session.cookieCache` and `advanced.crossSubDomainCookies` sections for production deployments to ensure proper cookie handling across domains.

## Features in Detail

### AI-Powered Keyword Generation

The application uses Cloudflare Workers AI to convert natural language queries into search-optimized keywords. The AI model analyzes your query and generates keywords that work well with the BM25 ranking algorithm.

### BM25 Search Engine

A client-side implementation of the BM25 (Best Matching 25) algorithm provides fast, accurate search results. The engine indexes repository metadata including:

- Repository owner
- Repository name
- Description
- README content

Field weights are tuned to prioritize repository names while still considering descriptions and README content.

### Search History Management

All searches are persisted to the database with:

- Original query
- Generated keywords
- Timestamp
- Soft delete capability

### Rate Limiting

To manage AI usage costs, the application implements a daily search limit:

- 20 searches per user per day (UTC)
- Counter resets at UTC midnight
- Clear feedback when limit is reached

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for your own purposes.

## Acknowledgments

- Scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack)
