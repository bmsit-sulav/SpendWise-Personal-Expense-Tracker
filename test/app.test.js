const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp } = require("../server/app");

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
    const ledger = await fetch(`${baseUrl}/api/expenses`);
    assert.deepEqual(await json(ledger), []);
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
