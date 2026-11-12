const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

function createSavingsGoalStore(filePath) {
  let queue = Promise.resolve();

  async function readGoals() {
    try {
      const contents = await fs.readFile(filePath, "utf8");
      const goals = JSON.parse(contents);
      if (!Array.isArray(goals)) {
        throw new Error("Savings goal data must be a JSON array.");
      }
      return goals;
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeGoals(goals) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(goals, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  }

  function serialize(goal) {
    const { targetCents, savedCents, ...fields } = goal;
    return {
      ...fields,
      targetAmount: targetCents / 100,
      savedAmount: savedCents / 100,
    };
  }

  function runExclusive(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  return {
    async list() {
      return (await readGoals())
        .sort((first, second) =>
          first.deadline.localeCompare(second.deadline) || first.name.localeCompare(second.name)
        )
        .map(serialize);
    },

    async create(fields) {
      return runExclusive(async () => {
        const now = new Date().toISOString();
        const goal = {
          id: randomUUID(),
          ...fields,
          createdAt: now,
          updatedAt: now,
        };
        const goals = await readGoals();
        goals.push(goal);
        await writeGoals(goals);
        return serialize(goal);
      });
    },

    async update(id, fields) {
      return runExclusive(async () => {
        const goals = await readGoals();
        const index = goals.findIndex((goal) => goal.id === id);
        if (index === -1) return null;
        const goal = {
          ...goals[index],
          ...fields,
          updatedAt: new Date().toISOString(),
        };
        goals[index] = goal;
        await writeGoals(goals);
        return serialize(goal);
      });
    },

    async remove(id) {
      return runExclusive(async () => {
        const goals = await readGoals();
        const remaining = goals.filter((goal) => goal.id !== id);
        if (remaining.length === goals.length) return false;
        await writeGoals(remaining);
        return true;
      });
    },
  };
}

module.exports = { createSavingsGoalStore };
