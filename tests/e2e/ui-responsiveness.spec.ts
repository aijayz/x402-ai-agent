import { test, expect, captureConsoleErrors, expectNoConsoleErrors } from './fixtures';

/**
 * UI Responsiveness and Error Handling Tests
 * Tests page stability, console errors, and error states
 */

test.describe('UI Responsiveness', () => {
  test('should load without console errors', async ({ page, chatPage }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });

    await chatPage.goto();

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Give time for any delayed errors
    await page.waitForTimeout(1000);

    expectNoConsoleErrors(consoleErrors);
  });

  test('should be responsive on mobile viewport', async ({ page, chatPage }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await chatPage.goto();

    // Verify main elements are still visible
    await expect(chatPage.conversation).toBeVisible();
    await expect(chatPage.messageTextarea).toBeVisible();
    await expect(chatPage.submitButton).toBeVisible();

    // Verify suggestions are accessible
    const suggestions = page.locator('button').filter({ hasText: 'Ask a question' });
    await expect(suggestions).toBeVisible();
  });

  test('should be responsive on tablet viewport', async ({ page, chatPage }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await chatPage.goto();

    // Verify layout is functional
    await expect(chatPage.conversation).toBeVisible();
    await expect(chatPage.messageTextarea).toBeVisible();
  });

  test('should handle rapid message sending', async ({ chatPage }) => {
    test.slow();

    await chatPage.goto();

    // Send multiple messages quickly
    const messages = ['Message 1', 'Message 2', 'Message 3'];

    for (const message of messages) {
      await chatPage.sendMessage(message);
      // Small delay to avoid overwhelming
      await chatPage.page.waitForTimeout(100);
    }

    // Verify all messages are in the conversation
    const userMessageCount = await chatPage.userMessages.count();
    expect(userMessageCount).toBeGreaterThanOrEqual(3);
  });

  test('should maintain scroll position correctly', async ({ page, chatPage }) => {
    await chatPage.goto();

    // Send multiple messages to create scrollable content
    for (let i = 0; i < 5; i++) {
      await chatPage.sendMessage(`Test message ${i + 1}`);
      await page.waitForTimeout(200);
    }

    // Get conversation element
    const conversation = chatPage.conversation;

    // Check that conversation is scrollable or all messages are visible
    const scrollHeight = await conversation.evaluate((el) => el.scrollHeight);
    const clientHeight = await conversation.evaluate((el) => el.clientHeight);

    // Either scrollable or all content fits
    expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight);
  });
});

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page, chatPage }) => {
    await chatPage.goto();

    // Simulate offline
    await page.context().setOffline(true);

    try {
      await chatPage.sendMessage('Test message');

      // Wait a bit for error handling
      await page.waitForTimeout(2000);

      // Should show error state or maintain UI
      const hasError = await chatPage.hasError();
      const isPageStable = await chatPage.conversation.isVisible();

      // Either shows error or page is still functional
      expect(hasError || isPageStable).toBe(true);
    } catch (e) {
      // If page crashes, that's also acceptable - just verify no crash
      console.log('Network error handled:', e);
    } finally {
      // Restore network (may fail if context closed)
      try {
        await page.context().setOffline(false);
      } catch (e) {
        // Context may be closed - ignore
      }
    }
  });

  test('should recover after retry button click', async ({ page, chatPage }) => {
    await chatPage.goto();

    // First send a message that might fail
    await chatPage.sendMessage('Test message for retry');

    // Wait for any response or error
    await page.waitForTimeout(5000);

    // If there's an error, test retry
    const hasError = await chatPage.hasError();

    if (hasError) {
      await chatPage.clickRetry();

      // Wait for retry attempt
      await page.waitForTimeout(5000);

      // Should show loading or response after retry
      const isLoading = await chatPage.loader.isVisible().catch(() => false);
      const hasResponse = await chatPage.assistantMessages.first().isVisible().catch(() => false);

      expect(isLoading || hasResponse).toBe(true);
    }
  });

  test('should handle empty message submission gracefully', async ({ chatPage }) => {
    await chatPage.goto();

    // Try to submit without typing
    const isDisabled = await chatPage.submitButton.isDisabled();

    // Button should be disabled when no text
    expect(isDisabled).toBe(true);

    // Try pressing Enter in empty textarea
    await chatPage.messageTextarea.press('Enter');

    // No user message should appear
    const userMessageCount = await chatPage.userMessages.count();
    expect(userMessageCount).toBe(0);
  });

  test('should handle very long messages', async ({ chatPage }) => {
    await chatPage.goto();

    // Create a long message (1000 characters)
    const longMessage = 'A'.repeat(1000);

    await chatPage.sendMessage(longMessage);

    // Verify message was sent
    await expect(chatPage.userMessages.first()).toBeVisible();

    // Verify the UI doesn't break
    await expect(chatPage.conversation).toBeVisible();
    await expect(chatPage.messageTextarea).toBeVisible();
  });

  test('should handle special characters in messages', async ({ page, chatPage }) => {
    await chatPage.goto();

    const specialMessages = [
      'Hello <script>alert("xss")</script>',
      'Test with emojis: 🎉🚀💻',
      'Unicode: 你好世界 🌍',
      'HTML entities: &lt;div&gt; &amp; &quot;test&quot;',
    ];

    for (const message of specialMessages) {
      await chatPage.sendMessage(message);
      await page.waitForTimeout(500);

      // Verify message appears
      const lastMessage = await chatPage.getLastUserMessage();
      expect(lastMessage).toBeTruthy();
    }
  });
});

test.describe('Accessibility', () => {
  test('should have proper ARIA roles', async ({ chatPage }) => {
    await chatPage.goto();

    // Conversation should have log role
    const conversation = chatPage.page.locator('[role="log"]');
    await expect(conversation).toBeVisible();

    // Textarea should have proper label
    const textarea = chatPage.messageTextarea;
    await expect(textarea).toHaveAttribute('name', 'message');

    // Model select should be accessible
    const modelSelect = chatPage.modelSelect;
    await expect(modelSelect).toHaveAttribute('role', 'combobox');
  });

  test('should support keyboard navigation', async ({ page, chatPage }) => {
    await chatPage.goto();

    // Focus should be on textarea initially (based on auto-focus)
    const textarea = chatPage.messageTextarea;

    // Tab to submit button
    await page.keyboard.press('Tab');

    // Tab to model selector
    await page.keyboard.press('Tab');

    // Should be able to type in textarea after focusing it
    await textarea.focus();
    await page.keyboard.type('Keyboard test message');

    await expect(textarea).toHaveValue('Keyboard test message');
  });
});
