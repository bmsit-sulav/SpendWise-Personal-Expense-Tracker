const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function createStore(filePath) {
  let queue = Promise.resolve();

  async function readExpenses() {
    try {
      const contents = await fs.readFile(filePath, "utf8");
      const expenses = JSON.parse(contents);
      if (!Array.isArray(expenses)) {
        throw new Error("Expense data must be a JSON array.");
      }
      return expenses;
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeExpenses(expenses) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(expenses, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  }

  function serialize(expense) {
    const { amountCents, ...fields } = expense;
    return { ...fields, amount: amountCents / 100 };
  }

  function runExclusive(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  return {
    async list() {
      return (await readExpenses()).map(serialize);
    },

    async create(fields) {
      return runExclusive(async () => {
        const expenses = await readExpenses();
        const now = new Date().toISOString();
        const expense = {
          id: randomUUID(),
          ...fields,
          createdAt: now,
          updatedAt: now,
        };
        expenses.push(expense);
        await writeExpenses(expenses);
        return serialize(expense);
      });
    },

    async update(id, fields) {
      return runExclusive(async () => {
        const expenses = await readExpenses();
        const index = expenses.findIndex((expense) => expense.id === id);
        if (index === -1) {
          return null;
        }
        expenses[index] = {
          ...expenses[index],
          ...fields,
          updatedAt: new Date().toISOString(),
        };
        await writeExpenses(expenses);
        return serialize(expenses[index]);
      });
    },

    async remove(id) {
      return runExclusive(async () => {
        const expenses = await readExpenses();
        const remaining = expenses.filter((expense) => expense.id !== id);
        if (remaining.length === expenses.length) {
          return false;
        }
        await writeExpenses(remaining);
        return true;
      });
    },
  };
}

module.exports = { createStore };
