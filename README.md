# MBIQ — Portfolio Intelligence Platform

A comprehensive stock portfolio tracker and earnings call analysis tool built with React, Supabase, and AI-powered transcript analysis.

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Postgres, Edge Functions, RLS)
- **Charts**: Recharts
- **State**: TanStack React Query

---

## Local Development Setup

### Prerequisites

- [Node.js](https://github.com/nvm-sh/nvm#installing-and-updating) (v18+)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`npm install -g supabase`)
- [Docker](https://docs.docker.com/get-docker/) (required for local Supabase)

### 1. Clone & Install

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
```

### 2. Start Local Supabase

This will spin up a local Postgres database and apply all migrations from `supabase/migrations/`:

```sh
supabase start
```

After starting, the CLI will output local credentials:

```
API URL:    http://127.0.0.1:54321
anon key:   eyJhbGci...
service_role key: eyJhbGci...
DB URL:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### 3. Configure Environment

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_key_from_supabase_start>
```

### 4. Configure Edge Function Secrets

Edge functions need secrets to operate. Set them for local development:

```sh
# Required for edge functions to access the database
supabase secrets set SUPABASE_URL=http://127.0.0.1:54321
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_start>

# Required for Screener.in financial data scraping
supabase secrets set SCREENER_SESSION_ID=<your_screener_session_cookie>
supabase secrets set SCREENER_CSRF_TOKEN=<your_screener_csrf_token>

# Optional: Alpha Vantage for additional financial data
supabase secrets set ALPHA_VANTAGE_API_KEY=<your_key>
```

#### How to get Screener.in credentials:
1. Go to [screener.in](https://www.screener.in/) and log in
2. Open browser DevTools → Application → Cookies
3. Copy the values of `sessionid` and `csrftoken`

### 5. Serve Edge Functions Locally

In a separate terminal:

```sh
supabase functions serve
```

### 6. Start the Frontend

```sh
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Project Structure

```
├── src/
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks (useStocks, useFinancials, etc.)
│   ├── integrations/     # Auto-generated Supabase client & types
│   ├── lib/              # Utilities, signals detection, types
│   └── pages/            # Route pages (Index, StocksPage, StockDetailPage, etc.)
├── supabase/
│   ├── config.toml       # Supabase project config
│   ├── migrations/       # Database migrations (auto-applied on `supabase start`)
│   └── functions/        # Edge functions
│       ├── fetch-price/          # Yahoo Finance price fetcher
│       ├── fetch-financials/     # Screener.in financial data scraper
│       ├── fetch-deals/          # Bulk/insider deal fetcher
│       ├── fetch-sector-indices/ # Nifty sector index tracker
│       ├── fetch-results-calendar/ # Upcoming results date fetcher
│       ├── refresh-all-prices/   # Batch price refresh
│       ├── refresh-all-financials/ # Batch financials refresh
│       └── analyze-transcript/   # AI transcript analysis
```

## Key Features

- **Auto-import on stock add**: Price + financials fetched automatically
- **3Y price backfill**: Historical daily prices from Yahoo Finance
- **Earnings call analysis**: Paste transcripts → AI extracts signals, promises, thesis drift
- **Multibagger signal detection**: Automated scoring based on financials, shareholding, management credibility
- **Thesis tracking**: Track investment thesis drift across quarters
- **Sector indices**: Nifty sector performance comparison

## Database

All tables have RLS enabled. Migrations in `supabase/migrations/` are applied automatically when you run `supabase start`. Key tables:

| Table | Purpose |
|-------|---------|
| `stocks` | Portfolio stocks with thesis & tracking config |
| `prices` | Daily price history |
| `financial_metrics` | Annual financial data (ROCE, ROE, etc.) |
| `financial_results` | Quarterly results |
| `shareholding` | Quarterly shareholding pattern |
| `peer_comparison` | Peer company metrics |
| `transcript_analysis` | AI-analyzed earnings call data |
| `quarterly_snapshots` | V5 quarterly thesis snapshots |
| `management_promises` | Tracked management commitments |
| `bulk_deals` / `insider_trades` | Deal activity |
| `sector_indices` | Nifty sector index prices |

## Useful Commands

```sh
supabase start          # Start local Supabase (applies migrations)
supabase stop           # Stop local Supabase
supabase db reset       # Reset DB and re-apply all migrations
supabase functions serve # Serve edge functions locally
npm run dev             # Start frontend dev server
npm run build           # Production build
```

## Deployment

The app is deployed via [Lovable](https://lovable.dev). Click **Publish** in the editor to deploy.

Edge functions deploy automatically on code changes. Frontend requires clicking **Update** in the publish dialog.
