import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minorUnits,
  formatAmount,
  summarize,
  validMonth,
  validPayment,
  formatMonth,
  formatDate,
  parseDateInput,
  formatTimestamp,
  tashkentToday,
} from "../src/web/model";
test("sums whole UZS using integer minor units", () => {
  assert.equal(minorUnits("29"), 2900);
  assert.deepEqual(
    summarize([
      { monthlyFee: "100", paid: "20", debt: "80" },
      { monthlyFee: "50", paid: "60", debt: "0" },
    ]),
    { expected: 15000, paid: 8000, debt: 8000 },
  );
});
test("rejects fractional payment amounts and impossible dates before submission", () => {
  assert.equal(validPayment("0", "2026-10-01"), false);
  assert.equal(validPayment("1.01", "2026-10-01"), false);
  assert.equal(validPayment("1.001", "2026-10-01"), false);
  assert.equal(validPayment("1", "2026-02-29"), false);
  assert.equal(validPayment("1", "2024-02-29"), true);
  assert.equal(validPayment("100.00", "2026-10-01"), true);
  assert.equal(validPayment("1e3", "2026-10-01"), false);
});
test("formats whole sums without decimal digits in either language", () => {
  assert.equal(validMonth("2026-10"), true);
  assert.equal(validMonth("2026-13"), false);
  assert.equal(validMonth(""), false);
  for (const lang of ["ru", "uz"] as const) {
    assert.equal(formatAmount("1234.00", lang).replace(/\s/g, ""), "1234");
    assert.equal(formatAmount(123400, lang).replace(/\s/g, ""), "1234");
  }
});
test("Uzbek month names remain readable without full browser ICU locale data", () => {
  assert.equal(formatMonth("2026-10", "uz"), "Oktabr 2026");
  assert.equal(formatMonth("2026-10", "ru"), "Октябрь 2026");
});
test("date input and display always use DD-MM-YYYY while API stays ISO", () => {
  assert.equal(formatDate("2026-10-01"), "01-10-2026");
  assert.equal(parseDateInput("01-10-2026"), "2026-10-01");
  assert.equal(parseDateInput("29-02-2026"), "");
  assert.equal(parseDateInput("29-02-2024"), "2024-02-29");
  assert.equal(parseDateInput("2026-10-01"), "");
  assert.equal(parseDateInput("1-10-2026"), "");
});
test("timestamps include local seconds and roll date at Tashkent midnight", () => {
  assert.equal(formatTimestamp("2026-10-01T18:59:59Z"), "01-10-2026 23:59:59");
  assert.equal(formatTimestamp("2026-10-01T19:00:00Z"), "02-10-2026 00:00:00");
  assert.equal(tashkentToday(new Date("2026-10-01T19:00:00Z")), "2026-10-02");
});
