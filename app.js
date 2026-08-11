const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;

const params = new URLSearchParams(location.search);
const tripId = params.get("trip");

let trip = null;
let people = [];
let expenses = [];

let participantToken =
  localStorage.getItem(`nls_participant_${tripId}`) || null;

let ownerToken =
  localStorage.getItem(`nls_owner_${tripId}`) || null;

const $ = id => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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
      data?.hint ||
      data?.error_description ||
      "Something went wrong"
    );
  }

  return data;
}

function toast(message) {
  const box = $("toast");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 3000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =====================================================
   HOME / TRIP LOADING
===================================================== */

async function start() {
  if (!tripId) {
    showHome();
    return;
  }

  $("homeScreen").classList.add("hidden");
  $("tripScreen").classList.remove("hidden");

  await loadTrip();
}

async function loadTrip() {
  try {
    const trips = await api(
      `/rest/v1/trip_public?id=eq.${encodeURIComponent(tripId)}&select=id,name,created_at`
    );

    if (!trips || !trips.length) {
      toast("Trip not found.");
      showHome();
      return;
    }

    trip = trips[0];

    people = await api(
      `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name,participant_id&order=created_at.asc`
    );

    expenses = await api(
      `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_by_participant_id,created_at&order=created_at.desc`
    );

    render();

  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

function showHome() {
  $("homeScreen").classList.remove("hidden");
  $("tripScreen").classList.add("hidden");
}


/* =====================================================
   RENDER
===================================================== */

function render() {
  $("tripTitle").textContent = trip.name;
  $("tripLink").textContent = location.href;

  populatePayers();
  renderExpenses();
  renderBalances();

  if (!participantToken && !ownerToken) {
    showJoinBox();
  } else {
    hideJoinBox();
  }
}

function populatePayers() {
  const select = $("expensePaidBy");

  select.innerHTML = "";

  people.forEach(person => {
    const option = document.createElement("option");

    option.value = person.id;
    option.textContent = person.name;

    select.appendChild(option);
  });
}


/* =====================================================
   JOIN TRIP
===================================================== */

function showJoinBox() {
  if ($("joinBox")) return;

  const card = document.createElement("div");

  card.className = "card";
  card.id = "joinBox";

  card.innerHTML = `
    <h2>Join this trip</h2>

    <p class="small">
      Choose your name. You don't need an account.
      Your private permission is saved only on this device.
    </p>

    <div style="height:12px"></div>

    <label>Your name</label>

    <input
      id="joinName"
      placeholder="e.g. Rahul"
    >

    <button id="joinBtn">
      Join Trip
    </button>
  `;

  $("tripScreen").insertBefore(
    card,
    $("tripScreen").firstChild
  );

  $("joinBtn").onclick = joinTrip;
}

function hideJoinBox() {
  const box = $("joinBox");

  if (box) {
    box.remove();
  }
}

async function joinTrip() {
  const name = $("joinName").value.trim();

  if (!name) {
    toast("Enter your name.");
    return;
  }

  $("joinBtn").disabled = true;
  $("joinBtn").textContent = "Joining...";

  try {
    const result = await api(
      "/rest/v1/rpc/join_trip",
      {
        method: "POST",
        body: JSON.stringify({
          p_trip_id: tripId,
          p_name: name
        })
      }
    );

    const data =
      Array.isArray(result)
        ? result[0]
        : result;

    if (!data?.participant_token) {
      throw new Error("Could not create participant permission.");
    }

    participantToken =
      data.participant_token;

    localStorage.setItem(
      `nls_participant_${tripId}`,
      participantToken
    );

    toast(`Welcome, ${data.name}!`);

    await loadTrip();

  } catch (error) {
    console.error(error);
    toast(error.message);

    $("joinBtn").disabled = false;
    $("joinBtn").textContent = "Join Trip";
  }
}


/* =====================================================
   ADD EXPENSE
===================================================== */

async function addExpense() {

  if (!participantToken && !ownerToken) {
    toast("Join the trip first.");
    return;
  }

  const description =
    $("expenseDescription").value.trim();

  const amount =
    Number($("expenseAmount").value);

  const paidBy =
    $("expensePaidBy").value;

  if (!description) {
    toast("Enter a description.");
    return;
  }

  if (!amount || amount <= 0) {
    toast("Enter a valid amount.");
    return;
  }

  if (!paidBy) {
    toast("Select who paid.");
    return;
  }

  $("addExpenseBtn").disabled = true;
  $("addExpenseBtn").textContent = "Adding...";

  try {

    if (!participantToken) {
      throw new Error(
        "Join the trip before adding expenses."
      );
    }

    await api(
      "/rest/v1/rpc/add_expense_secure",
      {
        method: "POST",
        body: JSON.stringify({
          p_trip_id: tripId,
          p_participant_token: participantToken,
          p_description: description,
          p_amount: amount,
          p_paid_by: paidBy
        })
      }
    );

    $("expenseDescription").value = "";
    $("expenseAmount").value = "";

    await loadTrip();

    toast("Expense added.");

  } catch (error) {
    console.error(error);
    toast(error.message);
  }

  $("addExpenseBtn").disabled = false;
  $("addExpenseBtn").textContent = "Add Expense";
}


/* =====================================================
   EXPENSE DISPLAY
===================================================== */

function renderExpenses() {

  const container = $("expensesList");

  container.innerHTML = "";

  if (!expenses.length) {
    container.innerHTML =
      `<p class="small">No expenses yet.</p>`;
    return;
  }

  expenses.forEach(expense => {

    const payer =
      people.find(
        p => p.id === expense.paid_by
      );

    const creator =
      people.find(
        p =>
          p.participant_id ===
          expense.created_by_participant_id
      );

    const item =
      document.createElement("div");

    item.className = "expense";

    let deleteButton = "";

    /*
      Participant:
      can delete only their own expense.

      Owner:
      can delete any expense.
    */

    const isCreator =
      participantToken &&
      creator &&
      getStoredParticipantId() ===
        creator.participant_id;

    if (isCreator) {
      deleteButton = `
        <button
          class="danger"
          style="margin-top:10px;width:auto;padding:8px 12px"
          onclick="deleteOwnExpense('${expense.id}')"
        >
          Delete
        </button>
      `;
    }

    item.innerHTML = `
      <div class="expense-top">

        <div>

          <div class="expense-name">
            ${escapeHtml(expense.description)}
          </div>

          <div class="expense-meta">
            Paid by
            ${escapeHtml(
              payer?.name || "Unknown"
            )}

            ${
              creator
                ? ` • Added by ${escapeHtml(creator.name)}`
                : ""
            }
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


/* =====================================================
   PARTICIPANT ID
===================================================== */

let storedParticipantId =
  localStorage.getItem(
    `nls_participant_id_${tripId}`
  );

function getStoredParticipantId() {
  return storedParticipantId;
}


/*
  We need the participant ID after joining.
*/

async function refreshParticipantIdentity() {

  if (!participantToken) return;

  /*
    We don't expose token hashes.
    We identify the participant through
    the local participant ID saved during join.
  */

}


/* =====================================================
   DELETE OWN EXPENSE
===================================================== */

async function deleteOwnExpense(expenseId) {

  if (!participantToken) {
    toast("Permission required.");
    return;
  }

  if (!confirm("Delete your expense?")) {
    return;
  }

  try {

    await api(
      "/rest/v1/rpc/delete_my_expense",
      {
        method: "POST",
        body: JSON.stringify({
          p_expense_id: expenseId,
          p_participant_token: participantToken
        })
      }
    );

    await loadTrip();

    toast("Expense deleted.");

  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}


/* =====================================================
   BALANCES
===================================================== */

function renderBalances() {

  const container =
    $("balancesList");

  container.innerHTML = "";

  if (!people.length) return;

  const total =
    expenses.reduce(
      (sum, e) =>
        sum + Number(e.amount),
      0
    );

  const share =
    total / people.length;

  const paid = {};

  people.forEach(p => {
    paid[p.id] = 0;
  });

  expenses.forEach(e => {

    if (
      paid[e.paid_by] !== undefined
    ) {
      paid[e.paid_by] +=
        Number(e.amount);
    }

  });

  people.forEach(person => {

    const balance =
      paid[person.id] - share;

    const row =
      document.createElement("div");

    row.className = "balance";

    let status;

    if (balance > 0.005) {

      status = `
        <span class="positive">
          gets ₹${balance.toFixed(2)}
        </span>
      `;

    } else if (balance < -0.005) {

      status = `
        <span class="negative">
          owes ₹${Math.abs(balance).toFixed(2)}
        </span>
      `;

    } else {

      status = `
        <span>
          settled
        </span>
      `;

    }

    row.innerHTML = `
      <div class="balance-row">

        <strong>
          ${escapeHtml(person.name)}
        </strong>

        ${status}

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
      `Each share: ₹${share.toFixed(2)}`;

    container.appendChild(summary);

  }
}


/* =====================================================
   SHARE
===================================================== */

async function shareTrip() {

  const url =
    location.href;

  try {

    if (navigator.share) {

      await navigator.share({
        title:
          `${trip.name} — No Login Split`,
        text:
          "Join our expense split",
        url
      });

    } else {

      await navigator.clipboard.writeText(url);

      toast("Trip link copied!");

    }

  } catch (error) {

    if (error.name !== "AbortError") {
      toast("Unable to share.");
    }

  }
}


/* =====================================================
   ADD PERSON FIELD — OWNER ONLY LATER
===================================================== */

function addPersonField() {

  const container =
    $("peopleInputs");

  const row =
    document.createElement("div");

  row.className =
    "person-row";

  row.innerHTML = `
    <input
      class="person-input"
      placeholder="Person's name"
    >

    <button
      class="remove-person"
      type="button"
    >
      ×
    </button>
  `;

  row.querySelector(
    ".remove-person"
  ).onclick = () => row.remove();

  container.appendChild(row);
}


/* =====================================================
   CREATE TRIP
===================================================== */

async function createTrip() {

  const name =
    $("tripName").value.trim();

  const peopleNames =
    [...document.querySelectorAll(
      ".person-input"
    )]
      .map(input => input.value.trim())
      .filter(Boolean);

  if (!name) {
    toast("Enter a trip name.");
    return;
  }

  if (peopleNames.length < 2) {
    toast("Add at least 2 people.");
    return;
  }

  $("createTripBtn").disabled = true;
  $("createTripBtn").textContent =
    "Creating...";

  try {

    const result =
      await api(
        "/rest/v1/rpc/create_trip",
        {
          method: "POST",
          body: JSON.stringify({
            p_name: name,
            p_people: peopleNames
          })
        }
      );

    const data =
      Array.isArray(result)
        ? result[0]
        : result;

    if (
      !data?.trip_id ||
      !data?.owner_token
    ) {
      throw new Error(
        "Trip creation failed."
      );
    }

    ownerToken =
      data.owner_token;

    localStorage.setItem(
      `nls_owner_${data.trip_id}`,
      ownerToken
    );

    /*
      Owner is automatically joined as
      the first participant.

      We join using the first name.
    */

    const firstName =
      peopleNames[0];

    const joined =
      await api(
        "/rest/v1/rpc/join_trip",
        {
          method: "POST",
          body: JSON.stringify({
            p_trip_id: data.trip_id,
            p_name: firstName
          })
        }
      );

    const participant =
      Array.isArray(joined)
        ? joined[0]
        : joined;

    participantToken =
      participant.participant_token;

    storedParticipantId =
      participant.participant_id;

    localStorage.setItem(
      `nls_participant_${data.trip_id}`,
      participantToken
    );

    localStorage.setItem(
      `nls_participant_id_${data.trip_id}`,
      storedParticipantId
    );

    location.href =
      `${location.pathname}?trip=${data.trip_id}`;

  } catch (error) {

    console.error(error);
    toast(error.message);

  }

  $("createTripBtn").disabled = false;
  $("createTripBtn").textContent =
    "Create Trip";
}


/* =====================================================
   EVENTS
===================================================== */

$("addPersonBtn")
  ?.addEventListener(
    "click",
    addPersonField
  );

$("createTripBtn")
  ?.addEventListener(
    "click",
    createTrip
  );

$("addExpenseBtn")
  ?.addEventListener(
    "click",
    addExpense
  );

$("shareBtn")
  ?.addEventListener(
    "click",
    shareTrip
  );


/* =====================================================
   START
===================================================== */

start();
