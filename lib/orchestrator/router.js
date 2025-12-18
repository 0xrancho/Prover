/**
 * ROUTER - Confirmation Detection Only
 *
 * Mode detection has been REMOVED. The planner (LLM) decides tools and approach
 * based on reasoning, not keyword matching.
 *
 * This file now only handles confirmation/cancellation detection for pending actions.
 */

/**
 * Check if message is a confirmation
 * @param {string} message - User's message
 * @returns {boolean}
 */
export function isConfirmation(message) {
  const q = message.toLowerCase().trim();
  const confirmWords = ['yes', 'y', 'ok', 'okay', 'sure', 'confirm', 'save', 'do it', 'go ahead', 'looks good', 'perfect', 'yep', 'yup'];
  return confirmWords.some(word => q === word || q.startsWith(word + ' ') || q.startsWith(word + ','));
}

/**
 * Check if message is a cancellation
 * @param {string} message - User's message
 * @returns {boolean}
 */
export function isCancellation(message) {
  const q = message.toLowerCase().trim();
  const cancelWords = ['no', 'cancel', 'stop', 'nevermind', 'never mind', 'nope', 'nah', "don't", 'dont'];
  return cancelWords.some(word =>
    q === word ||
    q.startsWith(word + ' ') ||
    q.startsWith(word + ',') ||
    q.startsWith(word + '.')
  );
}

export default {
  isConfirmation,
  isCancellation
};
