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

let expenses = [];
let editingId = null;
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

async function deleteExpense(expense) {
  const label = expense.description || expense.category;
  if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
  try {
    await request(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: "DELETE" });
    expenses = expenses.filter((item) => item.id !== expense.id);
    if (editingId === expense.id) resetForm();
    render();
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
    showMessage("Expense saved.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

cancelButton.addEventListener("click", resetForm);
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
currencySelect.addEventListener("change", () => {
  const previousCurrency = currency;
  const nextCurrency = currencySelect.value;
  const inputAmount = Number(amountInput.value);
  if (Number.isFinite(inputAmount) && inputAmount > 0) {
    amountInput.value = ((inputAmount / exchangeRates.rates[previousCurrency]) * exchangeRates.rates[nextCurrency]).toFixed(2);
  }
  currency = nextCurrency;
  localStorage.setItem(CURRENCY_KEY, currency);
  document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
  updateConversionPreview();
  render();
});
amountInput.addEventListener("input", updateConversionPreview);
document.querySelector("#currency-symbol").textContent = CURRENCY_SYMBOLS[currency];
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date()).toUpperCase();
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
    updateRateStatus();
    updateConversionPreview();
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
    updateConversionPreview();
    render();
    console.error("Could not load exchange rates:", error);
  });
