const SUPABASE_URL =
  window.SUPABASE_URL;

const SUPABASE_KEY =
  window.SUPABASE_KEY;

const tripId =
  new URLSearchParams(window.location.search).get("trip");

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


/* =====================================================
   HELPERS
===================================================== */

function $(id) {
  return document.getElementById(id);
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
   SUPABASE API
===================================================== */

async function api(path, options = {}) {

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );


  const text =
    await response.text();


  let data = null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

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
   PEOPLE
===================================================== */

let personCounter = 0;


function createPersonField() {

  personCounter++;


  const container =
    $("peopleInputs");


  const row =
    document.createElement("div");

  row.className =
    "person-row";


  const input =
    document.createElement("input");


  input.type = "text";

  input.className =
    "person-input";


  input.placeholder =
    `Person ${personCounter}`;


  /*
    Safari autofill protection
  */

  input.autocomplete =
    "new-password";

  input.autocapitalize =
    "words";

  input.autocorrect =
    "off";

  input.spellcheck =
    false;


  input.name =
    `person_${Date.now()}_${personCounter}`;


  /*
    VERY IMPORTANT:
    New field is always blank.
  */

  input.defaultValue = "";

  input.value = "";


  const remove =
    document.createElement("button");


  remove.type = "button";

  remove.className =
    "remove-person";

  remove.textContent = "×";


  remove.onclick =
    function () {

      row.remove();

      renumberPeople();

    };


  row.appendChild(input);

  row.appendChild(remove);

  container.appendChild(row);


  /*
    Safari sometimes restores input values
    after the element is added.
  */

  setTimeout(() => {

    input.value = "";

  }, 0);

}


function renumberPeople() {

  const inputs =
    document.querySelectorAll(
      "#peopleInputs .person-input"
    );


  inputs.forEach(
    (input, index) => {

      input.placeholder =
        `Person ${index + 1}`;

    }
  );


  personCounter =
    inputs.length;

}


function addPerson() {

  createPersonField();

}


/* =====================================================
   CREATE TRIP
===================================================== */

async function createTrip() {

  const tripName =
    $("tripName")
      .value
      .trim();


  const inputs =
    Array.from(
      document.querySelectorAll(
        "#peopleInputs .person-input"
      )
    );


  /*
    Read each input separately.
  */

  const names =
    inputs.map(
      input =>
        input.value.trim()
    );


  const validNames =
    names.filter(
      name =>
        name.length > 0
    );


  if (!tripName) {

    toast(
      "Enter a trip name."
    );

    return;
  }


  if (validNames.length < 2) {

    toast(
      "Add at least 2 people."
    );

    return;
  }


  /*
    Check duplicate names.
  */

  const lowerNames =
    validNames.map(
      name =>
        name.toLowerCase()
    );


  if (
    new Set(lowerNames).size !==
    validNames.length
  ) {

    toast(
      "Each person's name should be different."
    );

    return;
  }


  $("createTripBtn").disabled =
    true;

  $("createTripBtn").textContent =
    "Creating...";


  try {

    const result =
      await api(
        "/rest/v1/rpc/create_trip",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              p_name:
                tripName,

              p_people:
                validNames

            })

        }
      );


    const data =
      Array.isArray(result)
        ? result[0]
        : result;


    if (!data?.trip_id) {

      throw new Error(
        "Trip creation failed."
      );

    }


    const newTripId =
      data.trip_id;


    /*
      Join as first person.
    */

    const joined =
      await api(
        "/rest/v1/rpc/join_trip",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              p_trip_id:
                newTripId,

              p_name:
                validNames[0]

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
        "Could not create participant permission."
      );

    }


    participantToken =
      participant.participant_token;


    participantId =
      participant.participant_id;


    localStorage.setItem(
      `nls_participant_${newTripId}`,
      participantToken
    );


    localStorage.setItem(
      `nls_participant_id_${newTripId}`,
      participantId
    );


    /*
      ONE MASTER LINK.
    */

    window.location.href =
      `${window.location.pathname}?trip=${newTripId}`;


  } catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }


  $("createTripBtn").disabled =
    false;

  $("createTripBtn").textContent =
    "Create Trip";

}


