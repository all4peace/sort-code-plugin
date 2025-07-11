// Test Case 3: Mixed function types (declarations, expressions, arrow functions)
// Various function types out of order

const MAX_RETRIES = 3;

/**
 * Calculates transaction fees
 */
const calculateFees = (amount: number): number => {
  return amount * 0.03;
};

/**
 * Formats currency display
 */
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

/**
 * Generates transaction IDs
 */
function generateTransactionId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Handles payment errors
 */
const handleError = function (error: string): void {
  console.error("Payment error:", error);
};

/**
 * Processes payment transactions
 */
function processPayment(amount: number): boolean {
  return amount > 0;
}

/**
 * Sends email notifications
 */
function sendNotification(email: string, message: string): void {
  console.log(`Sending to ${email}: ${message}`);
}

/**
 * Validates credit card information
 */
const validateCard = function (cardNumber: string): boolean {
  return cardNumber.length === 16;
};
