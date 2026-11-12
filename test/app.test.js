const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp } = require("../server/app");
const { createSpendingComparison } = require("../server/spending-comparison");
const { calculateSavingsPlan } = require("../server/savings-goal-plan");
const { createExpenseCalendar } = require("../server/expense-calendar");
const { createExpenseForecast } = require("../server/expense-forecast");
const { answerFinancialQuestion } = require("../server/financial-assistant");

const validExpense = {
  amount: 125.5,
  category: "Food",
  date: "2026-11-09",
  description: "Lunch",
};

async function withServer(run, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spendwise-test-"));
  const server = createApp({
    dataFile: path.join(directory, "expenses.json"),
    budgetsFile: path.join(directory, "budgets.json"),
    savingsGoalsFile: path.join(directory, "savings-goals.json"),
    ratesFile: path.join(directory, "exchange-rates.json"),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function rateResponse() {
  return {
    result: "success",
    base_code: "INR",
    time_last_update_utc: "Wed, 11 Nov 2026 00:00:00 +0000",
    rates: { USD: 0.01, EUR: 0.009, GBP: 0.008, NPR: 1.6 },
  };
}

async function json(response) {
  return response.json();
}

test("serves the browser app and starts with an empty ledger", async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(await page.text(), /page-route\.js/);

    for (const route of ["/comparison", "/forecasting", "/assistant", "/budgets", "/savings-goals", "/calendar"]) {
      const featurePage = await fetch(`${baseUrl}${route}`);
      assert.equal(featurePage.status, 200);
      assert.match(featurePage.headers.get("content-type"), /text\/html/);
      assert.match(await featurePage.text(), /page-route\.js/);
    }

    const ledger = await fetch(`${baseUrl}/api/expenses`);
    assert.deepEqual(await json(ledger), []);
  });
});

test("answers monthly category, previous-week category, and spending-reduction questions", () => {
  const expenses = [
    { amount: 25, category: "Food", date: "2026-11-02" },
    { amount: 10, category: "Food", date: "2026-11-07" },
    { amount: 4, category: "Food", date: "2026-11-08" },
    { amount: 40, category: "Health", date: "2026-11-10" },
    { amount: 99, category: "Food", date: "2026-11-20" },
    { amount: 20, category: "Utilities", date: "2026-10-10" },
  ];
  const now = new Date(2026, 10, 12, 12);

  const monthly = answerFinancialQuestion("Where did most of my money go this month?", expenses, now);
  assert.equal(monthly.intent, "monthly-highest");
  assert.equal(monthly.totalCents, 7900);
  assert.equal(monthly.categories[0].category, "Health");
  assert.equal(monthly.categories[0].amountCents, 4000);

  const weekly = answerFinancialQuestion("How much did I spend on food last week?", expenses, now);
  assert.equal(weekly.intent, "weekly-category");
  assert.equal(weekly.category, "Food");
  assert.equal(weekly.fromDate, "2026-11-02");
  assert.equal(weekly.toDate, "2026-11-08");
  assert.equal(weekly.amountCents, 3900);
  assert.equal(weekly.expenseCount, 3);

  const reduction = answerFinancialQuestion("How can I reduce my expenses?", expenses, now);
  assert.equal(reduction.intent, "expense-reduction");
  assert.deepEqual(reduction.categories.map((category) => category.category), ["Health", "Food"]);

  assert.equal(answerFinancialQuestion("What is my account balance?", expenses, now).intent, "unsupported");
});

test("answers financial assistant requests locally and validates question length", async () => {
  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validExpense, amount: 30, date: "2026-11-10", category: "Health" }),
    });
    const response = await fetch(`${baseUrl}/api/financial-assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Where did most of my money go this month?" }),
    });
    assert.equal(response.status, 200);
    const answer = await json(response);
    assert.equal(answer.intent, "monthly-highest");
    assert.equal(answer.categories[0].category, "Health");

    const invalid = await fetch(`${baseUrl}/api/financial-assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "a".repeat(301) }),
    });
    assert.equal(invalid.status, 400);
  }, { now: () => new Date(2026, 10, 12, 12) });
});

