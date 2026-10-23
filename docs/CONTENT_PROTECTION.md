# Content Protection & Anti-Scraping Architecture

## 1. Executive Philosophy & Honest Guarantees
In web applications, **any content delivered to a user's browser can technically be captured, screenshotted, or extracted via browser developer tools or network sniffers**. Attempting to build an unbreakable digital rights management (DRM) sandbox in standard web browsers is technically impossible and often counterproductive.

The UNB Fiction Marketplace implements **defense-in-depth authorization on the server** paired with **honest, non-invasive client-side deterrents against casual copying, unauthorized printing, and bulk exfiltration**.

---

## 2. What IS Protected (Server & Database Guarantees)

### A. Zero Unauthenticated or Non-Entitled Delivery
- **Strict Server Gating**: Paid chapter content (`content_urdu`) is NEVER accessible through public endpoints, ISR caches, static site generation, or public novel metadata APIs.
- **Atomic Security Gate (`get_chapter_for_reader`)**: Every chapter retrieval executes a PostgreSQL `SECURITY DEFINER` RPC (`get_chapter_for_reader`) operating under `SET search_path = ''`.
- **Authorization Invariant**: Paid chapter text is returned ONLY if:
  1. The caller holds an active, non-revoked `purchase_entitlement` for that novel (granted strictly by `verify_order_payment` or `admin_force_verify`).
  2. The caller is the novel's authenticated author.
  3. The caller is a platform administrator (`role = 'admin'`).
  4. The chapter is marked `is_free_preview = true` AND the novel is published.
- **Uniform Information Hiding**: In all denied access cases (whether the chapter does not exist, is in draft, or belongs to a novel the reader hasn't bought), the RPC raises the identical generic exception:
  ```text
  'Chapter not found'
  ```
  The server never discloses novel existence, chapter titles, prices, or author identities to unauthorized callers.
- **Row-Level Security (RLS)**: Direct `SELECT` on `chapters` by non-entitled readers yields zero rows for paid chapters.
- **Sliding-Window Rate Limiting**: Entitled readers are rate-limited via `chapter_reads` (configurable in `platform_settings`, default: 20 distinct chapters per 10-minute sliding window). Scripted scraping by compromised reader accounts raises:
  ```text
  'Too many chapters opened, please slow down'
  ```
- **Audit-Logged Admin Moderation**: Platform admins can inspect and moderate orders and novels, but reader emails are strictly omitted from order inspection payloads to preserve reader privacy.

---

## 3. What Client-Side Deterrents ARE Implemented

The secure web reader at `/read/[slug]/[number]` implements layer-4 friction against casual piracy:

| Mechanism | Implementation | Threat Deterred | Limitations |
| :--- | :--- | :--- | :--- |
| **Dynamic Anti-Caching Headers** | `Cache-Control: private, no-store, must-revalidate`<br>`X-Robots-Tag: noindex, nofollow` | CDN/proxy caching, search engine crawler indexing | Local browser memory during active session |
| **Robots Exclusion** | `robots.ts` explicitly disallows `/read` and `/read/` | Search engines, web spiders | Rogue scrapers ignoring `robots.txt` |
| **CSS Watermark Overlay** | Repeating diagonal overlay showing reader order number (e.g. `UNB-20261023-ABCD`) + reader short hash | Casual screenshots, social media photo leakage, redistributed screenshots | Advanced users inspecting DOM or removing CSS layer |
| **Text Selection Disabled** | `select-none` (`user-select: none; -webkit-user-select: none;`) | Simple highlight-and-copy actions (`Ctrl+C`) | Browser developer tools DOM inspection |
| **Context Menu & Drag Disabled** | `onContextMenu={(e) => e.preventDefault()}`<br>`onDragStart={(e) => e.preventDefault()}` | Right-click "Save As", "Inspect Element" shortcut clicks, dragging text | Inspecting via F12 or browser menu bar |
| **Print Masking** | `@media print { .chapter-secure-content { display: none !important; } }` | "Print to PDF", physical printouts | Screen capture software, DevTools print emulation |
| **No PDF / EPUB Export** | No download buttons or client-side PDF generators | Bulk offline export | External screen recording |

---

## 4. What is Deliberately NOT Done (And Why)

### A. No Invisible / Zero-Width Characters in Text
- **Decision**: We strictly avoid injecting zero-width spaces (`\u200B`), soft hyphens (`\u00AD`), or hidden steganographic character sequences into the novel text body.
- **Rationale**: Urdu typography relies fundamentally on cursive **Nastaliq ligature shaping**. In Nastaliq (e.g., *Noto Nastaliq Urdu*), character glyphs join dynamically based on neighboring code points. Injecting zero-width or invisible Unicode characters fractures ligatures, resulting in broken, disjointed, illegible text that degrades the reading experience for legitimate buyers.

### B. No Obfuscated JavaScript Binary Canvas Decoders
- **Decision**: Content is rendered as accessible, clean HTML typography within a styled reader container rather than rendered onto an opaque HTML5 Canvas or WebGL buffer.
- **Rationale**: Canvas-based readers ruin font clarity, break mobile responsiveness, eliminate pinch-to-zoom accessibility for visually impaired readers, and dramatically increase memory consumption on low-end Android mobile devices common in Pakistan.

### C. No Claims of "Uncopyable" or "DRM-Proof" Web Text
- **Decision**: We transparently document that client-side deterrence is an inconvenience to pirates, not an absolute cryptographic lock.
- **Rationale**: Any text transmitted to a client can be read by accessibility tools, browser extensions, or screen capture software. The true business safeguard lies in **direct-to-writer community support, affordable pricing, and rapid sliding-window rate limiting on the database**.
