const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appSource = fs.readFileSync("app.js", "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Could not find ${name} in app.js`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `Could not find body for ${name}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function body: ${name}`);
}

const context = vm.createContext({
  people: [],
  expenses: [],
  expensePayments: [],
  expenseParticipants: {},
  Math,
  Number,
  String,
  Set,
  Object,
  Array
});

const functionsUnderTest = [
  "isValidCurrencyAmount",
  "calculateExpenseSharesInPaise",
  "calculateNetBalances",
  "calculateSettlements"
];
vm.runInContext(
  functionsUnderTest.map(name => extractFunction(appSource, name)).join("\n"),
  context
);

function setup({ people, expenses = [], expensePayments = [], expenseParticipants = {} }) {
  context.people = people;
  context.expenses = expenses;
  context.expensePayments = expensePayments;
  context.expenseParticipants = expenseParticipants;
}

function cents(value) {
  return Math.round(value * 100);
}

test("currency validation accepts positive paise precision only", () => {
  assert.equal(context.isValidCurrencyAmount(1), true);
  assert.equal(context.isValidCurrencyAmount(0.01), true);
  assert.equal(context.isValidCurrencyAmount(12.34), true);
  for (const value of [0, -1, 1.001, NaN, Infinity, "12.00"]) {
    assert.equal(context.isValidCurrencyAmount(value), false);
  }
});

test("equal shares always add up exactly for 1 to 50 members", () => {
  const people = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}` }));
  setup({ people });
  for (let count = 1; count <= 50; count++) {
    for (const amount of [0.01, 1, 10.01, 100.99, 9999.99]) {
      const ids = people.slice(0, count).map(person => person.id);
      const shares = context.calculateExpenseSharesInPaise(amount, ids);
      const total = Object.values(shares).reduce((sum, share) => sum + cents(share), 0);
      assert.equal(total, cents(amount), `${amount} split across ${count} members`);
      assert.equal(Object.keys(shares).length, count);
    }
  }
});

test("payer can be excluded from participants", () => {
  const people = ["Amit", "Rahul", "Priya", "Neha"].map((name, i) => ({ id: String(i + 1), name }));
  setup({
    people,
    expenses: [{ id: "cab", amount: 600, paid_by: "4" }],
    expensePayments: [{ expense_id: "cab", person_id: "4", amount: 600 }],
    expenseParticipants: { cab: ["1", "2", "3"] }
  });

  const net = context.calculateNetBalances();
  assert.deepEqual(Object.fromEntries(Object.entries(net).map(([id, value]) => [id, cents(value)])), {
    1: -20000, 2: -20000, 3: -20000, 4: 60000
  });
  const settlements = context.calculateSettlements();
  assert.equal(settlements.length, 3);
  assert.equal(settlements.reduce((sum, item) => sum + cents(item.amount), 0), 60000);
  assert.ok(settlements.every(item => item.to.id === "4"));
});

test("multi-payer expense balances correctly even when a payer is also a participant", () => {
  const people = ["A", "B", "C", "D"].map((name, i) => ({ id: String(i + 1), name }));
  setup({
    people,
    expenses: [{ id: "e1", amount: 1000, paid_by: "1" }],
    expensePayments: [
      { expense_id: "e1", person_id: "1", amount: 600 },
      { expense_id: "e1", person_id: "2", amount: 400 }
    ],
    expenseParticipants: { e1: ["2", "3", "4"] }
  });
  const net = context.calculateNetBalances();
  assert.equal(Object.values(net).reduce((sum, value) => sum + cents(value), 0), 0);
  assert.deepEqual(
    Object.fromEntries(Object.entries(net).map(([id, value]) => [id, cents(value)])),
    { 1: 60000, 2: 6666, 3: -33333, 4: -33333 }
  );
});

test("legacy single-payer expenses and missing split rows fall back to all trip members", () => {
  const people = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
  setup({
    people,
    expenses: [{ id: "legacy", amount: 10, paid_by: "1" }],
    expensePayments: [],
    expenseParticipants: {}
  });
  const net = context.calculateNetBalances();
  assert.deepEqual(
    Object.fromEntries(Object.entries(net).map(([id, value]) => [id, cents(value)])),
    { 1: 500, 2: -500 }
  );
});

test("1,000 generated expense combinations preserve zero-sum balances and settlement totals", () => {
  let seed = 20261123;
  const random = max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };

  for (let sample = 0; sample < 1000; sample++) {
    const count = 2 + random(9);
    const people = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}` }));
    const expenses = [];
    const expensePayments = [];
    const expenseParticipants = {};

    const expenseCount = 1 + random(12);
    for (let e = 0; e < expenseCount; e++) {
      const amountCents = 1 + random(500000);
      const amount = amountCents / 100;
      const split = people.filter(() => random(2) === 1);
      if (!split.length) split.push(people[random(count)]);
      const payers = people.filter(() => random(3) === 0);
      if (!payers.length) payers.push(people[random(count)]);

      const payerShares = payers.map((person, index) => ({
        person_id: person.id,
        amount: index === payers.length - 1 ? 0 : 0
      }));
      let remaining = amountCents;
      payerShares.forEach((row, index) => {
        const part = index === payerShares.length - 1
          ? remaining
          : random(remaining + 1);
        row.amount = part / 100;
        remaining -= part;
      });
      // Zero contributions are not valid server-side; regenerate as positive integer shares.
      if (payerShares.some(row => row.amount <= 0)) {
        payerShares.length = 0;
        const positivePayers = payers.slice(0, Math.min(payers.length, amountCents));
        let left = amountCents;
        positivePayers.forEach((person, index) => {
          const slots = positivePayers.length - index;
          const part = index === positivePayers.length - 1
            ? left
            : 1 + random(left - slots + 1);
          payerShares.push({ person_id: person.id, amount: part / 100 });
          left -= part;
        });
      }

      const id = `s${sample}-e${e}`;
      expenses.push({ id, amount, paid_by: payerShares[0].person_id });
      expensePayments.push(...payerShares.map(row => ({ expense_id: id, ...row })));
      expenseParticipants[id] = split.map(person => person.id);
    }

    setup({ people, expenses, expensePayments, expenseParticipants });
    const net = context.calculateNetBalances();
    const netCents = Object.values(net).reduce((sum, value) => sum + cents(value), 0);
    assert.equal(netCents, 0, `zero-sum failure in generated sample ${sample}`);

    const settlements = context.calculateSettlements();
    const settledCents = settlements.reduce((sum, item) => sum + cents(item.amount), 0);
    const debtorCents = Object.values(net).filter(value => value < 0).reduce((sum, value) => sum + Math.abs(cents(value)), 0);
    assert.equal(settledCents, debtorCents, `settlement mismatch in generated sample ${sample}`);
  }
});