test("forecasts category spending from history and estimates budget headroom", () => {
  const forecast = createExpenseForecast(
    [
      { amount: 31, category: "Food", date: "2026-10-10" },
      { amount: 5, category: "Food", date: "2026-11-02" },
    ],
    [{ amount: 30, category: "Food" }],
    new Date(2026, 10, 12, 12),
  );

  assert.equal(forecast.month, "2026-11");
  assert.equal(forecast.actualCents, 500);
  assert.equal(forecast.projectedCents, 2300);
  assert.equal(forecast.historicalMonths.length, 1);
  assert.equal(forecast.categories[0].projectedCents, 2300);
  assert.equal(forecast.potentialSavingsCents, 700);
  assert.equal(forecast.budgetOverageCents, 0);
});

test("uses current-month pace when history is unavailable and withholds savings without a usable estimate", () => {
  const currentPace = createExpenseForecast(
    [{ amount: 12.5, category: "Food", date: "2026-11-12" }],
    [],
    new Date(2026, 10, 12, 12),
  );
  assert.equal(currentPace.method, "current-pace");
  assert.equal(currentPace.projectedCents, 3125);
  assert.equal(currentPace.potentialSavingsCents, null);

  const noHistory = createExpenseForecast(
    [],
    [{ amount: 30, category: "Food" }],
    new Date(2026, 10, 12, 12),
  );
  assert.equal(noHistory.method, "insufficient-data");
  assert.equal(noHistory.potentialSavingsCents, null);
});

test("does not extend a category's current-month pace when prior-month history exists but the category is new", () => {
  const forecast = createExpenseForecast(
    [
      { amount: 31, category: "Food", date: "2026-10-10" },
      { amount: 5, category: "Food", date: "2026-11-02" },
      { amount: 20, category: "Utilities", date: "2026-11-12" },
    ],
    [],
    new Date(2026, 10, 12, 12),
  );

  const utilities = forecast.categories.find((category) => category.category === "Utilities");
  assert.equal(utilities.projectedCents, 2000);
  assert.equal(forecast.projectedCents, 4300);
});

test("serves the current-month expense forecast using expenses and budgets", async () => {
  await withServer(async (baseUrl) => {
    for (const expense of [
      { ...validExpense, amount: 31, date: "2026-10-10" },
      { ...validExpense, amount: 5, date: "2026-11-02" },
    ]) {
      const created = await fetch(`${baseUrl}/api/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expense),
      });
      assert.equal(created.status, 201);
    }

    const savedBudget = await fetch(`${baseUrl}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month: "2026-11", category: "Food", amount: 30 }),
    });
    assert.equal(savedBudget.status, 200);

    const response = await fetch(`${baseUrl}/api/expense-forecast`);
    assert.equal(response.status, 200);
    const forecast = await json(response);
    assert.equal(forecast.month, "2026-11");
    assert.equal(forecast.projectedCents, 2300);
    assert.equal(forecast.potentialSavingsCents, 700);
  }, { now: () => new Date(2026, 10, 12, 12) });
});

test("returns monthly day totals and validates the expense calendar month", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validExpense),
    });
    assert.equal(created.status, 201);

    const response = await fetch(`${baseUrl}/api/expense-calendar?month=2026-11`);
    assert.equal(response.status, 200);
    const calendar = await json(response);
    assert.equal(calendar.month, "2026-11");
    assert.equal(calendar.totalCents, 12550);
    assert.equal(calendar.daysInMonth, 30);
    assert.equal(calendar.days.find((day) => day.date === "2026-11-09").totalCents, 12550);

    const invalid = await fetch(`${baseUrl}/api/expense-calendar?month=2026-13`);
    assert.equal(invalid.status, 400);
  });
});

test("creates, updates, lists, and deletes an expense", async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validExpense),
    });
    assert.equal(createdResponse.status, 201);
    const created = await json(createdResponse);
    assert.equal(created.amount, validExpense.amount);
    assert.equal(created.category, validExpense.category);
    assert.ok(created.id);
    assert.ok(created.createdAt);

    const updatedResponse = await fetch(`${baseUrl}/api/expenses/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validExpense, amount: 200, description: "Dinner" }),
    });
    assert.equal(updatedResponse.status, 200);
    assert.equal((await json(updatedResponse)).description, "Dinner");

    const listed = await fetch(`${baseUrl}/api/expenses`);
    assert.equal((await json(listed)).length, 1);

    const deleted = await fetch(`${baseUrl}/api/expenses/${created.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await json(await fetch(`${baseUrl}/api/expenses`)), []);
  });
});

