const CURRENCY_KEY = "spendwise.currency";
const CURRENCY_SYMBOLS = { EUR: "€", GBP: "£", INR: "₹", NPR: "रू", USD: "$" };
const DEFAULT_CATEGORIES = ["Food", "Transport", "Housing", "Utilities", "Health", "Shopping", "Entertainment", "Other"];
const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);
const form = document.querySelector("#expense-form");
const amountInput = document.querySelector("#amount-input");
const categoryInput = document.querySelector("#category-input");
const dateInput = document.querySelector("#date-input");
const descriptionInput = document.querySelector("#description-input");
const list = document.querySelector("#expense-list");
const emptyState = document.querySelector("#empty-state");
const formMessage = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");
const cancelButton = document.querySelector("#cancel-edit");
const currencySelect = document.querySelector("#currency-select");
const budgetMonthInput = document.querySelector("#budget-month");
const calendarMonthInput = document.querySelector("#calendar-month");
const budgetForm = document.querySelector("#budget-form");
const budgetCategoryInput = document.querySelector("#budget-category");
const budgetAmountInput = document.querySelector("#budget-amount");
const budgetSubmitButton = document.querySelector("#budget-submit");
const budgetCancelButton = document.querySelector("#budget-cancel");
const budgetMessage = document.querySelector("#budget-message");
const savingsGoalForm = document.querySelector("#savings-goal-form");
const savingsGoalNameInput = document.querySelector("#savings-goal-name");
const savingsGoalTargetInput = document.querySelector("#savings-goal-target");
const savingsGoalSavedInput = document.querySelector("#savings-goal-saved");
const savingsGoalDeadlineInput = document.querySelector("#savings-goal-deadline");
const savingsGoalSubmitButton = document.querySelector("#savings-goal-submit");
const savingsGoalCancelButton = document.querySelector("#savings-goal-cancel");

const page = window.location.hash === "#transactions"
  ? "transactions"
  : document.documentElement.dataset.page || "home";
const pageLabels = {
  home: "Overview",
  transactions: "Transactions",
  comparison: "Spending comparison",
  budgets: "Budgets",
  "savings-goals": "Savings goals",
  calendar: "Expense calendar",
};
document.querySelector("#breadcrumb-current").textContent = pageLabels[page] || pageLabels.home;
for (const link of document.querySelectorAll(".nav-link")) {
  const active = link.dataset.page === page;
  link.classList.toggle("active", active);
  if (active) link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
}

let expenses = [];
let budgets = [];
let savingsGoals = [];
let spendingComparison = null;
let expenseCalendar = null;
let selectedCalendarDate = localDateValue();
let editingId = null;
let editingBudgetCategory = null;
let editingSavingsGoalId = null;
let currency = localStorage.getItem(CURRENCY_KEY) || "INR";
let exchangeRates = { base: "INR", rates: { INR: 1 }, stale: true };

function formatAmount(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatInCurrency(amount, currencyCode) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
}

function convertFromInr(amount) {
  return amount * (exchangeRates.rates[currency] || 1);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "The request could not be completed.");
  }
  return result;
}

function createCell(className, text) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function currentFilters() {
  const search = document.querySelector("#search-input").value.trim().toLocaleLowerCase();
  const category = document.querySelector("#category-filter").value;
  const month = document.querySelector("#month-filter").value;
  return expenses
    .filter((expense) => !category || expense.category === category)
    .filter((expense) => !month || expense.date.startsWith(month))
    .filter((expense) => {
      const searchable = `${expense.description} ${expense.category} ${expense.date}`.toLocaleLowerCase();
      return !search || searchable.includes(search);
    })
    .sort((first, second) => second.date.localeCompare(first.date) || second.createdAt.localeCompare(first.createdAt));
}

function renderSummary() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totalInr = expenses.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0) / 100;
  const monthlyTotal = expenses
    .filter((expense) => expense.date.startsWith(month))
    .reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0) / 100;
  document.querySelector("#total-spent").textContent = formatAmount(convertFromInr(totalInr));
  document.querySelector("#month-spent").textContent = formatAmount(convertFromInr(monthlyTotal));
  document.querySelector("#expense-count").textContent = new Intl.NumberFormat().format(expenses.length);
  document.querySelector("#month-caption").textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(now);
  document.querySelector("#visible-count").textContent = new Intl.NumberFormat().format(currentFilters().length);
}

