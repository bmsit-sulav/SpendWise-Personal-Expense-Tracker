function previousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function createSpendingComparison(expenses, month) {
  const lastMonth = previousMonth(month);
  const currentExpenses = expenses.filter((expense) => expense.date.startsWith(month));
  const previousExpenses = expenses.filter((expense) => expense.date.startsWith(lastMonth));
  const totalCents = (items) => items.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
  const currentTotalCents = totalCents(currentExpenses);
  const previousTotalCents = totalCents(previousExpenses);
  const currentByCategory = groupByCategory(currentExpenses);
  const previousByCategory = groupByCategory(previousExpenses);
  const categoryKeys = new Set([...currentByCategory.keys(), ...previousByCategory.keys()]);

  const categories = [...categoryKeys].map((key) => {
    const currentItems = currentByCategory.get(key) || [];
    const previousItems = previousByCategory.get(key) || [];
    const currentCents = totalCents(currentItems);
    const previousCents = totalCents(previousItems);
    const changeCents = currentCents - previousCents;
    return {
      category: currentItems[0]?.category || previousItems[0]?.category,
      currentCents,
      previousCents,
      changeCents,
      changePercent: previousCents === 0 ? null : Math.round((changeCents / previousCents) * 100),
      isNew: previousCents === 0 && currentCents > 0,
      trend: changeCents > 0 ? "increased" : changeCents < 0 ? "decreased" : "unchanged",
    };
  })
    .filter((category) => category.changeCents !== 0)
    .sort((first, second) => second.changeCents - first.changeCents);

  const combinedExpenses = [...currentExpenses, ...previousExpenses];
  const recentByCategory = groupByCategory(combinedExpenses);
  const unusualExpenses = combinedExpenses.flatMap((expense) => {
    const categoryExpenses = recentByCategory.get(expense.category.toLocaleLowerCase()) || [];
    if (categoryExpenses.length < 3) return [];
    const medianCents = median(categoryExpenses.map((item) => Math.round(item.amount * 100)));
    const amountCents = Math.round(expense.amount * 100);
    if (amountCents < medianCents * 2) return [];
    return [{
      id: expense.id,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      amountCents,
      medianCents,
      multiple: Math.round((amountCents / medianCents) * 10) / 10,
    }];
  }).sort((first, second) => second.amountCents - first.amountCents);

  return {
    month,
    lastMonth,
    currentTotalCents,
    previousTotalCents,
    changeCents: currentTotalCents - previousTotalCents,
    changePercent: previousTotalCents === 0
      ? null
      : Math.round(((currentTotalCents - previousTotalCents) / previousTotalCents) * 100),
    isNew: previousTotalCents === 0 && currentTotalCents > 0,
    categories,
    unusualExpenses,
  };
}

function groupByCategory(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    const key = expense.category.toLocaleLowerCase();
    const items = groups.get(key) || [];
    items.push(expense);
    groups.set(key, items);
  }
  return groups;
}

module.exports = { createSpendingComparison };
