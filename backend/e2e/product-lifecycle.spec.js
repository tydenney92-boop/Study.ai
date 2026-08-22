const { test, expect } = require("@playwright/test");
const {
    aiCounts,
    api,
    completeFiveQuestionQuiz,
    createCourse,
    createUnit,
    login,
    resetAiCounts,
    signup,
    uploadTextMaterial
} = require("./support/browser-helpers");

test("authentication, canonical navigation, session persistence, and recent courses", async ({ page }) => {
    await page.goto("/course.html");
    await expect(page).toHaveURL(/login\.html\?returnTo=/);

    const account = await signup(page, "Auth");
    await page.reload();
    await expect(page.locator(".profile-card strong")).toHaveText(account.name);

    await page.getByRole("link", { name: "My Courses" }).click();
    await expect(page).toHaveURL(/index\.html#courses$/);
    await expect(page.getByRole("link", { name: "My Courses" })).toHaveClass(/active/);
    await expect(page.getByRole("link", { name: "Dashboard" })).not.toHaveClass(/active/);

    const firstId = await createCourse(page, { name: "First Course", code: "FIRST 101" });
    await createCourse(page, { name: "Second Course", code: "SECOND 202" });
    await page.goto(`/course.html?courseId=${firstId}`);
    await expect(page.locator("#course-code-title")).toHaveText("FIRST 101");
    await expect(page.locator(".sidebar-course-link.active")).toContainText("FIRST 101");
    await expect(page.locator(".sidebar-nav .active")).toHaveCount(0);
    await page.goto("/index.html");
    await expect(page.locator(".sidebar-course-link").first()).toContainText("FIRST 101");
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveClass(/active/);

    await page.goto("/index.html");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/login\.html$/);
    await login(page, account);
    await expect(page.locator(".course-card", { hasText: "FIRST 101" })).toBeVisible();

    await page.goto("/index.html#courses");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, account);
    await expect(page).toHaveURL(/index\.html$/);
    await page.goto("/index.html#courses");
    await page.reload();
    await expect(page.getByRole("link", { name: "My Courses" })).toHaveClass(/active/);

    await page.goto("/course.html?courseId=999999");
    await expect(page).toHaveURL(/index\.html#courses$/);
    await expect(page.getByText("That course is unavailable.")).toBeVisible();
    await page.goto("/course.html");
    await expect(page).toHaveURL(/index\.html#courses$/);
    await page.goto("/progress.html");
    await expect(page.getByRole("link", { name: "Progress" })).toHaveClass(/active/);
});

test("course, unit, and material management works through the UI", async ({ page }) => {
    await signup(page, "Manage");
    const courseId = await createCourse(page, { name: "Biology", code: "BIO 101" });

    await page.locator("#edit-course-button").click();
    await page.locator("#edit-course-name").fill("General Biology");
    await page.locator("#edit-course-code").fill("BIO 111");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("#course-code-title")).toHaveText("BIO 111");

    await createUnit(page, "Foundations");
    await createUnit(page, "Cells");
    const foundations = page.locator(".unit-management-card", { hasText: "Foundations" });
    await foundations.getByRole("button", { name: "Edit" }).click();
    await page.locator("#unit-name").fill("Scientific Foundations");
    await page.getByRole("button", { name: "Save Name" }).click();
    const renamed = page.locator(".unit-management-card", { hasText: "Scientific Foundations" });
    await renamed.locator(".unit-down").click();
    await expect(page.locator(".unit-management-card").first()).toContainText("Cells");

    await page.getByRole("link", { name: "+ Add Materials" }).click();
    await expect(page.locator("#upload-modal")).toHaveClass(/active/);
    await page.locator("#upload-unit-modal").selectOption({ label: "Unit 2 — Scientific Foundations" });
    await page.locator("#file-input").setInputFiles(require("node:path").resolve(__dirname, "fixtures/market-notes.txt"));
    await page.locator("#confirm-upload").click();
    await expect(page).toHaveURL(/material\.html\?courseId=\d+&materialId=\d+$/);
    const materialId = Number(new URL(page.url()).searchParams.get("materialId"));
    await expect(page.locator("#material-extraction-status")).toHaveText("Extracted and AI-ready");

    await page.locator("#edit-material-button").click();
    await page.locator("#edit-material-name").fill("Demand Review Notes");
    await page.locator("#edit-material-unit").selectOption({ label: "Unit 1 — Cells" });
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("#material-title")).toHaveText("Demand Review Notes");
    await expect(page.locator("#material-subtitle")).toContainText("Cells");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-original-link").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("market-notes.txt");

    for (const query of ["market-notes", "Demand Review", "population"]) {
        await page.goto(`/materials.html?courseId=${courseId}`);
        await page.locator("#material-search").fill(query);
        await expect(page.locator(".material-card")).toContainText("Demand Review Notes");
    }

    await page.goto(`/course.html?courseId=${courseId}`);
    const populatedUnit = page.locator(".unit-management-card", { hasText: "Cells" });
    await populatedUnit.getByRole("button", { name: "Delete" }).click();
    await page.locator("#confirm-delete-unit").click();
    await expect(page.getByText("Unit deleted. Its materials are now unassigned.")).toBeVisible();
    await page.goto(`/material.html?courseId=${courseId}&materialId=${materialId}`);
    await expect(page.locator("#material-subtitle")).toContainText("No unit");

    await page.locator("#delete-material-button").click();
    await page.locator("#confirm-delete-material").click();
    await expect(page).toHaveURL(new RegExp(`materials\\.html\\?courseId=${courseId}$`));
    await expect(page.locator("#empty-materials-title")).toHaveText("No materials yet");

    await page.goto(`/course.html?courseId=${courseId}`);
    await page.locator("#delete-course-button").click();
    await page.locator("#confirm-delete-course").click();
    await expect(page).toHaveURL(/index\.html#courses$/);
    await expect(page.getByText("Course deleted successfully.")).toBeVisible();
    await expect(page.locator(".course-card", { hasText: "BIO 111" })).toHaveCount(0);
});