function renderExpenses() {
  const categoryFilter = document.querySelector("#category-filter");
  const selectedCategory = categoryFilter.value;
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...expenses.map((expense) => expense.category)])].sort();
  categoryFilter.replaceChildren(new Option("All categories", ""));
  for (const category of categories) {
    categoryFilter.add(new Option(category, category));
  }
  categoryFilter.value = selectedCategory;

  const visibleExpenses = currentFilters();
  list.replaceChildren();
  document.querySelector("#visible-count").textContent = new Intl.NumberFormat().format(visibleExpenses.length);
  emptyState.hidden = visibleExpenses.length > 0;
  document.querySelector("#empty-title").textContent = expenses.length ? "No matching expenses" : "Your ledger is ready";
  document.querySelector("#empty-message").textContent = expenses.length
    ? "Try changing your search or filters."
    : "Add your first expense to see it here.";
  document.querySelector("#empty-action").hidden = expenses.length > 0;

  for (const expense of visibleExpenses) {
    const row = document.createElement("tr");
    const descriptionCell = document.createElement("td");
    descriptionCell.className = "description-cell";
    descriptionCell.textContent = expense.description || expense.category;
    if (expense.description) {
      const categoryDescription = document.createElement("small");
      categoryDescription.textContent = expense.category;
      descriptionCell.append(categoryDescription);
    }
    row.append(descriptionCell);

    const categoryCell = document.createElement("td");
    const categoryTag = document.createElement("span");
    categoryTag.className = "category-tag";
    categoryTag.textContent = expense.category;
    categoryCell.append(categoryTag);
    row.append(categoryCell);

    row.append(createCell("", formatDate(expense.date)));
    row.append(createCell("amount-cell", formatAmount(convertFromInr(expense.amount))));
    const actions = document.createElement("td");
    actions.className = "actions-cell";
    const edit = document.createElement("button");
    edit.className = "row-action";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${expense.description || expense.category}`);
    edit.addEventListener("click", () => startEditing(expense));
    const remove = document.createElement("button");
    remove.className = "row-action delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${expense.description || expense.category}`);
    remove.addEventListener("click", () => deleteExpense(expense));
    actions.append(edit, remove);
    row.append(actions);
    list.append(row);
  }
}

function render() {
  renderSummary();
  renderExpenses();
  renderComparison();
  renderBudgets();
  renderSavingsGoals();
  renderExpenseCalendar();
}

function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = localDateValue();
  document.querySelector("#form-title").textContent = "Add expense";
  submitButton.innerHTML = 'Save expense <span aria-hidden="true">→</span>';
  cancelButton.hidden = true;
  showMessage("");
  updateConversionPreview();
}

function startEditing(expense) {
  editingId = expense.id;
  amountInput.value = convertFromInr(expense.amount).toFixed(2);
  categoryInput.value = expense.category;
  dateInput.value = expense.date;
  descriptionInput.value = expense.description;
  document.querySelector("#form-title").textContent = "Edit expense";
  submitButton.textContent = "Save changes";
  cancelButton.hidden = false;
  showMessage("");
  updateConversionPreview();
  document.querySelector("#add-expense").scrollIntoView({ behavior: "smooth", block: "start" });
  amountInput.focus({ preventScroll: true });
}

function updateConversionPreview() {
  const amount = Number(amountInput.value);
  const preview = document.querySelector("#conversion-preview");
  if (!Number.isFinite(amount) || amount <= 0) {
    preview.textContent = "";
    return;
  }
  const rate = exchangeRates.rates[currency];
  if (!rate) {
    preview.textContent = "Exchange rate unavailable.";
    return;
  }
  const amountInr = Math.round((amount / rate) * 100) / 100;
  preview.textContent = `≈ ${formatInCurrency(amountInr, "INR")} stored in INR`;
}

function updateRateStatus() {
  const status = document.querySelector("#rate-status");
  const updatedAt = new Date(exchangeRates.updatedAt || exchangeRates.fetchedAt);
  const date = Number.isNaN(updatedAt.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(updatedAt);
  status.classList.toggle("stale", exchangeRates.stale);
  status.classList.remove("error");
  status.textContent = exchangeRates.stale
    ? `Saved rates${date ? ` · ${date}` : ""}`
    : `Rates updated${date ? ` · ${date}` : ""}`;
}

function selectedBudgetMonth() {
  return budgetMonthInput.value || localDateValue().slice(0, 7);
}

function monthExpenses(month) {
  return expenses.filter((expense) => expense.date.startsWith(month));
}

function categoryMonthSpendCents(category, month) {
  const normalizedCategory = category.toLocaleLowerCase();
  return monthExpenses(month)
    .filter((expense) => expense.category.toLocaleLowerCase() === normalizedCategory)
    .reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
}

function formatDisplayCents(amountCents) {
  return formatAmount(convertFromInr(amountCents / 100));
}

function showBudgetMessage(message, isError = false) {
  budgetMessage.textContent = message;
  budgetMessage.classList.toggle("error", isError);
}

function comparisonMonthLabel(month) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(`${month}-01T00:00:00`));
}

function percentageLabel(changePercent, isNew) {
  if (isNew) return "New";
  if (changePercent === null || changePercent === 0) return "0%";
  return `${changePercent > 0 ? "+" : ""}${changePercent}%`;
}

