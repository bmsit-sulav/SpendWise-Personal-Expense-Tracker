const fs = require("node:fs/promises");
const path = require("node:path");

function createBudgetStore(filePath) {
  let queue = Promise.resolve();

  async function readBudgets() {
    try {
      const contents = await fs.readFile(filePath, "utf8");
      const budgets = JSON.parse(contents);
      if (!Array.isArray(budgets)) {
        throw new Error("Budget data must be a JSON array.");
      }
      return budgets;
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeBudgets(budgets) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(budgets, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  }

  function serialize(budget) {
    const { amountCents, ...fields } = budget;
    return { ...fields, amount: amountCents / 100 };
  }

  function runExclusive(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  return {
    async list(month) {
      return (await readBudgets())
        .filter((budget) => budget.month === month)
        .sort((first, second) => first.category.localeCompare(second.category))
        .map(serialize);
    },

    async upsert(fields) {
      return runExclusive(async () => {
        const budgets = await readBudgets();
        const index = budgets.findIndex((budget) =>
          budget.month === fields.month &&
          budget.category.toLocaleLowerCase() === fields.category.toLocaleLowerCase()
        );
        const now = new Date().toISOString();
        const budget = {
          ...(index === -1 ? { id: `${fields.month}:${fields.category.toLocaleLowerCase()}`, createdAt: now } : budgets[index]),
          ...fields,
          updatedAt: now,
        };
        if (index === -1) budgets.push(budget);
        else budgets[index] = budget;
        await writeBudgets(budgets);
        return serialize(budget);
      });
    },

    async remove(month, category) {
      return runExclusive(async () => {
        const budgets = await readBudgets();
        const remaining = budgets.filter((budget) =>
          budget.month !== month ||
          budget.category.toLocaleLowerCase() !== category.toLocaleLowerCase()
        );
        if (remaining.length === budgets.length) return false;
        await writeBudgets(remaining);
        return true;
      });
    },
  };
}

module.exports = { createBudgetStore };
