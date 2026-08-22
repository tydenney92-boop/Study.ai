const path = require("node:path");
const { expect } = require("@playwright/test");

let identity = 0;

function credentials(prefix) {
    identity++;
    return {
        name: `${prefix} Student`,
        email: `${prefix.toLowerCase()}-${identity}@example.test`,
        password: "StudySignal!123"
    };
}

async function signup(page, prefix = "E2E") {
    const account = credentials(prefix);
    await page.goto("/signup.html");
    await page.locator("#name").fill(account.name);
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    await page.locator("#password-confirmation").fill(account.password);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/index\.html$/);
    return account;
}

async function login(page, account) {
    await page.goto("/login.html");
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/index\.html$/);
}

async function createCourse(page, {
    name = "Economics of Markets",
    code = "ECON 210",
    semester = "Fall 2026"
} = {}) {
    await page.goto("/index.html#courses");
    await page.locator("#add-course-button").click();
    await page.locator("#course-name").fill(name);
    await page.locator("#course-code").fill(code);
    await page.locator("#course-semester").fill(semester);
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page).toHaveURL(/course\.html\?courseId=\d+$/);
    return Number(new URL(page.url()).searchParams.get("courseId"));
}

async function createUnit(page, name) {
    await page.locator("#add-unit-button").click();
    await page.locator("#unit-name").fill(name);
    await page.getByRole("button", { name: "Create Unit" }).click();
    await expect(page.locator("#course-units-list")).toContainText(name);
}

async function uploadTextMaterial(page, courseId, { unitLabel, filename = "market-notes.txt", empty = false } = {}) {
    await page.goto(`/materials.html?courseId=${courseId}&upload=1`);
    await expect(page.locator("#upload-modal")).toHaveClass(/active/);
    if (unitLabel) await page.locator("#upload-unit-modal").selectOption({ label: unitLabel });
    const fixture = path.resolve(__dirname, `../fixtures/${empty ? "empty-notes.txt" : "market-notes.txt"}`);
    await page.locator("#file-input").setInputFiles({
        name: filename,
        mimeType: "text/plain",
        buffer: require("node:fs").readFileSync(fixture)
    });
    await page.locator("#confirm-upload").click();
    await expect(page).toHaveURL(/material\.html\?courseId=\d+&materialId=\d+$/);
    return Number(new URL(page.url()).searchParams.get("materialId"));
}

async function api(page, method, url, body) {
    return page.evaluate(async ({ method, url, body }) => {
        const response = await fetch(url, {
            method,
            credentials: "include",
            headers: body === undefined ? undefined : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const payload = await response.json().catch(() => null);
        return { status: response.status, body: payload };
    }, { method, url, body });
}

async function resetAiCounts(page) {
    await api(page, "POST", "/api/e2e/ai-counts/reset", {});
}

async function aiCounts(page) {
    return (await api(page, "GET", "/api/e2e/ai-counts")).body;
}

async function completeFiveQuestionQuiz(page) {
    for (let index = 0; index < 5; index++) {
        await page.locator(".answer-option").first().click();
        await page.locator("#submit-answer").click();
        await expect(page.locator("#quiz-result")).toHaveClass(/show/);
        await page.locator("#submit-answer").click();
    }
    await expect(page.getByRole("heading", { name: "Great work!" })).toBeVisible();
    await expect(page.locator("#attempt-save-status")).toContainText("Attempt saved");
}

module.exports = {
    aiCounts,
    api,
    completeFiveQuestionQuiz,
    createCourse,
    createUnit,
    login,
    resetAiCounts,
    signup,
    uploadTextMaterial
};
