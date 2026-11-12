# SpendWise

**Track spending. Spot patterns. Plan ahead.**

SpendWise is a local-first expense tracker for recording everyday purchases, reviewing spending trends, setting category budgets, and tracking savings goals. A Node.js server provides the JSON API and stores data in local JSON files. The browser interface can be served directly by Node.js or by the optional Flask frontend, which forwards API requests to Node.js.

> **Storage note:** SpendWise currently uses local JSON files, not a database. There are no user accounts or cloud sync.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Run the application](#run-the-application)
- [Run the tests](#run-the-tests)
- [How it works](#how-it-works)
- [Currency and amounts](#currency-and-amounts)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Data, privacy, and limitations](#data-privacy-and-limitations)
- [License](#license)

## Features

### Expense tracking

- Add, edit, and delete expenses with an amount, category, date, and optional description.
- Search by description, category, or date; filter by category and month.
- Review dated expenses and totals for the current month and all recorded spending.

### Insights and budgets

- Compare the current month with the previous month, including category-level changes and percentages.
- Flag unusually large expenses when an amount is at least twice the category median, provided there are at least three expenses in the comparison period.
- Set category budgets by month, track utilization, and see alerts at 75%, 90%, and 100%.
- See the remaining monthly balance across all category budgets.
- View a monthly calendar with daily totals and high-spending days; identify possible weekly or monthly recurring expenses from transaction history.

### Savings and currency

- Create savings goals with a target and deadline, update the saved amount, and track progress and the monthly saving pace.
- Use INR, USD, EUR, GBP, or NPR for display and expense entry. Values are stored in INR.
- Keep expenses, budgets, savings goals, and cached exchange rates in local files.
- Open the overview, spending comparison, budgets, savings goals, and expense calendar as separate pages.

## Requirements

- Node.js 18 or newer
- npm, included with Node.js
- Python 3 and pip for the optional Flask frontend
- Internet access to retrieve fresh currency exchange rates (optional if a rate cache already exists)

SpendWise has no npm runtime dependencies; it uses Node.js built-in modules.

## Run the application

### Flask frontend with Node.js backend

The Flask frontend serves the existing SpendWise page and forwards its `/api` requests to the Node.js backend. This keeps the current browser UI and Node API connected without duplicating the application template.

Install the Python dependency once:

```bash
python3 -m pip install -r requirements.txt
```

Start the backend in one terminal:

```bash
npm start
```

Start Flask in a second terminal:

```bash
python3 flask_frontend.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in a browser. Flask listens locally by default and proxies API requests to `http://127.0.0.1:3000`.

Set `SPENDWISE_NODE_API` to change the Node API URL. `FLASK_HOST` and `FLASK_PORT` configure Flask's bind address and port.

### Node.js-served frontend

To run without Flask, start the Node.js server and open [http://127.0.0.1:3000](http://127.0.0.1:3000):

```bash
npm start
```

Feature pages are available at `/comparison`, `/budgets`, `/savings-goals`, and `/calendar` in either serving mode. The overview remains at `/`.

To use a different port:

```bash
PORT=4000 npm start
```

To make the server reachable from other devices, set `HOST` as well:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

Only expose the app on a trusted network. It has no authentication; anyone who can reach the server can access its expense API.

## Run the tests

```bash
npm test
python3 -m unittest discover -s test -p 'test_*.py'
```

The Node.js tests use temporary data files and cover the API, expense operations, validation, currency conversion, exchange-rate caching, budgets, spending comparisons, savings goals, and expense-calendar calculations. The Python tests check that Flask renders the existing pages and proxies API requests and responses correctly.

## How it works

```text
Browser
  ├── Node.js-only mode: Node.js serves the UI and API
  └── Flask mode: Flask serves the UI and forwards /api/* requests
                                  │
                                  ▼
                         Node.js API (server/)
                                  │
                                  ▼
                    Local JSON files (data/)
```

In Flask mode, the browser sends same-origin API requests to Flask, which forwards them to Node.js. The Node.js backend handles API behavior, validation, currency conversion, and persistence in both modes. Exchange rates come from [ExchangeRate-API](https://www.exchangerate-api.com/) and are cached locally.

## Currency and amounts

INR is the default and the application's **storage currency**. The currency selector changes the currency used to display totals and individual expenses. When adding or editing an expense, the amount is interpreted in the selected currency, converted to INR, and stored as integer paise (`amountCents`). The API returns expense amounts in INR.

Exchange rates are relative to INR. SpendWise refreshes the local cache when it is more than six hours old. If the provider is unavailable, the app uses the last successfully cached rates and indicates that they may be stale. If no cache is available, the app remains usable in INR-only mode until rates can be loaded.

Rates are indicative, not a quote for a financial transaction. Existing expenses are displayed using the currently available rate; historical exchange rates for each expense date are not stored. The selected display currency is saved in browser local storage.

## API reference

All endpoints are served from the same origin as the browser UI.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/expenses` | List expenses; amounts are returned in INR |
| `GET` | `/api/spending-comparison?month=YYYY-MM` | Compare a month with the previous month |
| `GET` | `/api/expense-calendar?month=YYYY-MM` | Get daily totals, high-spending days, and recurring patterns |
| `POST` | `/api/expenses` | Create an expense |
| `PUT` | `/api/expenses/:id` | Update an expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `GET` | `/api/budgets?month=YYYY-MM` | List budgets for a month |
| `PUT` | `/api/budgets` | Create or replace a category budget |
| `DELETE` | `/api/budgets?month=YYYY-MM&category=Food` | Delete a category budget |
| `GET` | `/api/savings-goals` | List savings goals; amounts are returned in INR |
| `POST` | `/api/savings-goals` | Create a savings goal; returns a calculated savings plan |
| `PUT` | `/api/savings-goals/:id` | Update a savings goal, including its saved amount |
| `DELETE` | `/api/savings-goals/:id` | Delete a savings goal |
| `GET` | `/api/exchange-rates` | Get current or cached rates relative to INR |

Budget amounts must be positive and have no more than two decimal places. A budget is identified by its month and category; saving the same category again for that month updates its existing budget. Budgets use INR as their storage currency, like expenses.

The monthly remaining balance is the sum of category budgets minus **all** recorded expenses for that month. It can be negative when spending exceeds the combined limits. Each category's progress and threshold alerts use only expenses matching that category in the selected month. A category shows a warning at 75% utilization, a higher warning at 90%, and a critical alert at or above 100%.

The spending comparison uses the current calendar month and the preceding calendar month. Category and total percentage changes use the previous month's spending as the baseline; when the previous amount is zero, the UI labels the current spending as new instead of showing an undefined percentage. An expense is highlighted as unusual when the category has at least three expenses across the two months and the individual amount is at least twice that category's median expense. This is a simple spending signal, not a financial or fraud assessment.

Savings goals are tracked separately from expenses. Enter a goal name, target amount, deadline, and optional saved-to-date amount. Update the saved amount manually whenever you add to the goal; goals do not automatically link to expenses or budgets. Goal amounts are stored in INR and displayed in the selected currency. For an active goal, the app divides the remaining amount by the number of calendar months from the current month through the deadline month, including both months, and rounds up to the nearest paise. A completed goal needs no further monthly saving; an incomplete goal past its deadline is marked overdue.

The expense calendar defaults to the current month and shows each day's expense total. It marks a day high-spending when its total is at least 1.5 times the month's average per calendar day, including days with no expenses. Recurring patterns are detected across all recorded expense history when the same description and category appear on at least three dates on a weekly (6–8 day interval) or monthly (27–32 day interval) cadence, with amounts within 15% of their median. This is a heuristic; it will not infer recurring expenses with a missing description or inconsistent dates.

Create or update a goal with amounts in the selected currency (the API defaults to INR if `currency` is omitted). The saved amount may be zero but cannot exceed the target.

```json
{
  "name": "Laptop",
  "targetAmount": 1200,
  "savedAmount": 400,
  "currency": "USD",
  "deadline": "2027-03-31"
}
```

The API stores goal amounts as integer paise and returns `targetAmount` and `savedAmount` in INR. Goal responses include a `plan` with `status`, `monthsRemaining`, and `monthlyCents`.

### Create an expense

Send a JSON body. `currency` is optional and defaults to `INR`.

```json
{
  "amount": 10,
  "currency": "USD",
  "category": "Food",
  "date": "2026-11-12",
  "description": "Lunch"
}
```

The server validates the amount, currency, category, date, and description. Amounts must be positive and have no more than two decimal places. A successful response contains the generated expense ID, timestamps, and amount converted to INR.

## Project structure

```text
public/
  index.html              Application page
  page-route.js           Sets the page view based on the URL path
  styles.css              Layout and responsive styling
  app.js                  Browser behavior and API requests
flask_frontend.py         Flask template server and Node API proxy
requirements.txt          Python dependencies for the Flask frontend
server/
  server.js               Server entry point and configuration
  app.js                  HTTP API routes and static file serving
  validation.js           Expense input validation
  store.js                JSON-backed expense operations
  budget-store.js         Monthly category budget persistence
  spending-comparison.js Month-over-month totals, category changes, and outlier detection
  savings-goal-store.js   Savings goal persistence
  savings-goal-plan.js    Monthly savings plan calculations
  expense-calendar.js     Daily totals, high-spend flags, and recurring patterns
  exchange-rates.js       Rate fetching, validation, caching, and fallback
test/
  app.test.js             API, validation, persistence, and rate tests
  test_flask_frontend.py  Flask rendering and API proxy tests
data/
  expenses.json           Local expense ledger (created at runtime)
  budgets.json            Monthly category budgets (created at runtime)
  savings-goals.json      Savings goals (created at runtime)
  exchange-rates.json     Local rate cache (created at runtime)
package.json              Start and test scripts
```

Files in `data/` are local runtime data and are excluded from Git. Local demo or personal records in these files are not included in commits or fresh clones. No database server is required.

## Data, privacy, and limitations

- Expense records, budgets, savings goals, and cached exchange rates are stored as **unencrypted local files**. They are not backed up or synced automatically.
- There is no authentication or separation between users on the same machine.
- The default loopback binding limits access to the local computer. If you bind to another network interface, anyone who can reach the server can use its API.
- There is no database, expense import/export, scheduled recurring-expense entry, or report generation yet. Recurring patterns are detected from existing transaction history only.

Protect the computer and the `data/` directory as you would any file containing personal financial information.

## License

Released under the MIT License. See [LICENSE](./LICENSE).
