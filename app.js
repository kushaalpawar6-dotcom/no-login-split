const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;

const tripId = new URLSearchParams(location.search).get("trip");

let trip = null;
let people = [];
let expenses = [];

let participantToken =
  tripId
    ? localStorage.getItem(`nls_participant_${tripId}`)
    : null;

let participantId =
  tripId
    ? localStorage.getItem(`nls_participant_id_${tripId}`)
    : null;

let ownerToken =
  tripId
    ? localStorage.getItem(`nls_owner_${tripId}`)
    : null;


/* =====================================================
   HELPERS
===================================================== */

const $ = id => document.getElementById(id);

function showToast(message) {
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


async function supabase(path, options = {}) {

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

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


/* =====================================================
   HOME
===================================================== */

function showHome() {

  $("homeScreen").classList.remove("hidden");

  $("tripScreen").classList.add("hidden");

}


/* =====================================================
   START
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


/* =====================================================
   LOAD TRIP
===================================================== */

async function loadTrip() {

  try {

    const trips = await supabase(
      `/rest/v1/trip_public?id=eq.${encodeURIComponent(tripId)}&select=id,name,created_at`
    );

    if (!trips.length) {

      showToast("Trip not found.");

      showHome();

      return;
    }

    trip = trips[0];


    people = await supabase(
      `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name,participant_id&order=created_at.asc`
    );


    expenses = await supabase(
      `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_by_participant_id,created_at&order=created_at.desc`
    );


    render();

  } catch (error) {

    console.error(error);

    showToast(error.message);

  }

}


/* =====================================================
   RENDER
===================================================== */

function render() {

  $("tripTitle").textContent = trip.name;

  $("tripLink").textContent =
    window.location.href;


  populatePaidBy();

  renderExpenses();

  renderBalances();


  if (!participantToken && !ownerToken) {

    showJoinBox();

  } else {

    hideJoinBox();

  }

}


/* =====================================================
   JOIN BOX
===================================================== */

function showJoinBox() {

  if ($("joinBox")) return;


  const card =
    document.createElement("div");

  card.className = "card";

  card.id = "joinBox";


  card.innerHTML = `

    <h2>Join this trip</h2>

    <p class="small">
      Enter your name to join this trip.
      No account or password is required.
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


  $("joinBtn").onclick =
    joinTrip;
}


function hideJoinBox() {

  const box =
    $("joinBox");

  if (box) {
    box.remove();
  }

}


/* =====================================================
   JOIN TRIP
===================================================== */

async function joinTrip() {

  const name =
    $("joinName").value.trim();


  if (!name) {

    showToast("Enter your name.");

    return;
  }


  $("joinBtn").disabled = true;

  $("joinBtn").textContent =
    "Joining...";


  try {

    const result =
      await supabase(
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

      throw new Error(
        "Could not create participant permission."
      );

    }


    participantToken =
      data.participant_token;


    participantId =
      data.participant_id;


    localStorage.setItem(
      `nls_participant_${tripId}`,
      participantToken
    );


    localStorage.setItem(
      `nls_participant_id_${tripId}`,
      participantId
    );


    showToast(
      `Welcome, ${data.name}!`
    );


    await loadTrip();


  } catch (error) {

    console.error(error);

    showToast(error.message);

    $("joinBtn").disabled = false;

    $("joinBtn").textContent =
      "Join Trip";

  }

}


/* =====================================================
   PEOPLE
===================================================== */

function populatePaidBy() {

  const select =
    $("expensePaidBy");

  select.innerHTML = "";


  people.forEach(person => {

    const option =
      document.createElement("option");

    option.value =
      person.id;

    option.textContent =
      person.name;

    select.appendChild(option);

  });

}


/* =====================================================
   ADD EXPENSE
===================================================== */

async function addExpense() {

  if (!participantToken) {

    toastJoinMessage();

    return;
  }


  const description =
    $("expenseDescription")
      .value
      .trim();


  const amount =
    Number(
      $("expenseAmount").value
    );


  const paidBy =
    $("expensePaidBy").value;


  if (!description) {

    showToast(
      "Enter an expense description."
    );

    return;
  }


  if (!amount || amount <= 0) {

    showToast(
      "Enter a valid amount."
    );

    return;
  }


  if (!paidBy) {

    showToast(
      "Select who paid."
    );

    return;
  }


  $("addExpenseBtn").disabled =
    true;

  $("addExpenseBtn").textContent =
    "Adding...";


  try {

    await supabase(
      "/rest/v1/rpc/add_expense_secure",
      {
        method: "POST",

        body: JSON.stringify({

          p_trip_id:
            tripId,

          p_participant_token:
            participantToken,

          p_description:
            description,

          p_amount:
            amount,

          p_paid_by:
            paidBy

        })
      }
    );


    $("expenseDescription")
      .value = "";

    $("expenseAmount")
      .value = "";


    await loadTrip();


    showToast(
      "Expense added."
    );


  } catch (error) {

    console.error(error);

    showToast(
      error.message
    );

  }


  $("addExpenseBtn").disabled =
    false;

  $("addExpenseBtn").textContent =
    "Add Expense";

}


function toastJoinMessage() {

  showToast(
    "Join the trip before adding an expense."
  );

}


/* =====================================================
   EXPENSES
===================================================== */

function renderExpenses() {

  const container =
    $("expensesList");

  container.innerHTML = "";


  if (!expenses.length) {

    container.innerHTML =
      `<p class="small">
        No expenses yet.
      </p>`;

    return;
  }


  expenses.forEach(expense => {

    const payer =
      people.find(
        p =>
          p.id ===
          expense.paid_by
      );


    const creator =
      people.find(
        p =>
          p.participant_id ===
          expense.created_by_participant_id
      );


    const item =
      document.createElement("div");

    item.className =
      "expense";


    let deleteButton = "";


    /*
      A participant can delete only
      an expense created by themselves.
    */

    const isMine =
      participantId &&
      expense.created_by_participant_id ===
        participantId;


    if (isMine) {

      deleteButton = `

        <button

          class="danger"

          style="
            margin-top:10px;
            width:auto;
            padding:8px 12px
          "

          onclick="
            deleteOwnExpense('${expense.id}')
          "

        >

          Delete

        </button>

      `;

    }


    item.innerHTML = `

      <div class="expense-top">

        <div>

          <div class="expense-name">

            ${escapeHtml(
              expense.description
            )}

          </div>


          <div class="expense-meta">

            Paid by
            ${escapeHtml(
              payer?.name ||
              "Unknown"
            )}

            ${
              creator
                ? ` • Added by ${escapeHtml(
                    creator.name
                  )}`
                : ""
            }

          </div>

        </div>


        <div class="expense-amount">

          ₹${Number(
            expense.amount
          ).toFixed(2)}

        </div>

      </div>


      ${deleteButton}

    `;


    container.appendChild(item);

  });

}


/* =====================================================
   DELETE OWN EXPENSE
===================================================== */

async function deleteOwnExpense(
  expenseId
) {

  if (!participantToken) {

    showToast(
      "Permission required."
    );

    return;
  }


  if (
    !confirm(
      "Delete your expense?"
    )
  ) {

    return;
  }


  try {

    await supabase(
      "/rest/v1/rpc/delete_my_expense",
      {
        method: "POST",

        body: JSON.stringify({

          p_expense_id:
            expenseId,

          p_participant_token:
            participantToken

        })
      }
    );


    await loadTrip();


    showToast(
      "Expense deleted."
    );


  } catch (error) {

    console.error(error);

    showToast(
      error.message
    );

  }

}


/* =====================================================
   BALANCES
===================================================== */

function renderBalances() {

  const container =
    $("balancesList");

  container.innerHTML = "";


  if (!people.length) {
    return;
  }


  const total =
    expenses.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.amount
        ),
      0
    );


  const share =
    total /
    people.length;


  const paid = {};


  people.forEach(person => {

    paid[person.id] =
      0;

  });


  expenses.forEach(expense => {

    if (
      paid[
        expense.paid_by
      ] !== undefined
    ) {

      paid[
        expense.paid_by
      ] +=
        Number(
          expense.amount
        );

    }

  });


  people.forEach(person => {

    const balance =
      paid[person.id] -
      share;


    const row =
      document.createElement("div");

    row.className =
      "balance";


    let status = "";


    if (balance > 0.005) {

      status = `

        <span class="positive">

          gets
          ₹${balance.toFixed(2)}

        </span>

      `;

    } else if (
      balance < -0.005
    ) {

      status = `

        <span class="negative">

          owes
          ₹${Math.abs(
            balance
          ).toFixed(2)}

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

          ${escapeHtml(
            person.name
          )}

        </strong>


        ${status}

      </div>

    `;


    container.appendChild(
      row
    );

  });


  if (total > 0) {

    const summary =
      document.createElement("p");

    summary.className =
      "small";

    summary.style.marginTop =
      "12px";


    summary.textContent =
      `Total spent: ₹${total.toFixed(2)} • ` +
      `Each share: ₹${share.toFixed(2)}`;


    container.appendChild(
      summary
    );

  }

}


/* =====================================================
   SHARE
===================================================== */

async function shareTrip() {

  const url =
    window.location.href;


  try {

    if (
      navigator.share
    ) {

      await navigator.share({

        title:
          `${trip.name} — No Login Split`,

        text:
          "Join our expense split",

        url

      });

    } else {

      await navigator.clipboard
        .writeText(url);

      showToast(
        "Trip link copied!"
      );

    }

  } catch (error) {

    if (
      error.name !==
      "AbortError"
    ) {

      showToast(
        "Unable to share."
      );

    }

  }

}


/* =====================================================
   CREATE PERSON INPUT
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
  ).onclick =
    () => row.remove();


  container.appendChild(
    row
  );

}


/* =====================================================
   CREATE TRIP
===================================================== */

async function createTrip() {

  const name =
    $("tripName")
      .value
      .trim();


  const names =
    [
      ...document.querySelectorAll(
        ".person-input"
      )
    ]
      .map(
        input =>
          input.value.trim()
      )
      .filter(Boolean);


  if (!name) {

    showToast(
      "Enter a trip name."
    );

    return;
  }


  if (names.length < 2) {

    showToast(
      "Add at least 2 people."
    );

    return;
  }


  $("createTripBtn").disabled =
    true;

  $("createTripBtn").textContent =
    "Creating...";


  try {

    /*
      The database already creates
      the people here.

      We then create the private
      participant identity for the
      FIRST person only.

      The other people will join
      themselves using the same link.
    */

    const result =
      await supabase(
        "/rest/v1/rpc/create_trip",
        {
          method: "POST",

          body: JSON.stringify({

            p_name:
              name,

            p_people:
              names

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


    const newTripId =
      data.trip_id;


    /*
      Save owner permission.
    */

    localStorage.setItem(
      `nls_owner_${newTripId}`,
      data.owner_token
    );


    /*
      IMPORTANT:
      Join the FIRST existing person.

      The fixed SQL function sees that
      the person already exists and attaches
      the participant identity to it.

      It DOES NOT create a duplicate person.
    */

    const joined =
      await supabase(
        "/rest/v1/rpc/join_trip",
        {
          method: "POST",

          body: JSON.stringify({

            p_trip_id:
              newTripId,

            p_name:
              names[0]

          })
        }
      );


    const participant =
      Array.isArray(joined)
        ? joined[0]
        : joined;


    if (
      !participant?.participant_token
    ) {

      throw new Error(
        "Could not create owner participant permission."
      );

    }


    localStorage.setItem(
      `nls_participant_${newTripId}`,
      participant.participant_token
    );


    localStorage.setItem(
      `nls_participant_id_${newTripId}`,
      participant.participant_id
    );


    /*
      ONE master URL.
    */

    window.location.href =
      `${location.pathname}?trip=${newTripId}`;


  } catch (error) {

    console.error(error);

    showToast(
      error.message
    );

  }


  $("createTripBtn").disabled =
    false;

  $("createTripBtn").textContent =
    "Create Trip";

}


/* =====================================================
   BUTTON EVENTS
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
   START APP
===================================================== */

start();