function renderComparison() {
  const categoryList = document.querySelector("#comparison-category-list");
  const unusualList = document.querySelector("#unusual-expense-list");
  categoryList.replaceChildren();
  unusualList.replaceChildren();
  document.querySelector("#comparison-category-empty").hidden = true;
  document.querySelector("#unusual-expense-empty").hidden = true;
  document.querySelector("#comparison-message").textContent = "";
  if (!spendingComparison) {
    document.querySelector("#comparison-current-total").textContent = "—";
    document.querySelector("#comparison-previous-total").textContent = "—";
    const change = document.querySelector("#comparison-change");
    change.textContent = "—";
    change.classList.remove("increased", "decreased");
    document.querySelector("#comparison-change-caption").textContent = "Compared with last month";
    return;
  }

  const comparison = spendingComparison;
  const currentLabel = comparisonMonthLabel(comparison.month);
  const previousLabel = comparisonMonthLabel(comparison.lastMonth);
  document.querySelector("#comparison-current-label").textContent = currentLabel;
  document.querySelector("#comparison-previous-label").textContent = previousLabel;
  document.querySelector("#comparison-period").textContent = `${previousLabel} → ${currentLabel}`;
  document.querySelector("#comparison-range").textContent = `${currentLabel} compared with ${previousLabel}`;
  document.querySelector("#comparison-current-total").textContent =
    formatDisplayCents(comparison.currentTotalCents);
  document.querySelector("#comparison-previous-total").textContent =
    formatDisplayCents(comparison.previousTotalCents);

  const change = document.querySelector("#comparison-change");
  change.textContent = percentageLabel(comparison.changePercent, comparison.isNew);
  change.classList.toggle("increased", comparison.changeCents > 0);
  change.classList.toggle("decreased", comparison.changeCents < 0);
  document.querySelector("#comparison-change-caption").textContent = comparison.isNew
    ? `New spending: ${formatDisplayCents(comparison.changeCents)}`
    : `${comparison.changeCents > 0 ? "More" : comparison.changeCents < 0 ? "Less" : "No change"} by ${formatDisplayCents(Math.abs(comparison.changeCents))}`;

  const categories = comparison.categories;
  document.querySelector("#comparison-category-empty").hidden = categories.length > 0;
  for (const item of categories) {
    const row = document.createElement("article");
    row.className = `comparison-category ${item.trend}`;

    const description = document.createElement("div");
    description.className = "comparison-category-name";
    const name = document.createElement("strong");
    name.textContent = item.category;
    const amounts = document.createElement("small");
    amounts.textContent = `${formatDisplayCents(item.previousCents)} → ${formatDisplayCents(item.currentCents)}`;
    description.append(name, amounts);

    const changeLabel = document.createElement("span");
    changeLabel.className = `comparison-change-label ${item.trend}`;
    const changeValue = item.isNew ? "New" : `${Math.abs(item.changePercent)}%`;
    changeLabel.textContent = `${item.changeCents > 0 ? "↑" : "↓"} ${changeValue}`;
    row.append(description, changeLabel);
    categoryList.append(row);
  }

  const unusualExpenses = comparison.unusualExpenses;
  document.querySelector("#unusual-expense-empty").hidden = unusualExpenses.length > 0;
  for (const expense of unusualExpenses) {
    const item = document.createElement("article");
    item.className = "unusual-expense";

    const description = document.createElement("div");
    description.className = "unusual-expense-description";
    const title = document.createElement("strong");
    title.textContent = expense.description || expense.category;
    const detail = document.createElement("small");
    detail.textContent = `${expense.category} · ${formatDate(expense.date)} · ${expense.multiple}× category median`;
    description.append(title, detail);

    const amount = document.createElement("span");
    amount.className = "unusual-expense-amount";
    amount.textContent = formatDisplayCents(expense.amountCents);
    item.append(description, amount);
    unusualList.append(item);
  }
}

async function loadSpendingComparison() {
  const month = localDateValue().slice(0, 7);
  try {
    spendingComparison = await request(`/api/spending-comparison?month=${encodeURIComponent(month)}`);
    renderComparison();
  } catch (error) {
    spendingComparison = null;
    renderComparison();
    document.querySelector("#comparison-message").textContent =
      `Could not load spending comparison: ${error.message}`;
  }
}

function selectedCalendarMonth() {
  return calendarMonthInput.value || localDateValue().slice(0, 7);
}