test("returns a month-over-month comparison from the API", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validExpense),
    });
    assert.equal(created.status, 201);

    const response = await fetch(`${baseUrl}/api/spending-comparison?month=2026-11`);
    assert.equal(response.status, 200);
    const comparison = await json(response);
    assert.equal(comparison.month, "2026-11");
    assert.equal(comparison.lastMonth, "2026-10");
    assert.equal(comparison.currentTotalCents, 12550);
    assert.equal(comparison.previousTotalCents, 0);
    assert.equal(comparison.isNew, true);

    const invalid = await fetch(`${baseUrl}/api/spending-comparison?month=2026-13`);
    assert.equal(invalid.status, 400);
  });
});

test("rejects invalid expenses and reports missing records", async () => {
  await withServer(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validExpense, amount: -1 }),
    });
    assert.equal(invalid.status, 400);
    assert.match((await json(invalid)).error, /positive number/);

    const badDate = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validExpense, date: "2026-02-30" }),
    });
    assert.equal(badDate.status, 400);

    const missing = await fetch(`${baseUrl}/api/expenses/not-a-real-id`, { method: "DELETE" });
    assert.equal(missing.status, 404);
  });
});

test("persists expenses in the JSON data file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spendwise-test-"));
  const dataFile = path.join(directory, "nested", "expenses.json");
  const first = createApp({ dataFile });
  await new Promise((resolve) => first.listen(0, "127.0.0.1", resolve));
  const address = first.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validExpense),
    });
  } finally {
    await new Promise((resolve, reject) => first.close((error) => error ? reject(error) : resolve()));
  }
  const stored = JSON.parse(await fs.readFile(dataFile, "utf8"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].amountCents, 12550);
  await fs.rm(directory, { recursive: true, force: true });
});

test("converts non-INR expense input to INR before storing", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validExpense, amount: 10, currency: "USD" }),
    });
    assert.equal(response.status, 201);
    assert.equal((await json(response)).amount, 1000);
    const listed = await fetch(`${baseUrl}/api/expenses`);
    assert.equal((await json(listed))[0].amount, 1000);
  }, { fetchRates: async () => rateResponse() });
});

test("serves exchange rates and uses cached rates when the provider is offline", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spendwise-rates-test-"));
  const ratesFile = path.join(directory, "exchange-rates.json");
  await fs.writeFile(ratesFile, JSON.stringify({
    base: "INR",
    rates: { INR: 1, USD: 0.01, EUR: 0.009, GBP: 0.008, NPR: 1.6 },
    updatedAt: "Wed, 11 Nov 2026 00:00:00 +0000",
    fetchedAt: "2020-01-01T00:00:00.000Z",
  }));
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/exchange-rates`);
      assert.equal(response.status, 200);
      const result = await json(response);
      assert.equal(result.base, "INR");
      assert.equal(result.rates.USD, 0.01);
      assert.equal(result.stale, true);
    }, {
      ratesFile,
      fetchRates: async () => { throw new Error("offline"); },
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("reports unavailable rates when neither network nor cache is available", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/exchange-rates`);
    assert.equal(response.status, 503);
    assert.match((await json(response)).error, /Exchange rates are unavailable/);
  }, {
    fetchRates: async () => { throw new Error("offline"); },
  });
});

