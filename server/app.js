const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { createStore } = require("./store");
const { createBudgetStore } = require("./budget-store");
const { createSavingsGoalStore } = require("./savings-goal-store");
const { calculateSavingsPlan } = require("./savings-goal-plan");
const {
  validateExpense,
  validateBudget,
  validateSavingsGoal,
  validateBudgetMonth,
} = require("./validation");
const { createExchangeRateService } = require("./exchange-rates");
const { createSpendingComparison } = require("./spending-comparison");
const { createExpenseCalendar } = require("./expense-calendar");
const { createExpenseForecast } = require("./expense-forecast");
const { answerFinancialQuestion } = require("./financial-assistant");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PUBLIC_DIR = path.join(ROOT, "public");
const DEFAULT_DATA_FILE = path.join(ROOT, "data", "expenses.json");
const DEFAULT_BUDGETS_FILE = path.join(ROOT, "data", "budgets.json");
const DEFAULT_SAVINGS_GOALS_FILE = path.join(ROOT, "data", "savings-goals.json");
const MAX_BODY_BYTES = 1024 * 1024;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        reject(Object.assign(new Error("Request body is required."), { statusCode: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function serveStatic(request, response, publicDir, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(publicDir, relativePath);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    throw error;
  }
}

function createApp(options = {}) {
  const publicDir = path.resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const store = createStore(options.dataFile || DEFAULT_DATA_FILE);
  const budgetStore = createBudgetStore(options.budgetsFile || DEFAULT_BUDGETS_FILE);
  const savingsGoalStore = createSavingsGoalStore(options.savingsGoalsFile || DEFAULT_SAVINGS_GOALS_FILE);
  const exchangeRates = createExchangeRateService({
    cacheFile: options.ratesFile,
    fetchRates: options.fetchRates,
    now: options.now,
  });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;
      if (request.method === "GET" && pathname === "/api/exchange-rates") {
        sendJson(response, 200, await exchangeRates.getRates());
        return;
      }
      if (request.method === "GET" && pathname === "/api/spending-comparison") {
        const month = validateBudgetMonth(url.searchParams.get("month"));
        sendJson(response, 200, createSpendingComparison(await store.list(), month));
        return;
      }
      if (request.method === "GET" && pathname === "/api/expense-calendar") {
        const month = validateBudgetMonth(url.searchParams.get("month"));
        sendJson(response, 200, createExpenseCalendar(await store.list(), month));
        return;
      }
      if (request.method === "GET" && pathname === "/api/expense-forecast") {
        const now = options.now ? options.now() : new Date();
        const month = localDateValue(now).slice(0, 7);
        const [expenses, budgets] = await Promise.all([
          store.list(),
          budgetStore.list(month),
        ]);
        sendJson(response, 200, createExpenseForecast(expenses, budgets, now));
        return;
      }
      if (request.method === "POST" && pathname === "/api/financial-assistant") {
        const body = await readJson(request);
        if (typeof body?.question !== "string" || !body.question.trim()) {
          const error = new Error("Enter a question for the financial assistant.");
          error.statusCode = 400;
          throw error;
        }
        if (body.question.length > 300) {
          const error = new Error("Questions must be 300 characters or fewer.");
          error.statusCode = 400;
          throw error;
        }
        const now = options.now ? options.now() : new Date();
        sendJson(response, 200, answerFinancialQuestion(body.question, await store.list(), now));
        return;
      }
      if (pathname === "/api/budgets" && request.method === "GET") {
        const month = validateBudgetMonth(url.searchParams.get("month"));
        sendJson(response, 200, await budgetStore.list(month));
        return;
      }
      if (pathname === "/api/budgets" && request.method === "PUT") {
        const fields = await toStoredCurrency(validateBudget(await readJson(request)), exchangeRates);
        sendJson(response, 200, await budgetStore.upsert(fields));
        return;
      }
      if (pathname === "/api/budgets" && request.method === "DELETE") {
        const month = validateBudgetMonth(url.searchParams.get("month"));
        const category = url.searchParams.get("category");
        if (!category || !category.trim()) {
          const error = new Error("A budget category is required.");
          error.statusCode = 400;
          throw error;
        }
        const removed = await budgetStore.remove(month, category.trim());
        if (!removed) {
          sendJson(response, 404, { error: "Budget not found." });
          return;
        }
        sendJson(response, 200, { deleted: true });
        return;
      }
      if (pathname === "/api/savings-goals" && request.method === "GET") {
        const goals = await savingsGoalStore.list();
        const today = localDateValue();
        sendJson(response, 200, goals.map((goal) => ({
          ...goal,
          plan: calculateSavingsPlan(goal, today),
        })));
        return;
      }
      if (pathname === "/api/savings-goals" && request.method === "POST") {
        const fields = await toStoredSavingsGoal(validateSavingsGoal(await readJson(request)), exchangeRates);
        const goal = await savingsGoalStore.create(fields);
        sendJson(response, 201, {
          ...goal,
          plan: calculateSavingsPlan(goal, localDateValue()),
        });
        return;
      }
      const savingsGoalMatch = pathname.match(/^\/api\/savings-goals\/([^/]+)$/);
      if (savingsGoalMatch && request.method === "PUT") {
        const fields = await toStoredSavingsGoal(validateSavingsGoal(await readJson(request)), exchangeRates);
        const goal = await savingsGoalStore.update(decodeURIComponent(savingsGoalMatch[1]), fields);
        if (!goal) {
          sendJson(response, 404, { error: "Savings goal not found." });
          return;
        }
        sendJson(response, 200, {
          ...goal,
          plan: calculateSavingsPlan(goal, localDateValue()),
        });
        return;
      }
      if (savingsGoalMatch && request.method === "DELETE") {
        const removed = await savingsGoalStore.remove(decodeURIComponent(savingsGoalMatch[1]));
        if (!removed) {
          sendJson(response, 404, { error: "Savings goal not found." });
          return;
        }
        sendJson(response, 200, { deleted: true });
        return;
      }
      if (
        request.method === "GET" &&
        ["/comparison", "/budgets", "/savings-goals", "/calendar", "/forecasting", "/assistant"].includes(pathname)
      ) {
        await serveStatic(request, response, publicDir, "/");
        return;
      }
      if (request.method === "GET" && pathname === "/api/expenses") {
        sendJson(response, 200, await store.list());
        return;
      }
      if (request.method === "POST" && pathname === "/api/expenses") {
        const fields = await toStoredCurrency(validateExpense(await readJson(request)), exchangeRates);
        sendJson(response, 201, await store.create(fields));
        return;
      }

      const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
      if (expenseMatch && request.method === "PUT") {
        const fields = await toStoredCurrency(validateExpense(await readJson(request)), exchangeRates);
        const expense = await store.update(decodeURIComponent(expenseMatch[1]), fields);
        if (!expense) {
          sendJson(response, 404, { error: "Expense not found." });
          return;
        }
        sendJson(response, 200, expense);
        return;
      }
      if (expenseMatch && request.method === "DELETE") {
        const removed = await store.remove(decodeURIComponent(expenseMatch[1]));
        if (!removed) {
          sendJson(response, 404, { error: "Expense not found." });
          return;
        }
        sendJson(response, 200, { deleted: true });
        return;
      }
      if (pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "API route not found." });
        return;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(request, response, publicDir, pathname);
        return;
      }
      sendJson(response, 405, { error: "Method not allowed." });
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        console.error("Request failed after the response started:", error);
        return;
      }
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error("Request failed:", error);
      }
      sendJson(response, statusCode, {
        error: statusCode === 503
          ? error.message
          : statusCode >= 500
            ? "The server could not complete the request."
            : error.message,
      });
    }
  });
}

async function toStoredCurrency(fields, exchangeRates) {
  const { currency, amountCents, ...expense } = fields;
  if (currency === "INR") {
    return { ...expense, amountCents };
  }
  const rates = await exchangeRates.getRates();
  return {
    ...expense,
    amountCents: Math.round(amountCents / rates.rates[currency]),
  };
}

async function toStoredSavingsGoal(fields, exchangeRates) {
  const { currency, ...goal } = fields;
  if (currency === "INR") return goal;
  const rates = await exchangeRates.getRates();
  return {
    ...goal,
    targetCents: Math.round(goal.targetCents / rates.rates[currency]),
    savedCents: Math.round(goal.savedCents / rates.rates[currency]),
  };
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = { createApp };
