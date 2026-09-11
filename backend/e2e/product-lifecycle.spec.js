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

    const courseCards = page.locator("#course-list .course-card");
    await expect(courseCards).toHaveCount(2);
    const renderedAccents = await courseCards.evaluateAll(cards => cards.map(card => {
        const bar = card.querySelector(".course-color");
        return {
            color: card.dataset.courseColor,
            background: getComputedStyle(bar).backgroundColor
        };
    }));
    expect(renderedAccents.every(accent => /^#[0-9A-F]{6}$/.test(accent.color))).toBe(true);
    expect(renderedAccents.every(accent => !["", "rgba(0, 0, 0, 0)", "transparent"].includes(accent.background))).toBe(true);
    expect(new Set(renderedAccents.map(accent => accent.color)).size).toBe(2);

    const firstCardColor = await courseCards.filter({ hasText: "FIRST 101" }).getAttribute("data-course-color");
    const firstSidebarColor = await page.locator(".sidebar-course-link", { hasText: "FIRST 101" }).getAttribute("data-course-color");
    expect(firstSidebarColor).toBe(firstCardColor);
    await page.reload();
    await expect(courseCards.filter({ hasText: "FIRST 101" })).toHaveAttribute("data-course-color", firstCardColor);

    await page.goto(`/course.html?courseId=${firstId}`);
    await expect(page.locator(".topbar.course-accent-context")).toHaveAttribute("data-course-color", firstCardColor);
    await expect(page.locator(".sidebar-course-link.active")).toHaveAttribute("data-course-color", firstCardColor);

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

test("first-run onboarding reaches a completed Today workflow without trapping navigation", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await signup(page, "FirstRun", { dismissWelcome: false });
    const welcome = page.locator("#welcome-modal");
    await expect(welcome).toHaveClass(/open/);
    await expect(page.getByRole("heading", { name: "Build your first useful study plan" })).toBeVisible();
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 700]]) {
        await page.setViewportSize({ width, height });
        const layout = await welcome.locator("[role=dialog]").evaluate(dialog => {
            const box = dialog.getBoundingClientRect();
            return {
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
                viewportHeight: innerHeight
            };
        });
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.left).toBeGreaterThanOrEqual(0);
        expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.top).toBeGreaterThanOrEqual(0);
        expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Get Started" }).focus();
    await page.keyboard.press("Enter");
    await expect(welcome).not.toHaveClass(/open/);
    await expect(page.locator("#onboarding-progress-copy")).toHaveText("0 of 6 steps complete");
    await page.getByRole("link", { name: "Create Course" }).click();
    await expect(page.locator("#course-modal")).toHaveClass(/open/);
    await page.locator("#course-name").fill("First Run Economics");
    await page.locator("#course-code").fill("ECON 150");
    await page.locator("#course-semester").fill("Fall 2026");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page).toHaveURL(/course\.html\?courseId=\d+&onboarding=course-created$/);
    const courseId = Number(new URL(page.url()).searchParams.get("courseId"));
    await expect(page.locator("#course-onboarding-next")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload Syllabus" })).toHaveAttribute(
        "href", `materials.html?courseId=${courseId}&upload=1&role=syllabus`
    );
    await page.getByRole("link", { name: "Upload Syllabus" }).click();
    await expect(page.locator("#upload-modal")).toHaveClass(/active/);
    await expect(page.locator("#upload-role-modal")).toHaveValue("syllabus");
    await page.locator("#file-input").setInputFiles({
        name: "economics-syllabus.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Homework 1 — September 20\nMidterm 1 — October 10 at 7:00 PM")
    });
    await page.getByRole("button", { name: "Upload Syllabus" }).click();
    await expect(page.locator("#material-onboarding-next")).toBeVisible();
    await page.getByRole("link", { name: "Import Deadlines" }).click();
    await expect(page.locator("#schedule-import-modal")).toHaveClass(/open/);
    await page.getByRole("button", { name: "Find Deadlines" }).click();
    await expect(page.locator(".schedule-candidate")).toHaveCount(2);
    await page.getByRole("button", { name: "Import Selected Events" }).click();
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await expect(page.getByRole("heading", { name: "Next, add notes or slides" })).toBeVisible();
    await page.getByRole("link", { name: "Add Study Material" }).click();
    await expect(page.locator("#upload-role-modal")).toHaveValue("general");
    await page.locator("#file-input").setInputFiles({
        name: "elasticity-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Elasticity measures responsiveness to price changes. Tax incidence depends on relative elasticity.")
    });
    await page.getByRole("button", { name: "Upload Material", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Try your first study activity" })).toBeVisible();
    await page.getByRole("link", { name: "Practice Quiz" }).first().click();
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await page.locator("#generate-quiz-button").click();
    await completeFiveQuestionQuiz(page);
    await page.getByRole("link", { name: "Open Today" }).click();
    await expect(page).toHaveURL(/today\.html$/);
    await expect(page.getByRole("heading", { name: "What should I do next?" })).toBeVisible();
    await expect.poll(async () => (await api(page, "GET", "/api/onboarding")).body.completedCount).toBe(6);
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.locator("#onboarding-checklist")).toBeHidden();
    await expect(page.locator("#dashboard-getting-started")).toBeVisible();
    expect(errors).toEqual([]);
});

test("skipped onboarding stays quiet and can be resumed", async ({ page }) => {
    await signup(page, "SkipSetup", { dismissWelcome: false });
    await page.locator("#welcome-skip").click();
    await expect(page.locator("#welcome-modal")).not.toHaveClass(/open/);
    await expect(page.locator("#onboarding-checklist")).toBeHidden();
    await expect(page.locator("#onboarding-resume")).toBeVisible();
    await page.reload();
    await expect(page.locator("#welcome-modal")).not.toHaveClass(/open/);
    await expect(page.locator("#onboarding-resume")).toBeVisible();
    await page.getByRole("button", { name: "Resume Setup" }).click();
    await expect(page.locator("#onboarding-checklist")).toBeVisible();
    await expect(page.locator("#onboarding-progress-copy")).toHaveText("0 of 6 steps complete");
});

