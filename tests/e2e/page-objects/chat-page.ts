import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the Chat page
 * Encapsulates all UI interactions for the x402 AI Agent chat interface
 */
export class ChatPage {
  readonly page: Page;

  // Main containers
  readonly conversation: Locator;
  readonly promptInput: Locator;

  // Input elements
  readonly messageTextarea: Locator;
  readonly submitButton: Locator;
  readonly modelSelect: Locator;

  // Suggestions
  readonly suggestions: Locator;

  // Messages
  readonly messages: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;

  // Loading and error states
  readonly loader: Locator;
  readonly errorMessage: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main containers
    this.conversation = page.locator('[role="log"]').first();
    this.promptInput = page.locator('form');

    // Input elements - using semantic selectors
    this.messageTextarea = page.locator('textarea[name="message"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.modelSelect = page.locator('[role="combobox"]').first();

    // Suggestions
    this.suggestions = page.locator('button[class*="rounded-full"]').filter({ hasText: /Ask|Use|Check/ });

    // Messages - using CSS classes from the components
    this.messages = page.locator('.group.flex');
    this.userMessages = page.locator('.group.is-user');
    this.assistantMessages = page.locator('.group.is-assistant');

    // Loading and error states
    // Loader is the standalone div in the conversation (not the button spinner)
    this.loader = page.locator('div[class*="animate-spin"]').filter({ hasNot: page.locator('button') });
    this.errorMessage = page.locator('text=Something went wrong');
    this.retryButton = page.locator('button:has-text("Try again")');
  }

  /**
   * Navigate to the chat page
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForPageLoad();
  }

  /**
   * Wait for the page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.conversation.waitFor({ state: 'visible' });
    await this.messageTextarea.waitFor({ state: 'visible' });
  }

  /**
   * Send a message in the chat
   * @param message - The message to send
   */
  async sendMessage(message: string): Promise<void> {
    await this.messageTextarea.fill(message);
    await this.submitButton.click();
  }

  /**
   * Send a message by pressing Enter
   * @param message - The message to send
   */
  async sendMessageWithEnter(message: string): Promise<void> {
    await this.messageTextarea.fill(message);
    await this.messageTextarea.press('Enter');
  }

  /**
   * Click a suggestion button
   * @param suggestionText - Partial text of the suggestion to click
   */
  async clickSuggestion(suggestionText: string): Promise<void> {
    const suggestion = this.page.locator('button').filter({ hasText: suggestionText });
    await suggestion.click();
  }

  /**
   * Select a model from the dropdown
   * @param modelName - The model name to select
   */
  async selectModel(modelName: string): Promise<void> {
    await this.modelSelect.click();
    const option = this.page.locator('[role="option"]').filter({ hasText: modelName });
    await option.click();
  }

  /**
   * Wait for AI response to complete
   * @param timeout - Maximum time to wait in milliseconds
   */
  async waitForResponse(timeout = 60000): Promise<void> {
    // Wait for loading to start then finish
    await this.loader.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      // Loading might already be done
    });
    await this.loader.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for streaming response to appear
   * Checks that at least one assistant message exists
   */
  async waitForStreamingResponse(timeout = 60000): Promise<void> {
    await this.assistantMessages.first().waitFor({ state: 'visible', timeout });
  }

  /**
   * Get the last user message text
   */
  async getLastUserMessage(): Promise<string | null> {
    const count = await this.userMessages.count();
    if (count === 0) return null;
    return this.userMessages.nth(count - 1).textContent();
  }

  /**
   * Get the last assistant message text
   */
  async getLastAssistantMessage(): Promise<string | null> {
    const count = await this.assistantMessages.count();
    if (count === 0) return null;
    return this.assistantMessages.nth(count - 1).textContent();
  }

  /**
   * Get all messages in the conversation
   */
  async getAllMessages(): Promise<{ role: string; content: string }[]> {
    const result: { role: string; content: string }[] = [];
    const count = await this.messages.count();

    for (let i = 0; i < count; i++) {
      const message = this.messages.nth(i);
      const className = await message.getAttribute('class');
      const role = className?.includes('is-user') ? 'user' : 'assistant';
      const content = await message.textContent() || '';
      result.push({ role, content });
    }

    return result;
  }

  /**
   * Check if there's an error state visible
   */
  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible().catch(() => false);
  }

  /**
   * Click the retry button
   */
  async clickRetry(): Promise<void> {
    await this.retryButton.click();
  }

  /**
   * Check if tool call is visible in the conversation
   * @param toolName - Name of the tool to check for
   */
  async isToolVisible(toolName: string): Promise<boolean> {
    const tool = this.page.locator('text=' + toolName);
    return tool.isVisible().catch(() => false);
  }

  /**
   * Wait for a tool to complete
   * @param toolName - Name of the tool to wait for
   * @param timeout - Maximum time to wait
   */
  async waitForToolCompletion(toolName: string, timeout = 30000): Promise<void> {
    const tool = this.page.locator('.rounded-md.border').filter({ hasText: toolName });
    await tool.waitFor({ state: 'visible', timeout });

    // Wait for completion badge
    const completedBadge = tool.locator('text=Completed');
    await completedBadge.waitFor({ state: 'visible', timeout });
  }

  /**
   * Get the content of a tool result
   * @param toolName - Name of the tool
   */
  async getToolResult(toolName: string): Promise<string | null> {
    const tool = this.page.locator('.rounded-md.border').filter({ hasText: toolName });
    return tool.textContent();
  }
}
