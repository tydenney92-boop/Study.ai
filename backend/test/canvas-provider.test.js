const test=require("node:test"),assert=require("node:assert/strict"),{createCanvasProvider,safeBase}=require("../src/services/lms/canvas.provider");
test("Canvas provider normalizes courses, quizzes, submission state, and skips undated work",async()=>{const requests=[],provider=createCanvasProvider({baseUrl:"https://school.instructure.com",accessToken:"hidden",fetchImpl:async(url,options)=>{requests.push({url,options});return{ok:true,status:200,async json(){return url.includes("assignments")?[{id:"9",name:"Check-in",due_at:"2026-09-11T23:00:00-06:00",quiz_id:"2",description:"<p>Review</p>",html_url:"https://school.instructure.com/a/9",submission:{submitted_at:"2026-09-10T00:00:00Z"}},{id:"10",name:"No date",due_at:null}]:[{id:"7",name:"Statistics",course_code:"STAT"}]}}}});assert.equal((await provider.listCourses())[0].externalId,"7");const tasks=await provider.listAssignments("7");assert.equal(tasks.length,1);assert.equal(tasks[0].type,"quiz");assert.equal(tasks[0].externalStatus,"submitted");assert.equal(tasks[0].description,"Review");assert.equal(requests[0].options.headers.Authorization,"Bearer hidden")});
test("Canvas URL validation requires HTTPS outside local development",()=>{assert.throws(()=>safeBase("http://canvas.example.edu"));assert.equal(safeBase("https://canvas.example.edu/path"),"https://canvas.example.edu")});

test("Canvas follows same-origin Link pagination for courses and assignments", async () => {
    const requests = [];
    const fetchImpl = async url => {
        requests.push(String(url));
        const parsed = new URL(url);
        const page = parsed.searchParams.get("page") || "1";
        const assignment = parsed.pathname.includes("assignments");
        const rows = assignment
            ? [{ id: `a${page}`, name: `Assignment ${page}`, due_at: "2026-09-20T18:00:00Z", submission_types: ["online_upload"] }]
            : [{ id: `c${page}`, name: `Course ${page}`, course_code: `C${page}`, term: { name: "Fall 2026" } }];
        return {
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    return name.toLowerCase() === "link" && page === "1"
                        ? `<https://school.instructure.com${parsed.pathname}?page=2>; rel="next"`
                        : null;
                }
            },
            async json() { return rows; }
        };
    };
    const provider = createCanvasProvider({
        baseUrl: "https://school.instructure.com",
        accessToken: "hidden",
        fetchImpl
    });
    assert.equal((await provider.listCourses()).length, 2);
    assert.equal((await provider.listAssignments("c1")).length, 2);
    assert.equal(requests.length, 4);
    assert.match(requests[0], /enrollment_type=student/);
    assert.match(requests[0], /enrollment_state=active/);
});

test("Canvas rejects cross-origin pagination before forwarding the bearer token", async () => {
    const provider = createCanvasProvider({
        baseUrl: "https://school.instructure.com",
        accessToken: "hidden",
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: { get() { return '<https://attacker.example/api?page=2>; rel="next"'; } },
            async json() { return []; }
        })
    });
    await assert.rejects(() => provider.listCourses(), error => error.code === "LMS_PROVIDER_ERROR");
});

test("Canvas refreshes once after a 401 and retries the original request once", async () => {
    const authorizations = [];
    let refreshes = 0;
    const provider = createCanvasProvider({
        baseUrl: "https://school.instructure.com",
        accessToken: "expired-access",
        async refreshAccessToken() { refreshes += 1; return "fresh-access"; },
        fetchImpl: async (_url, options) => {
            authorizations.push(options.headers.Authorization);
            if (authorizations.length === 1) return { ok: false, status: 401, headers: { get() { return null; } } };
            return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return []; } };
        }
    });
    await provider.listCourses();
    assert.equal(refreshes, 1);
    assert.deepEqual(authorizations, ["Bearer expired-access", "Bearer fresh-access"]);
});

test("Canvas submission state remains distinct and quiz classification uses reliable fields", () => {
    const provider = createCanvasProvider({ baseUrl: "https://school.instructure.com", accessToken: "hidden" });
    const base = { id: "1", name: "Final exam maybe", due_at: "2026-09-20T18:00:00Z", html_url: "https://school.instructure.com/courses/1/assignments/1" };
    assert.equal(provider.normalizeTask({ ...base, submission: { missing: true } }, "1").externalStatus, "missing");
    assert.equal(provider.normalizeTask({ ...base, submission: { late: true } }, "1").externalStatus, "late");
    assert.equal(provider.normalizeTask({ ...base, submission: { workflow_state: "graded" } }, "1").externalStatus, "graded");
    assert.equal(provider.normalizeTask(base, "1").type, "assignment");
    const quiz = provider.normalizeTask({ ...base, quiz_id: "4", submission_types: ["online_quiz"] }, "1");
    assert.equal(quiz.type, "quiz");
    assert.equal(quiz.externalSubmissionType, "online_quiz");
});

test("Canvas maps authorization, permission, missing-course, rate-limit, and provider failures safely", async t => {
    const cases = [
        [401, "LMS_AUTH_EXPIRED"],
        [403, "LMS_FORBIDDEN"],
        [404, "LMS_NOT_FOUND"],
        [429, "LMS_RATE_LIMITED"],
        [503, "LMS_PROVIDER_ERROR"]
    ];
    for (const [status, code] of cases) {
        await t.test(String(status), async () => {
            const provider = createCanvasProvider({
                baseUrl: "https://school.instructure.com",
                accessToken: "hidden",
                fetchImpl: async () => ({ ok: false, status, headers: { get() { return null; } } })
            });
            await assert.rejects(() => provider.listCourses(), error => error.code === code);
        });
    }
});