test("planner flow creates assignment and exam, completes work, and opens exam recommendations", async ({ page }) => {
    await signup(page, "PlannerFlow");
    const courseId = await createCourse(page, { name: "Planner Economics", code: "ECON 240", semester: "Fall 2026" });
    await page.goto(`/planner.html?courseId=${courseId}&new=1&type=assignment`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#task-title").fill("Comparative advantage worksheet");
    await page.locator("#task-date").fill("2026-09-20");
    await page.locator("#save-task").click();
    await expect(page.getByText("Comparative advantage worksheet")).toBeVisible();

    await page.getByRole("button", { name: "+ Add Exam" }).click();
    await page.locator("#task-title").fill("ECON Midterm");
    await page.locator("#task-date").fill("2026-09-25");
    await page.locator("#save-task").click();
    await expect(page.getByText("ECON Midterm")).toBeVisible();
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect(page.locator(".calendar-heading h2")).toBeVisible();
    await page.locator('[data-date="2026-09-20"]').click();
    await expect(page.locator(".calendar-day-panel")).toContainText("Comparative advantage worksheet");
    await page.locator(".calendar-day-panel").getByRole("button", { name: "+ Add Task" }).click();
    await expect(page.locator("#task-date")).toHaveValue("2026-09-20");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.locator(".calendar-day-panel").getByRole("button", { name: "Edit" }).click();
    await page.locator("#task-title").fill("Edited worksheet");
    await page.locator("#save-task").click();
    await expect(page.locator(".calendar-day-panel")).toContainText("Edited worksheet");
    await page.locator(".calendar-day-panel").getByRole("button", { name: "Complete" }).click();
    await expect(page.locator(".calendar-day-panel .day-task")).toHaveClass(/completed/);

    await page.locator('[data-date="2026-09-25"]').click();
    await expect(page.locator(".calendar-day-panel")).toContainText("ECON Midterm");
    await expect(page.locator(".calendar-day-panel").getByRole("link", { name: "What to Study" })).toBeVisible();

    await page.goto(`/course.html?courseId=${courseId}`);
    await expect(page.locator("#course-upcoming-tasks")).toContainText("ECON Midterm");
    await page.getByRole("link", { name: "Open Study Recommendations" }).click();
    await expect(page).toHaveURL(new RegExp(`recommendations\\.html\\?courseId=${courseId}`));
    await expect(page.locator("#planner-exam-context")).toContainText("ECON Midterm");
});

test("planner modal scrolls in a short window and the time picker preserves 24-hour values", async ({ page }) => {
    const consoleErrors = [];
    page.on("pageerror", error => consoleErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.setViewportSize({ width: 900, height: 550 });
    await signup(page, "PlannerModal");
    const courseId = await createCourse(page, { name: "Short Window", code: "QA 101" });
    await page.goto(`/planner.html?courseId=${courseId}&new=1&type=assignment`);
    await expect(page.locator("#task-modal")).toHaveClass(/open/);
    for (const [width, height] of [[1024, 600], [900, 550], [768, 500], [390, 600], [390, 500]]) {
        await page.setViewportSize({ width, height });
        const modalLayout = await page.locator("#task-modal .app-modal").evaluate(element => {
            const body = element.querySelector(".app-modal-body");
            const actions = element.querySelector(".app-modal-actions");
            return {
                display: getComputedStyle(element).display,
                direction: getComputedStyle(element).flexDirection,
                bodyClientHeight: body.clientHeight,
                bodyScrollHeight: body.scrollHeight,
                bodyOverflow: getComputedStyle(body).overflowY,
                pageOverflow: getComputedStyle(document.body).overflow,
                actionsBottom: actions.getBoundingClientRect().bottom,
                viewportHeight: window.innerHeight
            };
        });
        expect(modalLayout.display).toBe("flex");
        expect(modalLayout.direction).toBe("column");
        expect(modalLayout.bodyScrollHeight).toBeGreaterThan(modalLayout.bodyClientHeight);
        expect(modalLayout.bodyOverflow).toBe("auto");
        expect(modalLayout.pageOverflow).toBe("hidden");
        expect(modalLayout.actionsBottom).toBeLessThanOrEqual(modalLayout.viewportHeight);
        await expect(page.locator("#cancel-task")).toBeVisible();
        await expect(page.locator("#save-task")).toBeVisible();
    }
    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(10, 10);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
    await page.locator("#task-description").fill("A long assignment description ".repeat(100));
    await page.locator("#task-title").fill("Afternoon assignment");
    await page.locator("#task-date").fill("2026-10-14");
    await page.locator("#task-time-trigger").click();
    await expect(page.locator("#time-picker-modal")).toHaveClass(/open/);
    await expect(page.locator("#task-modal")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("listbox", { name: "Hour" })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Minute" })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "AM or PM" })).toBeVisible();
    for (const [width, height] of [[1440, 900], [900, 550], [390, 700], [320, 700]]) {
        await page.setViewportSize({ width, height });
        const pickerLayout = await page.locator(".time-picker-dialog").evaluate(element => {
            const box = element.getBoundingClientRect();
            const option = element.querySelector(".time-wheel-option").getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, optionHeight: option.height, width: innerWidth, height: innerHeight };
        });
        expect(pickerLayout.left).toBeGreaterThanOrEqual(0);
        expect(pickerLayout.right).toBeLessThanOrEqual(pickerLayout.width);
        expect(pickerLayout.top).toBeGreaterThanOrEqual(0);
        expect(pickerLayout.bottom).toBeLessThanOrEqual(pickerLayout.height);
        expect(pickerLayout.optionHeight).toBeGreaterThanOrEqual(44);
        await expect(page.locator("#clear-task-time")).toBeVisible();
        await expect(page.locator("#cancel-time-picker")).toBeVisible();
        await expect(page.locator("#confirm-time-picker")).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 600 });
    await page.locator('#time-hour-wheel [role="option"][data-value="1"]').click();
    await page.locator('#time-minute-wheel [role="option"][data-value="30"]').click();
    await page.locator('#time-period-wheel [role="option"][data-value="PM"]').click();
    await page.locator("#confirm-time-picker").click();
    await expect(page.locator("#task-time-display")).toHaveText("1:30 PM");
    await expect(page.locator("#task-time")).toHaveValue("13:30");
    await page.locator("#save-task").click();
    await expect(page.getByText("Afternoon assignment")).toBeVisible();
    const saved = (await api(page, "GET", `/api/courses/${courseId}/tasks`)).body.find(task => task.title === "Afternoon assignment");
    const localDue = await page.evaluate(value => {
        const date = new Date(value);
        return [date.getHours(), date.getMinutes()];
    }, saved.dueAt);
    expect(localDue).toEqual([13, 30]);
    await page.locator(".planner-task", { hasText: "Afternoon assignment" }).getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#task-time-display")).toHaveText("1:30 PM");
    await expect(page.locator("#task-time")).toHaveValue("13:30");
    await page.locator("#task-time-trigger").click();
    await page.locator('#time-hour-wheel [role="option"][data-value="6"]').click();
    await page.locator('#time-minute-wheel [role="option"][data-value="45"]').click();
    await page.locator('#time-period-wheel [role="option"][data-value="PM"]').click();
    await page.locator("#confirm-time-picker").click();
    await expect(page.locator("#task-time-display")).toHaveText("6:45 PM");
    await expect(page.locator("#task-time")).toHaveValue("18:45");
    await page.locator("#save-task").click();
    const updated = (await api(page, "GET", `/api/courses/${courseId}/tasks`)).body.find(task => task.title === "Afternoon assignment");
    const updatedLocalDue = await page.evaluate(value => {
        const date = new Date(value);
        return [date.getHours(), date.getMinutes()];
    }, updated.dueAt);
    expect(updatedLocalDue).toEqual([18, 45]);
    await page.locator(".planner-task", { hasText: "Afternoon assignment" }).getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#task-time-display")).toHaveText("6:45 PM");
    await page.locator("#task-time-trigger").click();
    await expect(page.locator('#time-hour-wheel [role="option"][data-value="6"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#time-minute-wheel [role="option"][data-value="45"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#time-period-wheel [role="option"][data-value="PM"]')).toHaveAttribute("aria-selected", "true");
    await page.getByRole("listbox", { name: "Hour" }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('#time-hour-wheel [role="option"][data-value="5"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("listbox", { name: "Minute" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#time-picker-modal")).not.toHaveClass(/open/);
    await expect(page.locator("#task-modal")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#task-time-trigger")).toBeFocused();
    await expect(page.locator("#task-time-display")).toHaveText("6:45 PM");
    expect(consoleErrors).toEqual([]);
});

test("interactive calendar remains contained and usable across desktop and mobile widths", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await signup(page, "CalendarResponsive");
    const courseId = await createCourse(page, { name: "Responsive Planning", code: "PLAN 101", semester: "Fall 2026" });
    await page.goto(`/planner.html?courseId=${courseId}&new=1&type=exam`);
    await page.locator("#task-title").fill("Responsive midterm");
    await page.locator("#task-date").fill("2026-09-17");
    await page.locator("#save-task").click();
    await page.getByRole("tab", { name: "Calendar" }).click();
    for (const width of [1440, 1024, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator(".calendar-day").first()).toBeVisible();
        const layout = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            page: document.documentElement.scrollWidth,
            escaped: [...document.querySelectorAll(".calendar-day")].some(cell => cell.scrollWidth > cell.clientWidth + 1),
            panelVisible: Boolean(document.querySelector(".calendar-day-panel")?.offsetParent)
        }));
        expect(layout.page).toBeLessThanOrEqual(layout.viewport);
        expect(layout.escaped).toBe(false);
        expect(layout.panelVisible).toBe(true);
    }
    expect(errors).toEqual([]);
});

