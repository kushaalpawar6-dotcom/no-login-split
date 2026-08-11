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


/*
=====================================================
CURRENT USER / MEMBER
=====================================================
*/

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



/*
=====================================================
HELPERS
=====================================================
*/

function $(id) {
  return document.getElementById(id);
}


function toast(message) {

  const box =
    $("toast");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent =
    message;

  box.style.display =
    "block";


  setTimeout(() => {

    box.style.display =
      "none";

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



/*
=====================================================
SUPABASE API
=====================================================
*/

async function api(
  path,
  options = {}
) {

  const response =
    await fetch(
      `${SUPABASE_URL}${path}`,
      {
        ...options,

        headers: {

          apikey:
            SUPABASE_KEY,

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

    data =
      text;

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



/*
=====================================================
PEOPLE INPUTS
=====================================================
*/

let personCounter = 0;


function createPersonField() {

  personCounter++;


  const container =
    $("peopleInputs");


  const row =
    document.createElement(
      "div"
    );


  row.className =
    "person-row";


  const input =
    document.createElement(
      "input"
    );


  input.type =
    "text";

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


  input.value =
    "";


  const remove =
    document.createElement(
      "button"
    );


  remove.type =
    "button";

  remove.className =
    "remove-person";

  remove.textContent =
    "×";


  remove.onclick =
    function () {

      row.remove();

      renumberPeople();

    };


  row.appendChild(
    input
  );

  row.appendChild(
    remove
  );


  container.appendChild(
    row
  );


  setTimeout(() => {

    input.value =
      "";

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



/*
=====================================================
CREATE TRIP
=====================================================
*/

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

    toast(
      "Enter a trip name."
    );

    return;

  }


  if (names.length < 2) {

    toast(
      "Add at least 2 people."
    );

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


  button.disabled =
    true;

  button.textContent =
    "Creating...";


  try {

    /*
    Create trip + members.
    */

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
                names

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
    The creator automatically becomes
    the first member.
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


    /*
    ONE MASTER LINK.
    */

    window.location.href =
      `${window.location.pathname}?trip=${newTripId}`;

  }


  catch (error) {

    console.error(error);

    toast(
      error.message
    );

    button.disabled =
      false;

    button.textContent =
      "Create Trip";

  }

}



/*
=====================================================
LOAD TRIP
=====================================================
*/

async function loadTrip() {

  try {

    /*
    Load trip.
    */

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


    /*
    Load ALL members.
    */

    people =
      await api(
        `/rest/v1/people?trip_id=eq.${encodeURIComponent(tripId)}&select=id,name,participant_id&order=created_at.asc`
      );


    /*
    Load expenses.
    */

    expenses =
      await api(
        `/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,description,amount,paid_by,created_by_participant_id,created_at&order=created_at.desc`
      );


    renderTrip();


  }

  catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }

}



/*
=====================================================
SCREENS
=====================================================
*/

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



/*
=====================================================
RENDER TRIP
=====================================================
*/

function renderTrip() {

  showTrip();


  $("tripTitle")
    .textContent =
    trip.name;


  $("tripLink")
    .textContent =
    window.location.href;


  /*
  Fill payer dropdown.
  */

  populatePayers();


  /*
  Show members / select current member.
  */

  renderMemberSelector();


  /*
  Show expenses.
  */

  renderExpenses();


  /*
  Show balances.
  */

  renderBalances();

}



/*
=====================================================
MEMBER SELECTOR
=====================================================
*/

function renderMemberSelector() {

  /*
  If the user has already selected a member
  on this device, don't show the selector.
  */

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

    /*
    Stored ID is no longer valid.
    */

    participantId =
      null;

    participantToken =
      null;

    localStorage.removeItem(
      `nls_participant_${tripId}`
    );

    localStorage.removeItem(
      `nls_participant_id_${tripId}`
    );

  }


  /*
  No member selected yet.

  Show the EXISTING members.

  No "Join Trip".
  */

  showMemberSelector();

}


function showMemberSelector() {

  let box =
    $("memberSelector");


  if (!box) {

    box =
      document.createElement(
        "div"
      );


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
      id="memberButtons"
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



/*
=====================================================
SELECT MEMBER
=====================================================
*/

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

    toast(
      "Member not found."
    );

    return;

  }


  /*
  Show a temporary state.
  */

  const buttons =
    document.querySelectorAll(
      ".member-choice"
    );


  buttons.forEach(
    button => {

      button.disabled =
        true;

    }
  );


  try {

    /*
    IMPORTANT:

    We use the EXISTING member name.

    No one types a new name.
    */

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
                person.name

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


    /*
    Save permission.
    */

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


    /*
    Immediately remove selector.
    */

    hideMemberSelector();


    toast(
      `You're using ${person.name}'s profile.`
    );


    /*
    Reload everything.
    */

    await loadTrip();

  }


  catch (error) {

    console.error(error);

    toast(
      error.message
    );


    buttons.forEach(
      button => {

        button.disabled =
          false;

      }
    );

  }

}



/*
=====================================================
PAYERS
=====================================================
*/

function populatePayers() {

  const select =
    $("expensePaidBy");


  if (!select) {
    return;
  }


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


      /*
      If current member is known,
      automatically select them.
      */

      if (
        participantId &&
        String(person.participant_id) ===
        String(participantId)
      ) {

        option.selected =
          true;

      }


      select.appendChild(
        option
      );

    }
  );

}



/*
=====================================================
ADD EXPENSE
=====================================================
*/

async function addExpense() {

  /*
  A member must be selected first.
  */

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


  const button =
    $("addExpenseBtn");


  button.disabled =
    true;

  button.textContent =
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
      .value =
      "";


    $("expenseAmount")
      .value =
      "";


    await loadTrip();


    toast(
      "Expense added ✓"
    );

  }


  catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }


  button.disabled =
    false;

  button.textContent =
    "Add Expense";

}



/*
=====================================================
EXPENSES
=====================================================
*/

function renderExpenses() {

  const container =
    $("expensesList");


  container.innerHTML =
    "";


  if (!expenses.length) {

    container.innerHTML = `

      <div
        class="expense"
        style="text-align:center;padding:25px;"
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


      const item =
        document.createElement(
          "div"
        );


      item.className =
        "expense";


      /*
      Only the person who added
      the expense sees Delete.
      */

      const isMine =
        participantId &&
        String(
          expense.created_by_participant_id
        ) ===
        String(participantId);


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



/*
=====================================================
DELETE MY EXPENSE
=====================================================
*/

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

  }


  catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }

}



/*
=====================================================
BALANCES
=====================================================
*/

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
      `Total spent: ₹${total.toFixed(2)} • ` +
      `Each share: ₹${share.toFixed(2)}`;


    container.appendChild(
      summary
    );

  }

}



/*
=====================================================
SHARE MASTER LINK
=====================================================
*/

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



/*
=====================================================
BUTTONS
=====================================================
*/

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



/*
=====================================================
INITIAL PERSON FIELDS
=====================================================
*/

createPersonField();

createPersonField();



/*
=====================================================
START
=====================================================
*/

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
