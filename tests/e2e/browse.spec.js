import { test, expect } from '@playwright/test';

// Mock-mode e2e: full browse flows with deterministic data.

test.describe('Home', () => {
  test('hero, stats, featured skills, categories, top builders all render', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Where AI builders' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'share their edge' })).toBeVisible();
    await expect(page.getByText('Skills Published')).toBeVisible();
    await expect(page.getByText('✦ Featured Skills')).toBeVisible();
    await expect(page.locator('[data-testid="skill-card"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Document', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top Builders' })).toBeVisible();
  });

  test('category tile navigates to filtered marketplace', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page).toHaveURL(/marketplace\?cat=Document/);
    await expect(page.getByTestId('results-count')).toContainText('in Document');
  });
});

test.describe('Marketplace', () => {
  test('search filters results', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByTestId('results-count')).toContainText('6 skills');
    await page.getByTestId('marketplace-search').fill('PDF');
    await expect(page.getByTestId('results-count')).toContainText('1 skill found');
  });

  test('platform, price, verified filters work', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Cursor', exact: true }).click();
    await expect(page.getByTestId('results-count')).toContainText('1 skill');
    await page.getByRole('button', { name: 'All', exact: true }).first().click();
    await page.getByRole('button', { name: 'Free', exact: true }).click();
    await expect(page.getByTestId('results-count')).toContainText('1 skill');
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await page.getByRole('button', { name: '✦ Verified' }).click();
    await expect(page.getByTestId('results-count')).toContainText('4 skills');
  });

  test('searchable category dropdown filters and applies', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: /^Category/ }).click();
    await page.getByPlaceholder('Search...').fill('mark');
    await page.getByText('Marketing', { exact: true }).click();
    await expect(page.getByTestId('results-count')).toContainText('in Marketing');
  });

  test('empty state shows when no skills match', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByTestId('marketplace-search').fill('zzz-no-match');
    await expect(page.getByText('No skills match your filters.')).toBeVisible();
  });
});

test.describe('Skill detail', () => {
  test('deep link renders full detail: POC, usage, reviews, sidebar', async ({ page }) => {
    await page.goto('/skills/1');
    await expect(page.getByRole('heading', { name: 'PDF Generation Skill' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Proof of Concept' })).toBeVisible();
    await expect(page.getByText('How to use this skill')).toBeVisible();
    await expect(page.getByText('~6 hours saved')).toBeVisible();
    await expect(page.getByText('seller estimate')).toBeVisible();
    await expect(page.getByText('one-time payment')).toBeVisible();
    await expect(page.getByText('Saved me hours. The proof of concept alone was worth it.')).toBeVisible();
  });

  test('unknown skill shows friendly error, not a blank page', async ({ page }) => {
    await page.goto('/skills/does-not-exist');
    await expect(page.getByText("We couldn't find that.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('author link goes to public profile', async ({ page }) => {
    await page.goto('/skills/1');
    await page.locator('span', { hasText: /^mohan$/ }).first().click();
    await expect(page).toHaveURL(/\/u\/mohan/);
    await expect(page.getByRole('heading', { name: 'Mohan' })).toBeVisible();
    await expect(page.getByText('Published Skills')).toBeVisible();
  });
});

test.describe('Leaderboard', () => {
  test('builders podium and tabs work without auth', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByText('All-time rankings.')).toBeVisible();
    await expect(page.getByText('wordsmith_ai').first()).toBeVisible();
    await page.getByRole('button', { name: 'Top Skills' }).click();
    await expect(page.getByText('React UI Design System Skill')).toBeVisible();
    await expect(page.getByText('Seller Badges')).toBeVisible();
  });
});

test.describe('Create a Skill (public, client-side)', () => {
  test('generates platform-specific prompt and switches platforms', async ({ page }) => {
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
  test('signed-out: My Library and My Profile hidden from nav; publish CTA asks sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'My Library' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign In to Publish' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign In to Publish' }).click();
    await expect(page.getByText('Welcome back')).toBeVisible(); // auth modal
  });

  test('deep link to /library shows sign-in gate, not blank page', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByText('Sign in to view this page.')).toBeVisible();
  });

  test('buy button on paid skill opens auth modal when signed out', async ({ page }) => {
    await page.goto('/skills/1');
    await page.getByTestId('buy-btn').click();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
