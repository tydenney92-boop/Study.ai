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
    assert.match(ui, /studyai:modal-close/);
});

test("stabilized frontend uses explicit study-guide generation and accurate states", () => {
    const guideHtml = read("study-guide.html");
    const guideScript = read("js/study-guide.js");
    const dashboard = read("js/dashboard.js");
    const auth = read("js/auth.js");
    const materials = read("js/materials.js");
    const notes = read("notes.html");
    const flashcards = read("js/flashcards.js");

    assert.match(guideHtml, />\s*Definitions\s*</);
    assert.match(guideHtml, /id="quick-review"/);
    assert.match(guideScript, /"Additional Tips"/);
    assert.doesNotMatch(guideScript, /else if \(courseId && materialId\)[\s\S]{0,180}generateStudyGuide\(\)/);
    assert.match(dashboard, /\/api\/courses\/summary/);
    assert.match(dashboard, /readyMaterialCount/);
    assert.match(auth, /window\.location\.hash/);
    assert.match(materials, /\/api\/client-config/);
    assert.match(materials, /No matching materials/);
    assert.match(notes, /Recent student questions help interpret follow-ups/);
    assert.match(notes, /id="new-conversation-button"/);
    assert.match(flashcards, /StudyAI\.api\.patch/);
});

test("course recommendations preserve context and Ask My Notes hides unsupported sources", () => {
    const course = read("course.html");
    const recommendations = read("js/recommendations.js");
    const notes = read("js/notes.js");
    const login = read("js/login.js");

    assert.match(course, /data-course-page="recommendations\.html"/);
    assert.match(recommendations, /\/api\/courses\/\$\{recommendationCourseId\}\/recommendations/);
    assert.match(recommendations, /course\.html/);
    assert.match(notes, /supportType !== "not_found"/);
    assert.match(login, /recommendations\.html/);
});

test("active styles centralize the Study Signal theme and version the current visual assets", () => {
    const shared = read("css/style.css");
    const themedCss = [
        "css/style.css", "css/auth.css", "css/history.css", "css/material.css",
        "css/materials.css", "css/progress.css", "css/quiz.css", "css/study-tools.css"
    ].map(read).join("\n");
    const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith(".html"));
    const html = htmlFiles.map(read).join("\n");

    assert.match(shared, /--color-ink:\s*#172033/i);
    assert.match(shared, /--color-primary:\s*#2f7f7a/i);
    assert.match(shared, /--color-primary-hover:\s*#256a66/i);
    assert.match(shared, /--color-surface-warm:\s*#f4efe6/i);
    assert.doesNotMatch(themedCss, /#2563eb|#1d4ed8|#4f6bed|#7c3aed|rgba\(37,\s*99,\s*235/i);
    assert.doesNotMatch(html, /href="css\/[^"]+\.css"/);
    assert.doesNotMatch(html, /src="js\/course-colors\.js"/);
    assert.match(html, /20260830-theme-fix/);
});
