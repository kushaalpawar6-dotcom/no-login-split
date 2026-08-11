const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;

const state = {
  trip: null,
  people: [],
  expenses: [],
  ownerToken: localStorage.getItem("nls_owner_token") || null
};

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error_description ||
      data?.hint ||
      "Something went wrong"
    );
  }

  return data;
}


/* -----------------------------------------
   CREATE TRIP
----------------------------------------- */

async function createTrip() {
  const name = $("tripName").value.trim();

  const people = [...document.querySelectorAll(".person-input")]
    .map(input => input.value.trim())
    .filter(Boolean);

  if (!name) {
    showToast("Please enter a trip name.");
    return;
  }

  if (people.length < 2) {
    showToast("Add at least 2 people.");
    return;
  }

  $("createTripBtn").disabled = true;
  $("createTripBtn").textContent = "Creating...";

  try {
    const result = await supabase("/rest/v1/rpc/create_trip", {
      method: "POST",
      body: JSON.stringify({
        p_name: name,
        p_people: people
      })
    });

    const tripData = Array.isArray(result) ? result[0] : result;

    if (!tripData?.trip_id || !tripData?.owner_token) {
      throw new Error("Trip creation failed.");
    }

    state.trip = {
      id: tripData.trip_id,
      name: tripData.name,
      owner: true
    };

    state.people = tripData.people || [];
    state.expenses = [];
    state.ownerToken = tripData.owner_token;

    localStorage.setItem(
      "nls_owner_token",
      state.ownerToken
    );

    history.replaceState(
      {},
      "",
      `${location.pathname}?trip=${state.trip.id}`
    );

    await loadTrip();

    showToast("Trip created successfully!");

  } catch (error) {
    console.error(error);
    showToast(error.message);
  }

  $("createTripBtn").disabled = false;
  $("createTripBtn").textContent = "Create Trip";
}


/* -----------------------------------------
   LOAD TRIP
----------------------------------------- */

async function loadTrip() {
  const tripId = new URLSearchParams(location.search).get("trip");

  if (!tripId) {
    showHome();
    return;
  }

  $("homeScreen").classList.add("hidden");
  $("tripScreen").classList.remove("hidden");

  try {
    const trips = await supabase(
      `/rest/v1/trip_public?id=eq.${encodeURIComponent(tripId)}&select=id,name,created_at`
    );

    if (!trips.length) {
      showToast("Trip not found.");
      showHome();
      return;
    }

    state.trip = trips[0];

    const people = await supabase(
      `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name&order=created_at.asc`
    );

    const expenses = await supabase(
      `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_at&order=created_at.desc`
    );

    state.people = people || [];
    state.expenses = expenses || [];

    renderTrip();

  } catch (error) {
    console.error(error);
    showToast(error.message);
  }
}


/* -----------------------------------------
   RENDER TRIP
----------------------------------------- */

function renderTrip() {
  $("tripTitle").textContent = state.trip.name;

  const url = window.location.href;
  $("tripLink").textContent = url;

  populatePaidBy();
  renderExpenses();
  renderBalances();

  if (state.ownerToken) {
    $("ownerPanel").classList.remove("hidden");
  }
}


/* -----------------------------------------
   PEOPLE
----------------------------------------- */

function populatePaidBy() {
  const select = $("expensePaidBy");

  select.innerHTML = "";

  state.people.forEach(person => {
    const option = document.createElement("option");

    option.value = person.id;
    option.textContent = person.name;

    select.appendChild(option);
  });
}


/* -----------------------------------------
   ADD PERSON FIELD
----------------------------------------- */

function addPersonField() {
  const container = $("peopleInputs");

  const row = document.createElement("div");
  row.className = "person-row";

  row.innerHTML = `
    <input
      class="person-input"
      placeholder="Person's name"
    >
    <button
      class="remove-person"
      type="button"
    >×</button>
  `;

  row.querySelector(".remove-person").onclick = () => {
    row.remove();
  };

  container.appendChild(row);
}


/* -----------------------------------------
   ADD EXPENSE
----------------------------------------- */

async function addExpense() {
  const description = $("expenseDescription")
    .value
    .trim();

  const amount = Number(
    $("expenseAmount").value
  );

  const paidBy = $("expensePaidBy").value;

  if (!description) {
    showToast("Enter an expense description.");
    return;
  }

  if (!amount || amount <= 0) {
    showToast("Enter a valid amount.");
    return;
  }

  if (!paidBy) {
    showToast("Select who paid.");
    return;
  }

  $("addExpenseBtn").disabled = true;
  $("addExpenseBtn").textContent = "Adding...";

  try {
    await supabase("/rest/v1/expenses", {
      method: "POST",
      headers: {
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        trip_id: state.trip.id,
        description,
        amount,
        paid_by: paidBy
      })
    });

    $("expenseDescription").value = "";
    $("expenseAmount").value = "";

    await loadTrip();

    showToast("Expense added.");

  } catch (error) {
    console.error(error);
    showToast(error.message);
  }

  $("addExpenseBtn").disabled = false;
  $("addExpenseBtn").textContent = "Add Expense";
}


/* -----------------------------------------
   EXPENSES
----------------------------------------- */