test("creates, updates, lists, and deletes monthly category budgets", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        month: "2026-11",
        category: "Food",
        amount: 10,
        currency: "USD",
      }),
    });
    assert.equal(createResponse.status, 200);
    assert.equal((await json(createResponse)).amount, 1000);

    const updateResponse = await fetch(`${baseUrl}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        month: "2026-11",
        category: "food",
        amount: 1500,
        currency: "INR",
      }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await json(updateResponse)).amount, 1500);

    const listed = await fetch(`${baseUrl}/api/budgets?month=2026-11`);
    const budgets = await json(listed);
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].amount, 1500);

    const anotherMonth = await fetch(`${baseUrl}/api/budgets?month=2026-12`);
    assert.deepEqual(await json(anotherMonth), []);

    const deleted = await fetch(
      `${baseUrl}/api/budgets?month=2026-11&category=${encodeURIComponent("FOOD")}`,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 200);
    assert.deepEqual(await json(await fetch(`${baseUrl}/api/budgets?month=2026-11`)), []);
  }, { fetchRates: async () => rateResponse() });
});

test("rejects malformed monthly budgets and returns not found for missing budgets", async () => {
  await withServer(async (baseUrl) => {
    const invalidMonth = await fetch(`${baseUrl}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month: "2026-13", category: "Food", amount: 100 }),
    });
    assert.equal(invalidMonth.status, 400);

    const invalidAmount = await fetch(`${baseUrl}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month: "2026-11", category: "Food", amount: 0 }),
    });
    assert.equal(invalidAmount.status, 400);

    const missing = await fetch(
      `${baseUrl}/api/budgets?month=2026-11&category=Food`,
      { method: "DELETE" },
    );
    assert.equal(missing.status, 404);
  });
});

test("creates, updates, lists, and deletes savings goals", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/savings-goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Laptop",
        targetAmount: 1200,
        savedAmount: 250,
        deadline: "2027-06-30",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await json(createResponse);
    assert.equal(created.name, "Laptop");
    assert.equal(created.targetAmount, 1200);
    assert.equal(created.savedAmount, 250);
    assert.ok(created.id);
    assert.ok(created.createdAt);

    const listed = await fetch(`${baseUrl}/api/savings-goals`);
    assert.equal((await json(listed)).length, 1);

    const updateResponse = await fetch(`${baseUrl}/api/savings-goals/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Laptop",
        targetAmount: 1200,
        savedAmount: 400,
        deadline: "2027-06-30",
      }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await json(updateResponse)).savedAmount, 400);

    const deleteResponse = await fetch(`${baseUrl}/api/savings-goals/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await json(await fetch(`${baseUrl}/api/savings-goals`)), []);
  });
});

test("validates savings goal amounts and dates and converts non-INR values", async () => {
  await withServer(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/savings-goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Laptop",
        targetAmount: 100,
        savedAmount: 101,
        deadline: "2027-02-29",
      }),
    });
    assert.equal(invalid.status, 400);

    const convertedResponse = await fetch(`${baseUrl}/api/savings-goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Laptop",
        targetAmount: 10,
        savedAmount: 5,
        currency: "USD",
        deadline: "2027-06-30",
      }),
    });
    assert.equal(convertedResponse.status, 201);
    const converted = await json(convertedResponse);
    assert.equal(converted.targetAmount, 1000);
    assert.equal(converted.savedAmount, 500);
  }, { fetchRates: async () => rateResponse() });
});

test("calculates monthly savings across calendar months and handles completed or overdue goals", () => {
  const active = calculateSavingsPlan({
    targetAmount: 1200,
    savedAmount: 400,
    deadline: "2027-03-31",
  }, "2026-11-12");
  assert.deepEqual(active, {
    status: "active",
    monthsRemaining: 5,
    monthlyCents: 16000,
  });

  const roundedUp = calculateSavingsPlan({
    targetAmount: 10.01,
    savedAmount: 0,
    deadline: "2027-01-31",
  }, "2026-11-12");
  assert.equal(roundedUp.monthsRemaining, 3);
  assert.equal(roundedUp.monthlyCents, 334);

  const completed = calculateSavingsPlan({
    targetAmount: 1200,
    savedAmount: 1200,
    deadline: "2027-03-31",
  }, "2026-11-12");
  assert.equal(completed.status, "reached");
  assert.equal(completed.monthlyCents, 0);

  const overdue = calculateSavingsPlan({
    targetAmount: 1200,
    savedAmount: 400,
    deadline: "2026-11-11",
  }, "2026-11-12");
  assert.equal(overdue.status, "overdue");
  assert.equal(overdue.monthlyCents, null);
});