test("study guides generate explicitly, preserve origins, reopen without AI, and delete", async ({ page }) => {
    await signup(page, "Guide");
    const courseId = await createCourse(page, { code: "GUIDE 101" });
    await createUnit(page, "Markets");
    const materialId = await uploadTextMaterial(page, courseId, { unitLabel: "Unit 1 — Markets" });

    await resetAiCounts(page);
    await page.locator("#material-study-guide-link").click();
    await expect(page).toHaveURL(new RegExp(`study-guide\\.html\\?courseId=${courseId}&materialId=${materialId}`));
    expect((await aiCounts(page)).total).toBe(0);
    await expect(page.locator("#guide-summary")).toContainText("when you are ready");
    await page.locator("#generate-guide-button").click();
    await expect(page.locator("#key-concepts")).toContainText("Supply and demand");
    await expect(page.locator("#source-material")).toHaveText("market-notes.txt");
    await expect(page.getByRole("heading", { name: "Additional Tips" })).toBeVisible();
    expect((await aiCounts(page)).studyGuide).toBe(1);
    await expect(page.locator("#guide-back-link")).toHaveAttribute("href", new RegExp(`materialId=${materialId}`));

    await page.goto(`/study-guide.html?courseId=${courseId}`);
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await page.locator("#generate-guide-button").click();
    await expect(page.locator("#key-concepts")).toContainText("Supply and demand");
    await expect(page.locator("#guide-back-link")).toHaveAttribute("href", `course.html?courseId=${courseId}`);

    await page.goto(`/history.html?courseId=${courseId}`);
    await expect(page.locator("#guide-history .history-item")).toHaveCount(2);
    await resetAiCounts(page);
    await page.locator("#guide-history .history-item").first().getByRole("link", { name: "Open Guide" }).click();
    await expect(page.locator("#guide-summary")).toContainText("Saved");
    expect((await aiCounts(page)).total).toBe(0);
    await page.locator("#guide-back-link").click();
    await page.locator("#guide-history .history-item").first().getByRole("button", { name: "Delete" }).click();
    await page.locator("#history-delete-confirm").click();
    await expect(page.locator("#guide-history .history-item")).toHaveCount(1);
});