function renderExpenseCalendar() {
  const calendarGrid = document.querySelector("#calendar-grid");
  const dayExpenseList = document.querySelector("#calendar-day-expenses");
  const patternList = document.querySelector("#recurring-pattern-list");
  calendarGrid.replaceChildren();
  dayExpenseList.replaceChildren();
  patternList.replaceChildren();
  document.querySelector("#calendar-day-empty").hidden = true;
  document.querySelector("#recurring-pattern-empty").hidden = true;
  document.querySelector("#calendar-message").textContent = "";

  if (!expenseCalendar) {
    document.querySelector("#calendar-total").textContent = "—";
    document.querySelector("#calendar-high-count").textContent = "—";
    document.querySelector("#calendar-average").textContent = "—";
    document.querySelector("#calendar-selected-date").textContent = "Choose a day";
    document.querySelector("#calendar-selected-total").textContent = "—";
    document.querySelector("#calendar-selected-count").textContent = "";
    return;
  }

  const calendar = expenseCalendar;
  const monthLabel = comparisonMonthLabel(calendar.month);
  document.querySelector("#calendar-total").textContent = formatDisplayCents(calendar.totalCents);
  document.querySelector("#calendar-expense-count").textContent =
    `${calendar.expenseCount} ${calendar.expenseCount === 1 ? "expense" : "expenses"} in ${monthLabel}`;
  document.querySelector("#calendar-high-count").textContent = String(calendar.highSpendingDayCount);
  document.querySelector("#calendar-high-threshold").textContent = calendar.totalCents > 0
    ? `At least ${formatDisplayCents(calendar.highSpendingThresholdCents)} (1.5× daily average)`
    : "No recorded spending this month";
  document.querySelector("#calendar-average").textContent = formatDisplayCents(calendar.dailyAverageCents);

  const [year, month] = calendar.month.split("-").map(Number);
  const firstDayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  for (let index = 0; index < firstDayOffset; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day-spacer";
    spacer.setAttribute("aria-hidden", "true");
    calendarGrid.append(spacer);
  }

  for (const day of calendar.days) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (day.expenseCount > 0) button.classList.add("has-expenses");
    if (day.highSpending) button.classList.add("high-spending");
    if (day.date === selectedCalendarDate) button.classList.add("selected");
    button.setAttribute("aria-pressed", String(day.date === selectedCalendarDate));
    button.setAttribute(
      "aria-label",
      `${formatDate(day.date)}: ${formatDisplayCents(day.totalCents)}${day.highSpending ? ", high-spending day" : ""}`,
    );

    const number = document.createElement("strong");
    number.className = "calendar-day-number";
    number.textContent = String(Number(day.date.slice(-2)));
    const amount = document.createElement("span");
    amount.className = "calendar-day-total";
    amount.textContent = formatDisplayCents(day.totalCents);
    const activity = document.createElement("small");
    activity.className = "calendar-day-activity";
    activity.textContent = day.highSpending
      ? "High spend"
      : day.expenseCount
        ? `${day.expenseCount} ${day.expenseCount === 1 ? "entry" : "entries"}`
        : "";
    button.append(number, amount, activity);
    button.addEventListener("click", () => {
      selectedCalendarDate = day.date;
      renderExpenseCalendar();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.querySelector(".calendar-day.selected").animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.045)" },
            { transform: "scale(1)" },
          ],
          { duration: 250, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
        document.querySelector(".calendar-day-card").animate(
          [
            { opacity: 0, transform: "translateY(8px) scale(0.985)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 250, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
      }
    });
    calendarGrid.append(button);
  }

  const selectedDay = calendar.days.find((day) => day.date === selectedCalendarDate) || calendar.days[0];
  if (selectedDay) {
    selectedCalendarDate = selectedDay.date;
    document.querySelector("#calendar-selected-date").textContent = formatDate(selectedDay.date);
    document.querySelector("#calendar-selected-total").textContent = formatDisplayCents(selectedDay.totalCents);
    document.querySelector("#calendar-selected-count").textContent =
      `${selectedDay.expenseCount} ${selectedDay.expenseCount === 1 ? "expense" : "expenses"} recorded`;
    const selectedExpenses = expenses
      .filter((expense) => expense.date === selectedDay.date)
      .sort((first, second) => second.amount - first.amount);
    document.querySelector("#calendar-day-empty").hidden = selectedExpenses.length > 0;
    for (const expense of selectedExpenses) {
      const item = document.createElement("article");
      item.className = "calendar-expense";
      const description = document.createElement("div");
      description.className = "calendar-expense-description";
      const title = document.createElement("strong");
      title.textContent = expense.description || expense.category;
      const category = document.createElement("small");
      category.textContent = expense.category;
      description.append(title, category);
      const amount = document.createElement("span");
      amount.textContent = formatDisplayCents(Math.round(expense.amount * 100));
      item.append(description, amount);
      dayExpenseList.append(item);
    }
  }

  const patterns = calendar.recurringPatterns;
  document.querySelector("#recurring-pattern-empty").hidden = patterns.length > 0;
  for (const pattern of patterns) {
    const item = document.createElement("article");
    item.className = "recurring-pattern";
    const description = document.createElement("div");
    description.className = "recurring-pattern-description";
    const title = document.createElement("strong");
    title.textContent = pattern.description;
    const detail = document.createElement("small");
    detail.textContent = `${pattern.category} · ${pattern.cadence} · ${pattern.occurrenceCount} occurrences`;
    description.append(title, detail);
    const amount = document.createElement("span");
    amount.className = "recurring-pattern-amount";
    amount.textContent = `~${formatDisplayCents(pattern.averageAmountCents)} each`;
    const dates = document.createElement("small");
    dates.className = "recurring-pattern-dates";
    dates.textContent = `${formatDate(pattern.firstDate)} – ${formatDate(pattern.lastDate)}`;
    item.append(description, amount, dates);
    patternList.append(item);
  }
}

async function loadExpenseCalendar() {
  const month = selectedCalendarMonth();
  try {
    const result = await request(`/api/expense-calendar?month=${encodeURIComponent(month)}`);
    if (month !== selectedCalendarMonth()) return;
    expenseCalendar = result;
    renderExpenseCalendar();
  } catch (error) {
    if (month !== selectedCalendarMonth()) return;
    expenseCalendar = null;
    renderExpenseCalendar();
    document.querySelector("#calendar-message").textContent =
      `Could not load expense calendar: ${error.message}`;
  }
}

