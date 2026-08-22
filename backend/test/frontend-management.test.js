const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
function read(file) {
    return fs.readFileSync(path.join(root, file), "utf8");
}

test("course and material management controls are wired to owned APIs", () => {
    const courseHtml = read("course.html");
    const courseScript = read("js/course-page.js");
    const materialHtml = read("material.html");
    const materialScript = read("js/material.js");
    const materialsScript = read("js/materials.js");

    assert.match(courseHtml, /id="edit-course-button"/);
    assert.match(courseHtml, /id="delete-unit-modal"/);
    assert.match(courseScript, /\/api\/courses\/\$\{courseId\}\/units\/order/);
    assert.match(materialHtml, /id="edit-material-button"/);
    assert.match(materialHtml, /id="view-original-link"/);
    assert.match(materialScript, /\/materials\/\$\{materialId\}\/file/);
    assert.match(materialsScript, /materials\?search=/);
});

test("active frontend has no browser alerts, dead Settings links, or prototype scripts", () => {
    const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith(".html"));
    const activeScripts = fs.readdirSync(path.join(root, "js"))
        .filter(file => file.endsWith(".js"));
    const combined = [
        ...htmlFiles.map(file => read(file)),
        ...activeScripts.map(file => read(path.join("js", file)))
    ].join("\n");

    assert.doesNotMatch(combined, /\b(?:alert|confirm)\s*\(/);
    assert.doesNotMatch(combined, />\s*Settings\s*</);
    assert.equal(fs.existsSync(path.join(root, "js/courses.js")), false);
    assert.equal(fs.existsSync(path.join(root, "js/questions.js")), false);
    assert.equal(fs.existsSync(path.join(root, "js/script.js")), false);
});

test("shared modal support provides keyboard and focus accessibility", () => {
    const ui = read("js/ui.js");
    assert.match(ui, /event\.key === "Escape"/);
    assert.match(ui, /event\.key !== "Tab"/);
    assert.match(ui, /aria-hidden/);
    assert.match(ui, /opener\?\.focus/);
});