/* =====================================================
   LOAD TRIP
===================================================== */

async function loadTrip() {

  try {

    const trips =
      await api(
        `/rest/v1/trip_public?id=eq.${encodeURIComponent(tripId)}&select=id,name,created_at`
      );


    if (
      !trips ||
      trips.length === 0
    ) {

      toast(
        "Trip not found."
      );

      showHome();

      return;
    }


    trip =
      trips[0];


    people =
      await api(
        `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name,participant_id&order=created_at.asc`
      );


    expenses =
      await api(
        `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_by_participant_id,created_at&order=created_at.desc`
      );


    renderTrip();


  } catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }

}


/* =====================================================
   SCREEN
===================================================== */

function showHome() {

  $("homeScreen")
    .classList
    .remove("hidden");


  $("tripScreen")
    .classList
    .add("hidden");

}


function showTrip() {

  $("homeScreen")
    .classList
    .add("hidden");


  $("tripScreen")
    .classList
    .remove("hidden");

}


/* =====================================================
   RENDER TRIP
===================================================== */

function renderTrip() {

  showTrip();


  $("tripTitle")
    .textContent =
    trip.name;


  $("tripLink")
    .textContent =
    window.location.href;


  populatePayers();

  renderExpenses();

  renderBalances();

}


/* =====================================================
   JOIN TRIP
===================================================== */

function showJoinBox() {

  if ($("joinBox")) {
    return;
  }


  const card =
    document.createElement("div");


  card.id =
    "joinBox";

  card.className =
    "card";


  card.innerHTML = `

    <h2>
      Join this trip
    </h2>

    <p class="small">
      Enter your name to join the trip.
    </p>

    <label>
      Your name
    </label>

    <input
      id="joinName"
      type="text"
      placeholder="e.g. Aman"
      autocomplete="off"
    >

    <button
      id="joinBtn"
      type="button"
    >
      Join Trip
    </button>

  `;


  $("tripScreen")
    .insertBefore(
      card,
      $("tripScreen").firstChild
    );


  $("joinBtn")
    .onclick =
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
   JOIN
===================================================== */

async function joinTrip() {

  const name =
    $("joinName")
      .value
      .trim();


  if (!name) {

    toast(
      "Enter your name."
    );

    return;
  }


  $("joinBtn").disabled =
    true;

  $("joinBtn").textContent =
    "Joining...";


  try {

    const result =
      await api(
        "/rest/v1/rpc/join_trip",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              p_trip_id:
                tripId,

              p_name:
                name

            })

        }
      );


    const participant =
      Array.isArray(result)
        ? result[0]
        : result;


    if (
      !participant?.participant_token
    ) {

      throw new Error(
        "Could not join trip."
      );

    }


    participantToken =
      participant.participant_token;


    participantId =
      participant.participant_id;


    localStorage.setItem(
      `nls_participant_${tripId}`,
      participantToken
    );


    localStorage.setItem(
      `nls_participant_id_${tripId}`,
      participantId
    );


    toast(
      `Welcome, ${participant.name}!`
    );


    await loadTrip();


  } catch (error) {

    console.error(error);

    toast(
      error.message
    );


    $("joinBtn").disabled =
      false;

    $("joinBtn").textContent =
      "Join Trip";

  }

}


/* =====================================================
   PAYERS
===================================================== */

function populatePayers() {

  const select =
    $("expensePaidBy");


  select.innerHTML =
    "";


  people.forEach(
    person => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        person.id;


      option.textContent =
        person.name;


      select.appendChild(
        option
      );

    }
  );

}


/* =====================================================
   ADD EXPENSE
===================================================== */