test("fake Canvas OAuth connects, maps, syncs, and updates without duplicates", async ({ page }) => {
    const browserErrors = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") browserErrors.push(message.text());
    });
    await signup(page, "CanvasImport");
    const courseId = await createCourse(page, { name: "Existing Economics", code: "ECON 388", semester: "Fall 2026" });
    await page.goto("/planner.html");
    await page.getByRole("button", { name: "Import from LMS" }).click();
    await page.getByRole("link", { name: "Connect Canvas" }).click();
    await expect(page.getByRole("heading", { name: "Fake Canvas authorization" })).toBeVisible();
    await page.getByRole("button", { name: "Authorize Study Signal" }).click();
    await expect(page).toHaveURL(/planner\.html$/);
    await expect(page.getByRole("heading", { name: "Connected Learning Platforms" })).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    const mapping = page.locator(".lms-mapping-row select");
    await mapping.selectOption(String(courseId));
    await page.getByRole("button", { name: "Sync Now" }).click();
    await expect(page.locator("#lms-sync-summary")).toContainText("Canvas synced");
    await expect(page.locator("#lms-sync-summary")).toContainText("1 imported");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Canvas Problem Set")).toBeVisible();
    await expect(page.locator(".source-badge", { hasText: "Canvas" })).toBeVisible();
    const external = page.getByRole("link", { name: "Open in Canvas" }).first();
    await expect(external).toHaveAttribute("href", "https://canvas.test/assignments/1");
    await page.setViewportSize({ width: 390, height: 700 });
    await page.getByRole("button", { name: "Import from LMS" }).click();
    const mobileLayout = await page.locator("#lms-modal .planner-modal").evaluate(element => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        viewport: document.documentElement.clientWidth
    }));
    expect(mobileLayout.left).toBeGreaterThanOrEqual(0);
    expect(mobileLayout.right).toBeLessThanOrEqual(mobileLayout.viewport);
    await Promise.all([
        page.waitForResponse(response => response.url().includes(`/api/lms/`) && response.url().endsWith("/sync") && response.request().method() === "POST"),
        page.getByRole("button", { name: "Sync Now" }).click()
    ]);
    await expect(page.locator("#lms-sync-summary")).toContainText("1 updated");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Canvas Problem Set")).toHaveCount(1);
    const imported = await page.request.get("/api/tasks").then(response => response.json());
    expect(imported.filter(task => task.externalId === "canvas-assignment-1")).toHaveLength(1);
    expect(imported[0].dueAt).toBe("2026-10-03T05:59:00.000Z");
    expect(imported[0].externalStatus).toBe("submitted");
    expect(imported[0].externalSubmissionType).toBe("online_upload");
    expect(browserErrors).toEqual([]);
});