function updateBudgetConversionPreview() {
  const amount = Number(budgetAmountInput.value);
  const preview = document.querySelector("#budget-conversion-preview");
  if (!Number.isFinite(amount) || amount <= 0) {
    preview.textContent = "";
    return;
  }
  const rate = exchangeRates.rates[currency];
  if (!rate) {
    preview.textContent = "Exchange rate unavailable.";
    return;
  }
  const amountInr = Math.round((amount / rate) * 100) / 100;
  preview.textContent = `≈ ${formatInCurrency(amountInr, "INR")} budget stored in INR`;
}

function renderBudgetCategories() {
  const categories = [...new Set([
    ...DEFAULT_CATEGORIES,
    ...expenses.map((expense) => expense.category),
    ...budgets.map((budget) => budget.category),
  ])].sort((first, second) => first.localeCompare(second));
  const options = document.querySelector("#budget-category-options");
  options.replaceChildren(...categories.map((category) => new Option(category, category)));
}

function renderBudgetAlerts() {
  const alerts = document.querySelector("#budget-alerts");
  const month = selectedBudgetMonth();
  const activeAlerts = budgets.flatMap((budget) => {
    const budgetCents = Math.round(budget.amount * 100);
    const spentCents = categoryMonthSpendCents(budget.category, month);
    const utilization = spentCents / budgetCents;
    if (utilization < 0.75) return [];

    if (utilization >= 1) {
      return [{
        level: "critical",
        message: utilization > 1
          ? `${budget.category} has passed 100% and is over budget by ${formatDisplayCents(spentCents - budgetCents)}.`
          : `${budget.category} has reached 100% of its monthly budget.`,
      }];
    }
    if (utilization >= 0.9) {
      return [{ level: "high", message: `${budget.category} has used ${Math.floor(utilization * 100)}% of its monthly budget.` }];
    }
    return [{ level: "caution", message: `${budget.category} has used ${Math.floor(utilization * 100)}% of its monthly budget.` }];
  });

  alerts.replaceChildren(...activeAlerts.map((alert) => {
    const item = document.createElement("p");
    item.className = `budget-alert ${alert.level}`;
    item.textContent = alert.message;
    return item;
  }));
  alerts.hidden = activeAlerts.length === 0;
}

function renderBudgets() {
  const month = selectedBudgetMonth();
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(`${month}-01T00:00:00`));
  renderBudgetCategories();

  const totalBudgetCents = budgets.reduce((sum, budget) => sum + Math.round(budget.amount * 100), 0);
  const totalSpendCents = monthExpenses(month)
    .reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
  const remainingCents = totalBudgetCents - totalSpendCents;
  document.querySelector("#budget-total").textContent = formatDisplayCents(totalBudgetCents);
  document.querySelector("#budget-spent").textContent = formatDisplayCents(totalSpendCents);
  document.querySelector("#budget-spent-caption").textContent = `All recorded expenses in ${monthLabel}`;
  document.querySelector("#budget-remaining").textContent = formatDisplayCents(remainingCents);
  document.querySelector("#budget-remaining").classList.toggle("over-budget", remainingCents < 0);
  document.querySelector("#budget-remaining-caption").textContent = remainingCents < 0
    ? `Spending is above your combined budgets for ${monthLabel}`
    : `Combined budgets minus all spending for ${monthLabel}`;

  renderBudgetAlerts();
  const budgetList = document.querySelector("#budget-list");
  budgetList.replaceChildren();
  budgetList.hidden = budgets.length === 0;
  document.querySelector("#budget-empty").hidden = budgets.length > 0;

  for (const budget of budgets) {
    const spentCents = categoryMonthSpendCents(budget.category, month);
    const budgetCents = Math.round(budget.amount * 100);
    const utilization = spentCents / budgetCents;
    const percent = Math.floor(utilization * 100);
    const level = utilization >= 1 ? "critical" : utilization >= 0.9 ? "high" : utilization >= 0.75 ? "caution" : "steady";
    const row = document.createElement("article");
    row.className = "budget-item";

    const heading = document.createElement("div");
    heading.className = "budget-item-heading";
    const category = document.createElement("strong");
    category.textContent = budget.category;
    const utilizationLabel = document.createElement("span");
    utilizationLabel.className = `budget-utilization ${level}`;
    utilizationLabel.textContent = `${percent}%`;
    heading.append(category, utilizationLabel);

    const progress = document.createElement("div");
    progress.className = "budget-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `${budget.category} budget utilization`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, Math.round(utilization * 100)))));
    const fill = document.createElement("span");
    fill.className = `budget-progress-fill ${level}`;
    fill.style.width = `${Math.min(100, Math.max(0, utilization * 100))}%`;
    progress.append(fill);

    const details = document.createElement("div");
    details.className = "budget-item-details";
    const spendLabel = document.createElement("span");
    spendLabel.textContent = `${formatDisplayCents(spentCents)} spent of ${formatDisplayCents(budgetCents)}`;
    const remaining = document.createElement("span");
    remaining.textContent = `${formatDisplayCents(budgetCents - spentCents)} left`;
    details.append(spendLabel, remaining);

    const actions = document.createElement("div");
    actions.className = "budget-item-actions";
    const edit = document.createElement("button");
    edit.className = "row-action";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${budget.category} budget`);
    edit.addEventListener("click", () => startBudgetEditing(budget));
    const remove = document.createElement("button");
    remove.className = "row-action delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${budget.category} budget`);
    remove.addEventListener("click", () => deleteBudget(budget));
    actions.append(edit, remove);

    row.append(heading, progress, details, actions);
    budgetList.append(row);
  }
}