test("compares adjacent months and identifies category changes and unusual expenses", () => {
  const expenses = [
    { id: "food-old", amount: 100, category: "Food", date: "2025-12-10", description: "Groceries" },
    { id: "food-current-b", amount: 100, category: "Food", date: "2026-01-05", description: "Groceries" },
    { id: "food-current-outlier", amount: 200, category: "Food", date: "2026-01-08", description: "Dinner" },
    { id: "transport-new", amount: 40, category: "Transport", date: "2026-01-09", description: "Taxi" },
    { id: "health-old", amount: 80, category: "Health", date: "2025-12-12", description: "Medicine" },
  ];

  const comparison = createSpendingComparison(expenses, "2026-01");
  assert.equal(comparison.lastMonth, "2025-12");
  assert.equal(comparison.previousTotalCents, 18000);
  assert.equal(comparison.currentTotalCents, 34000);
  assert.equal(comparison.changePercent, 89);
  assert.equal(comparison.isNew, false);

  const transport = comparison.categories.find((category) => category.category === "Transport");
  assert.equal(transport.isNew, true);
  assert.equal(transport.changePercent, null);

  const health = comparison.categories.find((category) => category.category === "Health");
  assert.equal(health.changePercent, -100);
  assert.equal(health.trend, "decreased");

  assert.deepEqual(comparison.unusualExpenses.map((expense) => expense.id), ["food-current-outlier"]);
  assert.equal(comparison.unusualExpenses[0].medianCents, 10000);
  assert.equal(comparison.unusualExpenses[0].sampleSize, 3);
  assert.equal(comparison.unusualExpenses[0].multiple, 2);
});

test("compares percentages against zero spending as new spending", () => {
  const comparison = createSpendingComparison([
    { id: "new", amount: 25, category: "Food", date: "2026-03-01", description: "Lunch" },
  ], "2026-03");

  assert.equal(comparison.lastMonth, "2026-02");
  assert.equal(comparison.previousTotalCents, 0);
  assert.equal(comparison.currentTotalCents, 2500);
  assert.equal(comparison.changePercent, null);
  assert.equal(comparison.isNew, true);
});

test("highlights days above the monthly average and recognizes weekly and monthly patterns", () => {
  const expenses = [
    { amount: 10, category: "Coffee", date: "2024-02-01", description: "Daily brew" },
    { amount: 1000, category: "Coffee", date: "2024-02-29", description: "Daily brew" },
    { amount: 100, category: "Coffee", date: "2024-01-01", description: "Daily brew" },
    { amount: 110, category: "Coffee", date: "2024-01-08", description: "Daily  brew" },
    { amount: 90, category: "Coffee", date: "2024-01-15", description: "Daily brew" },
    { amount: 200, category: "Bills", date: "2023-11-30", description: "Cloud plan" },
    { amount: 210, category: "Bills", date: "2023-12-30", description: "Cloud plan" },
    { amount: 190, category: "Bills", date: "2024-01-30", description: "Cloud plan" },
    { amount: 300, category: "Bills", date: "2024-02-01", description: "Annual fee" },
  ];

  const calendar = createExpenseCalendar(expenses, "2024-02");
  assert.equal(calendar.daysInMonth, 29);
  assert.equal(calendar.totalCents, 131000);
  assert.equal(calendar.highSpendingThresholdCents, 6776);
  assert.equal(calendar.highSpendingDayCount, 2);
  assert.equal(calendar.days.find((day) => day.date === "2024-02-01").highSpending, true);
  assert.equal(calendar.days.find((day) => day.date === "2024-02-29").highSpending, true);
  assert.equal(calendar.days.find((day) => day.date === "2024-02-02").highSpending, false);

  const patterns = calendar.recurringPatterns;
  assert.equal(patterns.length, 2);
  assert.deepEqual(
    patterns.map(({ description, cadence, occurrenceCount }) => ({ description, cadence, occurrenceCount })),
    [
      { description: "Cloud plan", cadence: "monthly", occurrenceCount: 3 },
      { description: "Daily brew", cadence: "weekly", occurrenceCount: 3 },
    ],
  );
});
