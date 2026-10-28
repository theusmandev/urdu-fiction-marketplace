# UNB Premium — Deployment & Reverse Proxy Caching Notes

## 1. Overview
UNB Premium runs on a Next.js (Node.js runtime) architecture backed by Supabase PostgreSQL. This document details production edge proxy, CDN, and caching requirements when deploying to Hostinger VPS, Cloudflare, or any fronting reverse proxy.

## 2. Dynamic Palette & ISR Cache Revalidation
The platform features an admin-controlled site appearance palette (`Admin > Settings > Appearance`) with three curated presets:
- **Ivory & Ink** (`ivory_ink`, default)
- **Paper & Teal** (`paper_teal`)
- **Cream & Maroon** (`cream_maroon`)

### Invalidation Architecture
When an administrator updates the site palette:
1. `set_site_palette` updates `platform_settings.site_palette` and writes an audit log.
2. The server action executes:
   - `revalidateTag('site-settings')`
   - `revalidatePath('/', 'layout')`
3. Next.js ISR regenerates cached HTML pages in the background with the new `data-palette` attribute on `<html>` and the matching `<meta name="theme-color">`.

### CDN & Cloudflare Proxy Invariant (CRITICAL)
> [!WARNING]
> **CDN HTML Caching Prohibition**
> Any reverse proxy (Cloudflare, Nginx, Hostinger Cache Manager, or LiteSpeed Cache) placed in front of UNB Premium **MUST NOT** cache HTML responses for SSR/ISR routes without a cache purge mechanism:
> - **Rule**: Set Cloudflare Cache Level to "Standard" (do NOT enable "Cache Everything" on HTML pages without an automated cache purge webhook).
> - **TTL**: If HTML is cached at the edge, edge cache TTL must not exceed 120 seconds, or an automated Cloudflare API purge must be triggered when the site palette changes.
> - **Static Assets**: Static assets (`/_next/static/*`, images, fonts) can be aggressively cached with immutable headers (`Cache-Control: public, max-age=31536000, immutable`).
> - **Theme Switching Delay**: Without edge HTML caching, pages reflect the new palette within seconds. With edge HTML caching, an edge cache purge (`Purge Everything` or purge URLs `/`, `/novels`, etc.) is required.

