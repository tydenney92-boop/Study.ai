const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(
    path.join(__dirname, "../../js/course-context.js"),
    "utf8"
);

function contextFor(search = "") {
    const notices = new Map();
    const location = {
        search,
        replacedWith: null,
        replace(value) { this.replacedWith = value; }
    };
    const window = { location, StudyAI: {} };
    vm.runInNewContext(script, {
        window,
        URLSearchParams,
        sessionStorage: {
            setItem(key, value) { notices.set(key, value); }
        }
    });
    return { navigation: window.StudyAI.courseContext, location, notices };
}

test("course-wide and material-specific tool origins return correctly", () => {
    const courseWide = contextFor("?courseId=7").navigation;
    assert.equal(courseWide.toolOrigin(), "course");
    assert.equal(courseWide.toolBackUrl(), "course.html?courseId=7");

    const materialSpecific = contextFor("?courseId=7&materialId=12").navigation;
    assert.equal(materialSpecific.toolOrigin(), "material");
    assert.equal(
        materialSpecific.toolBackUrl(),
        "material.html?courseId=7&materialId=12"
    );
});

test("missing course context redirects to canonical My Courses", () => {
    const page = contextFor();
    assert.equal(page.navigation.requireContext(), null);
    assert.equal(page.location.replacedWith, "index.html#courses");
    assert.equal(page.notices.get("studyai:notice"), "Choose a course to continue.");
});
