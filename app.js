const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;

const tripId =
  new URLSearchParams(window.location.search).get("trip");

let trip = null;
let people = [];
let expenses = [];
let expenseParticipants = {};
let expensePayments = [];

let ownerToken =
  tripId
    ? localStorage.getItem(`nls_owner_${tripId}`)
    : null;

let participantToken =
  tripId
    ? localStorage.getItem(`nls_participant_${tripId}`)
    : null;

let participantId =
  tripId
    ? localStorage.getItem(`nls_participant_id_${tripId}`)
    : null;


/* =========================
   HELPERS
========================= */

function $(id) {
  return document.getElementById(id);
}

async function copyTripLink() {
  const link = window.location.href;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
    } else {
      const field = document.createElement("textarea");
      field.value = link;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    toast("Trip link copied.");
  } catch (error) {
    console.error(error);
    toast("Could not copy automatically. Please copy the link shown above.");
  }
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
  
function isValidCurrencyAmount(value) {
  return Number.isFinite(value) &&
    value > 0 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001;
}



/* =========================
   SUPABASE API
========================= */

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


/* =========================
   PEOPLE INPUTS
========================= */

let personCounter = 0;

function createPersonField() {

  personCounter++;

  const container = $("peopleInputs");

  const row = document.createElement("div");

  row.className = "person-row";

  const input = document.createElement("input");

  input.type = "text";
  input.maxLength = 80;
  input.className = "person-input";

  input.placeholder =
    `Person ${personCounter}`;

  input.autocomplete = "off";
  input.autocapitalize = "words";
  input.autocorrect = "off";
  input.spellcheck = false;

  const remove =
    document.createElement("button");

  remove.type = "button";
  remove.className = "remove-person";
  remove.textContent = "×";

  remove.onclick = () => {
    row.remove();
    renumberPeople();
  };

  row.appendChild(input);
  row.appendChild(remove);

  container.appendChild(row);
}

function renumberPeople() {

  const inputs =
    document.querySelectorAll(
      "#peopleInputs .person-input"
    );

  inputs.forEach((input, index) => {
    input.placeholder =
      `Person ${index + 1}`;
  });

  personCounter = inputs.length;
}

function addPerson() {
  createPersonField();
}


/* =========================
   CREATE TRIP
========================= */

