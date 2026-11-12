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

function validateBudget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("Send a budget object.");
  }

  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw invalid("Budget amount must be a positive number.");
  }
  const amountCents = Math.round(amount * 100);
  if (
    !Number.isSafeInteger(amountCents) ||
    Math.abs(amount * 100 - amountCents) > 1e-7
  ) {
    throw invalid("Budget amount must have no more than two decimal places.");
  }

  if (typeof input.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    throw invalid("Budget month must use the YYYY-MM format.");
  }
  if (typeof input.category !== "string" || !input.category.trim()) {
    throw invalid("Choose a category for this budget.");
  }
  const category = input.category.trim();
  if (category.length > 50 || category.includes("/")) {
    throw invalid("Category must be 50 characters or fewer and cannot contain '/'.");
  }

  const currency = input.currency === undefined ? "INR" : input.currency;
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw invalid(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`);
  }
  return { amountCents, currency, month: input.month, category };
}

function validateSavingsGoal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("Send a savings goal object.");
  }

  if (typeof input.name !== "string" || !input.name.trim()) {
    throw invalid("Enter a name for this savings goal.");
  }
  const name = input.name.trim();
  if (name.length > 80) {
    throw invalid("Savings goal name must be 80 characters or fewer.");
  }

  function amountInCents(value, label, allowZero = false) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (allowZero ? value < 0 : value <= 0)
    ) {
      throw invalid(`${label} must be a ${allowZero ? "non-negative" : "positive"} number.`);
    }
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 1e-7) {
      throw invalid(`${label} must have no more than two decimal places.`);
    }
    return cents;
  }

  const targetCents = amountInCents(input.targetAmount, "Target amount");
  const savedCents = amountInCents(input.savedAmount ?? 0, "Saved amount", true);
  if (savedCents > targetCents) {
    throw invalid("Saved amount cannot be greater than the target amount.");
  }

  const currency = input.currency === undefined ? "INR" : input.currency;
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw invalid(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`);
  }

  if (typeof input.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) {
    throw invalid("Deadline must use the YYYY-MM-DD format.");
  }
  const [year, month, day] = input.deadline.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw invalid("Enter a real calendar date for the deadline.");
  }

  return { name, targetCents, savedCents, currency, deadline: input.deadline };
}

function validateBudgetMonth(month) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw invalid("A valid month in YYYY-MM format is required.");
  }
  return month;
}

module.exports = { validateExpense, validateBudget, validateSavingsGoal, validateBudgetMonth };
