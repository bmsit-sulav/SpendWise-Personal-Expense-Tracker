# SpendWise

**A simple, local-first personal expense tracker.**

SpendWise is a browser-based application for recording and reviewing everyday expenses. Its frontend is served by a small Node.js HTTP server, which provides a JSON API and stores expense records locally as JSON files.

> **Storage note:** SpendWise currently uses local JSON files, not a database. There are no user accounts or cloud sync.

## Features

- Create, edit, and delete expenses.
- Record an amount, category, date, and optional description.
- Search by description, category, or date; filter by category and month.
- Review expenses sorted by date, with totals for all recorded spending and the current month.
- View and enter amounts in INR, USD, EUR, GBP, or NPR.
- Keep expense records and cached exchange rates on the local machine.

## Requirements

- Node.js 18 or newer
- npm, included with Node.js
- Internet access to retrieve fresh currency exchange rates (optional if a rate cache already exists)

SpendWise has no npm runtime dependencies; it uses Node.js built-in modules.

## Run the application

From the project directory:

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in a browser. By default, the server listens only on the local computer.

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
```

Tests use Node.js's built-in test runner and temporary data files. They cover the HTTP app, expense operations, validation, currency conversion, and exchange-rate caching without modifying your local expense ledger.

## How it works

```text
Browser
  public/index.html, styles.css, app.js
            │ same-origin HTTP / JSON
            ▼
Node.js server
  server/server.js starts the app
  server/app.js serves the UI and handles API routes
      ├── server/validation.js validates expense input
      ├── server/exchange-rates.js fetches and caches INR-based rates
      └── server/store.js reads and writes local JSON files
            │
            ├── data/expenses.json
            └── data/exchange-rates.json
```

The browser sends expense requests to the Node.js server. The server validates the data and writes changes to the expense file. It also retrieves supported exchange rates from [ExchangeRate-API](https://www.exchangerate-api.com/) and stores the most recent successful rate set in a local cache.

## Currency and amounts

INR is the default and the application's **storage currency**. The currency selector changes the currency used to display totals and individual expenses. When adding or editing an expense, the amount is interpreted in the selected currency, converted to INR, and stored as integer paise (`amountCents`). The API returns expense amounts in INR.

Exchange rates are relative to INR. SpendWise refreshes the local cache when it is more than six hours old. If the exchange-rate provider is unavailable, the app uses the last successfully cached rates and indicates that they may be stale. If no cache is available either, the app falls back to INR-only mode until rates can be loaded.

Rates are indicative, not a quote for a financial transaction. Existing expenses are displayed using the currently available rate; historical exchange rates for each expense date are not stored. The selected display currency is saved in browser local storage.

## API reference

All endpoints are served from the same origin as the browser UI.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/expenses` | List expenses; amounts are returned in INR |
| `POST` | `/api/expenses` | Create an expense |
| `PUT` | `/api/expenses/:id` | Update an expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `GET` | `/api/exchange-rates` | Get current or cached rates relative to INR |

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
  styles.css              Layout and responsive styling
  app.js                  Browser behavior and API requests
server/
  server.js               Server entry point and configuration
  app.js                  HTTP API routes and static file serving
  validation.js           Expense input validation
  store.js                JSON-backed expense operations
  exchange-rates.js       Rate fetching, validation, caching, and fallback
test/
  app.test.js             API, validation, persistence, and rate tests
data/
  expenses.json           Local expense ledger (created at runtime)
  exchange-rates.json     Local rate cache (created at runtime)
package.json              Start and test scripts
```

Files in `data/` are local runtime data and are excluded from Git. The app does not require the C++ prototype or a database server.

## Data, privacy, and limitations

- Expense records and cached exchange rates are stored as **unencrypted local files**. They are not backed up or synced automatically.
- There is no authentication or separation between users on the same machine.
- The default loopback binding limits access to the local computer. If you bind to another network interface, anyone who can reach the server can use its API.
- There is no database, expense import/export, recurring-expense support, budget management, or report generation yet.

Protect the computer and the `data/` directory as you would any file containing personal financial information.

## License

Released under the MIT License. See [LICENSE](./LICENSE).
