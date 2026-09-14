# Kitzon staging deployment

## Services

- `kitzon-api`: Render web service created from `render.yaml`.
- `kitzon-dashboard`: Cloudflare Pages project for `dashboard`.
- `kitzon-kiosk`: Cloudflare Pages project for `kiosk-app`, protected with Cloudflare Access before it is used outside testing.
- `kitzon-landing`: public Cloudflare Pages project for `landing-page`.
- Supabase: database, authentication, and row-level security.

## Render environment

Set these only in Render. Never commit their real values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CORS_ORIGINS=https://kitzon-dashboard.pages.dev,https://kitzon-kiosk.pages.dev,https://kitzon-landing.pages.dev`
- `AUTH_INVITE_REDIRECT_URL=https://kitzon-dashboard.pages.dev/accept-invite`

The build explicitly installs development dependencies because TypeScript is compiled on Render before the production server starts. The health check is `/health/ready` and the API base URL is expected to be `https://kitzon-api.onrender.com/api/v1` while the service name is available.

## Cloudflare Pages builds

Create three projects from the same GitHub repository.

### Landing page

- Root directory: `/`
- Build command: `npm ci && npm run build --workspace landing-page`
- Build output directory: `landing-page/dist`
- Node version: `22`
- Environment: `VITE_API_BASE_URL=https://kitzon-api.onrender.com`

### Dashboard

- Root directory: `/`
- Build command: `npm ci && npm run build --workspace dashboard`
- Build output directory: `dashboard/dist`
- Node version: `22`
- Environment: `VITE_API_BASE_URL`, `VITE_AUTH_MODE=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`

### Kiosk

- Root directory: `/`
- Build command: `npm ci && npm run build --workspace kiosk-app`
- Build output directory: `kiosk-app/dist`
- Node version: `22`
- Environment: `VITE_API_BASE_URL`, `VITE_SCALE_ID`, and a provisioned `VITE_DEVICE_TOKEN`

The kiosk build contains a device credential, so do not expose its Pages address publicly. For production, provision one credential per physical device and protect the deployment with Cloudflare Access or package the kiosk as a managed local application.

## Supabase Auth URLs

Keep the local redirect for development, then add the exact staging redirect:

- Site URL: `https://kitzon-dashboard.pages.dev`
- Redirect URL: `https://kitzon-dashboard.pages.dev/accept-invite`
- Local redirect: `http://localhost:5173/accept-invite`

Replace the Pages addresses with `kitzon.app` subdomains when the domain is connected.
