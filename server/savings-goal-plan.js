function calculateSavingsPlan(goal, today) {
  const targetCents = Math.round(goal.targetAmount * 100);
  const savedCents = Math.round(goal.savedAmount * 100);
  if (savedCents >= targetCents) {
    return { status: "reached", monthsRemaining: 0, monthlyCents: 0 };
  }
  if (goal.deadline < today) {
    return { status: "overdue", monthsRemaining: 0, monthlyCents: null };
  }

  const [deadlineYear, deadlineMonth] = goal.deadline.split("-").map(Number);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const monthsRemaining = Math.max(1, (deadlineYear - currentYear) * 12 + deadlineMonth - currentMonth + 1);
  return {
    status: "active",
    monthsRemaining,
    monthlyCents: Math.ceil((targetCents - savedCents) / monthsRemaining),
  };
}

module.exports = { calculateSavingsPlan };
