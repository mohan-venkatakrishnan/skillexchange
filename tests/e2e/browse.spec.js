import { test, expect } from '@playwright/test';

// Mock-mode e2e: full browse flows against deterministic prototype data.

test.describe('Home', () => {
  test('hero, stats, how-it-works, featured, categories and builders all render', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Where AI builders/ })).toBeVisible();
    await expect(page.getByText('Skills published')).toBeVisible();

    // The "how the exchange works" explainer is the reason the page exists.
    await expect(page.getByRole('heading', { name: 'From your project to a sale' })).toBeVisible();
    await expect(page.getByText("Proof or it doesn't list")).toBeVisible();
    await expect(page.getByText("If you're buying")).toBeVisible();
    await expect(page.getByText("If you're selling")).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Hand-picked skills' })).toBeVisible();
    await expect(page.locator('[data-testid="skill-card"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Document/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top builders' })).toBeVisible();
  });

  test('hero is centred, not full-viewport', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('section').first();
    const box = await hero.boundingBox();
    const vh = page.viewportSize().height;
    // 70vh + padding — must leave the fold, so the stats bar peeks through.
    expect(box.height).toBeLessThan(vh);
  });

  test('category tile navigates to a filtered marketplace', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Document/ }).click();
    await expect(page).toHaveURL(/marketplace\?cat=Document/);
    await expect(page.getByTestId('results-count')).toContainText('in Document');
  });
});

test.describe('Marketplace', () => {
  test('search filters results and is reflected in the URL', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('results-count')).toContainText('6 skills');
    await page.getByTestId('marketplace-search').fill('PDF');
    await expect(page).toHaveURL(/q=PDF/);
    await expect(page.getByTestId('results-count')).toContainText('1 skill');
  });

  test('category rail filters and shows per-category counts', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: /^Marketing\s*1$/ }).click();
    await expect(page).toHaveURL(/cat=Marketing/);
    await expect(page.getByTestId('results-count')).toContainText('in Marketing');
    await expect(page.getByTestId('results-count')).toContainText('1 skill');
  });

  test('price, platform and verified filters compose', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Free', exact: true }).click();
    await expect(page.getByTestId('results-count')).toContainText('1 skill');

    await page.getByRole('button', { name: 'Any price' }).click();
    await page.getByRole('button', { name: 'Cursor', exact: true }).click();
    await expect(page.getByTestId('results-count')).toContainText('1 skill');

    await page.getByRole('button', { name: 'Any assistant' }).click();
    const verified = page.getByRole('checkbox', { name: 'Verified creators only' });
    await verified.click();
    await expect(verified).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/verified=1/);
    await expect(page.getByTestId('results-count')).toContainText('4 skills');
    // and it toggles back off cleanly — the old controlled native checkbox
    // bounced here, landing out of sync with the URL.
    await verified.click();
    await expect(verified).toHaveAttribute('aria-checked', 'false');
    await expect(page).not.toHaveURL(/verified=1/);
  });

  test('sort is a themed control, not a native select', async ({ page }) => {
    await page.goto('/marketplace');
    // A native <select> would render an unstyleable OS popup — the PRD called
    // this out explicitly. There must be none on the page.
    await expect(page.locator('select')).toHaveCount(0);
    await page.getByRole('button', { name: /Sort skills|Featured/ }).first().click();
    await page.getByRole('option', { name: 'Most downloaded' }).click();
    await expect(page).toHaveURL(/sort=downloads/);
    const first = page.locator('[data-testid="skill-card"]').first();
    await expect(first).toContainText('580 downloads');
  });

  test('clearing filters restores the full list', async ({ page }) => {
    await page.goto('/marketplace?cat=Design&price=Free');
    await expect(page.getByTestId('results-count')).toContainText('1 skill');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('results-count')).toContainText('6 skills');
  });

  test('empty state offers a way out', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByTestId('marketplace-search').fill('zzz-no-match');
    await expect(page.getByText('No skills match those filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page.getByTestId('results-count')).toContainText('6 skills');
  });

  test('never renders a zero metric or the "dl" abbreviation', async ({ page }) => {
    await page.goto('/marketplace');
    const grid = page.locator('[data-testid="skill-card"]');
    await expect(grid.first()).toBeVisible();
    const text = await grid.allInnerTexts();
    for (const t of text) {
      expect(t).not.toMatch(/\b0 downloads\b/);
      expect(t).not.toMatch(/0\.0 \(0\)/);
      expect(t).not.toMatch(/\bdl\b/);
    }
  });
});

