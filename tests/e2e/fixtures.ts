import { test as base, expect, type Page } from '@playwright/test';
import { ChatPage } from './page-objects/chat-page';

/**
 * Extended test fixture with page objects
 */
type TestFixtures = {
  chatPage: ChatPage;
};

/**
 * Extended test with fixtures
 */
export const test = base.extend<TestFixtures>({
  chatPage: async ({ page }, use) => {
    const chatPage = new ChatPage(page);
    await use(chatPage);
  },
});

/**
 * Re-export expect for convenience
 */
export { expect };

/**
 * Helper to capture console errors during tests
 */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}

/**
 * Helper to verify no console errors occurred
 */
export function expectNoConsoleErrors(errors: string[]): void {
  const filteredErrors = errors.filter(
    (error) =>
      // Filter out known benign errors
      !error.includes('favicon') &&
      !error.includes('404') &&
      !error.includes('webpack')
  );

  if (filteredErrors.length > 0) {
    console.log('Console errors found:', filteredErrors);
  }

  expect(filteredErrors).toHaveLength(0);
}

/**
 * Helper to wait for streaming content with timeout
 */
export async function waitForStreamingContent(
  page: Page,
  selector: string,
  timeout = 60000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = page.locator(selector);
    const text = await element.textContent().catch(() => '');

    if (text && text.length > 0) {
      return;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(`Timeout waiting for content in selector: ${selector}`);
}
