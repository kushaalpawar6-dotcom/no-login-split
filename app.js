const SUPABASE_URL =
  window.SUPABASE_URL;

const SUPABASE_KEY =
  window.SUPABASE_KEY;

const tripId =
  new URLSearchParams(
    window.location.search
  ).get("trip");


let trip = null;
let people = [];
let expenses = [];
let expenseParticipants = {};


/* =====================================================
   CURRENT USER
===================================================== */

let participantToken =
  tripId
    ? localStorage.getItem(
        `nls_participant_${tripId}`
      )
    : null;

let participantId =
  tripId
    ? localStorage.getItem(
        `nls_participant_id_${tripId}`
      )
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

  const response =
    await fetch(
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
    data = text
      ? JSON.parse(text)
      : null;
  }

  catch {
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
   PEOPLE INPUTS
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

  input.value = "";


  const remove =
    document.createElement("button");

  remove.type = "button";

  remove.className =
    "remove-person";

  remove.textContent = "×";


  remove.onclick = () => {

    row.remove();

    renumberPeople();

  };


  row.appendChild(input);
  row.appendChild(remove);

  container.appendChild(row);

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


  const names =
    inputs
      .map(
        input =>
          input.value.trim()
      )
      .filter(
        name =>
          name.length > 0
      );


  if (!tripName) {
    toast("Enter a trip name.");
    return;
  }


  if (names.length < 2) {
    toast("Add at least 2 people.");
    return;
  }


  const lowerNames =
    names.map(
      name =>
        name.toLowerCase()
    );


  if (
    new Set(lowerNames).size !==
    names.length
  ) {

    toast(
      "Each person's name should be different."
    );

    return;
  }


  const button =
    $("createTripBtn");

  button.disabled = true;
  button.textContent = "Creating...";


  try {

    const result =
      await api(
        "/rest/v1/rpc/create_trip",
        {
          method: "POST",

          body: JSON.stringify({
            p_name: tripName,
            p_people: names
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


    const joined =
      await api(
        "/rest/v1/rpc/join_trip",
        {
          method: "POST",

          body: JSON.stringify({
            p_trip_id: newTripId,
            p_name: names[0]
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
        "Could not create your permission."
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


    window.location.href =
      `${window.location.pathname}?trip=${newTripId}`;

  }


  catch (error) {

    console.error(error);

    toast(error.message);

    button.disabled = false;

    button.textContent =
      "Create Trip";
  }
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

      toast("Trip not found.");

      showHome();

      return;
    }


    trip = trips[0];


    people =
      await api(
        `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name,participant_id&order=created_at.asc`
      );


    expenses =
      await api(
        `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_by_participant_id,created_at&order=created_at.desc`
      );


    await loadExpenseParticipants();


    renderTrip();

  }


  catch (error) {

    console.error(error);

    toast(error.message);

  }
}


/* =====================================================
   LOAD EXPENSE PARTICIPANTS
===================================================== */

async function loadExpenseParticipants() {

  expenseParticipants = {};


  if (!expenses.length) {
    return;
  }


  const ids =
    expenses
      .map(e => e.id)
      .join(",");


  const rows =
    await api(
      `/rest/v1/expense_participants?expense_id=in.(${ids})&select=expense_id,person_id`
    );


  rows.forEach(row => {

    if (
      !expenseParticipants[
        row.expense_id
      ]
    ) {

      expenseParticipants[
        row.expense_id
      ] = [];

    }


    expenseParticipants[
      row.expense_id
    ].push(
      row.person_id
    );

  });


  /*
    OLD EXPENSES:
    If an old expense has no participant rows,
    everyone participates.
  */

  expenses.forEach(expense => {

    if (
      !expenseParticipants[
        expense.id
      ] ||
      !expenseParticipants[
        expense.id
      ].length
    ) {

      expenseParticipants[
        expense.id
      ] =
        people.map(
          person => person.id
        );

    }

  });

}


/* =====================================================
   SCREENS
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


  renderExpenseParticipantSelector();


  renderMemberSelector();


  renderExpenses();


  renderBalances();


  // NEW: calculate and display who owes whom
  renderWhoOwesWhom();

}


/* =====================================================
   MEMBER SELECTOR
===================================================== */

function renderMemberSelector() {

  if (participantId) {

    const existing =
      people.find(
        person =>
          person.participant_id ===
          participantId
      );


    if (existing) {

      hideMemberSelector();

      return;
    }


    participantId = null;
    participantToken = null;


    localStorage.removeItem(
      `nls_participant_${tripId}`
    );


    localStorage.removeItem(
      `nls_participant_id_${tripId}`
    );

  }


  showMemberSelector();

}


function showMemberSelector() {

  let box =
    $("memberSelector");


  if (!box) {

    box =
      document.createElement("div");

    box.id =
      "memberSelector";

    box.className =
      "card";

    box.style.marginBottom =
      "16px";


    $("tripScreen")
      .insertBefore(
        box,
        $("tripScreen").firstChild
      );

  }


  box.innerHTML = `

    <div class="section-title">

      <div class="section-icon">
        👤
      </div>

      <div>

        <h2>
          Who are you?
        </h2>

        <p>
          Select your name to use this trip.
        </p>

      </div>

    </div>


    <div
      style="
        display:flex;
        flex-direction:column;
        gap:9px;
      "
    >

      ${
        people
          .map(
            person => `

              <button
                type="button"
                class="member-choice"
                onclick="
                  selectMember('${person.id}')
                "
                style="
                  width:100%;
                  min-height:48px;
                  border:1px solid #e8eaf0;
                  border-radius:14px;
                  background:#fafbfe;
                  color:#151823;
                  font-weight:700;
                  text-align:left;
                  padding:0 15px;
                "
              >

                ${escapeHtml(
                  person.name
                )}

              </button>

            `
          )
          .join("")
      }

    </div>

  `;

}


function hideMemberSelector() {

  const box =
    $("memberSelector");


  if (box) {
    box.remove();
  }

}


/* =====================================================
   SELECT MEMBER
===================================================== */

async function selectMember(
  personId
) {

  const person =
    people.find(
      p =>
        String(p.id) ===
        String(personId)
    );


  if (!person) {

    toast("Member not found.");

    return;
  }


  const buttons =
    document.querySelectorAll(
      ".member-choice"
    );


  buttons.forEach(
    button => {
      button.disabled = true;
    }
  );


  try {

    const result =
      await api(
        "/rest/v1/rpc/join_trip",
        {
          method: "POST",

          body: JSON.stringify({
            p_trip_id: tripId,
            p_name: person.name
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
        "Could not select this member."
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


    hideMemberSelector();


    toast(
      `You're using ${person.name}'s profile.`
    );


    await loadTrip();

  }


  catch (error) {

    console.error(error);

    toast(error.message);


    buttons.forEach(
      button => {
        button.disabled = false;
      }
    );

  }

}


/* =====================================================
   PAYERS
===================================================== */

function populatePayers() {

  const select =
    $("expensePaidBy");


  if (!select) {
    return;
  }


  select.innerHTML = "";


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


      if (
        participantId &&
        String(
          person.participant_id
        ) ===
        String(participantId)
      ) {

        option.selected = true;

      }


      select.appendChild(option);

    }
  );

}


/* =====================================================
   EXPENSE PARTICIPANT UI
===================================================== */

function renderExpenseParticipantSelector() {

  let box =
    $("expenseParticipantsBox");


  if (!box) {

    box =
      document.createElement("div");

    box.id =
      "expenseParticipantsBox";


    box.style.cssText = `
      margin-top:16px;
      padding:14px;
      border:1px solid #e8eaf0;
      border-radius:16px;
      background:#fafbfe;
    `;


    const button =
      $("addExpenseBtn");


    button.parentNode
      .insertBefore(
        box,
        button
      );

  }


  box.innerHTML = `

    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:10px;
      "
    >

      <div>

        <div
          style="
            font-weight:800;
            font-size:14px;
          "
        >
          Split between
        </div>

        <div
          id="selectedParticipantCount"
          style="
            font-size:12px;
            color:#737887;
            margin-top:3px;
          "
        >
          ${people.length} of ${people.length} selected
        </div>

      </div>


      <div
        style="
          display:flex;
          gap:6px;
        "
      >

        <button
          type="button"
          id="selectAllParticipants"
          style="
            border:0;
            background:transparent;
            font-size:12px;
            font-weight:700;
            padding:6px;
          "
        >
          Select all
        </button>


        <button
          type="button"
          id="clearAllParticipants"
          style="
            border:0;
            background:transparent;
            font-size:12px;
            font-weight:700;
            padding:6px;
          "
        >
          Clear
        </button>

      </div>

    </div>


    <div
      id="expenseParticipantList"
      style="
        display:flex;
        flex-direction:column;
        gap:8px;
      "
    >
    </div>

  `;


  const list =
    $("expenseParticipantList");


  people.forEach(
    person => {

      const label =
        document.createElement("label");


      label.style.cssText = `
        display:flex;
        align-items:center;
        gap:10px;
        min-height:42px;
        padding:0 10px;
        border-radius:12px;
        background:white;
        border:1px solid #eef0f4;
        font-weight:600;
        cursor:pointer;
      `;


      label.innerHTML = `

        <input
          type="checkbox"
          class="expense-participant"
          value="${escapeHtml(person.id)}"
          checked
          style="
            width:18px;
            height:18px;
          "
        >

        <span>
          ${escapeHtml(person.name)}
        </span>

      `;


      list.appendChild(label);

    }
  );


  function updateCount() {

    const checked =
      document.querySelectorAll(
        ".expense-participant:checked"
      ).length;


    const count =
      $("selectedParticipantCount");


    if (count) {

      count.textContent =
        `${checked} of ${people.length} selected`;

    }

  }


  list
    .querySelectorAll(
      ".expense-participant"
    )
    .forEach(
      input => {

        input.addEventListener(
          "change",
          updateCount
        );

      }
    );


  $("selectAllParticipants")
    .onclick = () => {

      list
        .querySelectorAll(
          ".expense-participant"
        )
        .forEach(
          input =>
            input.checked = true
        );


      updateCount();

    };


  $("clearAllParticipants")
    .onclick = () => {

      list
        .querySelectorAll(
          ".expense-participant"
        )
        .forEach(
          input =>
            input.checked = false
        );


      updateCount();

    };

}


function getSelectedExpenseParticipants() {

  return Array.from(
    document.querySelectorAll(
      ".expense-participant:checked"
    )
  )
  .map(
    input =>
      input.value
  );

}


/* =====================================================
   SAVE EXPENSE PARTICIPANTS
===================================================== */

async function saveExpenseParticipants(
  expenseId,
  personIds
) {

  if (
    !expenseId ||
    !personIds.length
  ) {

    throw new Error(
      "Select at least one participant."
    );

  }


  await api(
    "/rest/v1/expense_participants",
    {
      method: "POST",

      headers: {
        Prefer:
          "return=minimal"
      },

      body:
        JSON.stringify(
          personIds.map(
            personId => ({
              expense_id:
                expenseId,

              person_id:
                personId
            })
          )
        )
    }
  );

}


/* =====================================================
   ADD EXPENSE
===================================================== */

async function addExpense() {

  if (!participantToken) {

    toast(
      "Please select your name first."
    );

    showMemberSelector();

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
const expenseDate =
  $("expenseDate")
    .value;
  if (!expenseDate) {

  toast(
    "Please select a date."
  );

  return;

}

  const paidBy =
    $("expensePaidBy")
      .value;


  const selectedParticipants =
    getSelectedExpenseParticipants();


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


  if (
    !selectedParticipants.length
  ) {

    toast(
      "Select at least one participant."
    );

    return;
  }


  const button =
    $("addExpenseBtn");


  button.disabled = true;

  button.textContent =
    "Adding...";


  try {

    const result =
      await api(
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

p_expense_date:
  expenseDate,

p_paid_by:
  paidBy

          })
        }
      );


    let expenseId =
      Array.isArray(result)
        ? result[0]?.id
        : result?.id;


    if (
      !expenseId &&
      Array.isArray(result)
    ) {

      expenseId =
        result[0]?.expense_id;

    }


    /*
      If the RPC doesn't return the
      expense ID, find the newly-created
      expense.
    */

    if (!expenseId) {

      const latest =
        await api(
          `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&created_by_participant_id=eq.${encodeURIComponent(participantId)}&description=eq.${encodeURIComponent(description)}&amount=eq.${encodeURIComponent(amount)}&select=id,created_at&order=created_at.desc&limit=1`
        );


      expenseId =
        latest?.[0]?.id;

    }


    if (!expenseId) {

      throw new Error(
        "Expense was added, but its participant list could not be saved."
      );

    }


    await saveExpenseParticipants(
      expenseId,
      selectedParticipants
    );


    $("expenseDescription")
      .value = "";


    $("expenseAmount")
      .value = "";


    await loadTrip();


    toast(
      "Expense added ✓"
    );

  }


  catch (error) {

    console.error(error);

    toast(error.message);

  }


  button.disabled = false;

  button.textContent =
    "Add Expense";

}


/* =====================================================
   EXPENSES
===================================================== */

function renderExpenses() {

  const container =
    $("expensesList");


  container.innerHTML = "";


  if (!expenses.length) {

    container.innerHTML = `

      <div
        class="expense"
        style="
          text-align:center;
          padding:25px;
        "
      >

        <div style="font-size:28px;">
          🧾
        </div>

        <div
          style="
            margin-top:8px;
            font-weight:700;
          "
        >
          No expenses yet
        </div>

        <div
          style="
            margin-top:4px;
            color:#737887;
            font-size:12px;
          "
        >
          Add your first trip expense.
        </div>

      </div>

    `;

    return;
  }


  expenses.forEach(
    expense => {

      const payer =
        people.find(
          person =>
            String(person.id) ===
            String(expense.paid_by)
        );


      const creator =
        people.find(
          person =>
            String(
              person.participant_id
            ) ===
            String(
              expense.created_by_participant_id
            )
        );


      const ids =
        expenseParticipants[
          expense.id
        ] ||
        people.map(
          person =>
            person.id
        );


      const names =
        people
          .filter(
            person =>
              ids.some(
                id =>
                  String(id) ===
                  String(person.id)
              )
          )
          .map(
            person =>
              person.name
          );


      const item =
        document.createElement(
          "div"
        );


      item.className =
        "expense";


      const isMine =
        participantId &&
        String(
          expense.created_by_participant_id
        ) ===
        String(participantId);


      let deleteButton = "";


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


        <div
          style="
            margin-top:9px;
            font-size:12px;
            color:#737887;
            line-height:1.45;
          "
        >

          <strong>
            Split between:
          </strong>

          ${escapeHtml(
            names.join(", ")
          )}

        </div>


        ${deleteButton}

      `;


      container.appendChild(item);

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


    toast(
      "Expense deleted."
    );

  }


  catch (error) {

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


  if (!people.length) {
    return;
  }


  const paid = {};
  const owed = {};


  people.forEach(
    person => {

      paid[person.id] = 0;

      owed[person.id] = 0;

    }
  );


  expenses.forEach(
    expense => {

      const amount =
        Number(
          expense.amount
        );


      /*
        Money actually paid.
      */

      if (
        paid[
          expense.paid_by
        ] !== undefined
      ) {

        paid[
          expense.paid_by
        ] += amount;

      }


      /*
        People who owe this expense.
      */

      const ids =
        expenseParticipants[
          expense.id
        ]?.length

          ? expenseParticipants[
              expense.id
            ]

          : people.map(
              person =>
                person.id
            );


      const validIds =
        ids.filter(
          id =>
            owed[id] !== undefined
        );


      if (!validIds.length) {
        return;
      }


      const share =
        amount /
        validIds.length;


      validIds.forEach(
        id => {

          owed[id] +=
            share;

        }
      );

    }
  );


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


  people.forEach(
    person => {

      const balance =
        paid[person.id] -
        owed[person.id];


      let status;


      if (
        balance > 0.005
      ) {

        status = `

          <span class="positive">
            gets ₹${balance.toFixed(2)}
          </span>

        `;

      }


      else if (
        balance < -0.005
      ) {

        status = `

          <span class="negative">
            owes ₹${Math.abs(
              balance
            ).toFixed(2)}
          </span>

        `;

      }


      else {

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
      `Total spent: ₹${total.toFixed(2)} • Shares are calculated per expense`;


    container.appendChild(
      summary
    );

  }

}


/* =====================================================
   WHO OWES WHOM
===================================================== */

function calculateNetBalances() {

  const net = {};


  people.forEach(person => {

    net[person.id] = 0;

  });


  expenses.forEach(expense => {

    const amount =
      Number(expense.amount) || 0;


    const payerId =
      String(expense.paid_by);


    if (
      net[payerId] === undefined
    ) {

      return;

    }


    /*
      The payer is owed the full amount
      they actually paid.
    */

    net[payerId] +=
      amount;


    const ids =
      expenseParticipants[
        expense.id
      ]?.length

        ? expenseParticipants[
            expense.id
          ]

        : people.map(
            person =>
              person.id
          );


    const validIds =
      ids.filter(
        id =>
          net[id] !== undefined
      );


    if (!validIds.length) {

      return;

    }


    /*
      Everyone selected for this expense
      owes an equal share.
    */

    const share =
      amount /
      validIds.length;


    validIds.forEach(id => {

      net[id] -=
        share;

    });

  });


  return net;

}


/*
  Convert net balances into actual payments.

  Positive balance:
    person should RECEIVE money.

  Negative balance:
    person needs to PAY money.
*/

function calculateSettlements() {

  const net =
    calculateNetBalances();


  const creditors = [];
  const debtors = [];


  people.forEach(person => {

    /*
      Work in paise to avoid floating-point
      errors such as 399.999999999.
    */

    const balance =
      Math.round(
        (net[person.id] || 0) * 100
      );


    if (balance > 0) {

      creditors.push({

        id:
          person.id,

        name:
          person.name,

        amount:
          balance

      });

    }


    else if (balance < 0) {

      debtors.push({

        id:
          person.id,

        name:
          person.name,

        amount:
          Math.abs(balance)

      });

    }

  });


  /*
    Largest balances first.
    This generally reduces the number
    of transactions required.
  */

  creditors.sort(
    (a, b) =>
      b.amount -
      a.amount
  );


  debtors.sort(
    (a, b) =>
      b.amount -
      a.amount
  );


  const settlements = [];


  let creditorIndex = 0;

  let debtorIndex = 0;


  while (
    creditorIndex <
      creditors.length &&

    debtorIndex <
      debtors.length
  ) {

    const creditor =
      creditors[
        creditorIndex
      ];


    const debtor =
      debtors[
        debtorIndex
      ];


    const amount =
      Math.min(
        creditor.amount,
        debtor.amount
      );


    if (amount > 0) {

      settlements.push({

        from:
          debtor,

        to:
          creditor,

        amount:
          amount / 100

      });

    }


    creditor.amount -=
      amount;


    debtor.amount -=
      amount;


    if (
      creditor.amount ===
      0
    ) {

      creditorIndex++;

    }


    if (
      debtor.amount ===
      0
    ) {

      debtorIndex++;

    }

  }


  return settlements;

}


/*
  Render the "Who owes whom?" card.

  The card is created automatically, so
  you do NOT need to change your HTML.
*/

function renderWhoOwesWhom() {

  let card =
    $("whoOwesWhomCard");


  /*
    Create the card only once.
  */

  if (!card) {

    card =
      document.createElement(
        "div"
      );


    card.id =
      "whoOwesWhomCard";


    card.className =
      "card";


    card.style.marginTop =
      "16px";


    const balancesCard =
      document.querySelector(
        ".balances-card"
      );


    if (
      balancesCard &&
      balancesCard.parentNode
    ) {

      balancesCard.parentNode
        .insertBefore(
          card,
          balancesCard.nextSibling
        );

    }


    else {

      $("tripScreen")
        .appendChild(
          card
        );

    }

  }


  const settlements =
    calculateSettlements();


  card.innerHTML = `

    <div
      class="section-title"
      style="
        margin-bottom:14px;
      "
    >

      <div
        class="section-icon balance-icon"
      >
        ↔️
      </div>


      <div>

        <h2>
          Who owes whom?
        </h2>

        <p>
          Simple payments to settle the trip.
        </p>

      </div>

    </div>


    <div
      id="settlementsList"
    ></div>

  `;


  const list =
    $("settlementsList");


  /*
    No payments are necessary.
  */

  if (
    !settlements.length
  ) {

    list.innerHTML = `

      <div
        style="
          padding:16px;
          border-radius:14px;
          background:#eaf8f0;
          color:#16864b;
          font-weight:800;
          text-align:center;
        "
      >

        Everyone is settled up 🎉

      </div>

    `;


    return;

  }


  /*
    Render every required payment.
  */

  settlements.forEach(
    settlement => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "balance";


      row.style.background =
        "#fafbfe";


      row.innerHTML = `

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
          "
        >

          <div
            style="
              min-width:0;
            "
          >

            <div
              style="
                font-size:13px;
                font-weight:800;
                line-height:1.4;
              "
            >

              ${escapeHtml(
                settlement.from.name
              )}

              <span
                style="
                  color:#737887;
                  font-weight:600;
                "
              >
                owes
              </span>

              ${escapeHtml(
                settlement.to.name
              )}

            </div>


            <div
              style="
                margin-top:4px;
                color:#737887;
                font-size:11px;
              "
            >

              Pay
              ${escapeHtml(
                settlement.to.name
              )}

            </div>

          </div>


          <div
            class="negative"
            style="
              white-space:nowrap;
            "
          >

            ₹${settlement.amount.toFixed(2)}

          </div>

        </div>

      `;


      list.appendChild(
        row
      );

    }
  );

}


/* =====================================================
   SHARE MASTER LINK
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

    }


    else {

      await navigator.clipboard
        .writeText(url);


      toast(
        "Trip link copied!"
      );

    }

  }


  catch (error) {

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
   BUTTONS
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
   INITIAL PEOPLE
===================================================== */

createPersonField();
createPersonField();


/* =====================================================
   START
===================================================== */

if (tripId) {

  $("homeScreen")
    .classList
    .add("hidden");


  $("tripScreen")
    .classList
    .remove("hidden");


  loadTrip();

}


else {

  showHome();

}
