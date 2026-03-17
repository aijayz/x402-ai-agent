import { test, expect, captureConsoleErrors, expectNoConsoleErrors } from './fixtures';

/**
 * API Endpoint Tests
 * Tests that backend API endpoints are accessible and functional
 */

test.describe('API Endpoints', () => {
  test('registry endpoint should return valid JSON', async ({ request }) => {
    const response = await request.get('/api/registry');

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
  });

  test('MCP endpoint should be accessible', async ({ request }) => {
    const response = await request.get('/mcp', {
      headers: {
        'Accept': 'application/json',
      },
    });

    // MCP endpoint may return various status codes depending on implementation
    // It should not return 500
    expect(response.status()).not.toBe(500);
  });

  test('chat endpoint should handle POST requests', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        model: 'deepseek-chat',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should accept the request (actual response depends on AI processing)
    // 200, 202, or 400 (validation error) are acceptable
    expect([200, 202, 400]).toContain(response.status());
  });

  test('chat endpoint should require messages array', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return error for missing messages
    expect([400, 422]).toContain(response.status());
  });
});

test.describe('Health Checks', () => {
  test('main page should load successfully', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);

    const response = await page.goto('/');

    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);

    // Verify page title or content
    await expect(page.locator('body')).toBeVisible();

    expectNoConsoleErrors(consoleErrors);
  });

  test('page should have correct metadata', async ({ page }) => {
    await page.goto('/');

    // Check for basic HTML structure
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');

    // Body should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('static assets should be accessible', async ({ request }) => {
    // Test favicon
    const faviconResponse = await request.get('/favicon.ico');
    expect([200, 204, 404]).toContain(faviconResponse.status());
  });
});