function renderExpenses() {
  const container = $("expensesList");

  container.innerHTML = "";

  if (!state.expenses.length) {
    container.innerHTML =
      `<p class="small">No expenses yet.</p>`;
    return;
  }

  state.expenses.forEach(expense => {

    const payer =
      state.people.find(
        person => person.id === expense.paid_by
      );

    const item = document.createElement("div");

    item.className = "expense";

    const deleteButton = state.ownerToken
      ? `
        <button
          class="danger"
          style="margin-top:10px;width:auto;padding:8px 12px"
          onclick="deleteExpense('${expense.id}')"
        >
          Delete
        </button>
      `
      : "";

    item.innerHTML = `
      <div class="expense-top">
        <div>
          <div class="expense-name">
            ${escapeHtml(expense.description)}
          </div>

          <div class="expense-meta">
            Paid by ${escapeHtml(
              payer ? payer.name : "Unknown"
            )}
          </div>
        </div>

        <div class="expense-amount">
          ₹${Number(expense.amount).toFixed(2)}
        </div>
      </div>

      ${deleteButton}
    `;

    container.appendChild(item);
  });
}


/* -----------------------------------------
   DELETE EXPENSE
----------------------------------------- */

async function deleteExpense(expenseId) {

  if (!state.ownerToken) {
    showToast("Owner permission required.");
    return;
  }

  const confirmed = confirm(
    "Delete this expense?"
  );

  if (!confirmed) return;

  try {

    await supabase(
      "/rest/v1/rpc/delete_expense",
      {
        method: "POST",
        body: JSON.stringify({
          p_expense_id: expenseId,
          p_owner_token: state.ownerToken
        })
      }
    );

    await loadTrip();

    showToast("Expense deleted.");

  } catch (error) {
    console.error(error);
    showToast(error.message);
  }
}


/* -----------------------------------------
   BALANCE CALCULATION
----------------------------------------- */

function renderBalances() {
  const container = $("balancesList");

  container.innerHTML = "";

  if (!state.people.length) {
    return;
  }

  const total = state.expenses.reduce(
    (sum, expense) =>
      sum + Number(expense.amount),
    0
  );

  const share =
    total / state.people.length;

  const paid = {};

  state.people.forEach(person => {
    paid[person.id] = 0;
  });

  state.expenses.forEach(expense => {
    if (paid[expense.paid_by] !== undefined) {
      paid[expense.paid_by] +=
        Number(expense.amount);
    }
  });

  state.people.forEach(person => {

    const balance =
      paid[person.id] - share;

    const row =
      document.createElement("div");

    row.className = "balance";

    let amountText = "";

    if (balance > 0.005) {
      amountText =
        `<span class="positive">
          gets ₹${balance.toFixed(2)}
        </span>`;
    } else if (balance < -0.005) {
      amountText =
        `<span class="negative">
          owes ₹${Math.abs(balance).toFixed(2)}
        </span>`;
    } else {
      amountText =
        `<span>
          settled
        </span>`;
    }

    row.innerHTML = `
      <div class="balance-row">
        <strong>
          ${escapeHtml(person.name)}
        </strong>

        ${amountText}
      </div>
    `;

    container.appendChild(row);
  });

  if (total > 0) {

    const summary =
      document.createElement("p");

    summary.className = "small";

    summary.style.marginTop = "12px";

    summary.textContent =
      `Total spent: ₹${total.toFixed(2)} • ` +
      `Each person's share: ₹${share.toFixed(2)}`;

    container.appendChild(summary);
  }
}


/* -----------------------------------------
   SHARE
----------------------------------------- */

async function shareTrip() {

  const url = window.location.href;

  try {

    if (navigator.share) {

      await navigator.share({
        title: state.trip.name +
          " — No Login Split",
        text: "Join our expense split",
        url
      });

    } else {

      await navigator.clipboard.writeText(url);

      showToast("Trip link copied!");

    }

  } catch (error) {

    if (error.name !== "AbortError") {
      showToast("Could not share the link.");
    }

  }
}


/* -----------------------------------------
   OWNER MODE
----------------------------------------- */

function ownerMode() {

  if (state.ownerToken) {
    showToast("Owner mode is already active.");
    return;
  }

  const token = prompt(
    "Enter the owner's permission code:"
  );

  if (!token) return;

  localStorage.setItem(
    "nls_owner_token",
    token.trim()
  );

  state.ownerToken = token.trim();

  renderTrip();

  showToast("Owner mode enabled.");
}


/* -----------------------------------------
   HOME
----------------------------------------- */

function showHome() {

  $("homeScreen").classList.remove("hidden");
  $("tripScreen").classList.add("hidden");

}


/* -----------------------------------------
   SECURITY / HTML ESCAPING
----------------------------------------- */

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* -----------------------------------------
   EVENTS
----------------------------------------- */

$("addPersonBtn")
  .addEventListener(
    "click",
    addPersonField
  );

$("createTripBtn")
  .addEventListener(
    "click",
    createTrip
  );

$("addExpenseBtn")
  .addEventListener(
    "click",
    addExpense
  );

$("shareBtn")
  .addEventListener(
    "click",
    shareTrip
  );

$("ownerBtn")
  .addEventListener(
    "click",
    ownerMode
  );


/* -----------------------------------------
   START
----------------------------------------- */

loadTrip();