test("syllabus schedule import reviews, edits, excludes, confirms, and opens exam study recommendations", async ({ page }) => {
    const browserErrors = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") browserErrors.push(message.text());
    });
    await signup(page, "ScheduleImport");
    const courseId = await createCourse(page, { name: "Schedule Economics", code: "ECON 389", semester: "Fall 2026" });
    const materialId = await uploadTextMaterial(page, courseId, {
        filename: "syllabus.txt",
        content: "Homework 1 — September 12\nQuiz 1 — September 19\nMidterm 1 — October 10 at 7:00 PM\nFinal paper due during finals week."
    });
    await api(page, "PATCH", `/api/courses/${courseId}/materials/${materialId}`, { materialRole: "syllabus" });
    await page.goto(`/course.html?courseId=${courseId}`);
    const importButton = page.getByRole("button", { name: "Import from Syllabus" });
    await expect(importButton).toBeVisible();
    await expect(page.locator("#course-task-actions")).toBeVisible();
    await importButton.click();
    await expect(page.locator("#upload-schedule-material")).toHaveAttribute("href", `materials.html?courseId=${courseId}&upload=1&role=syllabus`);
    await page.locator("#schedule-material").selectOption(String(materialId));
    await page.getByRole("button", { name: "Find Deadlines" }).click();
    await expect(page.locator(".schedule-candidate")).toHaveCount(4);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#schedule-import-modal .app-modal")).toBeVisible();
    await expect(page.locator(".schedule-candidate").first()).toBeVisible();
    const homework = page.locator(".schedule-candidate", { hasText: "Homework 1" });
    await homework.locator(".candidate-date").fill("2026-09-13");
    const quiz = page.locator(".schedule-candidate", { hasText: "Quiz 1" });
    await quiz.locator("input[type=checkbox]").uncheck();
    await page.getByRole("button", { name: "Import Selected Events" }).click();
    await expect(page.locator("#schedule-confirm-copy")).toContainText("Create 2 Planner events?");
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await page.goto(`/planner.html?courseId=${courseId}`);
    await expect(page.getByText("Homework 1")).toBeVisible();
    await expect(page.getByText("Midterm 1")).toBeVisible();
    await expect(page.locator(".source-badge", { hasText: "Syllabus" }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.locator('[data-date="2026-10-10"]').click();
    await page.locator(".calendar-day-panel").getByRole("link", { name: "What to Study" }).click();
    await expect(page).toHaveURL(new RegExp(`recommendations\\.html\\?courseId=${courseId}`));
    expect(browserErrors).toEqual([]);
});

test("course deletion is discoverable, confirmed, recoverable on failure, and removes navigation", async ({ page }) => {
    await signup(page, "CourseDelete");
    const courseId = await createCourse(page, {
        name: "Old Calculus",
        code: "MATH 199",
        semester: "Spring 2024"
    });

    const deleteTrigger = page.getByRole("button", { name: "Delete Course" }).first();
    await expect(page.locator("#course-management-actions")).toBeVisible();
    await expect(deleteTrigger).toBeVisible();
    await deleteTrigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#delete-course-title")).toHaveText("Delete MATH 199?");
    await expect(page.locator("#delete-course-description")).toContainText("Old Calculus");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(deleteTrigger).toBeFocused();
    await expect(page.locator("#course-code-title")).toHaveText("MATH 199");

    await page.route(`**/api/courses/${courseId}`, async route => {
        if (route.request().method() !== "DELETE") return route.continue();
        await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "DELETE_FAILED", message: "Deletion is temporarily unavailable." } })
        });
    });
    await deleteTrigger.click();
    await page.locator("#confirm-delete-course").click();
    await expect(page.getByText("Deletion is temporarily unavailable.").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`course\\.html\\?courseId=${courseId}(?:&[^#]+)?$`));
    await expect(page.locator("#course-code-title")).toHaveText("MATH 199");
    await page.unroute(`**/api/courses/${courseId}`);

    let releaseDelete;
    let markDeleteRequested;
    const deleteRelease = new Promise(resolve => { releaseDelete = resolve; });
    const deleteRequested = new Promise(resolve => { markDeleteRequested = resolve; });
    await page.route(`**/api/courses/${courseId}`, async route => {
        if (route.request().method() !== "DELETE") return route.continue();
        markDeleteRequested();
        await deleteRelease;
        const response = await route.fetch();
        expect(response.status()).toBe(204);
        await route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({ cleanup: { completed: 0, pending: 1 } })
        });
    });
    await page.locator("#confirm-delete-course").click();
    await deleteRequested;
    await expect(page.locator("#confirm-delete-course")).toHaveText("Deleting…");
    await expect(page.locator("#confirm-delete-course")).toBeDisabled();
    releaseDelete();
    await expect(page).toHaveURL(/index\.html#courses$/);
    await expect(page.getByText("Course deleted. Stored-file cleanup is queued and will be retried.")).toBeVisible();
    await expect(page.locator("#course-list .course-card", { hasText: "MATH 199" })).toHaveCount(0);
    await expect(page.locator(".sidebar-course-link", { hasText: "MATH 199" })).toHaveCount(0);
    await expect(page.locator(".sidebar-semester-group", { hasText: "Spring 2024" })).toHaveCount(0);
});