function showSavingsGoalMessage(message, isError = false) {
  const messageElement = document.querySelector("#savings-goals-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("error", isError);
}

function renderSavingsGoals() {
  const goalList = document.querySelector("#savings-goal-list");
  goalList.replaceChildren();
  goalList.hidden = savingsGoals.length === 0;
  document.querySelector("#savings-goals-empty").hidden = savingsGoals.length > 0;

  for (const goal of savingsGoals) {
    const targetCents = Math.round(goal.targetAmount * 100);
    const savedCents = Math.round(goal.savedAmount * 100);
    const percent = Math.floor((savedCents / targetCents) * 100);
    const schedule = goal.plan;
    const card = document.createElement("article");
    card.className = `savings-goal-card ${schedule.status}`;

    const heading = document.createElement("div");
    heading.className = "savings-goal-card-heading";
    const name = document.createElement("strong");
    name.textContent = goal.name;
    const status = document.createElement("span");
    status.className = `savings-goal-status ${schedule.status}`;
    status.textContent = schedule.status === "reached"
      ? "Goal reached"
      : schedule.status === "overdue"
        ? "Past deadline"
        : `${percent}% saved`;
    heading.append(name, status);

    const progress = document.createElement("div");
    progress.className = "savings-goal-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `${goal.name} savings progress`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.min(100, percent)));
    const fill = document.createElement("span");
    fill.className = "savings-goal-progress-fill";
    fill.style.width = `${Math.min(100, (savedCents / targetCents) * 100)}%`;
    progress.append(fill);

    const amountDetails = document.createElement("div");
    amountDetails.className = "savings-goal-amount-details";
    const savedLabel = document.createElement("span");
    savedLabel.textContent = `${formatDisplayCents(savedCents)} saved of ${formatDisplayCents(targetCents)}`;
    const remainingLabel = document.createElement("span");
    remainingLabel.textContent = `${formatDisplayCents(targetCents - savedCents)} to go`;
    amountDetails.append(savedLabel, remainingLabel);

    const plan = document.createElement("div");
    plan.className = "savings-goal-plan";
    const deadline = document.createElement("span");
    deadline.textContent = `Deadline: ${formatDate(goal.deadline)}`;
    const monthly = document.createElement("strong");
    monthly.textContent = schedule.status === "reached"
      ? `Monthly saving needed: ${formatDisplayCents(0)}`
      : schedule.status === "overdue"
        ? "Deadline has passed"
        : `Save ${formatDisplayCents(schedule.monthlyCents)} / month · ${schedule.monthsRemaining} ${schedule.monthsRemaining === 1 ? "month" : "months"} left`;
    plan.append(deadline, monthly);

    const actions = document.createElement("div");
    actions.className = "savings-goal-actions";
    const edit = document.createElement("button");
    edit.className = "row-action";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${goal.name} savings goal`);
    edit.addEventListener("click", () => startSavingsGoalEditing(goal));
    const remove = document.createElement("button");
    remove.className = "row-action delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${goal.name} savings goal`);
    remove.addEventListener("click", () => deleteSavingsGoal(goal));
    actions.append(edit, remove);

    card.append(heading, progress, amountDetails, plan, actions);
    goalList.append(card);
  }
}

