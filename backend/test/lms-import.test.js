const test=require("node:test"),assert=require("node:assert/strict"),supertest=require("supertest");
const {createTestApp,authenticatedRequest}=require("./helpers/test-app");
function setup(){let revision=0,fail=false;return{provider:{async listCourses(){return[{externalId:"canvas-course-1",name:"Economics",code:"ECON 388",term:"Fall 2026"}]},async listAssignments(){if(fail)throw Error("Provider unavailable");return[{externalId:"a1",externalCourseId:"canvas-course-1",title:"Problem Set",type:"assignment",description:"Practice",dueAt:revision?"2026-10-02T05:59:00.000Z":"2026-09-20T05:59:00.000Z",startAt:null,externalUrl:"https://canvas.test/a1",externalUpdatedAt:revision?"2026-09-10T00:00:00.000Z":"2026-09-01T00:00:00.000Z",externalStatus:"available"},{externalId:"q1",externalCourseId:"canvas-course-1",title:"Quiz",type:"quiz",description:"",dueAt:"2026-09-25T18:00:00.000Z",startAt:null,externalUrl:"https://canvas.test/q1",externalUpdatedAt:null,externalStatus:"submitted"},null]}},setRevision(v){revision=v},setFail(v){fail=v}}}
async function connect(ctx){return(await authenticatedRequest(ctx.app).post("/api/lms/test-connect").send({accessToken:"secret-token",baseUrl:"https://canvas.test"}).expect(201)).body}
test("Canvas discovery, mapping, idempotent sync, changed dates, malformed rows, and partial failure",async t=>{const fake=setup(),ctx=createTestApp({config:{environment:"test"},lmsProviderRegistry:{create(){return fake.provider}}});t.after(ctx.cleanup);const c=await connect(ctx);assert.equal((await authenticatedRequest(ctx.app).get(`/api/lms/${c.id}/courses`).expect(200)).body[0].externalId,"canvas-course-1");await authenticatedRequest(ctx.app).put(`/api/lms/${c.id}/mappings`).send({mappings:[{externalCourseId:"canvas-course-1",externalCourseName:"Economics",courseId:1}]}).expect(200);let result=(await authenticatedRequest(ctx.app).post(`/api/lms/${c.id}/sync`).expect(200)).body;assert.equal(result.created,2);assert.equal(result.skipped,1);assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks")).body.length,2);result=(await authenticatedRequest(ctx.app).post(`/api/lms/${c.id}/sync`).expect(200)).body;assert.equal(result.created,0);fake.setRevision(1);result=(await authenticatedRequest(ctx.app).post(`/api/lms/${c.id}/sync`).expect(200)).body;assert.equal(result.updated,1);assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks")).body.find(x=>x.externalId==="a1").dueAt,"2026-10-02T05:59:00.000Z");await authenticatedRequest(ctx.app).post("/api/courses/1/tasks").send({title:"Manual",type:"assignment",dueAt:"2026-09-30T00:00:00.000Z"}).expect(201);fake.setFail(true);result=(await authenticatedRequest(ctx.app).post(`/api/lms/${c.id}/sync`).expect(200)).body;assert.equal(result.failedCourses.length,1);assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks")).body.some(x=>x.title==="Manual"),true)});
test("connections are isolated and disconnected providers cannot sync",async t=>{const fake=setup(),ctx=createTestApp({config:{environment:"test"},lmsProviderRegistry:{create(){return fake.provider}}});t.after(ctx.cleanup);const c=await connect(ctx),other=supertest.agent(ctx.app);await other.post("/api/auth/register").send({name:"Other",email:"lms-other@example.com",password:"StrongPass123!"}).expect(201);assert.equal((await other.get("/api/lms").expect(200)).body.connections.length,0);await other.get(`/api/lms/${c.id}/courses`).expect(404);await authenticatedRequest(ctx.app).delete(`/api/lms/${c.id}`).expect(200);await authenticatedRequest(ctx.app).post(`/api/lms/${c.id}/sync`).expect(404)});

