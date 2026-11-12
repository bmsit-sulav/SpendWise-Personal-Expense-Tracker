const DAY_MS = 24 * 60 * 60 * 1000;

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function daysBetween(firstDate, secondDate) {
  return (Date.parse(`${secondDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY_MS;
}

function matchesCadence(days, cadence) {
  return cadence === "weekly"
    ? days >= 6 && days <= 8
    : days >= 27 && days <= 32;
}

function findRecurringPatterns(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    const description = expense.description.trim().replace(/\s+/g, " ");
    if (!description) continue;
    const categoryKey = expense.category.toLocaleLowerCase();
    const descriptionKey = description.toLocaleLowerCase();
    const key = JSON.stringify([categoryKey, descriptionKey]);
    const group = groups.get(key) || [];
    group.push({
      category: expense.category,
      description,
      date: expense.date,
      amountCents: Math.round(expense.amount * 100),
    });
    groups.set(key, group);
  }

  const patterns = [];
  for (const group of groups.values()) {
    const medianCents = median(group.map((expense) => expense.amountCents));
    const similarExpenses = group
      .filter((expense) => Math.abs(expense.amountCents - medianCents) * 100 <= medianCents * 15)
      .sort((first, second) => first.date.localeCompare(second.date));
    const uniqueDates = similarExpenses.filter(
      (expense, index, items) => index === 0 || expense.date !== items[index - 1].date,
    );
    if (uniqueDates.length < 3) continue;

    for (const cadence of ["weekly", "monthly"]) {
      let run = [];
      for (const expense of uniqueDates) {
        if (run.length === 0 || matchesCadence(daysBetween(run[run.length - 1].date, expense.date), cadence)) {
          run.push(expense);
          continue;
        }
        addPattern(patterns, run, cadence);
        run = [expense];
      }
      addPattern(patterns, run, cadence);
    }
  }

  return patterns.sort((first, second) =>
    second.lastDate.localeCompare(first.lastDate) ||
    first.category.localeCompare(second.category) ||
    first.description.localeCompare(second.description)
  );
}

function addPattern(patterns, occurrences, cadence) {
  if (occurrences.length < 3) return;
  const amountCents = occurrences.reduce((sum, expense) => sum + expense.amountCents, 0);
  patterns.push({
    category: occurrences[0].category,
    description: occurrences[0].description,
    cadence,
    occurrenceCount: occurrences.length,
    averageAmountCents: Math.round(amountCents / occurrences.length),
    firstDate: occurrences[0].date,
    lastDate: occurrences[occurrences.length - 1].date,
  });
}

function createExpenseCalendar(expenses, month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const totalsByDate = new Map();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    totalsByDate.set(date, { date, totalCents: 0, expenseCount: 0, highSpending: false });
  }

  let totalCents = 0;
  let expenseCount = 0;
  for (const expense of expenses) {
    if (!expense.date.startsWith(month)) continue;
    const dailyTotal = totalsByDate.get(expense.date);
    if (!dailyTotal) continue;
    const amountCents = Math.round(expense.amount * 100);
    dailyTotal.totalCents += amountCents;
    dailyTotal.expenseCount += 1;
    totalCents += amountCents;
    expenseCount += 1;
  }

  const dailyAverageCents = Math.round(totalCents / daysInMonth);
  const highSpendingThresholdCents = Math.ceil((totalCents * 1.5) / daysInMonth);
  const days = [...totalsByDate.values()].map((day) => ({
    ...day,
    highSpending: day.totalCents > 0 && day.totalCents >= highSpendingThresholdCents,
  }));
  return {
    month,
    totalCents,
    expenseCount,
    daysInMonth,
    dailyAverageCents,
    highSpendingThresholdCents,
    highSpendingDayCount: days.filter((day) => day.highSpending).length,
    days,
    recurringPatterns: findRecurringPatterns(expenses),
  };
}

module.exports = { createExpenseCalendar, findRecurringPatterns };