function showSavingsGoalFormMessage(message, isError = false) {
  const messageElement = document.querySelector("#savings-goal-form-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("error", isError);
}

async function loadSavingsGoals() {
  try {
    savingsGoals = await request("/api/savings-goals");
    renderSavingsGoals();
    showSavingsGoalMessage("");
  } catch (error) {
    savingsGoals = [];
    renderSavingsGoals();
    showSavingsGoalMessage(`Could not load savings goals: ${error.message}`, true);
  }
}

function resetSavingsGoalForm() {
  editingSavingsGoalId = null;
  savingsGoalForm.reset();
  document.querySelector("#savings-goal-form-title").textContent = "Create a savings goal";
  savingsGoalSubmitButton.innerHTML = 'Save goal <span aria-hidden="true">→</span>';
  savingsGoalCancelButton.hidden = true;
  showSavingsGoalFormMessage("");
}

function startSavingsGoalEditing(goal) {
  editingSavingsGoalId = goal.id;
  savingsGoalNameInput.value = goal.name;
  savingsGoalTargetInput.value = convertFromInr(goal.targetAmount).toFixed(2);
  savingsGoalSavedInput.value = convertFromInr(goal.savedAmount).toFixed(2);
  savingsGoalDeadlineInput.value = goal.deadline;
  document.querySelector("#savings-goal-form-title").textContent = `Update ${goal.name}`;
  savingsGoalSubmitButton.textContent = "Save progress";
  savingsGoalCancelButton.hidden = false;
  showSavingsGoalFormMessage("");
  savingsGoalForm.scrollIntoView({ behavior: "smooth", block: "center" });
  savingsGoalSavedInput.focus({ preventScroll: true });
}

async function deleteSavingsGoal(goal) {
  if (!window.confirm(`Delete the "${goal.name}" savings goal? This cannot be undone.`)) return;
  try {
    await request(`/api/savings-goals/${encodeURIComponent(goal.id)}`, { method: "DELETE" });
    savingsGoals = savingsGoals.filter((item) => item.id !== goal.id);
    if (editingSavingsGoalId === goal.id) resetSavingsGoalForm();
    renderSavingsGoals();
    showSavingsGoalMessage("Savings goal deleted.");
  } catch (error) {
    showSavingsGoalMessage(error.message, true);
  }
}

async function loadBudgets() {
  const month = selectedBudgetMonth();
  try {
    const result = await request(`/api/budgets?month=${encodeURIComponent(month)}`);
    if (month !== selectedBudgetMonth()) return;
    budgets = result;
    showBudgetMessage("");
    renderBudgets();
  } catch (error) {
    if (month === selectedBudgetMonth()) {
      budgets = [];
      renderBudgets();
      showBudgetMessage(`Could not load budgets: ${error.message}`, true);
    }
  }
}

function resetBudgetForm() {
  editingBudgetCategory = null;
  budgetForm.reset();
  budgetCategoryInput.disabled = false;
  document.querySelector("#budget-form-title").textContent = "Set a category budget";
  budgetSubmitButton.innerHTML = 'Save budget <span aria-hidden="true">→</span>';
  budgetCancelButton.hidden = true;
  showBudgetMessage("");
  updateBudgetConversionPreview();
}

function startBudgetEditing(budget) {
  editingBudgetCategory = budget.category;
  budgetCategoryInput.value = budget.category;
  budgetCategoryInput.disabled = true;
  budgetAmountInput.value = convertFromInr(budget.amount).toFixed(2);
  document.querySelector("#budget-form-title").textContent = `Edit ${budget.category} budget`;
  budgetSubmitButton.textContent = "Save changes";
  budgetCancelButton.hidden = false;
  showBudgetMessage("");
  updateBudgetConversionPreview();
  budgetForm.scrollIntoView({ behavior: "smooth", block: "center" });
  budgetAmountInput.focus({ preventScroll: true });
}

async function deleteBudget(budget) {
  const month = selectedBudgetMonth();
  if (!window.confirm(`Delete the ${budget.category} budget for ${month}?`)) return;
  try {
    await request(
      `/api/budgets?month=${encodeURIComponent(month)}&category=${encodeURIComponent(budget.category)}`,
      { method: "DELETE" },
    );
    budgets = budgets.filter((item) => item.category.toLocaleLowerCase() !== budget.category.toLocaleLowerCase());
    if (editingBudgetCategory?.toLocaleLowerCase() === budget.category.toLocaleLowerCase()) {
      resetBudgetForm();
    }
    renderBudgets();
    showBudgetMessage("Budget deleted.");
  } catch (error) {
    showBudgetMessage(error.message, true);
  }
}

async function deleteExpense(expense) {
  const label = expense.description || expense.category;
  if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
  try {
    await request(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: "DELETE" });
    expenses = expenses.filter((item) => item.id !== expense.id);
    if (editingId === expense.id) resetForm();
    render();
    await loadSpendingComparison();
    await loadExpenseCalendar();
  } catch (error) {
    showMessage(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  submitButton.disabled = true;
  const payload = {
    amount: Number(amountInput.value),
    currency,
    category: categoryInput.value,
    date: dateInput.value,
    description: descriptionInput.value,
  };
  try {
    const saved = await request(
      editingId ? `/api/expenses/${encodeURIComponent(editingId)}` : "/api/expenses",
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      },
    );
    if (editingId) {
      expenses = expenses.map((expense) => expense.id === editingId ? saved : expense);
    } else {
      expenses.push(saved);
    }
    resetForm();
    render();
    await loadSpendingComparison();
    await loadExpenseCalendar();
    showMessage("Expense saved.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

cancelButton.addEventListener("click", resetForm);
budgetMonthInput.value = localDateValue().slice(0, 7);
budgetMonthInput.addEventListener("change", () => {
  if (!budgetMonthInput.value) budgetMonthInput.value = localDateValue().slice(0, 7);
  resetBudgetForm();
  budgets = [];
  renderBudgets();
  loadBudgets();
  loadSavingsGoals();
});
calendarMonthInput.value = localDateValue().slice(0, 7);
calendarMonthInput.addEventListener("change", () => {
  if (!calendarMonthInput.value) calendarMonthInput.value = localDateValue().slice(0, 7);
  selectedCalendarDate = `${selectedCalendarMonth()}-01`;
  loadExpenseCalendar();
});
budgetCancelButton.addEventListener("click", resetBudgetForm);
budgetAmountInput.addEventListener("input", updateBudgetConversionPreview);
budgetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showBudgetMessage("");
  budgetSubmitButton.disabled = true;
  try {
    const saved = await request("/api/budgets", {
      method: "PUT",
      body: JSON.stringify({
        month: selectedBudgetMonth(),
        category: budgetCategoryInput.value,
        amount: Number(budgetAmountInput.value),
        currency,
      }),
    });
    const normalizedCategory = saved.category.toLocaleLowerCase();
    budgets = budgets.filter((budget) => budget.category.toLocaleLowerCase() !== normalizedCategory);
    budgets.push(saved);
    resetBudgetForm();
    renderBudgets();
    showBudgetMessage("Budget saved.");
  } catch (error) {
    showBudgetMessage(error.message, true);
  } finally {
    budgetSubmitButton.disabled = false;
  }
});

savingsGoalCancelButton.addEventListener("click", resetSavingsGoalForm);
savingsGoalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showSavingsGoalFormMessage("");
  savingsGoalSubmitButton.disabled = true;
  const payload = {
    name: savingsGoalNameInput.value,
    targetAmount: Number(savingsGoalTargetInput.value),
    savedAmount: Number(savingsGoalSavedInput.value || 0),
    deadline: savingsGoalDeadlineInput.value,
    currency,
  };
  try {
    const saved = await request(
      editingSavingsGoalId
        ? `/api/savings-goals/${encodeURIComponent(editingSavingsGoalId)}`
        : "/api/savings-goals",
      {
        method: editingSavingsGoalId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      },
    );
    if (editingSavingsGoalId) {
      savingsGoals = savingsGoals.map((goal) => goal.id === editingSavingsGoalId ? saved : goal);
    } else {
      savingsGoals.push(saved);
    }
    resetSavingsGoalForm();
    renderSavingsGoals();
    showSavingsGoalMessage("Savings goal saved.");
  } catch (error) {
    showSavingsGoalFormMessage(error.message, true);
  } finally {
    savingsGoalSubmitButton.disabled = false;
  }
});

