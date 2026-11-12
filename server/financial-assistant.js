const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CATEGORIES = [
  "Food",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Other",
];

function answerFinancialQuestion(question, expenses, now = new Date()) {
  const normalizedQuestion = question.trim().toLocaleLowerCase();
  const month = localDateValue(now).slice(0, 7);
  const today = localDateValue(now);

  if (/\b(last week|past week|previous week)\b/.test(normalizedQuestion)) {
    const category = findCategory(normalizedQuestion, expenses);
    if (!category) return { intent: "weekly-category-required" };
    const { fromDate, toDate } = previousWeekRange(now);
    const matchingExpenses = expenses.filter((expense) =>
      expense.category.toLocaleLowerCase() === category.toLocaleLowerCase() &&
      expense.date >= fromDate &&
      expense.date <= toDate
    );
    return {
      intent: "weekly-category",
      category,
      fromDate,
      toDate,
      amountCents: totalCents(matchingExpenses),
      expenseCount: matchingExpenses.length,
    };
  }

  if (/\b(reduce|cut|lower|spend less|save money|reduce spending)\b/.test(normalizedQuestion)) {
    const monthExpenses = expenses.filter(
      (expense) => expense.date.startsWith(month) && expense.date <= today,
    );
    return {
      intent: "expense-reduction",
      month,
      totalCents: totalCents(monthExpenses),
      categories: summarizeCategories(monthExpenses).slice(0, 3),
    };
  }

  if (
    /\b(most|largest|main)\b/.test(normalizedQuestion) &&
    /\b(money|spend|spending|expense|expenses|month)\b/.test(normalizedQuestion)
  ) {
    const monthExpenses = expenses.filter(
      (expense) => expense.date.startsWith(month) && expense.date <= today,
    );
    const categories = summarizeCategories(monthExpenses);
    return {
      intent: "monthly-highest",
      month,
      totalCents: totalCents(monthExpenses),
      categories,
    };
  }

  return { intent: "unsupported" };
}

function findCategory(question, expenses) {
  const categories = [...new Set([
    ...expenses.map((expense) => expense.category),
    ...DEFAULT_CATEGORIES,
  ])].sort((first, second) => second.length - first.length);

  return categories.find((category) => {
    const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu");
    return expression.test(question);
  }) || null;
}

function previousWeekRange(now) {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const mondayThisWeek = today.getTime() - daysSinceMonday * DAY_MS;
  const fromDate = new Date(mondayThisWeek - 7 * DAY_MS);
  const toDate = new Date(mondayThisWeek - DAY_MS);
  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
  };
}

function summarizeCategories(expenses) {
  const categories = new Map();
  for (const expense of expenses) {
    const key = expense.category.toLocaleLowerCase();
    const current = categories.get(key) || { category: expense.category, amountCents: 0, expenseCount: 0 };
    current.amountCents += Math.round(expense.amount * 100);
    current.expenseCount += 1;
    categories.set(key, current);
  }
  return [...categories.values()].sort((first, second) =>
    second.amountCents - first.amountCents || first.category.localeCompare(second.category)
  );
}

function totalCents(expenses) {
  return expenses.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = { answerFinancialQuestion };
