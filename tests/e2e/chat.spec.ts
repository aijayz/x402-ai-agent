import { test, expect, captureConsoleErrors, expectNoConsoleErrors } from './fixtures';

/**
 * Basic Chat Flow Tests
 * Tests core chat functionality without AI dependencies
 */

test.describe('Basic Chat Flow', () => {
  test.beforeEach(async ({ chatPage }) => {
    await chatPage.goto();
  });

  test('should load the chat interface', async ({ page, chatPage }) => {
    const consoleErrors = captureConsoleErrors(page);

    // Verify main elements are present
    await expect(chatPage.conversation).toBeVisible();
    await expect(chatPage.messageTextarea).toBeVisible();
    await expect(chatPage.submitButton).toBeVisible();

    // Verify textarea has correct placeholder
    await expect(chatPage.messageTextarea).toHaveAttribute(
      'placeholder',
      'What would you like to know?'
    );

    // Verify no console errors on initial load
    expectNoConsoleErrors(consoleErrors);
  });

  test('should allow typing in the textarea', async ({ chatPage }) => {
    const testMessage = 'Hello, this is a test message';

    await chatPage.messageTextarea.fill(testMessage);
    await expect(chatPage.messageTextarea).toHaveValue(testMessage);
  });

  test('should disable submit button when textarea is empty', async ({ chatPage }) => {
    // Initially should be disabled (empty textarea)
    await expect(chatPage.submitButton).toBeDisabled();

    // After typing, should be enabled
    await chatPage.messageTextarea.fill('Test message');
    await expect(chatPage.submitButton).toBeEnabled();

    // After clearing, should be disabled again
    await chatPage.messageTextarea.fill('');
    await expect(chatPage.submitButton).toBeDisabled();
  });

  test('should display user message after sending', async ({ page, chatPage }) => {
    const testMessage = 'Test user message';
    const consoleErrors = captureConsoleErrors(page);

    await chatPage.sendMessage(testMessage);

    // Verify user message appears
    await expect(chatPage.userMessages.first()).toBeVisible();

    // Verify message content
    const lastMessage = await chatPage.getLastUserMessage();
    expect(lastMessage).toContain(testMessage);

    // Verify textarea is cleared after sending
    await expect(chatPage.messageTextarea).toHaveValue('');

    expectNoConsoleErrors(consoleErrors);
  });

  test('should submit message on Enter key', async ({ chatPage }) => {
    const testMessage = 'Message sent with Enter';

    await chatPage.sendMessageWithEnter(testMessage);

    // Verify user message appears
    await expect(chatPage.userMessages.first()).toBeVisible();
    const lastMessage = await chatPage.getLastUserMessage();
    expect(lastMessage).toContain(testMessage);
  });

  test('should allow Shift+Enter to create new lines without submitting', async ({ chatPage }) => {
    // This tests that Shift+Enter doesn't submit the form
    await chatPage.messageTextarea.fill('Line 1');
    await chatPage.messageTextarea.press('Shift+Enter');
    await chatPage.messageTextarea.fill('Line 1\nLine 2');

    // Should still have the multiline text
    await expect(chatPage.messageTextarea).toHaveValue('Line 1\nLine 2');

    // No user message should be sent yet
    const userMessageCount = await chatPage.userMessages.count();
    expect(userMessageCount).toBe(0);
  });

  test('should display suggestion buttons', async ({ page, chatPage }) => {
    // Verify suggestion buttons are present
    const suggestions = [
      'Ask a question',
      'Use a free tool',
      'Check my balance',
      'Use a paid tool',
    ];

    for (const suggestion of suggestions) {
      const button = page.locator('button').filter({ hasText: suggestion });
      await expect(button).toBeVisible();
    }
  });

  test('should send message when clicking a suggestion', async ({ page, chatPage }) => {
    const consoleErrors = captureConsoleErrors(page);

    await chatPage.clickSuggestion('Ask a question');

    // Verify user message appears with the suggestion text
    await expect(chatPage.userMessages.first()).toBeVisible();
    const lastMessage = await chatPage.getLastUserMessage();
    expect(lastMessage).toContain('What is blockchain technology?');

    expectNoConsoleErrors(consoleErrors);
  });

  test('should show loading state after sending message', async ({ page, chatPage }) => {
    const testMessage = 'Test message for loading state';

    await chatPage.sendMessage(testMessage);

    // Should show either loading indicator OR assistant response (whichever happens first)
    // The loader may be very brief, so we just check that something happens
    await expect(chatPage.userMessages.first()).toBeVisible();

    // Wait for any response or loader to appear
    const responseOrLoader = page.locator('.group.is-assistant, [class*="animate-spin"]').first();
    await expect(responseOrLoader).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Model Selection', () => {
  test.beforeEach(async ({ chatPage }) => {
    await chatPage.goto();
  });

  test('should have model selector visible', async ({ chatPage }) => {
    await expect(chatPage.modelSelect).toBeVisible();

    // Check default value
    const modelText = await chatPage.modelSelect.textContent();
    expect(modelText).toContain('DeepSeek Chat');
  });

  test('should display model options when clicked', async ({ page, chatPage }) => {
    // Click the model selector to open dropdown
    await chatPage.modelSelect.click();

    // Should show at least one option
    const options = page.locator('[role="option"]');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);

    // Verify DeepSeek Chat is an option
    const firstOption = await options.first().textContent();
    expect(firstOption).toContain('DeepSeek');
  });
});

test.describe('Conversation History', () => {
  test.beforeEach(async ({ chatPage }) => {
    await chatPage.goto();
  });

  test('should display multiple messages in conversation', async ({ chatPage }) => {
    // Send first message
    await chatPage.sendMessage('First message');
    await chatPage.waitForStreamingResponse();

    // Send second message
    await chatPage.sendMessage('Second message');
    await chatPage.waitForStreamingResponse();

    // Verify both user messages are present
    const userMessageCount = await chatPage.userMessages.count();
    expect(userMessageCount).toBeGreaterThanOrEqual(2);

    // Get all messages
    const messages = await chatPage.getAllMessages();
    const userContents = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content);

    expect(userContents.some((c) => c.includes('First message'))).toBe(true);
    expect(userContents.some((c) => c.includes('Second message'))).toBe(true);
  });
});
