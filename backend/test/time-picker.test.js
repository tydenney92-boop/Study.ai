const test = require("node:test");
const assert = require("node:assert/strict");
const { format12Hour, from24Hour, to24Hour } = require("../../js/time-picker");

const cases = [
    ["12:00 AM", "00:00", 12, 0, "AM"],
    ["1:30 AM", "01:30", 1, 30, "AM"],
    ["11:59 AM", "11:59", 11, 59, "AM"],
    ["12:00 PM", "12:00", 12, 0, "PM"],
    ["1:30 PM", "13:30", 1, 30, "PM"],
    ["6:45 PM", "18:45", 6, 45, "PM"],
    ["11:59 PM", "23:59", 11, 59, "PM"]
];

test("time picker converts every 12-hour boundary to canonical 24-hour time", () => {
    for (const [, expected, hour, minute, period] of cases) {
        assert.equal(to24Hour(hour, minute, period), expected);
    }
});

test("time picker converts canonical 24-hour values back to display selections", () => {
    for (const [label, value, hour, minute, period] of cases) {
        const selection = from24Hour(value);
        assert.deepEqual(selection, { hour, minute, period });
        assert.equal(format12Hour(selection), label);
    }
});

test("time picker rejects malformed or out-of-range values", () => {
    for (const value of ["", "words", "7:30", "24:00", "13:75"]) assert.equal(from24Hour(value), null);
    assert.equal(to24Hour(13, 30, "PM"), null);
    assert.equal(to24Hour(1, 60, "PM"), null);
    assert.equal(to24Hour(1, 30, "noon"), null);
});

test("time picker preserves arbitrary imported minutes", () => {
    const selection = from24Hour("13:37");
    assert.deepEqual(selection, { hour: 1, minute: 37, period: "PM" });
    assert.equal(format12Hour(selection), "1:37 PM");
    assert.equal(to24Hour(selection.hour, selection.minute, selection.period), "13:37");
});
