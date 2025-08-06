# Overview

Vintage Revival is a comprehensive business simulation game focused on fast fashion retail operations and project management. Players manage a fashion company through strategic phases including product design, pricing, procurement, production, logistics, and marketing. The simulation teaches real-world business concepts through gameplay mechanics spanning 15 weeks across different business phases (Strategy, Development, Sales, and Run-out). The application features a full-stack architecture with React frontend, Express backend, PostgreSQL database, and Replit authentication integration.

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
- **Database Layer**: Drizzle ORM with Neon PostgreSQL for type-safe database operations
- **Authentication**: Replit OpenID Connect (OIDC) integration with session-based auth
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Game Engine**: Custom business simulation engine with predefined game constants and mechanics
- **API Design**: RESTful endpoints for authentication, game management, and simulation operations

## Database Design
- **Users Table**: Stores user profiles from Replit authentication (email, names, profile images)
- **Game Sessions**: Tracks individual game instances with completion status and final scores
- **Weekly States**: Comprehensive game state storage including financial data, inventory, decisions, and performance metrics
- **Sessions Table**: Authentication session management with automatic expiration

## Authentication & Authorization
- **Provider**: Replit OIDC for seamless integration with Replit environment
- **Session Management**: Express sessions with PostgreSQL storage for persistence
- **Security**: HTTP-only cookies, CSRF protection, and secure session configuration
- **User Flow**: Automatic redirect-based authentication with protected route middleware

## Game Engine Architecture
- **Constants System**: Centralized game configuration including product data, supplier information, and business rules
- **State Management**: Weekly progression system with decision validation and outcome calculation
- **Business Logic**: Realistic simulation of supply chain, demand forecasting, pricing elasticity, and financial performance
- **Phase System**: Four distinct game phases (Strategy, Development, Sales, Run-out) with phase-specific mechanics

# External Dependencies

## Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database with connection pooling via @neondatabase/serverless
- **WebSocket Support**: Real-time database connections using ws library for Neon compatibility

## Authentication Services
- **Replit OIDC**: OAuth 2.0/OpenID Connect integration for user authentication
- **Passport.js**: Authentication middleware with OpenID Connect strategy for session management

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