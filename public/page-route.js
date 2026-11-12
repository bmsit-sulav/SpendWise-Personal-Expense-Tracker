const routes = {
  "/": { page: "home", title: "SpendWise — Personal expense tracker" },
  "/comparison": { page: "comparison", title: "Spending comparison — SpendWise" },
  "/assistant": { page: "assistant", title: "AI Financial Assistance — SpendWise" },
  "/forecasting": { page: "forecasting", title: "Expense forecasting — SpendWise" },
  "/budgets": { page: "budgets", title: "Monthly budgets — SpendWise" },
  "/savings-goals": { page: "savings-goals", title: "Savings goals — SpendWise" },
  "/calendar": { page: "calendar", title: "Expense calendar — SpendWise" },
};

const route = routes[window.location.pathname] || routes["/"];
document.documentElement.dataset.page = route.page;
document.title = route.title;