async function createTrip() {

  const tripName =
    $("tripName").value.trim();

  const inputs =
    Array.from(
      document.querySelectorAll(
        "#peopleInputs .person-input"
      )
    );

  const names =
    inputs
      .map(input => input.value.trim())
      .filter(name => name.length > 0);

  if (!tripName || tripName.length > 100) {
    toast("Enter a trip name (maximum 100 characters).");
    return;
  }

  if (names.length < 2 || names.length > 50) {
    toast("Add between 2 and 50 people.");
    return;
  }

  const lowerNames =
    names.map(name => name.toLowerCase());

  if (
    new Set(lowerNames).size !== names.length
  ) {
    toast(
      "Each person's name should be different."
    );
    return;
  }

  const button = $("createTripBtn");

  button.disabled = true;
  button.textContent = "Creating...";

  try {

    const result = await api(
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

    const newTripId = data.trip_id;

    if (data.owner_token) {
      localStorage.setItem(`nls_owner_${newTripId}`, data.owner_token);
    }

    const joined = await api(
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

    if (!participant?.participant_token) {
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

  } catch (error) {

    console.error(error);

    toast(error.message);

    button.disabled = false;
    button.textContent = "Create Trip";
  }
}
/* =====================================================
   LOAD TRIP
===================================================== */

async function loadTrip() {
  try {
    const result = await api("/rest/v1/rpc/get_trip_data", {
      method: "POST",
      body: JSON.stringify({ p_trip_id: tripId })
    });

    const data = Array.isArray(result) ? result[0] : result;
    if (!data?.trip) {
      toast("Trip not found.");
      showHome();
      return;
    }

    trip = data.trip;
    people = Array.isArray(data.people) ? data.people : [];
    expenses = Array.isArray(data.expenses) ? data.expenses : [];
    expensePayments = Array.isArray(data.expensePayments) ? data.expensePayments : [];
    expenseParticipants = {};

    (Array.isArray(data.expenseParticipants) ? data.expenseParticipants : []).forEach(row => {
      if (!expenseParticipants[row.expense_id]) {
        expenseParticipants[row.expense_id] = [];
      }
      expenseParticipants[row.expense_id].push(row.person_id);
    });

    // Older expenses without saved split rows are treated as shared by everyone.
    expenses.forEach(expense => {
      if (!expenseParticipants[expense.id]?.length) {
        expenseParticipants[expense.id] = people.map(person => person.id);
      }
    });

    renderTrip();
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not load this trip.");
  }
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
   
/* =====================================================
   RENDER TRIP
===================================================== */

function getLocalToday() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* =====================================================
   EXPENSE DATE FIELD
===================================================== */

function addExpenseDateField() {

  // Use the date input already present in index.html
  if ($("expenseDate")) {
    if (!$("expenseDate").value) {
      $("expenseDate").value = getLocalToday();
    }
    return;
  }

  const payerBox = $("expensePayersBox");

  if (!payerBox) return;

  const dateBox = document.createElement("div");

  dateBox.id = "expenseDateBox";

  dateBox.style.cssText = `
    margin-top:16px;
    margin-bottom:16px;
    padding:14px;
    border:1px solid #e8eaf0;
    border-radius:16px;
    background:#fafbfe;
  `;

  dateBox.innerHTML = `
    <label
      for="expenseDate"
      style="
        display:block;
        font-weight:800;
        font-size:14px;
        margin-bottom:8px;
      "
    >
      Date
    </label>

    <input
      type="date"
      id="expenseDate"
      style="
        width:100%;
        box-sizing:border-box;
        min-height:52px;
        padding:0 14px;
        border:1px solid #e3e5eb;
        border-radius:14px;
        background:white;
        font-size:16px;
        color:#151823;
      "
    >
  `;

  payerBox.parentNode.insertBefore(dateBox, payerBox);

  $("expenseDate").value = getLocalToday();
}


/* =====================================================
   RENDER TRIP
===================================================== */

function renderOwnerControls() {
  let panel = $("ownerControls");

  if (!ownerToken) {
    if (!participantToken) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "ownerControls";
      panel.className = "card";
      panel.style.cssText = "margin-bottom:16px;";
      const expenseCard = document.querySelector(".expense-card");
      if (expenseCard?.parentNode) {
        expenseCard.parentNode.insertBefore(panel, expenseCard);
      } else {
        $("tripScreen").appendChild(panel);
      }
    }
    panel.innerHTML = `
      <div style="font-weight:800;margin-bottom:6px;">Older trip creator access</div>
      <p style="font-size:13px;color:#737887;margin:0 0 12px;">If you created this trip originally, the first participant can restore creator controls using their saved participant access.</p>
      <button type="button" style="width:100%;" onclick="claimLegacyTripOwner()">Restore creator access</button>
    `;
    return;
  }

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ownerControls";
    panel.className = "card";
    panel.style.cssText = "margin-bottom:16px;";
    const expenseCard = document.querySelector(".expense-card");
    if (expenseCard?.parentNode) {
      expenseCard.parentNode.insertBefore(panel, expenseCard);
    } else {
      $("tripScreen").appendChild(panel);
    }
  }

  panel.innerHTML = `
    <div class="section-title" style="margin-bottom:12px;">
      <div class="section-icon">⚙️</div>
      <div>
        <h2>Trip management</h2>
        <p>Creator controls</p>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:9px;">
      <div style="font-weight:700;font-size:14px;">Add person</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="ownerAddPersonName" type="text" maxlength="80" placeholder="New person's name" style="min-width:0;flex:1;">
        <button type="button" id="ownerAddPersonBtn" style="width:auto;padding:10px 14px;" onclick="addTripPerson()">Add</button>
      </div>
      <div style="font-weight:700;font-size:14px;margin-top:6px;">People</div>
      ${people.map(person => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #e8eaf0;border-radius:12px;">
          <span style="font-weight:600;">${escapeHtml(person.name)}</span>
          ${people.length > 2
            ? `<button type="button" class="danger" style="width:auto;padding:7px 10px;" onclick="deleteTripPerson('${person.id}')">Delete</button>`
            : `<span style="font-size:11px;color:#737887;">Keep at least 2 people</span>`}
        </div>
      `).join("")}
      <button type="button" class="danger" style="margin-top:8px;" onclick="deleteCurrentTrip()">Delete Trip</button>
      <p style="font-size:12px;color:#737887;margin:0;">People linked to existing expenses cannot be deleted, to protect expense history.</p>
      <p style="font-size:12px;color:#737887;margin:0;">Creator access is saved on this device. Clearing browser data removes it.</p>
    </div>
  `;
}

async function claimLegacyTripOwner() {
  if (!participantToken) {
    toast("Select your original participant profile first.");
    return;
  }
  try {
    const result = await api("/rest/v1/rpc/claim_legacy_trip_owner", {
      method: "POST",
      body: JSON.stringify({
        p_trip_id: tripId,
        p_participant_token: participantToken
      })
    });
    const data = Array.isArray(result) ? result[0] : result;
    if (!data?.owner_token) throw new Error("Creator access could not be restored.");
    ownerToken = data.owner_token;
    localStorage.setItem(`nls_owner_${tripId}`, ownerToken);
    await loadTrip();
    toast("Creator access restored.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not restore creator access.");
  }
}


async function deleteTripPerson(personId) {
  if (!ownerToken) {
    toast("Only the trip creator can delete people.");
    return;
  }
  const person = people.find(item => String(item.id) === String(personId));
  if (!person) return;
  if (!confirm(`Delete ${person.name} from this trip? This cannot be undone.`)) return;

  try {
    await api("/rest/v1/rpc/delete_person", {
      method: "POST",
      body: JSON.stringify({
        p_person_id: personId,
        p_owner_token: ownerToken
      })
    });

    if (String(participantId) === String(person.participant_id)) {
      localStorage.removeItem(`nls_participant_${tripId}`);
      localStorage.removeItem(`nls_participant_id_${tripId}`);
      participantToken = null;
      participantId = null;
    }
    await loadTrip();
    toast("Person deleted.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not delete person.");
  }
}

async function addTripPerson() {
  if (!ownerToken) {
    toast("Only the trip creator can add people.");
    return;
  }
  const input = $("ownerAddPersonName");
  const button = $("ownerAddPersonBtn");
  const name = input?.value.trim() || "";
  if (!name || name.length > 80) {
    toast("Enter a name between 1 and 80 characters.");
    return;
  }
  if (people.some(person => person.name.trim().toLowerCase() === name.toLowerCase())) {
    toast("A person with this name already exists.");
    return;
  }
  if (people.length >= 50) {
    toast("This trip has reached the 50-person limit.");
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = "Adding...";
  }
  try {
    await api("/rest/v1/rpc/add_trip_person_owner", {
      method: "POST",
      body: JSON.stringify({
        p_trip_id: tripId,
        p_owner_token: ownerToken,
        p_name: name
      })
    });
    if (input) input.value = "";
    await loadTrip();
    toast("Person added. They can select their name to join.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not add person.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Add";
    }
  }
}

async function deleteCurrentTrip() {
  if (!ownerToken) {
    toast("Only the trip creator can delete this trip.");
    return;
  }
  if (!confirm("Delete this entire trip, including all expenses and balances? This cannot be undone.")) return;

  try {
    await api("/rest/v1/rpc/delete_trip", {
      method: "POST",
      body: JSON.stringify({
        p_trip_id: tripId,
        p_owner_token: ownerToken
      })
    });

    localStorage.removeItem(`nls_owner_${tripId}`);
    localStorage.removeItem(`nls_participant_${tripId}`);
    localStorage.removeItem(`nls_participant_id_${tripId}`);
    window.location.href = window.location.pathname;
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not delete trip.");
  }
}

function renderTrip() {

  showTrip();

  $("tripTitle").textContent = trip.name;

  $("tripLink").textContent = window.location.href;

  renderOwnerControls();

  populatePayers();

  addExpenseDateField();

  renderExpenseParticipantSelector();

  renderMemberSelector();

  renderExpenses();

  renderTripSummary();

  renderBalances();

  renderWhoOwesWhom();

}



function renderMemberSelector() {

  if (participantId) {

    const existing =
      people.find(
        person =>
          String(person.participant_id) === String(participantId) ||
          (Array.isArray(person.participant_ids) &&
            person.participant_ids.some(id => String(id) === String(participantId)))
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
          Select your name to use this trip. Anyone with the link can choose a profile, so share it only with your group.
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

                ${escapeHtml(person.name)}

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

async function selectMember(personId) {

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

  buttons.forEach(button => {
    button.disabled = true;
  });


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


    if (!participant?.participant_token) {

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

    buttons.forEach(button => {
      button.disabled = false;
    });

  }

}


/* =====================================================
   PAYERS
===================================================== */

function populatePayers() {

  const oldSelect =
    $("expensePaidBy");

  if (!oldSelect) {
    return;
  }


  let box =
    $("expensePayersBox");


  if (!box) {

    box =
      document.createElement("div");

    box.id =
      "expensePayersBox";

    box.style.cssText = `
      margin-top:16px;
      padding:14px;
      border:1px solid #e8eaf0;
      border-radius:16px;
      background:#fafbfe;
    `;


    oldSelect.parentNode.parentNode
      .insertBefore(
        box,
        oldSelect.parentNode
      );

  }


  oldSelect.parentNode.style.display =
    "none";


  box.innerHTML = `

    <div style="
      font-weight:800;
      font-size:14px;
      margin-bottom:10px;
    ">
      Paid by
    </div>

    <div style="
      font-size:12px;
      color:#737887;
      margin-bottom:10px;
    ">
      Select everyone who paid and enter their amount.
    </div>

    <div
      id="payerRows"
      style="
        display:flex;
        flex-direction:column;
        gap:8px;
      "
    ></div>

  `;


  const rows =
    $("payerRows");


  people.forEach(person => {

    const row =
      document.createElement("div");


    row.style.cssText = `
      display:grid;
      grid-template-columns:1fr 110px;
      gap:8px;
      align-items:center;
    `;


    row.innerHTML = `

      <label style="
        display:flex;
        align-items:center;
        gap:8px;
        min-height:44px;
        padding:0 10px;
        border-radius:12px;
        background:white;
        border:1px solid #eef0f4;
        font-weight:600;
      ">

        <input
          type="checkbox"
          class="expense-payer"
          value="${escapeHtml(person.id)}"
          style="
            width:18px;
            height:18px;
          "
        >

        <span>
          ${escapeHtml(person.name)}
        </span>

      </label>


      <input
        type="number"
        class="payer-amount"
        data-person-id="${escapeHtml(person.id)}"
        min="0"
        step="0.01"
        inputmode="decimal"
        placeholder="₹ Amount"
        disabled
        style="
          width:100%;
          box-sizing:border-box;
        "
      >

    `;


    rows.appendChild(row);

  });


  rows
    .querySelectorAll(".expense-payer")
    .forEach(checkbox => {

      checkbox.addEventListener(
        "change",
        () => {

          const amountInput =
            rows.querySelector(
              `.payer-amount[data-person-id="${checkbox.value}"]`
            );


          if (amountInput) {

            amountInput.disabled =
              !checkbox.checked;


            if (!checkbox.checked) {
              amountInput.value = "";
            }

          }

        }
      );

    });

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


    button.parentNode.insertBefore(
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
    ></div>

  `;


  const list =
    $("expenseParticipantList");


  people.forEach(person => {

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

  });


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
    .forEach(input => {

      input.addEventListener(
        "change",
        updateCount
      );

    });


  $("selectAllParticipants").onclick =
    () => {

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


  $("clearAllParticipants").onclick =
    () => {

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
  ).map(
    input =>
      input.value
  );

}


/* =====================================================
   SAVE EXPENSE PARTICIPANTS
===================================================== */

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
      $("expenseAmount").value
    );


  const expenseDate =
    $("expenseDate").value;


  if (!description || description.length > 200) {

    toast(
      "Enter a description (maximum 200 characters)."
    );

    return;
  }


  if (!isValidCurrencyAmount(amount)) {

    toast(
      "Enter a valid amount with up to 2 decimal places."
    );

    return;
  }


  if (!expenseDate) {

    toast(
      "Please select a date."
    );

    return;
  }


  const payerCheckboxes =
    Array.from(
      document.querySelectorAll(
        ".expense-payer:checked"
      )
    );


  if (!payerCheckboxes.length) {

    toast(
      "Select at least one person who paid."
    );

    return;
  }


  const payments = [];


  payerCheckboxes.forEach(
    checkbox => {

      const amountInput =
        document.querySelector(
          `.payer-amount[data-person-id="${checkbox.value}"]`
        );


      const payerAmount =
        Number(
          amountInput?.value || 0
        );


      if (payerAmount > 0) {

        payments.push({

          person_id:
            checkbox.value,

          amount:
            payerAmount

        });

      }

    }
  );


  if (!payments.length) {

    toast(
      "Enter the amount paid by each selected person."
    );

    return;
  }

  if (payments.some(payment => !isValidCurrencyAmount(payment.amount))) {
    toast("Each payer amount must be positive and have up to 2 decimal places.");
    return;
  }


  const paymentTotal =
    payments.reduce(
      (sum, payment) =>
        sum + payment.amount,
      0
    );


  if (
    Math.abs(
      paymentTotal - amount
    ) > 0.001
  ) {

    toast(
      `Payer amounts must total ₹${amount.toFixed(2)}. Currently ₹${paymentTotal.toFixed(2)}.`
    );

    return;
  }


  const selectedParticipants =
    getSelectedExpenseParticipants();


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

    const primaryPayer =
      payments[0].person_id;


    const expenseId = await api(
      "/rest/v1/rpc/create_expense_complete_secure",
      {
        method: "POST",
        body: JSON.stringify({
          p_trip_id: tripId,
          p_participant_token: participantToken,
          p_description: description,
          p_amount: amount,
          p_paid_by: primaryPayer,
          p_expense_date: expenseDate,
          p_participants: selectedParticipants.map(person_id => ({ person_id })),
          p_payments: payments.map(payment => ({
            person_id: payment.person_id,
            amount: payment.amount
          }))
        })
      }
    );

    if (!expenseId) {
      throw new Error("Expense could not be saved.");
    }

    $("expenseDescription")
      .value = "";


    $("expenseAmount")
      .value = "";