for (const selector of ["#search-input", "#category-filter", "#month-filter"]) {
  document.querySelector(selector).addEventListener("input", renderExpenses);
}
document.querySelector("#clear-filters").addEventListener("click", () => {
  document.querySelector("#search-input").value = "";
  document.querySelector("#category-filter").value = "";
  document.querySelector("#month-filter").value = "";
  renderExpenses();
});
if (!SUPPORTED_CURRENCIES.includes(currency)) currency = "INR";
currencySelect.value = currency;
currency = currencySelect.value;
document.querySelector("#budget-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
document.querySelector("#savings-goal-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
document.querySelector("#savings-goal-saved-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
currencySelect.addEventListener("change", () => {
  const previousCurrency = currency;
  const nextCurrency = currencySelect.value;
  const inputAmount = Number(amountInput.value);
  const budgetInputAmount = Number(budgetAmountInput.value);
  if (Number.isFinite(inputAmount) && inputAmount > 0) {
    amountInput.value = ((inputAmount / exchangeRates.rates[previousCurrency]) * exchangeRates.rates[nextCurrency]).toFixed(2);
  }
  if (Number.isFinite(budgetInputAmount) && budgetInputAmount > 0) {
    budgetAmountInput.value = ((budgetInputAmount / exchangeRates.rates[previousCurrency]) * exchangeRates.rates[nextCurrency]).toFixed(2);
  }
  for (const input of [savingsGoalTargetInput, savingsGoalSavedInput]) {
    const value = Number(input.value);
    if (input.value !== "" && Number.isFinite(value) && value >= 0) {
      input.value = ((value / exchangeRates.rates[previousCurrency]) * exchangeRates.rates[nextCurrency]).toFixed(2);
    }
  }
  currency = nextCurrency;
  localStorage.setItem(CURRENCY_KEY, currency);
  document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
  document.querySelector("#budget-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
  document.querySelector("#savings-goal-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
  document.querySelector("#savings-goal-saved-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
  updateConversionPreview();
  updateBudgetConversionPreview();
  render();
});
amountInput.addEventListener("input", updateConversionPreview);
loadBudgets();
loadExpenseCalendar();
document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());
dateInput.value = localDateValue();

request("/api/expenses")
  .then((result) => {
    expenses = result;
    render();
  })
  .catch((error) => {
    render();
    showMessage(`Could not load expenses: ${error.message}`, true);
  });

loadSpendingComparison();

request("/api/exchange-rates")
  .then((result) => {
    exchangeRates = result;
    if (!SUPPORTED_CURRENCIES.every((code) => Number.isFinite(exchangeRates.rates[code]))) {
      throw new Error("The server returned incomplete exchange rates.");
    }
    currencySelect.disabled = false;
    currencySelect.value = SUPPORTED_CURRENCIES.includes(currency) ? currency : "INR";
    currency = currencySelect.value;
    document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
    document.querySelector("#budget-currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
    updateRateStatus();
    updateConversionPreview();
    updateBudgetConversionPreview();
    render();
  })
  .catch((error) => {
    exchangeRates = { base: "INR", rates: { INR: 1 }, stale: true };
    currency = "INR";
    currencySelect.value = "INR";
    for (const option of currencySelect.options) option.disabled = option.value !== "INR";
    localStorage.setItem(CURRENCY_KEY, "INR");
    const status = document.querySelector("#rate-status");
    status.classList.add("error");
    status.textContent = "Exchange rates unavailable · INR only";
    document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS.INR;
    document.querySelector("#budget-currency-symbol").textContent = CURRENCY_SYMBOLS.INR;
    updateConversionPreview();
    updateBudgetConversionPreview();
    render();
    console.error("Could not load exchange rates:", error);
  });
