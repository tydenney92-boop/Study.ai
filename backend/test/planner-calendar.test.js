const test = require("node:test");
const assert = require("node:assert/strict");
const { localDay, monthGrid, moveMonth, tasksForDay, visibleTasks } = require("../../js/planner-calendar-utils");

test("calendar navigation handles month, year, and leap-year transitions", () => {
    assert.equal(localDay(moveMonth(new Date(2026, 0, 1), -1)), "2025-12-01");
    assert.equal(localDay(moveMonth(new Date(2026, 11, 1), 1)), "2027-01-01");
    assert.equal(monthGrid(new Date(2028, 1, 1)).some(date => localDay(date) === "2028-02-29"), true);
    assert.equal(monthGrid(new Date(2026, 8, 1)).length, 42);
});

test("calendar groups timestamps by browser-local day and never UTC date text", () => {
    const local = new Date(2026, 8, 10, 23, 30);
    const task = { id: 1, courseId: 2, type: "assignment", dueAt: local.toISOString() };
    assert.equal(tasksForDay([task], "2026-09-10").length, 1);
    assert.equal(tasksForDay([task], localDay(new Date(task.dueAt))).length, 1);
});

test("calendar filtering and multiple tasks retain every matching item", () => {
    const tasks = Array.from({ length: 6 }, (_, index) => ({ id: index, courseId: index < 5 ? 1 : 2, type: index === 0 ? "exam" : "assignment", dueAt: "2026-09-17T18:00:00.000Z" }));
    assert.equal(tasksForDay(tasks, new Date(2026, 8, 17)).length, 6);
    assert.equal(visibleTasks(tasks, "1", "").length, 5);
    assert.equal(visibleTasks(tasks, "", "exam").length, 1);
});