test.describe('Skill detail', () => {
  test('deep link renders proof, usage, reviews and the buy sidebar', async ({ page }) => {
    await page.goto('/skills/1');
    await expect(page.getByRole('heading', { name: 'PDF Generation Skill' })).toBeVisible();
    // Heading only — a review body also contains the phrase "proof of concept".
    await expect(page.getByRole('heading', { name: /Proof of concept/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /How to use this skill/i })).toBeVisible();
    await expect(page.getByText('~6 hours saved')).toBeVisible();
    await expect(page.getByText('seller estimate')).toBeVisible();
    await expect(page.getByText('one-time payment')).toBeVisible();
    await expect(page.getByText('Saved me hours. The proof of concept alone was worth it.')).toBeVisible();
  });

  test('unknown skill shows a friendly error with Retry, not a blank page', async ({ page }) => {
    await page.goto('/skills/does-not-exist');
    await expect(page.getByText("We couldn't find that.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('author link opens the public profile', async ({ page }) => {
    await page.goto('/skills/1');
    await page.getByText('mohan', { exact: true }).first().click();
    await expect(page).toHaveURL(/\/u\/mohan/);
    await expect(page.getByRole('heading', { name: 'Mohan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Published skills' })).toBeVisible();
  });
});

test.describe('Leaderboard', () => {
  test('podium, tabs and badge explainer work without an account', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByText('wordsmith_ai').first()).toBeVisible();
    await page.getByTestId('lb-tab-skills').click();
    // Rank 1 appears twice on each tab now — once on the podium, once in the ranked list.
    await expect(page.getByText('React UI Design System Skill').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Seller badges' })).toBeVisible();
  });
});

test.describe('Create a Skill (public, client-side)', () => {
  test('generates a platform-specific prompt and switches platform', async ({ page }) => {
    await page.goto('/create');
    await page.getByTestId('generate-prompt').click();
    await expect(page.getByText('Your Claude prompt')).toBeVisible();
    await expect(page.locator('pre')).toContainText('SKILL.md');
    await page.getByRole('button', { name: 'ChatGPT', exact: true }).click();
    await expect(page.getByText('Your ChatGPT prompt')).toBeVisible();
    await expect(page.locator('pre')).toContainText('Act as a senior');
  });
});

test.describe('Auth gates', () => {
  test('signed out: private nav hidden, publish CTA opens the modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'My Library' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign in to publish' }).click();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('deep link to /library shows a sign-in gate, not a blank page', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
    await expect(page.getByText("You'll come straight back to this page.")).toBeVisible();
  });

  test('buying while signed out opens the auth modal', async ({ page }) => {
    await page.goto('/skills/1');
    await page.getByTestId('buy-btn').click();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('sign-up asks for a real name and validates the username', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-signin').click();
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByTestId('signup-name')).toBeVisible();
    await page.getByTestId('signup-username').fill('X!');
    await expect(page.getByText('3–24 characters: a–z, 0–9, _')).toBeVisible();
    await page.getByTestId('signup-username').fill('mohan');
    await expect(page.getByText('✗ Already taken')).toBeVisible();
    await page.getByTestId('signup-username').fill('brand_new_handle');
    await expect(page.getByText('✓ Available')).toBeVisible();
  });

  test('sign-in returns you to the page you came from', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.getByTestId('nav-signin').click();
    await page.getByTestId('auth-email').fill('someone@example.com');
    await page.getByTestId('auth-password').fill('Passw0rd!');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('nav-user')).toBeVisible();
    // Must NOT get dumped on the homepage (PRD screenshot 3).
    await expect(page).toHaveURL(/leaderboard/);
  });
});