$("expenseDate").value = getLocalToday();

    document
      .querySelectorAll(
        ".expense-payer"
      )
      .forEach(
        checkbox => {

          checkbox.checked =
            false;

        }
      );


    document
      .querySelectorAll(
        ".payer-amount"
      )
      .forEach(
        input => {

          input.value =
            "";

          input.disabled =
            true;

        }
      );


    await loadTrip();


    toast(
      "Expense added ✓"
    );

  }


  catch (error) {

    console.error(error);

    toast(
      error.message ||
      "Could not add expense."
    );

  }


  finally {

    button.disabled =
      false;

    button.textContent =
      "Add Expense";
  

  }

}
/* =====================================================
   EXPENSES
===================================================== */

function isCurrentUserExpense(expense) {
  if (!participantId || !expense) return false;

  // A returning participant may receive a new participant token on another
  // device. Match the current participant to the saved person profile first.
  const currentPerson = people.find(person =>
    String(person.participant_id) === String(participantId) ||
    (Array.isArray(person.participant_ids) &&
      person.participant_ids.some(id => String(id) === String(participantId)))
  );

  if (!currentPerson) return false;

  // The database authorizes edits by the creator's person profile name,
  // so the UI must use the same rule to show the correct controls.
  if (expense.created_by_name) {
    return currentPerson.name.trim().toLowerCase() ===
      String(expense.created_by_name).trim().toLowerCase();
  }

  // Compatibility for older expenses that do not expose created_by_name.
  return String(expense.created_by_participant_id) === String(participantId);
}


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


  expenses.forEach(expense => {

    const paymentsForExpense =
      expensePayments.filter(
        payment =>
          String(payment.expense_id) === String(expense.id)
      );

    const payerDisplay = paymentsForExpense.length
      ? paymentsForExpense
          .map(payment => {
            const person = people.find(
              item => String(item.id) === String(payment.person_id)
            );
            return person
              ? `${person.name} (₹${Number(payment.amount).toFixed(2)})`
              : null;
          })
          .filter(Boolean)
          .join(", ")
      : (
          people.find(
            person =>
              String(person.id) === String(expense.paid_by)
          )?.name || "Unknown"
        );


    const creatorName =
      expense.created_by_name ||
      people.find(
        person =>
          String(person.participant_id) ===
          String(expense.created_by_participant_id)
      )?.name ||
      "";


    const ids =
      expenseParticipants[expense.id] ||
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
      document.createElement("div");


    item.className =
      "expense";


    const isMine = isCurrentUserExpense(expense);


    let deleteButton = "";


    if (isMine || ownerToken) {

      deleteButton = `

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button
            type="button"
            style="width:auto;padding:8px 12px;"
            onclick="editExpense('${expense.id}')"
          >
            Edit
          </button>

          <button
            type="button"
            class="danger"
            style="width:auto;padding:8px 12px;"
            onclick="deleteOwnExpense('${expense.id}')"
          >
            Delete
          </button>
        </div>

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

            ${escapeHtml(
              expense.expense_date
            )}

            • Paid by

            ${escapeHtml(payerDisplay)}

            ${
              creatorName
                ? ` • Added by ${escapeHtml(creatorName)}`
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

  });

}


/* =====================================================
   DELETE EXPENSE
===================================================== */

function editExpense(expenseId) {
  const expense = expenses.find(item => String(item.id) === String(expenseId));
  if (!expense) return;

  const isMine = isCurrentUserExpense(expense);
  if (!ownerToken && !isMine) {
    toast("You can only edit your own expense.");
    return;
  }

  const existingPayments = expensePayments
    .filter(payment => String(payment.expense_id) === String(expenseId))
    .map(payment => ({ person_id: String(payment.person_id), amount: Number(payment.amount) }));

  const initialPayments = existingPayments.length
    ? existingPayments
    : [{ person_id: String(expense.paid_by), amount: Number(expense.amount) }];

  const initialSplit = expenseParticipants[expenseId]?.length
    ? expenseParticipants[expenseId].map(String)
    : people.map(person => String(person.id));

  const overlay = document.createElement("div");
  overlay.id = "editExpenseOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,18,30,.58);display:flex;align-items:center;justify-content:center;padding:14px;";

  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="Edit expense" style="width:100%;max-width:520px;max-height:92vh;overflow:auto;background:#fff;border-radius:20px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
        <h2 style="margin:0;font-size:20px;">Edit expense</h2>
        <button type="button" id="closeEditExpense" aria-label="Close" style="width:38px;height:38px;border:0;border-radius:12px;background:#f1f2f6;font-size:22px;">×</button>
      </div>

      <label for="editExpenseDescription">Description</label>
      <input id="editExpenseDescription" type="text" maxlength="200" value="${escapeHtml(expense.description)}" style="width:100%;box-sizing:border-box;margin:6px 0 14px;">

      <label for="editExpenseAmount">Total amount (₹)</label>
      <input id="editExpenseAmount" type="number" min="0.01" step="0.01" value="${Number(expense.amount).toFixed(2)}" style="width:100%;box-sizing:border-box;margin:6px 0 14px;">

      <label for="editExpenseDate">Date</label>
      <input id="editExpenseDate" type="date" value="${escapeHtml(expense.expense_date || getLocalToday())}" style="width:100%;box-sizing:border-box;margin:6px 0 18px;">

      <div style="font-weight:800;margin-bottom:8px;">Paid by</div>
      <div id="editExpensePayers" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">
        ${people.map(person => {
          const payment = initialPayments.find(item => item.person_id === String(person.id));
          return `
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 112px;align-items:center;gap:8px;padding:9px;border:1px solid #e8eaf0;border-radius:12px;">
              <label style="display:flex;align-items:center;gap:8px;margin:0;">
                <input type="checkbox" class="edit-payer-check" value="${person.id}" ${payment ? "checked" : ""}>
                <span>${escapeHtml(person.name)}</span>
              </label>
              <input type="number" class="edit-payer-amount" data-person-id="${person.id}" min="0.01" step="0.01" value="${payment ? Number(payment.amount).toFixed(2) : ""}" ${payment ? "" : "disabled"} style="width:100%;box-sizing:border-box;">
            </div>
          `;
        }).join("")}
      </div>

      <button type="button" id="editAutoAllocate" style="width:auto;padding:8px 12px;margin-bottom:8px;">Distribute total between selected payers</button>
      <p id="editPayerTotal" style="font-size:12px;color:#737887;margin:0 0 18px;"></p>

      <div style="font-weight:800;margin-bottom:8px;">Split between</div>
      <div id="editExpenseSplit" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        ${people.map(person => `
          <label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #e8eaf0;border-radius:12px;margin:0;">
            <input type="checkbox" class="edit-split-check" value="${person.id}" ${initialSplit.includes(String(person.id)) ? "checked" : ""}>
            <span>${escapeHtml(person.name)}</span>
          </label>
        `).join("")}
      </div>

      <div style="display:flex;gap:10px;">
        <button type="button" id="cancelEditExpense" style="flex:1;background:#f1f2f6;color:#202331;">Cancel</button>
        <button type="button" id="saveEditExpense" style="flex:1;">Save changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#closeEditExpense").addEventListener("click", close);
  overlay.querySelector("#cancelEditExpense").addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });

  const updatePayerTotal = () => {
    const total = [...overlay.querySelectorAll(".edit-payer-check:checked")]
      .reduce((sum, checkbox) => {
        const input = overlay.querySelector(`.edit-payer-amount[data-person-id="${checkbox.value}"]`);
        return sum + Number(input?.value || 0);
      }, 0);
    const amount = Number(overlay.querySelector("#editExpenseAmount").value || 0);
    overlay.querySelector("#editPayerTotal").textContent =
      `Payer total: ₹${total.toFixed(2)} / ₹${amount.toFixed(2)}`;
  };

  overlay.querySelectorAll(".edit-payer-check").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const input = overlay.querySelector(`.edit-payer-amount[data-person-id="${checkbox.value}"]`);
      input.disabled = !checkbox.checked;
      if (!checkbox.checked) input.value = "";
      updatePayerTotal();
    });
  });

  overlay.querySelectorAll(".edit-payer-amount").forEach(input => {
    input.addEventListener("input", updatePayerTotal);
  });
  overlay.querySelector("#editExpenseAmount").addEventListener("input", updatePayerTotal);

  overlay.querySelector("#editAutoAllocate").addEventListener("click", () => {
    const amount = Number(overlay.querySelector("#editExpenseAmount").value);
    const selected = [...overlay.querySelectorAll(".edit-payer-check:checked")];
    if (!Number.isFinite(amount) || amount <= 0 || !selected.length) {
      toast("Enter an amount and select at least one payer.");
      return;
    }
    const totalPaise = Math.round(amount * 100);
    if (totalPaise < selected.length) {
      toast("Total amount is too small for the selected number of payers.");
      return;
    }
    const weights = selected.map(checkbox => {
      const input = overlay.querySelector(`.edit-payer-amount[data-person-id="${checkbox.value}"]`);
      return Math.max(0, Number(input.value) || 0);
    });
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    let remaining = totalPaise;
    selected.forEach((checkbox, index) => {
      const input = overlay.querySelector(`.edit-payer-amount[data-person-id="${checkbox.value}"]`);
      let paise;
      if (index === selected.length - 1) {
        paise = remaining;
      } else {
        const weight = weightTotal > 0 ? weights[index] / weightTotal : 1 / selected.length;
        paise = Math.max(1, Math.round(totalPaise * weight));
        const futureMinimum = selected.length - index - 1;
        paise = Math.min(paise, remaining - futureMinimum);
      }
      remaining -= paise;
      input.value = (paise / 100).toFixed(2);
    });
    updatePayerTotal();
  });

  overlay.querySelector("#saveEditExpense").addEventListener("click", async () => {
    const saveButton = overlay.querySelector("#saveEditExpense");
    const description = overlay.querySelector("#editExpenseDescription").value.trim();
    const amount = Number(overlay.querySelector("#editExpenseAmount").value);
    const expenseDate = overlay.querySelector("#editExpenseDate").value;

    if (!description || description.length > 200 || !isValidCurrencyAmount(amount) || !expenseDate) {
      toast("Enter a valid description, amount and date.");
      return;
    }

    const payments = [...overlay.querySelectorAll(".edit-payer-check:checked")].map(checkbox => {
      const input = overlay.querySelector(`.edit-payer-amount[data-person-id="${checkbox.value}"]`);
      return { person_id: checkbox.value, amount: Number(input.value) };
    });

    if (!payments.length || payments.some(payment => !isValidCurrencyAmount(payment.amount))) {
      toast("Select payers and enter a positive amount for each.");
      return;
    }

    const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(paymentTotal - amount) > 0.001) {
      toast(`Payer amounts must total ₹${amount.toFixed(2)}. Currently ₹${paymentTotal.toFixed(2)}.`);
      return;
    }

    const splitIds = [...overlay.querySelectorAll(".edit-split-check:checked")].map(input => input.value);
    if (!splitIds.length) {
      toast("Select at least one person to split this expense.");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
      await api("/rest/v1/rpc/update_expense_secure", {
        method: "POST",
        body: JSON.stringify({
          p_expense_id: expenseId,
          p_participant_token: participantToken,
          p_owner_token: ownerToken,
          p_description: description,
          p_amount: amount,
          p_paid_by: payments[0].person_id,
          p_expense_date: expenseDate,
          p_participants: splitIds.map(person_id => ({ person_id })),
          p_payments: payments
        })
      });
      close();
      await loadTrip();
      toast("Expense updated.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not update expense.");
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });

  updatePayerTotal();
}


async function deleteOwnExpense(expenseId) {

  if (!participantToken && !ownerToken) {

    toast(
      "Permission required."
    );

    return;
  }


  if (
    !confirm(
      "Delete this expense?"
    )
  ) {

    return;
  }


  try {

    await api(
      "/rest/v1/rpc/delete_expense_secure",
      {
        method: "POST",

        body: JSON.stringify({

          p_expense_id:
            expenseId,

          p_participant_token:
            participantToken,

          p_owner_token:
            ownerToken

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
   TRIP SUMMARY
===================================================== */

function renderTripSummary() {

  let card =
    $("tripSummaryCard");


  if (!card) {

    card =
      document.createElement("div");

    card.id =
      "tripSummaryCard";

    card.className =
      "card";

    card.style.marginBottom =
      "16px";


    const balancesCard =
      document.querySelector(
        ".balances-card"
      );


    if (
      balancesCard &&
      balancesCard.parentNode
    ) {

      balancesCard.parentNode.insertBefore(
        card,
        balancesCard
      );

    } else {

      $("tripScreen")
        .appendChild(card);

    }

  }


  const total =
    expenses.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.amount || 0
        ),
      0
    );


  const memberCount =
    people.length;


  const average =
    memberCount > 0
      ? total / memberCount
      : 0;


  card.innerHTML = `

    <div
      class="section-title"
      style="
        margin-bottom:14px;
      "
    >

      <div
        class="section-icon"
      >
        📊
      </div>

      <div>

        <h2>
          Trip Summary
        </h2>

        <p>
          Overview of your trip expenses.
        </p>

      </div>

    </div>


    <div
      style="
        display:grid;
        grid-template-columns:
          repeat(3, 1fr);
        gap:10px;
      "
    >

      <div
        style="
          padding:14px 10px;
          border-radius:14px;
          background:#fafbfe;
          text-align:center;
        "
      >

        <div
          style="
            font-size:11px;
            color:#737887;
          "
        >
          Total spent
        </div>

        <div
          style="
            margin-top:5px;
            font-size:18px;
            font-weight:800;
          "
        >
          ₹${total.toFixed(2)}
        </div>

      </div>


      <div
        style="
          padding:14px 10px;
          border-radius:14px;
          background:#fafbfe;
          text-align:center;
        "
      >

        <div
          style="
            font-size:11px;
            color:#737887;
          "
        >
          People
        </div>

        <div
          style="
            margin-top:5px;
            font-size:18px;
            font-weight:800;
          "
        >
          ${memberCount}
        </div>

      </div>


      <div
        style="
          padding:14px 10px;
          border-radius:14px;
          background:#fafbfe;
          text-align:center;
        "
      >

        <div
          style="
            font-size:11px;
            color:#737887;
          "
        >
          Avg / person
        </div>

        <div
          style="
            margin-top:5px;
            font-size:18px;
            font-weight:800;
          "
        >
          ₹${average.toFixed(2)}
        </div>

      </div>

    </div>

  `;

}


/* =====================================================
   BALANCES
===================================================== */

function calculateExpenseSharesInPaise(amount, personIds) {
  const ids = [...new Set(personIds)];
  ids.sort((a, b) => {
    const indexA = people.findIndex(person => String(person.id) === String(a));
    const indexB = people.findIndex(person => String(person.id) === String(b));
    return indexA - indexB;
  });
  if (!ids.length) return {};

  const totalPaise = Math.max(0, Math.round((Number(amount) || 0) * 100));
  const basePaise = Math.floor(totalPaise / ids.length);
  const extraPaise = totalPaise % ids.length;
  const shares = {};

  ids.forEach((personId, index) => {
    shares[personId] = (basePaise + (index < extraPaise ? 1 : 0)) / 100;
  });

  return shares;
}


function renderBalances() {

  const container =
    $("balancesList");


  container.innerHTML = "";


  if (!people.length) {
    return;
  }


  const paid = {};
  const owed = {};


  people.forEach(person => {

    paid[person.id] = 0;
    owed[person.id] = 0;

  });


  expenses.forEach(expense => {

    const amount =
      Number(
        expense.amount
      ) || 0;


    const paymentRows =
      expensePayments.filter(
        payment =>
          String(payment.expense_id) === String(expense.id)
      );

    if (paymentRows.length) {
      paymentRows.forEach(payment => {
        const payerId = String(payment.person_id);
        if (paid[payerId] !== undefined) {
          paid[payerId] += Number(payment.amount) || 0;
        }
      });
    } else if (paid[expense.paid_by] !== undefined) {
      // Older expenses may not have contribution rows.
      paid[expense.paid_by] += amount;
    }


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
          owed[id] !==
          undefined
      );


    if (!validIds.length) {
      return;
    }


    const uniqueValidIds = [...new Set(validIds)];
    const shares =
      calculateExpenseSharesInPaise(amount, uniqueValidIds);

    uniqueValidIds.forEach(id => {
      owed[id] += shares[id] || 0;
    });

  });


  people.forEach(person => {

    const balance =
      paid[person.id] -
      owed[person.id];


    let status;


    if (balance > 0.005) {

      status = `

        <span class="positive">
          gets ₹${balance.toFixed(2)}
        </span>

      `;

    }

    else if (balance < -0.005) {

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


    container.appendChild(row);

  });

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


    const paymentRows =
      expensePayments.filter(
        payment =>
          String(payment.expense_id) === String(expense.id)
      );

    if (paymentRows.length) {
      paymentRows.forEach(payment => {
        const payerId = String(payment.person_id);
        if (net[payerId] !== undefined) {
          net[payerId] += Number(payment.amount) || 0;
        }
      });
    } else {
      const payerId = String(expense.paid_by);
      if (net[payerId] === undefined) return;

      // Backward compatibility for older single-payer expenses.
      net[payerId] += amount;
    }


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


    const uniqueValidIds = [...new Set(validIds)];
    const shares =
      calculateExpenseSharesInPaise(amount, uniqueValidIds);

    uniqueValidIds.forEach(id => {
      net[id] -= shares[id] || 0;
    });

  });


  return net;

}


/* =====================================================
   CALCULATE SETTLEMENTS
===================================================== */

function calculateSettlements() {

  const net =
    calculateNetBalances();


  const creditors = [];
  const debtors = [];


  people.forEach(person => {

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


/* =====================================================
   RENDER WHO OWES WHOM
===================================================== */

function renderWhoOwesWhom() {

  let card =
    $("whoOwesWhomCard");


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
        .appendChild(card);

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


  if (!settlements.length) {

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

          <div>

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


      list.appendChild(row);

    }
  );

}


/* =====================================================
   SHARE MASTER LINK
===================================================== */

function getTripShareUrl() {
  return `${window.location.origin}${window.location.pathname}?trip=${encodeURIComponent(tripId)}`;
}

async function copyTripLink() {
  const url = getTripShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast("Trip link copied!");
  } catch (error) {
    window.prompt("Copy your trip link:", url);
  }
}

async function shareTrip() {
  const url = getTripShareUrl();

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${trip.name} — No Login Split`,
        text: "Join our expense split",
        url
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  await copyTripLink();
}


/* =====================================================
   BUTTONS
===================================================== */

const addPersonBtn =
  $("addPersonBtn");

const createTripBtn =
  $("createTripBtn");

const addExpenseBtn =
  $("addExpenseBtn");

const shareBtn =
  $("shareBtn");


if (addPersonBtn) {

  addPersonBtn.addEventListener(
    "click",
    addPerson
  );

}


if (createTripBtn) {

  createTripBtn.addEventListener(
    "click",
    createTrip
  );

}


if (addExpenseBtn) {

  addExpenseBtn.addEventListener(
    "click",
    addExpense
  );

}


if (shareBtn) {

  shareBtn.addEventListener(
    "click",
    shareTrip
  );

}


/* =====================================================
   INITIAL PEOPLE
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

}

else {

  showHome();

}
