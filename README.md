# ai.market frontend

The customer marketplace web app uses Next.js App Router, React, TypeScript and Tailwind CSS. Application routes are in `app/`; shared UI is in `components/`; API clients are in `api/`; Zustand session state is in `store/auth.ts`. Vitest uses the Vite React plugin for tests; the application development and production commands use Next.js.

## Local development

Local checks and frontend CI use Node.js 22; the committed Railway/Nixpacks build selects Node.js 20. Both use the npm lockfile. From this repository:

```sh
npm ci
npm run dev
```

The default Next.js development address is `http://localhost:3000`. The browser API client defaults to `http://localhost:8000/api/v1`. For another backend, set `NEXT_PUBLIC_API_URL` to its origin (without `/api/v1`) in a local environment file, such as `.env.local`. `API_URL` is the server-side fallback for the rewrites in `next.config.ts`.

`NEXT_PUBLIC_*` values enter the browser bundle; keep private credentials out of them. In production, the frontend API origin is `https://api.ai.market` so the browser refresh cookie stays on the same site. Next.js inlines the public value during the build, so changing that value requires a rebuild.

## Existing checks and production commands

Production builds select Keystatic GitHub storage and need the variables listed in `.env.example`: `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET` and `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`. Use the existing secret-management guide below for real configuration; keep private values in local/server environment configuration and out of source control and `NEXT_PUBLIC_*`. Development selects local Keystatic storage. A build without its required configuration can fail while collecting the Keystatic API route.

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm start
```

`npm start` serves the built application. `nixpacks.toml` runs `npm ci` and `npm run build`, then starts it with `npm start`. Railway deploys the main branch; deployment and browser acceptance guidance lives in the existing runbooks below.

## Operating guides

- [Marketplace frontend](https://github.com/aidotmarket/runbooks/blob/main/ai-market-frontend.md): deployment, routes and customer issue diagnosis.
- [Browser session authentication](https://github.com/aidotmarket/runbooks/blob/main/browser-session-auth.md): same-site API configuration and reload verification.
- [Secret management](https://github.com/aidotmarket/runbooks/blob/main/infisical-secrets.md): existing credential setup and ownership.

This setup description was compared with the committed package scripts, API client, Next.js configuration and Nixpacks configuration in S1799 (2026-10-11). It is source evidence, not a new successful build or live browser verification.
