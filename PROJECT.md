# Overview

Fast Fashion Simulation is a business simulation game focused on product launch decisions under time, cash, and supply constraints. Players manage the Vintage Revival capsule collection through strategic phases including product design, pricing, procurement, production, logistics, and marketing. The simulation teaches real-world business concepts through gameplay mechanics spanning 15 weeks across different business phases (Strategy, Development, Sales, and Run-out). The application is a **standalone** full-stack app: React frontend, Express backend, **PostgreSQL** for persistence (e.g. **Render** or any host with `DATABASE_URL`), and **session-style identification** for players (see Authentication below).

This repository is **not** tied to Replit. An early prototype was drafted there once; **no Replit services, hosting, or OIDC are used** in this project.

This document summarizes **how the repository is built today**. Product rules and numeric parameters are in [`FFBSG dev prompt.md`](FFBSG%20dev%20prompt.md), including **§6 Implementation deltas** for places the code intentionally differs from or extends the original mega-prompt.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for development/build tooling
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming and responsive design
- **State Management**: TanStack Query (React Query) for server state management and API interactions
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

## Backend Architecture
- **Runtime**: Node.js with Express.js framework using ES modules
- **Database Layer**: Drizzle ORM with **PostgreSQL** (connection string via `DATABASE_URL`; `@neondatabase/serverless` is used when connecting through Neon)
- **Authentication**: See **Authentication & Authorization** below (module path `server/replitAuth.ts` is a **legacy filename only**)
- **Game Engine**: Custom business simulation engine with predefined game constants and mechanics
- **API Design**: RESTful endpoints for game management and simulation operations

## Database Design
- **Users Table**: Stores user records (e.g. pseudo-user per browser session in the default stub — email, names, optional profile image URL)
- **Game Sessions**: Tracks individual game instances with completion status and final scores
- **Weekly States**: Comprehensive game state storage including financial data, inventory, decisions, and performance metrics
- **Sessions / orders log**: Additional tables as defined in `shared/schema.ts` for the production database path

## Authentication & Authorization

**As implemented in this repo** (`server/replitAuth.ts`):

- **No third-party identity provider** is required. `setupAuth` issues an **`sid` HTTP-only cookie**, upserts a lightweight **user row** keyed to that session, and attaches `req.user.claims.sub` for downstream routes.
- **`isAuthenticated`** currently **allows all requests** (middleware passes through). Game APIs are still structured as “protected” for clarity; you can replace this module with real login (e.g. Passport + OIDC of your choice) without changing route shapes.

For production, tighten this layer (validate sessions, add login/logout, rate limiting) as needed for your host.

## Game Engine Architecture
- **Constants System**: Centralized game configuration including product data, supplier information, and business rules (`server/gameEngine.ts` — `GAME_CONSTANTS`; must stay aligned with [`FFBSG dev prompt.md`](FFBSG%20dev%20prompt.md) §4)
- **State Management**: Weekly progression system with decision validation and outcome calculation (`GameEngine.validateWeeklyDecisions`, `GameEngine.commitWeek`)
- **Business Logic**: Supply chain, demand forecasting, pricing elasticity, cash waterfall, staged week-N+1 procurement and marketing payments, holding and interest
- **Phase System**: Four distinct game phases (Strategy, Development, Sales, Run-out) with phase-specific validation rules

## Key API surface (Express)

Authentication middleware wraps protected routes (e.g. `isAuthenticated` in `server/routes.ts`). Representative endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/game/current` | Active game session + latest weekly state for dashboard |
| POST | `/api/game/start` | Start a new game |
| GET | `/api/game/:gameId/week/:weekNumber` | Weekly state row |
| GET | `/api/game/:gameId/weeks` | All weeks + session (analytics, final dashboard) |
| POST | `/api/game/:gameId/week/:weekNumber/update` | Partial updates (procurement, production, **planned marketing lock**, etc.) |
| GET | `/api/game/:gameId/week/:weekNumber/planned-marketing-cap` | **`{ maxPlannedMarketingSpend }`** — liquidity headroom for next week’s locked plan |
| POST | `/api/game/:gameId/week/:weekNumber/validate` | Run validation (uses same pre-commit **marketing clamp** as commit for consistent `canCommit`) |
| POST | `/api/game/:gameId/week/:weekNumber/commit` | Validate (after clamp), optionally persist trimmed `plannedMarketingPlan`, run `commitWeek`, mark committed |
| GET | `/api/game/constants` | Expose `CREDIT_LIMIT` and other constants to the client |

## Frontend dashboard tabs (`client/src/pages/dashboard.tsx`)

Sidebar tabs (not the older “Design & Pricing + Finance” split from the mega-prompt):

1. **Overview** — KPI cards, product portfolio, timeline  
2. **Price Positioning** — RRP / positioning (`pricing.tsx`)  
3. **Design** — Fabrics, print, cost visibility (`design.tsx`)  
4. **Procurement** — GMC and spot orders (**FVC is not implemented** in current UI)  
5. **Production** — Batches, capacity, shipping choice; **partial batches** (below 25k) when materials are insufficient; capacity charges **one full 25k rung** per in-house batch-week  
6. **Inventory** — RM / WIP / FG, in-transit shipments  
7. **Logistics** — Shipping plan; labels use **handoff week** vs **on-shelf week** (transit + stocking week per engine)  
8. **Marketing** — Next-week budget and channel mix; **Apply & lock** subject to **planned-marketing cap**; `marketing-preview` for A/I/demand forecast  
9. **Analytics** — Multi-panel season analytics  

**Commit week** opens `commit-week-modal.tsx` (validates via POST `.../validate`). **Final dashboard** after week 15: `final-dashboard.tsx`.

## Marketing liquidity (implemented)

Commit-time cash validation counts **immediate** week-N production/shipping plus **staged** week-N+1 outflows: procurement due, **planned** `plannedMarketingPlan.totalSpend`, holding on inventory value, interest on credit. The engine exposes **`GameEngine.getMaxAffordablePlannedMarketingSpend`** and **`GameEngine.clampPlannedMarketingToLiquidity`** (proportional channel trim). The commit route **clamps before validate**, persists the trimmed plan if it changed, then runs **`commitWeek`** so players are not blocked by an oversized locked plan from an older save.

## Storage

- **`DATABASE_URL` set**: `DatabaseStorage` (Drizzle + PostgreSQL).  
- **Not set**: in-memory weekly state (development only; not for production persistence).

# External Dependencies

## Database Services
- **PostgreSQL**: Primary persistence; often **Neon** in serverless setups with `@neondatabase/serverless` and `ws` for compatibility

## Authentication

- **None required** for the default in-repo stub beyond the **`sid` cookie** pattern described above. Add **Passport** or another stack only if you introduce external identity providers.

## UI & Styling Libraries
- **Radix UI**: Comprehensive set of accessible, unstyled UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework with custom design system implementation
- **Recharts**: React charting library for analytics and data visualization components
- **Lucide React**: Featherweight SVG icon library for consistent iconography

## Development & Build Tools
- **Vite**: Fast build tool with HMR for development and optimized production builds
- **TypeScript**: Static type checking across frontend and backend code
- **Drizzle Kit**: Database migration and schema management toolkit
- **ESBuild**: Fast JavaScript bundler for server-side code compilation

## Utility Libraries
- **date-fns**: Modern date utility library for time-based calculations and formatting
- **clsx/twMerge**: Conditional CSS class composition utilities for dynamic styling
- **zod**: Runtime type validation for API endpoints and form data validation