test("expired access tokens refresh before discovery and replacements remain encrypted", async t => {
    const now = Date.parse("2026-09-10T18:00:00.000Z");
    const seenTokens = [];
    let refreshes = 0;
    const ctx = createTestApp({
        config: { environment: "test" },
        lmsClock: () => now,
        canvasOAuthClient: {
            async refresh(token) {
                refreshes += 1;
                assert.equal(token, "refresh-secret");
                return {
                    accessToken: "replacement-access",
                    refreshToken: null,
                    tokenExpiresAt: new Date(now + 3600000).toISOString()
                };
            },
            async revoke() { return true; }
        },
        lmsProviderRegistry: {
            create(_connection, accessToken) {
                seenTokens.push(accessToken);
                return { async listCourses() { return []; } };
            }
        }
    });
    t.after(ctx.cleanup);
    const connection = (await authenticatedRequest(ctx.app).post("/api/lms/test-connect").send({
        baseUrl: "https://canvas.test",
        accessToken: "expired-access",
        refreshToken: "refresh-secret",
        tokenExpiresAt: new Date(now - 1000).toISOString()
    }).expect(201)).body;
    await authenticatedRequest(ctx.app).get(`/api/lms/${connection.id}/courses`).expect(200);
    assert.equal(refreshes, 1);
    assert.deepEqual(seenTokens, ["replacement-access"]);
    const saved = ctx.database.prepare("SELECT access_token_encrypted, refresh_token_encrypted FROM lms_connections WHERE id = ?").get(connection.id);
    assert.equal(JSON.stringify(saved).includes("replacement-access"), false);
    assert.equal(JSON.stringify(saved).includes("refresh-secret"), false);
});

test("failed refresh marks the connection for reconnection and stops sync", async t => {
    const now = Date.parse("2026-09-10T18:00:00.000Z");
    const ctx = createTestApp({
        config: { environment: "test" },
        lmsClock: () => now,
        canvasOAuthClient: {
            async refresh() { throw new Error("sensitive provider response"); },
            async revoke() { return false; }
        },
        lmsProviderRegistry: { create() { throw new Error("provider must not be created"); } }
    });
    t.after(ctx.cleanup);
    const connection = (await authenticatedRequest(ctx.app).post("/api/lms/test-connect").send({
        accessToken: "expired",
        refreshToken: "bad-refresh",
        tokenExpiresAt: new Date(now - 1).toISOString()
    }).expect(201)).body;
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({
        mappings: [{ externalCourseId: "canvas-course-1", externalCourseName: "Economics", courseId: 1 }]
    }).expect(200);
    const result = await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    assert.equal(result.body.reconnectRequired, true);
    assert.equal(result.body.connectionStatus, "expired");
    assert.equal(JSON.stringify(result.body).includes("sensitive provider response"), false);
    assert.equal(ctx.database.prepare("SELECT status FROM lms_connections WHERE id = ?").get(connection.id).status, "expired");
});

test("deselecting a mapping hides its imported tasks without deleting them", async t => {
    const fake = setup();
    const ctx = createTestApp({ config: { environment: "test" }, lmsProviderRegistry: { create() { return fake.provider; } } });
    t.after(ctx.cleanup);
    const connection = await connect(ctx);
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({
        mappings: [{ externalCourseId: "canvas-course-1", externalCourseName: "Economics", courseId: 1 }]
    }).expect(200);
    await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({ mappings: [] }).expect(200);
    assert.equal((await authenticatedRequest(ctx.app).get(`/api/lms/${connection.id}/mappings`).expect(200)).body.length, 0);
    assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks").expect(200)).body.length, 0);
    const stored = ctx.database.prepare("SELECT removed_at, external_status FROM course_tasks WHERE external_id = 'a1'").get();
    assert.ok(stored.removed_at);
    assert.equal(stored.external_status, "unmapped");
});

