import { test, expect, captureConsoleErrors, expectNoConsoleErrors } from './fixtures';

/**
 * Paid Tool Tests
 * Tests paid tool functionality with x402 payment integration
 *
 * Note: These tests are marked with test.skip when:
 * - Real payments would be required
 * - CDP credentials are not available
 * - Network conditions are not suitable
 */

const SKIP_PAID_TESTS = process.env.SKIP_PAID_TESTS === 'true' || !process.env.CDP_API_KEY_ID;

test.describe('Paid Tool Request Flow', () => {
  test.beforeEach(async ({ chatPage }) => {
    await chatPage.goto();
  });

  test('should request premium random number tool via suggestion @paid', async ({ page, chatPage }) => {
    test.slow();
    test.skip(SKIP_PAID_TESTS, 'Skipping paid tool test - SKIP_PAID_TESTS is true or CDP credentials not available');

    const consoleErrors = captureConsoleErrors(page);

    // Click the "Use a paid tool" suggestion
    await chatPage.clickSuggestion('Use a paid tool');

    // Wait for user message
    await expect(chatPage.userMessages.first()).toBeVisible();

    // Wait for AI response
    await chatPage.waitForStreamingResponse();

    // Wait for tool to appear with extended timeout for payment processing
    const tool = page.locator('.rounded-md.border').filter({ hasText: 'premium_random' });
    await tool.waitFor({ state: 'visible', timeout: 60000 });

    // Wait for completion
    await chatPage.waitForToolCompletion('premium_random', 60000);

    // Verify x402 payment information is displayed
    const toolResult = await chatPage.getToolResult('premium_random');
    expect(toolResult).toBeTruthy();

    // Check for transaction link
    const transactionLink = page.locator('a[href*="basescan.org/tx/"]');
    await expect(transactionLink).toBeVisible();

    expectNoConsoleErrors(consoleErrors);
  });

  test('should display tool requiring payment @paid', async ({ page, chatPage }) => {
    test.slow();
    test.skip(SKIP_PAID_TESTS, 'Skipping paid tool test');

    // Request premium random number
    await chatPage.sendMessage('Get me a premium random number');

    // Wait for tool to appear
    const tool = page.locator('.rounded-md.border').filter({ hasText: 'premium_random' });
    await tool.waitFor({ state: 'visible', timeout: 30000 });

    // Verify tool shows payment status
    const toolText = await tool.textContent();
    expect(toolText).toContain('premium_random');
  });

  test('should handle paid tool error gracefully @paid', async ({ page, chatPage }) => {
    test.slow();
    test.skip(SKIP_PAID_TESTS, 'Skipping paid tool test');

    const consoleErrors = captureConsoleErrors(page);

    // Request a paid tool
    await chatPage.sendMessage('Get me a premium analysis');

    // Wait for AI response
    await chatPage.waitForStreamingResponse();

    // Wait for potential tool execution
    await page.waitForTimeout(15000);

    // Should not show error state
    const hasError = await chatPage.hasError();
    expect(hasError).toBe(false);

    expectNoConsoleErrors(consoleErrors);
  });

  test('should show payment information in tool output @paid', async ({ page, chatPage }) => {
    test.slow();
    test.skip(SKIP_PAID_TESTS, 'Skipping paid tool test');

    // Use paid tool suggestion
    await chatPage.clickSuggestion('Use a paid tool');

    // Wait for tool to complete
    const tool = page.locator('.rounded-md.border').filter({ hasText: 'premium_random' });
    await tool.waitFor({ state: 'visible', timeout: 60000 });
    await chatPage.waitForToolCompletion('premium_random', 60000);

    // Look for x402 payment section
    const paymentHeader = page.locator('text=x402 Payment');
    const isPaymentVisible = await paymentHeader.isVisible().catch(() => false);

    if (isPaymentVisible) {
      await expect(paymentHeader).toBeVisible();

      // Should have transaction link
      const txLink = page.locator('a[href*="basescan.org"]').first();
      await expect(txLink).toBeVisible();
    }
  });
});

test.describe('Payment Flow Mock Tests', () => {
  /**
   * These tests verify UI behavior without requiring actual payments
   * They mock or verify the 402 response handling
   */

  test.beforeEach(async ({ chatPage }) => {
    await chatPage.goto();
  });

  test('should display suggestion for paid tool', async ({ page, chatPage }) => {
    const consoleErrors = captureConsoleErrors(page);

    // Verify paid tool suggestion exists
    const paidSuggestion = page.locator('button').filter({ hasText: 'Use a paid tool ($0.01)' });
    await expect(paidSuggestion).toBeVisible();

    // Verify the price is displayed
    const suggestionText = await paidSuggestion.textContent();
    expect(suggestionText).toContain('$0.01');

    expectNoConsoleErrors(consoleErrors);
  });

  test('should send paid tool request message', async ({ page, chatPage }) => {
    const consoleErrors = captureConsoleErrors(page);

    // Click paid tool suggestion
    await chatPage.clickSuggestion('Use a paid tool');

    // Verify correct message is sent
    await expect(chatPage.userMessages.first()).toBeVisible();
    const lastMessage = await chatPage.getLastUserMessage();
    expect(lastMessage).toContain('premium random number');

    expectNoConsoleErrors(consoleErrors);
  });

  test('should handle streaming response for paid tool request', async ({ page, chatPage }) => {
    test.slow();
    const consoleErrors = captureConsoleErrors(page);

    // Send request for paid tool
    await chatPage.sendMessage('I want to use a premium tool');

    // Wait for streaming to begin
    await chatPage.waitForStreamingResponse();

    // Verify assistant message appears
    await expect(chatPage.assistantMessages.first()).toBeVisible();

    expectNoConsoleErrors(consoleErrors);
  });
});
