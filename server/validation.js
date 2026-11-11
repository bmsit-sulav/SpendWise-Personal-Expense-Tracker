const { SUPPORTED_CURRENCIES } = require("./exchange-rates");

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateExpense(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("Send an expense object.");
  }

  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw invalid("Amount must be a positive number.");
  }
  const amountCents = Math.round(amount * 100);
  if (
    !Number.isSafeInteger(amountCents) ||
    Math.abs(amount * 100 - amountCents) > 1e-7
  ) {
    throw invalid("Amount must be a valid value with no more than two decimal places.");
  }

  const currency = input.currency === undefined ? "INR" : input.currency;
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw invalid(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`);
  }

  if (typeof input.category !== "string" || !input.category.trim()) {
    throw invalid("Choose a category.");
  }
  const category = input.category.trim();
  if (category.length > 50) {
    throw invalid("Category must be 50 characters or fewer.");
  }

  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw invalid("Date must use the YYYY-MM-DD format.");
  }
  const [year, month, day] = input.date.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw invalid("Enter a real calendar date.");
  }

  const description = input.description === undefined ? "" : input.description;
  if (typeof description !== "string" || description.length > 200) {
    throw invalid("Description must be 200 characters or fewer.");
  }

  return {
    amountCents,
    currency,
    category,
    date: input.date,
    description: description.trim(),
  };
}

module.exports = { validateExpense };