test("dashboard, sidebar, course header, and units share one visible deterministic course accent", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });

    await signup(page, "CourseColors");
    const courseId = await createCourse(page, {
        name: "Color Systems",
        code: "COLOR 220",
        semester: "Fall 2026"
    });
    await createUnit(page, "Visible Unit");

    await page.goto("/index.html#courses");
    await expect.poll(() => page.evaluate(() =>
        typeof window.StudySignalCourseColors?.applyCourseColor
    )).toBe("function");
    const card = page.locator("#course-list .course-card", { hasText: "COLOR 220" });
    const sidebar = page.locator(".sidebar-course-link", { hasText: "COLOR 220" });
    await expect(card).toBeVisible();
    await expect(sidebar).toBeVisible();

    const dashboardAccent = await card.evaluate(element => ({
        resolved: element.dataset.courseColor,
        visible: getComputedStyle(element.querySelector(".course-color")).backgroundColor
    }));
    const sidebarAccent = await sidebar.evaluate(element => ({
        resolved: element.dataset.courseColor,
        visible: getComputedStyle(element, "::before").backgroundColor
    }));
    expect(dashboardAccent.resolved).toMatch(/^#[0-9A-F]{6}$/);
    expect(dashboardAccent.visible).not.toBe("rgba(0, 0, 0, 0)");
    expect(sidebarAccent.resolved).toBe(dashboardAccent.resolved);
    expect(sidebarAccent.visible).toBe(dashboardAccent.visible);

    await page.reload();
    await expect(card).toHaveAttribute("data-course-color", dashboardAccent.resolved);
    await page.goto(`/course.html?courseId=${courseId}`);
    await expect(page.locator("#course-units-list")).toContainText("Visible Unit");
    const courseAccents = await page.evaluate(() => ({
        helper: typeof window.StudySignalCourseColors?.applyCourseColor,
        headerResolved: document.querySelector(".topbar").dataset.courseColor,
        headerVisible: getComputedStyle(document.querySelector(".topbar")).borderLeftColor,
        unitResolved: document.querySelector(".unit-management-card").dataset.courseColor,
        unitVisible: getComputedStyle(document.querySelector(".unit-management-card .course-color")).backgroundColor
    }));
    expect(courseAccents.helper).toBe("function");
    expect(courseAccents.headerResolved).toBe(dashboardAccent.resolved);
    expect(courseAccents.unitResolved).toBe(dashboardAccent.resolved);
    expect(courseAccents.headerVisible).toBe(dashboardAccent.visible);
    expect(courseAccents.unitVisible).toBe(dashboardAccent.visible);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test("course rendering uses a safe accent and does not crash when the color helper asset is unavailable", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await signup(page, "ColorFallback");
    await page.route("**/js/course-colors.js*", route => route.abort());

    const courseId = await createCourse(page, {
        name: "Fallback Course",
        code: "SAFE 101",
        semester: "Spring 2027"
    });
    await createUnit(page, "Fallback Unit");

    await expect(page.locator("#course-code-title")).toHaveText("SAFE 101");
    await expect(page.locator("#course-units-list")).toContainText("Fallback Unit");
    await expect(page.locator(".topbar.course-accent-context")).toHaveAttribute("data-course-color", "#2F7F7A");
    expect(pageErrors).toEqual([]);
    expect(pageErrors.some(message => message.includes("applyCourseColor"))).toBe(false);
});

