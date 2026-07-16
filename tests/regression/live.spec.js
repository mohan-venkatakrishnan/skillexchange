import { test, expect } from '@playwright/test';

// Live regression vs a DEPLOYED environment. Runs as the release gate on
// every deploy and nightly. Sentinel tests encode bug CLASSES, not features.

const PAGES = ['/', '/marketplace', '/leaderboard', '/create', '/verify'];

test.describe('Route health', () => {
  for (const path of PAGES) {
    test(`${path} returns real HTTP 200 (not SPA-fallback 404)`, async ({ request, baseURL }) => {
      const res = await request.get(`${baseURL}${path}`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  test('robots.txt and sitemap.xml are served and wired', async ({ request, baseURL }) => {
    const robots = await request.get(baseURL + '/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap: https://skillexchange.tapdot.org/sitemap.xml');

    const sitemap = await request.get(baseURL + '/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain('<urlset');
    expect(xml).toContain('/marketplace</loc>');
    expect(xml, 'sitemap must list real skill pages, not just static routes').toMatch(/\/skills\/[^<]+<\/loc>/);
  });

  test('sitelinks search-box structured data is present', async ({ page }) => {
    await page.goto('/');
    const joined = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
    expect(joined).toContain('WebSite');
    expect(joined).toContain('SearchAction');
    expect(joined).toContain('search_term_string');
  });

  test('routes carry distinct titles (per-route SEO)', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page).toHaveTitle(/Browse skills/);
    await page.goto('/leaderboard');
    await expect(page).toHaveTitle(/Leaderboard/);
    await page.goto('/');
    await expect(page).toHaveTitle(/Where AI builders/);
  });

  // Headers must be asserted on the encodings a real browser negotiates, not
  // just the identity one. CloudFront caches per Accept-Encoding (vary), so a
  // brotli copy can be pinned WITHOUT the custom headers while an
  // uncompressed `curl -I` still looks perfectly fine — which is exactly how
  // this shipped to production once.
  for (const enc of ['gzip, deflate, br', 'gzip', 'identity']) {
    test(`security headers are present [Accept-Encoding: ${enc}]`, async ({ request, baseURL }) => {
      const res = await request.get(baseURL + '/', { headers: { 'Accept-Encoding': enc } });
      const h = res.headers();
      expect(h['strict-transport-security'], 'HSTS').toContain('max-age');
      expect(h['x-content-type-options'], 'nosniff').toBe('nosniff');
      expect(h['x-frame-options'], 'clickjacking').toBe('DENY');
      expect(h['content-security-policy'], 'CSP').toContain("default-src 'self'");
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  }

  test('the HTML document is never cached by the CDN', async ({ request, baseURL }) => {
    // index.html points at the hashed bundle; a long-lived s-maxage on it
    // pins an old build (and its headers) at the edge.
    const res = await request.get(baseURL + '/', { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
    const cc = res.headers()['cache-control'] || '';
    expect(cc, `document Cache-Control was "${cc}"`).toMatch(/no-cache|no-store|max-age=0/);
    expect(cc).not.toMatch(/s-maxage=\d{4,}/);
  });
});

test.describe('Pages render real content', () => {
  test('home renders hero and live stats bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Where AI builders' })).toBeVisible();
    await expect(page.getByText('Skills Published')).toBeVisible();
  });

  test('marketplace loads skills from the live API (no error, no eternal spinner)', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Couldn't reach Skill Exchange")).toHaveCount(0);
  });

  test('leaderboard loads without error', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0, { timeout: 15_000 });
  });

  test('create-a-skill prompt generator works fully client-side', async ({ page }) => {
    await page.goto('/create');
    await page.getByTestId('generate-prompt').click();
    await expect(page.locator('pre')).toContainText('SKILL.md');
  });
});

test.describe('Responsive sentinel', () => {
  test('zero horizontal overflow at 390px phone width', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });

  test('mobile hamburger menu opens and navigates', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByLabel('Menu').click();
    await page.getByRole('button', { name: 'Marketplace' }).click();
    await expect(page).toHaveURL(/marketplace/);
    await ctx.close();
  });

  test('sticky topbar survives scroll', async ({ page }) => {
    await page.goto('/marketplace');
    await page.evaluate(() => window.scrollTo(0, 1500));
    const nav = page.locator('nav');
    const box = await nav.boundingBox();
    expect(box.y).toBe(0);
  });
});

test.describe('API contract sentinels', () => {
  // VITE_API_URL is baked into the bundle; recover it from the page itself.
  async function apiUrl(page) {
    await page.goto('/marketplace');
    const req = await page.waitForRequest(r => r.url().includes('/skills'), { timeout: 15_000 });
    return new URL(req.url()).origin + new URL(req.url()).pathname.replace(/\/skills.*/, '');
  }

  test('authenticated endpoints reject unauthenticated calls', async ({ page, request }) => {
    const base = await apiUrl(page);
    for (const path of ['/me', '/library']) {
      const res = await request.get(base + path);
      expect([401, 403], `${path} must reject anon`).toContain(res.status());
    }
    const res = await request.post(base + '/skills', { data: { title: 'x' } });
    expect([401, 403]).toContain(res.status());
  });

  test('webhook rejects unsigned payloads', async ({ page, request }) => {
    const base = await apiUrl(page);
    const res = await request.post(base + '/webhook/razorpay', {
      data: { event: 'payment.captured', payload: {} },
    });
    expect([400, 401]).toContain(res.status());
  });

  test('superadmin endpoints reject wrong credentials', async ({ page, request }) => {
    const base = await apiUrl(page);
    const res = await request.get(base + '/admin/queue', {
      headers: { 'X-Superadmin-Username': 'wrong', 'X-Superadmin-Password': 'wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('username-check validates format and answers availability', async ({ page, request }) => {
    const base = await apiUrl(page);
    const bad = await request.get(base + '/username-check?u=X!');
    expect(bad.status()).toBe(400);
    const good = await request.get(base + '/username-check?u=definitely_free_name_42');
    expect(good.status()).toBe(200);
    expect((await good.json()).available).toBe(true);
  });
});

// Full auth + library round-trip using the CI test user (QA auto-confirms
// signups, so this is deterministic). Requires TEST_USER_* env vars.
test.describe('Authenticated flow', () => {
  test.skip(!process.env.TEST_USER_EMAIL, 'TEST_USER_EMAIL not set');

  test('sign in → library loads → profile shows username → sign out', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-signin').click();
    await page.getByTestId('auth-email').fill(process.env.TEST_USER_EMAIL);
    await page.getByTestId('auth-password').fill(process.env.TEST_USER_PASSWORD);
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('nav-user')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'My Library' }).click();
    await expect(page.getByRole('heading', { name: 'My Library' })).toBeVisible();

    await page.getByTestId('nav-user').click();
    await page.getByTestId('account-btn').click();
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('nav-signin')).toBeVisible();
  });
});