test("disconnect revokes when possible, clears credentials, and preserves imported tasks", async t => {
    const fake = setup();
    const revoked = [];
    const ctx = createTestApp({
        config: { environment: "test" },
        canvasOAuthClient: {
            async refresh() { throw new Error("not expected"); },
            async revoke(token) { revoked.push(token); return true; }
        },
        lmsProviderRegistry: { create() { return fake.provider; } }
    });
    t.after(ctx.cleanup);
    const connection = await connect(ctx);
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({
        mappings: [{ externalCourseId: "canvas-course-1", externalCourseName: "Economics", courseId: 1 }]
    }).expect(200);
    await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    const response = await authenticatedRequest(ctx.app).delete(`/api/lms/${connection.id}`).expect(200);
    assert.deepEqual(revoked, ["secret-token"]);
    assert.equal(response.body.tokenRevoked, true);
    assert.equal(response.body.importedTasksRemain, true);
    const saved = ctx.database.prepare("SELECT status, access_token_encrypted, refresh_token_encrypted FROM lms_connections WHERE id = ?").get(connection.id);
    assert.deepEqual(saved, { status: "disconnected", access_token_encrypted: "", refresh_token_encrypted: null });
    assert.equal(ctx.database.prepare("SELECT COUNT(*) count FROM course_tasks").get().count, 2);
});

test("assignments removed from Canvas are marked unavailable rather than deleted", async t => {
    let removed = false;
    const provider = {
        async listCourses() { return []; },
        async listAssignments() {
            return removed ? [] : [{
                externalId: "remote-a1",
                externalCourseId: "canvas-course-1",
                title: "Remote assignment",
                type: "assignment",
                description: "",
                dueAt: "2026-09-20T18:00:00.000Z",
                startAt: null,
                externalUrl: "https://canvas.test/a1",
                externalStatus: "unsubmitted",
                externalSubmissionType: "online_upload",
                externalUpdatedAt: null
            }];
        }
    };
    const ctx = createTestApp({ config: { environment: "test" }, lmsProviderRegistry: { create() { return provider; } } });
    t.after(ctx.cleanup);
    const connection = await connect(ctx);
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({
        mappings: [{ externalCourseId: "canvas-course-1", externalCourseName: "Economics", courseId: 1 }]
    }).expect(200);
    await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    removed = true;
    const result = await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    assert.equal(result.body.removed, 1);
    assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks").expect(200)).body.length, 0);
    const stored = ctx.database.prepare("SELECT removed_at, external_status FROM course_tasks WHERE external_id = 'remote-a1'").get();
    assert.ok(stored.removed_at);
    assert.equal(stored.external_status, "removed");
});

test("one failed Canvas course preserves successful imports and marks the sync failed", async t => {
    const provider = {
        async listCourses() { return []; },
        async listAssignments(externalCourseId) {
            if (externalCourseId === "canvas-course-2") throw new Error("private provider detail");
            return [{
                externalId: "success-a1",
                externalCourseId,
                title: "Successful assignment",
                type: "assignment",
                description: "",
                dueAt: "2026-09-20T18:00:00.000Z",
                startAt: null,
                externalUrl: "https://canvas.test/a1",
                externalStatus: "unsubmitted",
                externalSubmissionType: null,
                externalUpdatedAt: null
            }];
        }
    };
    const ctx = createTestApp({ config: { environment: "test" }, lmsProviderRegistry: { create() { return provider; } } });
    t.after(ctx.cleanup);
    const connection = await connect(ctx);
    const second = await authenticatedRequest(ctx.app).post("/api/courses").send({
        courseName: "Second Course",
        courseCode: "SECOND 1",
        semester: "Fall 2026"
    }).expect(201);
    await authenticatedRequest(ctx.app).put(`/api/lms/${connection.id}/mappings`).send({ mappings: [
        { externalCourseId: "canvas-course-1", externalCourseName: "Economics", courseId: 1 },
        { externalCourseId: "canvas-course-2", externalCourseName: "Second", courseId: second.body.id }
    ] }).expect(200);
    const result = await authenticatedRequest(ctx.app).post(`/api/lms/${connection.id}/sync`).expect(200);
    assert.equal(result.body.created, 1);
    assert.equal(result.body.failedCourses.length, 1);
    assert.equal(result.body.connectionStatus, "error");
    assert.equal(JSON.stringify(result.body).includes("private provider detail"), false);
    assert.equal((await authenticatedRequest(ctx.app).get("/api/tasks").expect(200)).body.some(task => task.externalId === "success-a1"), true);
});