test("major rendered pages resolve the centralized ink and teal theme without legacy blue overrides", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });

    async function expectTheme(primarySelector, { sidebar = true } = {}) {
        const theme = await page.evaluate(selector => {
            const primary = document.querySelector(selector);
            const navigation = document.querySelector(".sidebar");
            const rootStyles = getComputedStyle(document.documentElement);
            return {
                ink: rootStyles.getPropertyValue("--color-ink").trim(),
                primary: rootStyles.getPropertyValue("--color-primary").trim(),
                background: getComputedStyle(document.body).backgroundColor,
                primaryBackground: primary ? getComputedStyle(primary).backgroundColor : null,
                sidebarBackground: navigation ? getComputedStyle(navigation).backgroundColor : null,
                overflow: document.documentElement.scrollWidth - window.innerWidth
            };
        }, primarySelector);
        expect(theme.ink.toLowerCase()).toBe("#172033");
        expect(theme.primary.toLowerCase()).toBe("#2f7f7a");
        expect(theme.background).toBe("rgb(247, 248, 250)");
        expect(["rgb(47, 127, 122)", "rgb(170, 180, 189)"]).toContain(theme.primaryBackground);
        expect(theme.primaryBackground).not.toBe("rgb(37, 99, 235)");
        if (sidebar) expect(theme.sidebarBackground).toBe("rgb(23, 32, 51)");
        expect(theme.overflow).toBeLessThanOrEqual(1);
    }

    await page.goto("/login.html");
    await expectTheme(".auth-submit", { sidebar: false });
    await page.goto("/signup.html");
    await expectTheme(".auth-submit", { sidebar: false });

    await signup(page, "Theme");
    const courseId = await createCourse(page, { code: "THEME 101", name: "Visual Systems" });
    await createUnit(page, "Theme Unit");
    const materialId = await uploadTextMaterial(page, courseId, { unitLabel: "Unit 1 — Theme Unit" });
    const pages = [
        ["/index.html#courses", "#add-course-button"],
        [`/course.html?courseId=${courseId}`, ".header-actions .primary-button"],
        [`/materials.html?courseId=${courseId}`, "#upload-button"],
        [`/quiz.html?courseId=${courseId}&materialId=${materialId}`, "#generate-quiz-button", false],
        [`/study-guide.html?courseId=${courseId}&materialId=${materialId}`, "#generate-guide-button"],
        [`/flashcards.html?courseId=${courseId}`, "#generate-cards-button"],
        [`/notes.html?courseId=${courseId}`, "#send-message"],
        [`/recommendations.html?courseId=${courseId}`, "#recommendations-empty-primary"],
        [`/progress.html?courseId=${courseId}`, "#empty-quiz-action"]
    ];
    for (const [url, primarySelector, hasSidebar = true] of pages) {
        await page.goto(url);
        await expect(page.locator("body")).toBeVisible();
        await expect.poll(() => page.evaluate(() =>
            typeof window.StudySignalCourseColors?.applyCourseColor
        )).toBe("function");
        await expectTheme(primarySelector, { sidebar: hasSidebar });
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test("semester sidebar groups courses, persists folders, and keeps one active destination", async ({ page }) => {
    await signup(page, "Semesters");
    const fallId = await createCourse(page, {
        name: "Market Economics",
        code: "ECON 310",
        semester: "Fall 2026"
    });
    await createCourse(page, {
        name: "Strategy",
        code: "STRAT 300",
        semester: "Winter 2027"
    });
    await createCourse(page, {
        name: "Independent Study",
        code: "IND 100",
        semester: "To be announced"
    });

    await page.goto("/index.html");
    const folders = page.locator(".sidebar-semester-folder");
    await expect(folders).toHaveCount(3);
    await expect(folders.locator(".sidebar-semester-label")).toHaveText([
        "Winter 2027",
        "Fall 2026",
        "Other / Unassigned"
    ]);
    await expect(page.locator(".sidebar-course-link")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveClass(/active/);
    await expect(page.locator(".sidebar .active")).toHaveCount(1);

    const winter = folders.filter({ hasText: "Winter 2027" });
    const fall = folders.filter({ hasText: "Fall 2026" });
    await expect(winter.locator(".sidebar-semester-toggle")).toHaveAttribute("aria-expanded", "true");
    await winter.locator(".sidebar-semester-toggle").click();
    await expect(winter.locator(".sidebar-semester-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.locator(".sidebar-semester-folder", { hasText: "Winter 2027" })
        .locator(".sidebar-semester-toggle")).toHaveAttribute("aria-expanded", "false");

    const reloadedFall = page.locator(".sidebar-semester-folder", { hasText: "Fall 2026" });
    await reloadedFall.locator(".sidebar-semester-toggle").click();
    await reloadedFall.getByRole("link", { name: /ECON 310/ }).click();
    await expect(page).toHaveURL(new RegExp(`course\\.html\\?courseId=${fallId}$`));
    await expect(page.locator(".sidebar-course-link.active")).toContainText("ECON 310");
    await expect(page.locator(".sidebar-semester-folder", { hasText: "Fall 2026" })
        .locator(".sidebar-semester-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".sidebar .active")).toHaveCount(1);

    await page.locator('.sidebar-nav a[href="index.html#courses"]').click();
    await expect(page.locator('.sidebar-nav a[href="index.html#courses"]')).toHaveClass(/active/);
    await expect(page.locator(".sidebar .active")).toHaveCount(1);
    await page.locator('.sidebar-nav a[href="progress.html"]').click();
    await expect(page.locator('.sidebar-nav a[href="progress.html"]')).toHaveClass(/active/);
    await expect(page.locator(".sidebar .active")).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.locator(".sidebar-semesters-mobile-toggle");
    await expect(mobileToggle).toBeVisible();
    await mobileToggle.click();
    await expect(page.locator(".sidebar-courses-panel")).toBeVisible();
    await expect(page.locator(".sidebar-semester-toggle").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
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
    await expect(page.locator("#generate-quiz-button")).toBeDisabled();
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await expect(page.locator("#generate-quiz-button")).toBeEnabled();
    await resetAiCounts(page);
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    expect((await aiCounts(page)).total).toBe(0);
    await page.locator("#generate-quiz-button").click();
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
    await page.locator("#recent-quiz-attempts .progress-row").first().click();
    await expect(page).toHaveURL(/quizId=/);

    await page.goto(`/quiz.html?courseId=${courseId}&materialId=${materialId}`);
    await expect(page.locator("#quiz-material-selection-wrap")).toBeHidden();
    await expect(page.locator("#quiz-back-link")).toHaveAttribute("href", new RegExp(`materialId=${materialId}`));
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await page.locator("#generate-quiz-button").click();
    await expect(page.locator("#question")).toContainText("selected material");

    await page.goto(`/history.html?courseId=${courseId}`);
    const attemptedQuiz = page.locator("#quiz-history .history-item", { hasText: "2 attempts" });
    await attemptedQuiz.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#history-delete-warning")).toContainText("2 saved attempts");
    await page.locator("#history-delete-confirm").click();
    await page.goto(`/progress.html?courseId=${courseId}`);
    await expect(page.locator("#total-attempts")).toHaveText("0");
    await expect(page.locator("#recent-quiz-attempts")).toContainText("No saved quiz attempts yet.");
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

    await uploadTextMaterial(page, courseId, {
        filename: "irrelevant-biology.txt",
        content: "Mitochondria produce cellular energy through respiration."
    });

    await page.goto(`/notes.html?courseId=${courseId}`);
    await expect(page.locator("#notes-back-link")).toHaveAttribute("href", `course.html?courseId=${courseId}`);
    await expect(page.locator("#chat-disclaimer")).toHaveCount(0);
    await page.locator(".material-choice", { hasText: "market-notes.txt" }).locator("input").check();
    await page.locator(".material-choice", { hasText: "irrelevant-biology.txt" }).locator("input").check();
    await page.locator("#chat-input").fill("How do supply and demand interact?");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("market outcomes");
    await expect(page.locator(".message.assistant").last()).toContainText("Based on your notes with added explanation.");
    await expect(page.locator(".message.assistant").last()).toContainText("Retrieved supporting materials");
    await expect(page.locator(".message.assistant").last()).toContainText("market-notes.txt");
    await expect(page.locator(".message.assistant").last()).not.toContainText("irrelevant-biology.txt");
    await page.locator("#chat-input").fill("Explain that more simply.");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("market outcomes");
    await expect(page).toHaveURL(/conversationId=\d+/);
    const conversationUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(conversationUrl);
    await expect(page.locator(".message.user")).toHaveCount(2);
    await expect(page.locator(".message.assistant")).toHaveCount(2);
    await expect(page.locator("#conversation-select")).not.toHaveValue("");
    await page.locator("#chat-input").fill("What is missing from my notes?");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("do not contain enough information");
    await page.locator("#chat-input").fill("Force service error about supply");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.error-message").last()).toContainText("could not complete");
    await expect(page.locator(".message.error-message").last().getByRole("button", { name: "Try Again" })).toBeVisible();
    await page.locator("#new-conversation-button").click();
    await expect(page.locator(".message.user")).toHaveCount(0);
    await expect(page.locator(".suggestion-row")).toBeVisible();
    await expect(page).toHaveURL(/conversationId=\d+/);

    const emptyCourseId = await createCourse(page, { name: "Empty Notes", code: "EMPTY 101" });
    await uploadTextMaterial(page, emptyCourseId, { filename: "empty.txt", empty: true });
    await page.goto(`/notes.html?courseId=${emptyCourseId}`);
    await expect(page.getByText("No usable extracted text")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ Add Materials" })).toHaveAttribute("href", `materials.html?courseId=${emptyCourseId}&upload=1`);
});

test("image notes are OCR-extracted and participate in Ask My Notes", async ({ page }) => {
    await signup(page, "Ocr");
    const courseId = await createCourse(page, { code: "OCR 101" });
    await page.goto(`/materials.html?courseId=${courseId}&upload=1`);
    const { PNG_FIXTURE } = require("../test/helpers/image-fixtures");
    await page.locator("#file-input").setInputFiles({
        name: "photo-notes.png",
        mimeType: "image/png",
        buffer: PNG_FIXTURE
    });
    await page.locator("#confirm-upload").click();
    await expect(page).toHaveURL(/material\.html\?courseId=\d+&materialId=\d+$/);
    await expect(page.locator("#material-extraction-status"))
        .toHaveText("Extracted with OCR and AI-ready");

    await page.goto(`/notes.html?courseId=${courseId}`);
    await page.locator(".material-choice", { hasText: "photo-notes.png" }).locator("input").check();
    await page.locator("#chat-input").fill("How do supply and demand interact?");
    await page.locator("#send-message").click();
    await expect(page.locator(".message.assistant").last()).toContainText("market outcomes");
    await expect(page.locator(".message.assistant").last()).toContainText("photo-notes.png");
    expect((await api(page, "GET", "/api/e2e/ocr-counts")).body.total).toBe(1);
});

test("course study recommendations use persisted evidence and preserve course links", async ({ page }) => {
    await signup(page, "Recommend");
    const courseId = await createCourse(page, { code: "SIGNAL 301" });
    await createUnit(page, "Market Analysis");
    const materialId = await uploadTextMaterial(page, courseId, {
        unitLabel: "Unit 1 — Market Analysis",
        filename: "midterm-review.txt",
        content: "The midterm review topics include elasticity and tax incidence. Elasticity measures responsiveness to price changes."
    });

    await page.goto(`/quiz.html?courseId=${courseId}&materialId=${materialId}`);
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await page.locator("#generate-quiz-button").click();
    await completeFiveQuestionQuiz(page);

    const created = await api(page, "POST", `/api/courses/${courseId}/flashcards`, {
        front: "How does elasticity affect tax incidence?",
        back: "The less elastic side bears more of a tax."
    });
    expect(created.status).toBe(201);
    await api(
        page,
        "POST",
        `/api/courses/${courseId}/flashcards/${created.body.id}/reviews`,
        { outcome: "still_learning" }
    );

    await page.goto(`/course.html?courseId=${courseId}`);
    await page.getByRole("link", { name: /What to Study/ }).click();
    await expect(page).toHaveURL(new RegExp(`recommendations\\.html\\?courseId=${courseId}$`));
    await expect(page.locator("#recommendations-title")).toContainText("SIGNAL 301");
    await page.locator("#toggle-exam-plan").click();
    await page.locator("#exam-name").fill("Midterm 1");
    await page.locator("#exam-date").fill("2026-10-15");
    await page.locator("#exam-unit-options input").check();
    await page.locator("#exam-material-options input").check();
    await page.locator("#exam-source-options input").check();
    await page.locator("#exam-source-options select").selectOption("exam_review");
    await page.locator("#save-exam-plan").click();
    await expect(page.locator("#exam-plan-summary")).toContainText("Midterm 1");
    await expect(page.locator("#focus-first-list")).toContainText("elasticity");
    await expect(page.locator("#focus-first-list")).toContainText("Still Learning");
    await expect(page.locator("#recommendation-exam-sources")).toHaveText("1");
    await expect(page.locator("#recommendations-back")).toHaveAttribute(
        "href",
        `course.html?courseId=${courseId}`
    );
    const response = await api(page, "GET", `/api/courses/${courseId}/recommendations`);
    expect(response.body.sections.focusFirst[0].action.href).toContain(`courseId=${courseId}`);
    expect(response.body.sections.focusFirst[0].evidence).not.toContain("invented");
    await page.goto(`/progress.html?courseId=${courseId}`);
    await expect(page.locator("#total-attempts")).toHaveText("1");
    await expect(page.locator("#unit-progress-list")).toContainText("Market Analysis");
    await expect(page.locator("#unit-progress-list")).toContainText("midterm-review.txt");
    await page.goto(`/recommendations.html?courseId=${courseId}`);
    const recommendedAction = page.locator("#focus-first-list .recommendation-actions a").first();
    await expect(recommendedAction).toHaveAttribute("href", new RegExp(`courseId=${courseId}`));
    await recommendedAction.click();
    await expect(page).toHaveURL(new RegExp(`courseId=${courseId}`));
    expect(materialId).toBeGreaterThan(0);
});

test("Today builds a time-bounded plan, opens the first activity, and refreshes after study", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await signup(page, "TodayPlan");
    const priorityCourseId = await createCourse(page, {
        name: "Applied Economics",
        code: "ECON 415"
    });
    const materialId = await uploadTextMaterial(page, priorityCourseId, {
        filename: "midterm-topics.txt",
        content: "Midterm topics include elasticity, tax incidence, and market equilibrium."
    });
    await page.goto(`/quiz.html?courseId=${priorityCourseId}&materialId=${materialId}`);
    await page.locator('.quiz-length-button[data-question-count="5"]').click();
    await page.locator("#generate-quiz-button").click();
    for (let index = 0; index < 5; index++) {
        await page.locator(".answer-option").nth(1).click();
        await page.locator("#submit-answer").click();
        await expect(page.locator("#quiz-result")).toHaveClass(/show/);
        await page.locator("#submit-answer").click();
    }
    await expect(page.locator("#attempt-save-status")).toContainText("Attempt saved");

    const tomorrow = new Date(Date.now() + 86_400_000);
    const tomorrowDate = [
        tomorrow.getFullYear(),
        String(tomorrow.getMonth() + 1).padStart(2, "0"),
        String(tomorrow.getDate()).padStart(2, "0")
    ].join("-");
    const examPlan = await api(page, "PUT", `/api/courses/${priorityCourseId}/exam-plan`, {
        examName: "Economics Midterm",
        examDate: tomorrowDate,
        unitIds: [],
        materialIds: [materialId],
        sourceMaterialIds: [materialId]
    });
    expect(examPlan.status).toBe(200);

    const secondCourseId = await createCourse(page, {
        name: "Strategy Lab",
        code: "STRAT 401"
    });
    const dueSoon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const task = await api(page, "POST", `/api/courses/${secondCourseId}/tasks`, {
        title: "Case analysis",
        type: "assignment",
        dueAt: dueSoon,
        estimatedMinutes: 20,
        priority: "high"
    });
    expect(task.status).toBe(201);
    const card = await api(page, "POST", `/api/courses/${secondCourseId}/flashcards`, {
        front: "What creates a defensible advantage?",
        back: "A difficult-to-copy system of reinforcing choices."
    });
    expect(card.status).toBe(201);
    const review = await api(
        page,
        "POST",
        `/api/courses/${secondCourseId}/flashcards/${card.body.id}/reviews`,
        { outcome: "still_learning" }
    );
    expect(review.status).toBe(201);

    await page.goto("/today.html");
    await expect(page.getByRole("heading", { name: "What should I do next?" })).toBeVisible();
    await page.getByRole("button", { name: "45" }).click();
    await expect(page.locator("#today-plan-summary")).toContainText("45 minutes");
    const activities = page.locator(".today-plan-card");
    await expect(activities).toHaveCount(3);
    const allocated = await activities.locator(".today-plan-minutes").allTextContents();
    expect(allocated.reduce((sum, value) => sum + Number(value.match(/\d+/)[0]), 0)).toBeLessThanOrEqual(45);
    await expect(activities.first()).toContainText("ECON 415");
    await expect(activities.first()).toContainText(/quiz miss|Midterm|exam-planning source/i);
    await expect(page.locator("#today-upcoming")).toContainText("Case analysis");
    await expect(page.locator("#today-exams")).toContainText("Economics Midterm");
    await expect(page.getByRole("link", { name: "Today" })).toHaveClass(/active/);

    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 700]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.locator(".today-page").evaluate(element => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            planWidth: element.getBoundingClientRect().width,
            minimumActionHeight: Math.min(...[...document.querySelectorAll(".today-plan-actions a, .today-plan-actions button")]
                .map(action => action.getBoundingClientRect().height))
        }));
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.planWidth).toBeGreaterThan(0);
        expect(layout.minimumActionHeight).toBeGreaterThanOrEqual(40);
        await expect(page.locator("#start-study-session")).toBeVisible();
    }

    await page.locator("#start-study-session").click();
    await expect(page).toHaveURL(new RegExp(`quiz\\.html\\?courseId=${priorityCourseId}.*quizId=`));
    await completeFiveQuestionQuiz(page);
    await page.goto("/today.html");
    await page.locator("#refresh-plan").click();
    await expect(page.locator("#today-plan-summary")).toContainText("45 minutes");
    await expect(page.locator(".today-plan-card").first()).toBeVisible();
    expect(errors).toEqual([]);
});

test("Today Done completes a linked Planner assignment", async ({ page }) => {
    await signup(page, "TodayDone");
    const courseId = await createCourse(page, { name: "Writing Seminar", code: "WRIT 210" });
    const task = await api(page, "POST", `/api/courses/${courseId}/tasks`, {
        title: "Draft introduction",
        type: "assignment",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        estimatedMinutes: 20
    });
    expect(task.status).toBe(201);
    await page.goto("/today.html");
    const activity = page.locator(".today-plan-card", { hasText: "Draft introduction" });
    await expect(activity).toBeVisible();
    await activity.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("#today-upcoming")).not.toContainText("Draft introduction");
    const saved = (await api(page, "GET", `/api/courses/${courseId}/tasks`)).body
        .find(item => item.id === task.body.id);
    expect(saved.completed).toBe(true);
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

test("critical authenticated pages remain usable at target responsive widths", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signup(page, "Mobile");
    const courseId = await createCourse(page, { code: "MOBILE 101" });
    const materialId = await uploadTextMaterial(page, courseId);
    const pages = [
        "/index.html", `/course.html?courseId=${courseId}`,
        `/materials.html?courseId=${courseId}`, `/quiz.html?courseId=${courseId}&materialId=${materialId}`,
        `/flashcards.html?courseId=${courseId}`, `/notes.html?courseId=${courseId}`,
        `/recommendations.html?courseId=${courseId}`, `/planner.html?courseId=${courseId}`,
        `/progress.html?courseId=${courseId}`, `/history.html?courseId=${courseId}`
    ];
    for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 700 : 820 });
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
            expect(layout.overflow, `${url} at ${width}px overflowed via ${layout.offenders.join(", ")}`).toBeLessThanOrEqual(1);
        }
    }
});
