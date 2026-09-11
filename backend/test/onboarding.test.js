const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp } = require("./helpers/test-app");

let identity = 0;

async function newUser(app, prefix = "onboarding") {
    identity++;
    const agent = supertest.agent(app);
    await agent.post("/api/auth/register").send({
        name: "New Student",
        email: `${prefix}-${identity}@example.test`,
        password: "StrongPass123!"
    }).expect(201);
    return agent;
}

test("brand-new users receive an honest, actionable six-step onboarding state", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const user = await newUser(context.app, "brand-new");
    const initial = await user.get("/api/onboarding").expect(200);
    assert.equal(initial.body.showWelcome, true);
    assert.equal(initial.body.showChecklist, true);
    assert.equal(initial.body.completedCount, 0);
    assert.equal(initial.body.totalSteps, 6);
    assert.deepEqual(initial.body.steps.map(step => step.id), [
        "course", "syllabus", "deadlines", "materials", "study", "today"
    ]);
    assert.equal(initial.body.nextStep.id, "course");
    assert.equal(initial.body.nextStep.href, "index.html?newCourse=1#courses");

    await user.patch("/api/onboarding").send({ action: "dismiss_welcome" }).expect(200);
    const dismissed = await user.get("/api/onboarding").expect(200);
    assert.equal(dismissed.body.showWelcome, false);
    assert.equal(dismissed.body.showChecklist, true);
});

test("checklist progress is derived from real course, material, task, and study data", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const user = await newUser(context.app, "derived");
    const course = await user.post("/api/courses").send({
        courseName: "Microeconomics",
        courseCode: "ECON 201",
        semester: "Fall 2026"
    }).expect(201);
    let state = await user.get("/api/onboarding").expect(200);
    assert.equal(state.body.completedCount, 1);
    assert.equal(state.body.showWelcome, false);
    assert.match(state.body.steps.find(step => step.id === "syllabus").href, new RegExp(`courseId=${course.body.id}`));

    const syllabus = await user.post(`/api/courses/${course.body.id}/materials`)
        .field("materialRole", "syllabus")
        .attach("file", Buffer.from("Homework 1 — September 15\nMidterm — October 10"), "syllabus.txt")
        .expect(201);
    state = await user.get("/api/onboarding").expect(200);
    assert.equal(state.body.completedCount, 2);
    assert.equal(state.body.steps.find(step => step.id === "syllabus").completed, true);

    context.database.prepare(`
        INSERT INTO course_tasks (
            course_id, title, type, description, due_at,
            schedule_source_material_id, schedule_import_key, schedule_imported_at
        ) VALUES (?, 'Homework 1', 'assignment', '', '2026-09-15T23:59:00.000Z', ?, 'onboarding-test', CURRENT_TIMESTAMP)
    `).run(course.body.id, syllabus.body.id);
    state = await user.get("/api/onboarding").expect(200);
    assert.equal(state.body.completedCount, 3);
    assert.equal(state.body.steps.find(step => step.id === "deadlines").completed, true);

    await user.post(`/api/courses/${course.body.id}/materials`)
        .field("materialRole", "general")
        .attach("file", Buffer.from("Elasticity measures responsiveness to price."), "lecture-notes.txt")
        .expect(201);
    state = await user.get("/api/onboarding").expect(200);
    assert.equal(state.body.completedCount, 4);

    await user.post(`/api/courses/${course.body.id}/flashcards`).send({
        front: "Define elasticity",
        back: "Responsiveness to a change in price."
    }).expect(201);
    state = await user.get("/api/onboarding").expect(200);
    assert.equal(state.body.completedCount, 5);
    assert.equal(state.body.nextStep.id, "today");

    state = await user.patch("/api/onboarding").send({ action: "view_today" }).expect(200);
    assert.equal(state.body.completedCount, 6);
    assert.equal(state.body.completed, true);
    assert.equal(state.body.showChecklist, false);
});

test("skip, resume, dismissal, and onboarding data remain isolated by user", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const first = await newUser(context.app, "skip-first");
    const second = await newUser(context.app, "skip-second");
    await first.patch("/api/onboarding").send({ action: "skip" }).expect(200);
    let firstState = await first.get("/api/onboarding").expect(200);
    const secondState = await second.get("/api/onboarding").expect(200);
    assert.equal(firstState.body.skipped, true);
    assert.equal(firstState.body.showChecklist, false);
    assert.equal(firstState.body.showResume, true);
    assert.equal(secondState.body.skipped, false);
    assert.equal(secondState.body.showWelcome, true);

    firstState = await first.patch("/api/onboarding").send({ action: "resume" }).expect(200);
    assert.equal(firstState.body.skipped, false);
    assert.equal(firstState.body.showChecklist, true);
    assert.equal(firstState.body.showWelcome, false);
    await first.patch("/api/onboarding").send({ action: "unsupported" }).expect(400);
});
