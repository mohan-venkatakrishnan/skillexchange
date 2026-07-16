/* Per-route SEO for an SPA. Every route ships the SAME index.html, so without
   this Google sees one title/description for the whole site — and can't tell
   Marketplace from Publish from a skill page, which is exactly what it needs
   to distinguish before it will offer any of them as a sitelink.

   Google's renderer executes our JS and reads the document.title / meta it
   finds AFTER hydration, so setting these on navigation is enough — no SSR
   needed for this. We update title, description, canonical, and the og/twitter
   pair, and optionally inject a page-specific JSON-LD block. */

import { useEffect } from 'react';

const ORIGIN = 'https://skillexchange.tapdot.org';
const SUFFIX = ' · Skill Exchange';
const DEFAULT_DESC = 'The GitHub for AI skills — buy and sell reusable workflows that power real products.';
const DEFAULT_IMG = `${ORIGIN}/og-image.png`;

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!value) { if (el && el.dataset.seo) el.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    const [, key] = selector.match(/\[(?:name|property)="(.+)"\]/) || [];
    el.setAttribute(selector.includes('property=') ? 'property' : 'name', key);
    el.dataset.seo = '1';
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
  el.href = href;
}

function setJsonLd(obj) {
  document.querySelectorAll('script[data-seo-jsonld]').forEach(n => n.remove());
  if (!obj) return;
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.dataset.seoJsonld = '1';
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
}

/**
 * @param {object} o
 * @param {string} o.title  page title (brand suffix appended unless `raw`)
 * @param {string} [o.description]
 * @param {string} [o.path]   canonical path, e.g. "/marketplace"
 * @param {string} [o.image]
 * @param {boolean} [o.raw]   don't append the brand suffix
 * @param {object} [o.jsonLd] page-specific structured data
 * @param {boolean} [o.noindex] mark thin/duplicate routes noindex
 * @param {any[]} [deps]
 */
export default function useSeo(o = {}, deps = []) {
  useEffect(() => {
    const title = o.title ? (o.raw ? o.title : o.title + SUFFIX) : 'Skill Exchange — Where AI builders share their edge';
    const desc = o.description || DEFAULT_DESC;
    const url = ORIGIN + (o.path || (typeof window !== 'undefined' ? window.location.pathname : '/'));
    const img = o.image || DEFAULT_IMG;

    const prevTitle = document.title;
    document.title = title;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[name="twitter:image"]', 'content', img);
    setMeta('meta[name="robots"]', 'content', o.noindex ? 'noindex, follow' : 'index, follow');
    setCanonical(url);
    setJsonLd(o.jsonLd || null);

    return () => { document.title = prevTitle; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export { ORIGIN };