async function addExpense() {

  if (!participantToken) {

    showJoinBox();

    toast(
      "Join the trip first."
    );

    return;
  }


  const description =
    $("expenseDescription")
      .value
      .trim();


  const amount =
    Number(
      $("expenseAmount")
        .value
    );


  const paidBy =
    $("expensePaidBy")
      .value;


  if (!description) {

    toast(
      "Enter a description."
    );

    return;
  }


  if (
    !amount ||
    amount <= 0
  ) {

    toast(
      "Enter a valid amount."
    );

    return;
  }


  if (!paidBy) {

    toast(
      "Select who paid."
    );

    return;
  }


  $("addExpenseBtn")
    .disabled =
    true;

  $("addExpenseBtn")
    .textContent =
    "Adding...";


  try {

    await api(
      "/rest/v1/rpc/add_expense_secure",
      {

        method:
          "POST",

        body:
          JSON.stringify({

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


    toast(
      "Expense added."
    );


  } catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }


  $("addExpenseBtn")
    .disabled =
    false;

  $("addExpenseBtn")
    .textContent =
    "Add Expense";

}


/* =====================================================
   EXPENSE LIST
===================================================== */

function renderExpenses() {

  const container =
    $("expensesList");


  container.innerHTML =
    "";


  if (!expenses.length) {

    container.innerHTML =
      `
        <p class="small">
          No expenses yet.
        </p>
      `;

    return;
  }


  expenses.forEach(
    expense => {

      const payer =
        people.find(
          person =>
            person.id ===
            expense.paid_by
        );


      const creator =
        people.find(
          person =>
            person.participant_id ===
            expense.created_by_participant_id
        );


      const item =
        document.createElement(
          "div"
        );


      item.className =
        "expense";


      const isMine =
        participantId &&
        expense.created_by_participant_id ===
        participantId;


      let deleteButton =
        "";


      if (isMine) {

        deleteButton = `

          <button
            class="danger"
            style="
              width:auto;
              padding:8px 12px;
              margin-top:10px;
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


      container.appendChild(
        item
      );

    }
  );

}


/* =====================================================
   DELETE EXPENSE
===================================================== */

async function deleteOwnExpense(
  expenseId
) {

  if (!participantToken) {

    toast(
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

    await api(
      "/rest/v1/rpc/delete_my_expense",
      {

        method:
          "POST",

        body:
          JSON.stringify({

            p_expense_id:
              expenseId,

            p_participant_token:
              participantToken

          })

        }
      );


    await loadTrip();


    toast(
      "Expense deleted."
    );


  } catch (error) {

    console.error(error);

    toast(
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


  container.innerHTML =
    "";


  if (!people.length) {
    return;
  }


  const total =
    expenses.reduce(
      (
        sum,
        expense
      ) =>
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


  people.forEach(
    person => {

      paid[person.id] =
        0;

    }
  );


  expenses.forEach(
    expense => {

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

    }
  );


  people.forEach(
    person => {

      const balance =
        paid[person.id] -
        share;


      let status;


      if (
        balance > 0.005
      ) {

        status = `

          <span class="positive">
            gets ₹${balance.toFixed(2)}
          </span>

        `;

      } else if (
        balance < -0.005
      ) {

        status = `

          <span class="negative">
            owes ₹${Math.abs(
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


      const row =
        document.createElement(
          "div"
        );


      row.className =
        "balance";


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

    }
  );


  if (total > 0) {

    const summary =
      document.createElement(
        "p"
      );


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

        url:
          url

      });

    } else {

      await navigator.clipboard
        .writeText(url);


      toast(
        "Trip link copied!"
      );

    }

  } catch (error) {

    if (
      error.name !==
      "AbortError"
    ) {

      toast(
        "Unable to share the link."
      );

    }

  }

}


/* =====================================================
   BUTTON EVENTS
===================================================== */

$("addPersonBtn")
  .addEventListener(
    "click",
    addPerson
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


/* =====================================================
   INITIAL PERSON FIELDS
===================================================== */

createPersonField();

createPersonField();


/* =====================================================
   START APP
===================================================== */

if (tripId) {

  $("homeScreen")
    .classList
    .add("hidden");


  $("tripScreen")
    .classList
    .remove("hidden");


  loadTrip();

} else {

  showHome();

}