test("quizzes persist attempts, retake without generation, update progress, and cascade delete", async ({ page }) => {
    const account = await signup(page, "Quiz");
    const courseId = await createCourse(page, { code: "QUIZ 101" });
    const materialId = await uploadTextMaterial(page, courseId);

    await page.goto(`/quiz.html?courseId=${courseId}`);
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await resetAiCounts(page);
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await completeFiveQuestionQuiz(page);
    const generated = await aiCounts(page);
    expect(generated.quiz).toBe(1);
    expect(generated.verification).toBe(1);

    await page.goto("/index.html");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, account);
    await page.goto(`/progress.html?courseId=${courseId}`);
    await expect(page.locator("#total-attempts")).toHaveText("1");

    await page.goto(`/history.html?courseId=${courseId}`);
    await expect(page.locator("#quiz-history .history-item")).toHaveCount(1);
    await expect(page.locator("#quiz-history .score-chip")).toHaveText("1 attempt");
    await resetAiCounts(page);
    await page.locator("#quiz-history .history-item").getByRole("link", { name: "Open / Retake" }).click();
    await expect(page.locator("#question")).toContainText("selected material");
    expect((await aiCounts(page)).total).toBe(0);
    await completeFiveQuestionQuiz(page);
    expect((await aiCounts(page)).total).toBe(0);

    await page.goto(`/progress.html?courseId=${courseId}`);
    await expect(page.locator("#total-attempts")).toHaveText("2");
    await page.locator("#recent-activity .progress-row").first().click();
    await expect(page).toHaveURL(/quizId=/);

    await page.goto(`/quiz.html?courseId=${courseId}&materialId=${materialId}`);
    await expect(page.locator("#quiz-material-selection-wrap")).toBeHidden();
    await expect(page.locator("#quiz-back-link")).toHaveAttribute("href", new RegExp(`materialId=${materialId}`));
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await expect(page.locator("#question")).toContainText("selected material");

    await page.goto(`/history.html?courseId=${courseId}`);
    const attemptedQuiz = page.locator("#quiz-history .history-item", { hasText: "2 attempts" });
    await attemptedQuiz.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#history-delete-warning")).toContainText("2 saved attempts");
    await page.locator("#history-delete-confirm").click();
    await page.goto(`/progress.html?courseId=${courseId}`);
    await expect(page.locator("#total-attempts")).toHaveText("0");
    await expect(page.locator("#progress-empty")).toBeVisible();
});

