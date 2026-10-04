# SnapSignFit SEO Release Gates Checklist

This checklist corresponds to the **R1–R20 Risk Register and Release Gates** defined in `masterpiece-seo.md`. Run `npm run check` or `node build-seo.js` to execute automated validation.

---

### Release Gates Summary

- [x] **R1: Keyword Stuffing Prevention**
  - Keywords reside in `keywords.csv` only.
  - No comma-separated chip lists or `<code>` blocks.
  - "Also searched as" line is natural and limited to $\le 2$ lines.

- [x] **R2: Hidden Text / Cloaking Prevention**
  - Zero `display:none`, `visibility:hidden`, or off-screen keyword text.
  - Static HTML identical across crawlers and users.

- [x] **R3: Unique Content & Value**
  - Each page generated from distinct `pages.json` data with $\ge 300$ unique words.
  - Zero duplicate titles, H1s, or meta descriptions.

- [x] **R4: Government Specs Verification Age**
  - All 13 intent specifications include `source_url` and `verified_on`.
  - Build fails if specification verification date is older than 180 days.

- [x] **R5: Native Bangla Copy Review**
  - All Bangla translations verified with `"bn_reviewed": true`.
  - Shorter string lengths prevent Cumulative Layout Shifts (CLS).

- [x] **R6: Structured Data Validation**
  - JSON-LD schemas generated from matching visible text arrays:
    - `BreadcrumbList`
    - `WebApplication` (Free, BDT 0)
    - `HowTo` (Step-by-step instructions)
    - `FAQPage` (Real questions and answers)

- [x] **R7: Canonical & Reciprocal hreflang**
  - Reciprocal alternate links for `en`, `bn`, `en-BD`, `bn-BD`, and `x-default`.
  - Strict self-referencing canonical URLs with trailing slashes.

- [x] **R8: Static Non-JS Content Indexability**
  - Title, H1, spec table, step instructions, and FAQs present in raw HTML before JavaScript runs.

- [x] **R9: Safe Service Worker Caching**
  - HTML is **network-first**; static assets are **cache-first**.
  - No interception of `sitemap.xml`, `robots.txt`, or IndexNow keys.

- [x] **R10: Zero Third-Party Requests & Strict CSP**
  - Content Security Policy: `default-src 'self'`.
  - Zero tracking beacons, zero external analytics.

- [x] **R11: Core Web Vitals Performance**
  - Fast static delivery: LCP $< 2.0\text{s}$, INP $< 200\text{ms}$, CLS $< 0.1$.

- [x] **R12: Internal Link Graph Integrity**
  - Zero 404 links. Every intent page has $\ge 3$ inbound related links.

- [x] **R13: Robots & Search Indexing Directives**
  - `robots.txt` enables crawling on all indexable pages and points directly to `sitemap.xml`.

- [x] **R14: Legal Non-Affiliation Disclaimer**
  - Visible disclaimer in footer of every page: *"Not affiliated with Teletalk, BPSC, DUET, or any government body."*

- [x] **R20: Client-Side Privacy Guarantee**
  - All image processing executes strictly within the user's browser memory.
