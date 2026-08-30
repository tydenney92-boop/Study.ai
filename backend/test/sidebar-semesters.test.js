const test = require("node:test");
const assert = require("node:assert/strict");
const {
    groupSidebarCourses,
    parseSidebarSemester,
    sidebarSemesterExpanded
} = require("../../js/auth.js");

test("semester parsing is normalized and chronological rather than alphabetical", () => {
    assert.deepEqual(parseSidebarSemester(" fall 2026 "), {
        key: "fall-2026",
        label: "Fall 2026",
        sortValue: 2026 * 4 + 3
    });
    assert.equal(parseSidebarSemester("Legacy Prototype"), null);

    const courses = [
        { id: 1, semester: "Fall 2026" },
        { id: 2, semester: "Winter 2027" },
        { id: 3, semester: "Spring 2027" },
        { id: 4, semester: "Summer 2027" }
    ];
    assert.deepEqual(
        groupSidebarCourses(courses).map(group => group.label),
        ["Summer 2027", "Spring 2027", "Winter 2027", "Fall 2026"]
    );
});

test("courses are grouped once, retain API order, and unassigned values remain visible", () => {
    const courses = [
        { id: 8, courseCode: "RECENT", semester: "Fall 2026" },
        { id: 7, courseCode: "OLDER", semester: "fall 2026" },
        { id: 6, courseCode: "BLANK", semester: "" },
        { id: 5, courseCode: "ODD", semester: "Next term" },
        { id: 4, courseCode: "NULL", semester: null }
    ];
    const groups = groupSidebarCourses(courses);
    assert.deepEqual(groups.map(group => group.label), ["Fall 2026", "Other / Unassigned"]);
    assert.deepEqual(groups[0].courses.map(course => course.id), [8, 7]);
    assert.deepEqual(groups[1].courses.map(course => course.id), [6, 5, 4]);
    assert.deepEqual(groups.flatMap(group => group.courses).map(course => course.id), [8, 7, 6, 5, 4]);
});

test("active semester expands while explicit folder state persists elsewhere", () => {
    const [newer, active] = groupSidebarCourses([
        { id: 1, semester: "Spring 2027" },
        { id: 2, semester: "Fall 2026" }
    ]);
    const state = { [newer.key]: false, [active.key]: false };
    assert.equal(sidebarSemesterExpanded({
        group: active,
        index: 1,
        activeCourseId: 2,
        state,
        hasActiveGroup: true
    }), true);
    assert.equal(sidebarSemesterExpanded({
        group: newer,
        index: 0,
        activeCourseId: 2,
        state,
        hasActiveGroup: true
    }), false);
    assert.equal(sidebarSemesterExpanded({
        group: newer,
        index: 0,
        activeCourseId: null,
        state: {},
        hasActiveGroup: false
    }), true);
});