test("flashcards and Ask My Notes use real course material and persisted state", async ({ page }) => {
    await signup(page, "Tools");
    const courseId = await createCourse(page, { code: "TOOLS 101" });
    const materialId = await uploadTextMaterial(page, courseId);

    await page.goto(`/flashcards.html?courseId=${courseId}`);
    await page.locator("#add-card-button").click();
    await page.locator("#manual-card-front").fill("What is demand?");
    await page.locator("#manual-card-back").fill("Willingness and ability to buy.");
    await page.locator("#save-manual-card").click();
    await expect(page.locator("#flashcard-question")).toHaveText("What is demand?");
    await page.locator("#edit-card-button").click();
    await page.locator("#manual-card-front").fill("Define demand.");
    await page.locator("#save-manual-card").click();
    await expect(page.locator("#flashcard-question")).toHaveText("Define demand.");
    await page.locator("#flashcard").click();
    await expect(page.locator("#flashcard")).toHaveClass(/flipped/);
    await page.locator("#know-card").click();
    await page.locator("#still-learning").click();
    await page.reload();
    await expect(page.locator("#flashcard-mastery")).toContainText("2 reviews");
    const savedCards = await api(page, "GET", `/api/courses/${courseId}/flashcards`);
    const manualCard = savedCards.body.find(card => card.front === "Define demand.");
    expect(manualCard.correctCount).toBe(1);
    expect(manualCard.incorrectCount).toBe(1);

    await page.locator("#generate-cards-button").click();
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await page.locator("#flashcard-count").selectOption("5");
    await page.locator("#confirm-generate-cards").click();
    await expect(page.locator("#card-total")).toHaveText("6");
    await page.locator("#flashcard-filter").selectOption(String(materialId));
    await expect(page.locator("#card-total")).toHaveText("5");
    await page.locator("#delete-card-button").click();
    await page.locator("#confirm-delete-card").click();
    await expect(page.locator("#card-total")).toHaveText("4");

    await page.goto(`/notes.html?courseId=${courseId}`);
    await expect(page.locator("#notes-back-link")).toHaveAttribute("href", `course.html?courseId=${courseId}`);
    await expect(page.locator("#chat-disclaimer")).toHaveCount(0);
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await page.locator("#chat-input").fill("How do supply and demand interact?");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("market outcomes");
    await expect(page.locator(".message.assistant").last()).toContainText("Selected materials");
    await page.locator("#chat-input").fill("What is missing from my notes?");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("couldn't find that information");
    await page.locator("#chat-input").fill("Force service error");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.error-message").last()).toContainText("could not complete");
    await expect(page.locator(".message.error-message").last().getByRole("button", { name: "Try Again" })).toBeVisible();

    const emptyCourseId = await createCourse(page, { name: "Empty Notes", code: "EMPTY 101" });
    await uploadTextMaterial(page, emptyCourseId, { filename: "empty.txt", empty: true });
    await page.goto(`/notes.html?courseId=${emptyCourseId}`);
    await expect(page.getByText("No usable extracted text")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ Add Materials" })).toHaveAttribute("href", `materials.html?courseId=${emptyCourseId}&upload=1`);
});

test("two browser contexts remain isolated across data and destructive APIs", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
        await signup(pageA, "OwnerA");
        const courseId = await createCourse(pageA, { name: "Private Course", code: "PRIVATE A" });
        const materialId = await uploadTextMaterial(pageA, courseId);
        const guide = await api(pageA, "POST", `/api/courses/${courseId}/study-guides`, { materialIds: [materialId] });
        expect(guide.status).toBe(201);

        await signup(pageB, "OwnerB");
        await expect(pageB.getByText("PRIVATE A")).toHaveCount(0);
        for (const [method, url] of [
            ["GET", `/api/courses/${courseId}`],
            ["GET", `/api/courses/${courseId}/materials/${materialId}`],
            ["GET", `/api/courses/${courseId}/study-guides/${guide.body.id}`],
            ["DELETE", `/api/courses/${courseId}/materials/${materialId}`],
            ["DELETE", `/api/courses/${courseId}`]
        ]) {
            expect((await api(pageB, method, url)).status).toBe(404);
        }
        const progress = await api(pageB, "GET", "/api/progress");
        expect(progress.body.totalAttempts).toBe(0);
        expect((await api(pageA, "GET", `/api/courses/${courseId}`)).status).toBe(200);
        expect((await api(pageA, "GET", `/api/courses/${courseId}/materials/${materialId}`)).status).toBe(200);
    } finally {
        await contextA.close();
        await contextB.close();
    }
});

test("critical authenticated pages remain usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signup(page, "Mobile");
    const courseId = await createCourse(page, { code: "MOBILE 101" });
    const materialId = await uploadTextMaterial(page, courseId);
    const pages = [
        "/index.html", `/course.html?courseId=${courseId}`,
        `/materials.html?courseId=${courseId}`, `/quiz.html?courseId=${courseId}&materialId=${materialId}`,
        `/flashcards.html?courseId=${courseId}`, `/notes.html?courseId=${courseId}`
    ];
    for (const url of pages) {
        await page.goto(url);
        await expect(page.locator("body")).toBeVisible();
        const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            offenders: [...document.querySelectorAll("body *")]
                .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
                .slice(0, 8)
                .map(element => `${element.tagName.toLowerCase()}.${element.className}`)
        }));
        expect(layout.overflow, `${url} overflowed via ${layout.offenders.join(", ")}`).toBeLessThanOrEqual(1);
    }
});
