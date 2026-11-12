function monthValue(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function createExpenseForecast(expenses, budgets, now = new Date()) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const days = daysInMonth(month);
  const elapsedDays = now.getDate();
  const remainingDays = days - elapsedDays;
  const today = `${month}-${String(elapsedDays).padStart(2, "0")}`;
  const historicalMonths = [1, 2, 3]
    .map((offset) => monthValue(now.getFullYear(), now.getMonth() - offset))
    .filter((historicalMonth) => expenses.some((expense) => expense.date.startsWith(historicalMonth)));
  const historicalTotalsByMonth = new Map(
    historicalMonths.map((historicalMonth) => [historicalMonth, new Map()]),
  );
  const actualByCategory = new Map();
  let actualCents = 0;

  for (const expense of expenses) {
    const amountCents = Math.round(expense.amount * 100);
    if (expense.date.startsWith(month) && expense.date <= today) {
      actualCents += amountCents;
      addCategoryAmount(actualByCategory, expense.category, amountCents);
      continue;
    }

    const monthTotals = historicalTotalsByMonth.get(expense.date.slice(0, 7));
    if (monthTotals) addCategoryAmount(monthTotals, expense.category, amountCents);
  }

  const categoriesByKey = new Map();
  for (const expense of expenses) {
    const expenseMonth = expense.date.slice(0, 7);
    if (expenseMonth === month && expense.date <= today) {
      addCategory(categoriesByKey, expense.category);
    } else if (historicalTotalsByMonth.has(expenseMonth)) {
      addCategory(categoriesByKey, expense.category);
    }
  }
  for (const budget of budgets) addCategory(categoriesByKey, budget.category);

  const categoryForecasts = [...categoriesByKey.values()].map(({ key, category }) => {
    const categoryActualCents = actualByCategory.get(key)?.amountCents || 0;
    const historicalDailyRates = historicalMonths.map((historicalMonth) => {
      const monthDays = daysInMonth(historicalMonth);
      const historicalCents = historicalTotalsByMonth.get(historicalMonth).get(key)?.amountCents || 0;
      return historicalCents / monthDays;
    });
    const historicalDailyRate = average(historicalDailyRates);
    const currentDailyRate = elapsedDays > 0 ? categoryActualCents / elapsedDays : 0;
    const dailyRate = historicalMonths.length > 0 ? historicalDailyRate : currentDailyRate;
    const budgetCents = budgets
      .filter((budget) => budget.category.toLocaleLowerCase() === key)
      .reduce((sum, budget) => sum + Math.round(budget.amount * 100), 0);

    return {
      category,
      actualCents: categoryActualCents,
      projectedCents: categoryActualCents + Math.round(dailyRate * remainingDays),
      budgetCents: budgetCents || null,
    };
  }).sort((first, second) =>
    second.projectedCents - first.projectedCents || first.category.localeCompare(second.category)
  );

  const projectedCents = categoryForecasts.reduce((sum, category) => sum + category.projectedCents, 0);
  const totalBudgetCents = budgets.reduce((sum, budget) => sum + Math.round(budget.amount * 100), 0);
  const hasCurrentSpending = actualCents > 0;
  const method = historicalMonths.length > 0
    ? "historical-average"
    : hasCurrentSpending
      ? "current-pace"
      : "insufficient-data";

  return {
    month,
    daysInMonth: days,
    elapsedDays,
    remainingDays,
    actualCents,
    projectedCents,
    historicalMonths,
    method,
    totalBudgetCents: totalBudgetCents || null,
    potentialSavingsCents: totalBudgetCents && method !== "insufficient-data"
      ? Math.max(0, totalBudgetCents - projectedCents)
      : null,
    budgetOverageCents: totalBudgetCents && method !== "insufficient-data"
      ? Math.max(0, projectedCents - totalBudgetCents)
      : null,
    categories: categoryForecasts,
  };
}

function addCategoryAmount(categories, category, amountCents) {
  const key = category.toLocaleLowerCase();
  const current = categories.get(key) || { category, amountCents: 0 };
  current.amountCents += amountCents;
  categories.set(key, current);
}

function addCategory(categories, category) {
  const key = category.toLocaleLowerCase();
  if (!categories.has(key)) categories.set(key, { key, category });
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

module.exports = { createExpenseForecast };
