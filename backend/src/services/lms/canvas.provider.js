const { AppError } = require("../../utils/app-error");

const MAX_PAGES = 100;

function safeBase(value) {
    let url;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new AppError({ code: "LMS_CONFIGURATION_ERROR", message: "Canvas URL is invalid.", status: 400 });
    }
    if (url.protocol !== "https:" && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url.href)) {
        throw new AppError({ code: "LMS_CONFIGURATION_ERROR", message: "Canvas must use HTTPS.", status: 400 });
    }
    return url.origin;
}

function stripHtml(value = "") {
    return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

function nextPage(linkHeader, origin) {
    const match = String(linkHeader || "").match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (!match) return null;
    const next = new URL(match[1]);
    if (next.origin !== origin) {
        throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas returned an unsafe pagination link.", status: 502 });
    }
    return next.href;
}

function submissionStatus(assignment) {
    const submission = assignment.submission;
    if (submission?.missing || submission?.late_policy_status === "missing") return "missing";
    if (submission?.late || submission?.late_policy_status === "late") return "late";
    if (["graded", "pending_review", "submitted"].includes(submission?.workflow_state)) {
        return submission.workflow_state;
    }
    if (submission?.submitted_at) return "submitted";
    return "unsubmitted";
}

function safeExternalUrl(value, origin) {
    if (typeof value !== "string") return null;
    try {
        const url = new URL(value);
        return url.origin === origin ? url.href : null;
    } catch (_error) {
        return null;
    }
}

function createCanvasProvider({
    baseUrl,
    accessToken,
    refreshAccessToken,
    fetchImpl = fetch,
    maxPages = MAX_PAGES
}) {
    const origin = safeBase(baseUrl);
    let currentAccessToken = accessToken;

    async function request(url, canRefresh = true) {
        let response;
        try {
            response = await fetchImpl(url, {
                headers: {
                    Authorization: `Bearer ${currentAccessToken}`,
                    Accept: "application/json+canvas-string-ids"
                }
            });
        } catch (_error) {
            throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas is temporarily unavailable.", status: 502 });
        }
        if (response.status === 401 && canRefresh && refreshAccessToken) {
            currentAccessToken = await refreshAccessToken();
            return request(url, false);
        }
        if (response.status === 401) {
            throw new AppError({ code: "LMS_AUTH_EXPIRED", message: "Canvas connection expired. Reconnect Canvas.", status: 401 });
        }
        if (response.status === 403) {
            throw new AppError({ code: "LMS_FORBIDDEN", message: "Canvas did not allow access to this course.", status: 403 });
        }
        if (response.status === 404) {
            throw new AppError({ code: "LMS_NOT_FOUND", message: "This Canvas course is no longer available.", status: 404 });
        }
        if (response.status === 429) {
            throw new AppError({ code: "LMS_RATE_LIMITED", message: "Canvas rate limit reached. Try again later.", status: 503 });
        }
        if (!response.ok) {
            throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas is temporarily unavailable.", status: 502 });
        }
        return response;
    }

    async function getAll(path) {
        let url = `${origin}${path}`;
        const rows = [];
        let pages = 0;
        while (url) {
            pages += 1;
            if (pages > maxPages) {
                throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas returned too many result pages.", status: 502 });
            }
            const response = await request(url);
            let page;
            try {
                page = await response.json();
            } catch (_error) {
                throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas returned an invalid response.", status: 502 });
            }
            if (!Array.isArray(page)) {
                throw new AppError({ code: "LMS_PROVIDER_ERROR", message: "Canvas returned an invalid response.", status: 502 });
            }
            rows.push(...page);
            url = nextPage(response.headers?.get?.("link"), origin);
        }
        return rows;
    }

    return {
        provider: "canvas",

        async listCourses() {
            const rows = await getAll("/api/v1/courses?enrollment_type=student&enrollment_state=active&include[]=term&per_page=100");
            return rows.filter(course => course.id && course.name).map(course => ({
                externalId: String(course.id),
                name: String(course.name).slice(0, 200),
                code: String(course.course_code || "").slice(0, 80),
                term: String(course.term?.name || "").slice(0, 120)
            }));
        },

        async listAssignments(externalCourseId) {
            const rows = await getAll(`/api/v1/courses/${encodeURIComponent(externalCourseId)}/assignments?include[]=submission&per_page=100`);
            return rows.map(assignment => this.normalizeTask(assignment, externalCourseId)).filter(Boolean);
        },

        normalizeTask(assignment, courseId) {
            if (!assignment.id || !assignment.due_at || Number.isNaN(Date.parse(assignment.due_at))) return null;
            const submissionTypes = Array.isArray(assignment.submission_types) ? assignment.submission_types : [];
            const quiz = Boolean(assignment.quiz_id) || submissionTypes.includes("online_quiz");
            return {
                externalId: String(assignment.id),
                externalCourseId: String(courseId),
                title: String(assignment.name || "Untitled assignment").slice(0, 200),
                type: quiz ? "quiz" : "assignment",
                description: stripHtml(assignment.description),
                dueAt: new Date(assignment.due_at).toISOString(),
                startAt: assignment.unlock_at && !Number.isNaN(Date.parse(assignment.unlock_at))
                    ? new Date(assignment.unlock_at).toISOString()
                    : null,
                externalUrl: safeExternalUrl(assignment.html_url, origin),
                externalUpdatedAt: assignment.updated_at && !Number.isNaN(Date.parse(assignment.updated_at))
                    ? new Date(assignment.updated_at).toISOString()
                    : null,
                externalStatus: submissionStatus(assignment),
                externalSubmissionType: String(assignment.submission?.submission_type || submissionTypes[0] || "").slice(0, 50) || null
            };
        }
    };
}

module.exports = { createCanvasProvider, safeBase, nextPage, submissionStatus, safeExternalUrl };
