const DAY_MS = 86_400_000;
const DEFAULT_MINUTES = 45;

function daysUntil(value, now = new Date(), timezoneOffset = 0) {
    const target = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(target.getTime())) return null;
    const shift = Number(timezoneOffset || 0) * 60_000;
    const targetLocal = new Date(target.getTime() - shift);
    const nowLocal = new Date(now.getTime() - shift);
    const targetDay = Date.UTC(targetLocal.getUTCFullYear(), targetLocal.getUTCMonth(), targetLocal.getUTCDate());
    const currentDay = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate());
    return Math.round((targetDay - currentDay) / DAY_MS);
}

function recencyDays(value, now, timezoneOffset = 0) {
    if (!value) return null;
    const difference = daysUntil(now, new Date(value), timezoneOffset);
    return difference === null ? null : Math.max(0, difference);
}

function examUrgency(days) {
    if (days === null || days < 0) return 0;
    if (days <= 1) return 48;
    if (days <= 3) return 38;
    if (days <= 7) return 27;
    if (days <= 14) return 15;
    if (days <= 21) return 7;
    return 0;
}

function taskUrgency(days) {
    if (days === null) return 0;
    if (days < 0) return 95 + Math.min(Math.abs(days), 10);
    if (days === 0) return 88;
    if (days === 1) return 74;
    if (days <= 3) return 58;
    if (days <= 7) return 38;
    if (days <= 14) return 20;
    return 0;
}

function dueReason(days, label = "Due") {
    if (days === null) return null;
    if (days < 0) return `${label} ${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
    if (days === 0) return `${label} today`;
    if (days === 1) return `${label} in 1 day`;
    return `${label} in ${days} days`;
}

function stablePart(value) {
    let hash = 0;
    for (const character of String(value || "")) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash.toString(36);
}

function dateOnlyAtLocalNoon(value, timezoneOffset) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12) + timezoneOffset * 60_000).toISOString();
}

function profileForAction(action = {}) {
    const href = String(action.href || "");
    if (href.startsWith("quiz.html")) return { kind: "quiz", label: "Practice Quiz", minimum: 15, preferred: 20, maximum: 30 };
    if (href.startsWith("flashcards.html")) return { kind: "flashcards", label: "Review Flashcards", minimum: 10, preferred: 15, maximum: 25 };
    if (href.startsWith("material.html")) return { kind: "material", label: "Review Material", minimum: 10, preferred: 15, maximum: 30 };
    if (href.startsWith("history.html")) return { kind: "study_guide", label: "Open Study Guide", minimum: 15, preferred: 20, maximum: 30 };
    return { kind: "recommendations", label: action.label || "Open What to Study", minimum: 10, preferred: 15, maximum: 25 };
}

function recommendationScore(item, tier, exam, now = new Date(), timezoneOffset = 0) {
    const signals = item.signals || {};
    let score = { focusFirst: 60, reviewNext: 38, keepFresh: 12 }[tier] || 25;
    score += examUrgency(exam?.days ?? null);
    if (signals.explicitExam) score += 20;
    else if (signals.examScoped) score += 12;
    score += Number(signals.quizMisses || 0) * 9;
    if (Number(signals.quizMisses || 0) > 1) score += Math.min(12, (signals.quizMisses - 1) * 4);
    score += Number(signals.flashcardIncorrect || 0) * 5;
    if (signals.hasFlashcard) score += Math.max(0, 4 - Number(signals.bestMastery ?? 5)) * 3;
    if (signals.reviewGap) score += 9;
    const lastStudy = [signals.lastAttemptAt, signals.lastReviewedAt].filter(Boolean).sort().at(-1);
    const age = recencyDays(lastStudy, now, timezoneOffset);
    if (age !== null && age >= 14) score += 9;
    else if (age !== null && age <= 1) score -= 5;
    if (!signals.quizMisses && Number(signals.bestMastery ?? 0) >= 4 && signals.flashcardReviews) score -= 14;
    return score;
}

function allocatePlan(candidates, budgetMinutes, excludedIds = []) {
    const excluded = new Set(excludedIds);
    const remainingCandidates = candidates.filter(item => !excluded.has(item.id) && item.score > 0);
    const selected = [];
    const selectedIds = new Set();
    const courseCounts = new Map();
    let remaining = budgetMinutes;
    const maximumItems = budgetMinutes <= 20 ? 2 : budgetMinutes <= 45 ? 3 : 4;

    while (selected.length < maximumItems) {
        const eligible = remainingCandidates.filter(item =>
            !selectedIds.has(item.id) && item.minimum <= remaining
        );
        if (!eligible.length) break;
        eligible.sort((left, right) => {
            const leftScore = left.score - (courseCounts.get(left.course.id) || 0) * 12;
            const rightScore = right.score - (courseCounts.get(right.course.id) || 0) * 12;
            return rightScore - leftScore || right.score - left.score || left.id.localeCompare(right.id);
        });
        const candidate = eligible[0];
        selected.push({ ...candidate, minutes: candidate.minimum });
        selectedIds.add(candidate.id);
        courseCounts.set(candidate.course.id, (courseCounts.get(candidate.course.id) || 0) + 1);
        remaining -= candidate.minimum;
    }

    function deepen(limitField) {
        for (const activity of [...selected].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
            while (remaining >= 5 && activity.minutes + 5 <= activity[limitField]) {
                activity.minutes += 5;
                remaining -= 5;
            }
        }
    }
    deepen("preferred");
    deepen("maximum");
    return selected.map(({ score, minimum, preferred, maximum, ...activity }, index) => ({
        ...activity, rank: index + 1
    }));
}

function createDailyPlanService({
    coursesService, tasksRepository, progressRepository, recommendationsService,
    clock = () => new Date(), analyticsService
}) {
    return {
        generate(userId, { minutes = DEFAULT_MINUTES, excludedIds = [], timezoneOffset = 0 } = {}) {
            const now = clock();
            const courses = coursesService.list(userId);
            const courseMap = new Map(courses.map(course => [course.id, course]));
            const tasks = tasksRepository.listOwned(userId, { status: "incomplete" });
            const snapshot = progressRepository.snapshot(userId);
            const recommendations = new Map(courses.map(course => [
                course.id, recommendationsService.course(course.id, userId)
            ]));
            const exams = [];

            for (const course of courses) {
                const response = recommendations.get(course.id);
                const taskExam = tasks.filter(task => task.courseId === course.id &&
                    ["exam", "quiz"].includes(task.type) && new Date(task.dueAt) >= now
                ).sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))[0];
                const plannedDate = response.examPlan.examDate;
                const plannedExam = plannedDate ? {
                    title: response.examPlan.examName || "Planned exam",
                    dueAt: dateOnlyAtLocalNoon(plannedDate, timezoneOffset),
                    source: "exam_plan"
                } : null;
                const options = [taskExam && { title: taskExam.title, dueAt: taskExam.dueAt, source: "planner", taskId: taskExam.id }, plannedExam]
                    .filter(Boolean).sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)));
                const nearest = options[0];
                if (!nearest) continue;
                exams.push({
                    id: `exam:${course.id}:${nearest.taskId || stablePart(nearest.title + nearest.dueAt)}`,
                    course: { id: course.id, code: course.courseCode, name: course.courseName },
                    title: nearest.title,
                    dueAt: nearest.dueAt,
                    days: daysUntil(nearest.dueAt, now, timezoneOffset),
                    source: nearest.source,
                    focus: response.sections.focusFirst[0]?.topic || response.sections.reviewNext[0]?.topic || null,
                    href: `recommendations.html?courseId=${course.id}`
                });
            }
            exams.sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)));
            const examMap = new Map(exams.map(exam => [exam.course.id, exam]));
            const candidates = [];

            for (const task of tasks) {
                const course = courseMap.get(task.courseId);
                if (!course) continue;
                const days = daysUntil(task.dueAt, now, timezoneOffset);
                if (["exam", "quiz"].includes(task.type)) continue;
                const score = taskUrgency(days) + (task.priority === "high" ? 10 : task.priority === "low" ? -5 : 0);
                if (score <= 0) continue;
                const estimated = Number(task.estimatedMinutes || 15);
                const preferred = Math.max(10, Math.min(30, Math.round(estimated / 5) * 5));
                candidates.push({
                    id: `task:${task.id}`,
                    type: "task",
                    course: { id: course.id, code: course.courseCode, name: course.courseName },
                    title: task.title,
                    score,
                    minimum: 5,
                    preferred,
                    maximum: Math.max(20, preferred),
                    reasons: [dueReason(days)].filter(Boolean),
                    action: { label: "Work on Assignment", href: `planner.html?courseId=${course.id}` },
                    source: { taskId: task.id, taskType: task.type }
                });
            }

            for (const course of courses) {
                const response = recommendations.get(course.id);
                const exam = examMap.get(course.id);
                for (const [tier, items] of Object.entries(response.sections)) {
                    for (const item of items) {
                        const profile = profileForAction(item.action);
                        const signals = item.signals || {};
                        const reasons = [];
                        if (exam && exam.days >= 0 && exam.days <= 21) reasons.push(dueReason(exam.days, exam.title));
                        if (signals.explicitExam) reasons.push("Listed in a selected exam-planning source");
                        else if (signals.examScoped) reasons.push("Included in your selected exam scope");
                        if (signals.quizMisses) reasons.push(`${signals.quizMisses} recorded quiz miss${signals.quizMisses === 1 ? "" : "es"}`);
                        if (signals.flashcardIncorrect) reasons.push(`${signals.flashcardIncorrect} Still Learning review${signals.flashcardIncorrect === 1 ? "" : "s"}`);
                        else if (signals.hasFlashcard && signals.flashcardReviews === 0) reasons.push("Flashcards not reviewed yet");
                        if (signals.reviewGap) reasons.push("No recorded practice yet");
                        if (!reasons.length) reasons.push(item.reason.replace(/^Based on\s+/i, "").replace(/\.$/, ""));
                        candidates.push({
                            id: `recommendation:${course.id}:${profile.kind}:${stablePart(item.topic)}`,
                            type: profile.kind,
                            course: { id: course.id, code: course.courseCode, name: course.courseName },
                            title: item.topic,
                            score: recommendationScore(item, tier, exam, now, timezoneOffset),
                            minimum: profile.minimum,
                            preferred: profile.preferred,
                            maximum: profile.maximum,
                            reasons: [...new Set(reasons)].slice(0, 3),
                            action: { label: profile.label, href: item.action.href },
                            source: { recommendationTier: tier, materialIds: item.materialIds }
                        });
                    }
                }

                const courseMaterials = snapshot.materials.filter(material => material.courseId === course.id && material.extractionStatus === "extracted");
                const responseMaterialIds = new Set(candidates.filter(candidate => candidate.course.id === course.id)
                    .flatMap(candidate => candidate.source.materialIds || []));
                const examMaterialIds = new Set([
                    ...response.examPlan.materialIds,
                    ...response.examPlan.sourceMaterialIds,
                    ...courseMaterials.filter(material => response.examPlan.unitIds.includes(material.unitId)).map(material => material.id)
                ]);
                for (const material of courseMaterials) {
                    const activityCount = material.quizAttemptCount + material.flashcardReviews + material.studyGuideCount + material.askNotesCount;
                    if (activityCount > 0 || responseMaterialIds.has(material.id)) continue;
                    const selectedForExam = examMaterialIds.has(material.id);
                    candidates.push({
                        id: `material:${course.id}:${material.id}`,
                        type: "material",
                        course: { id: course.id, code: course.courseCode, name: course.courseName },
                        title: material.name,
                        score: 14 + (selectedForExam ? 18 : 0) + examUrgency(exam?.days ?? null),
                        minimum: 10, preferred: 15, maximum: 25,
                        reasons: [selectedForExam ? "Selected in your exam plan" : "No recorded study activity yet"],
                        action: { label: "Review Material", href: `material.html?courseId=${course.id}&materialId=${material.id}` },
                        source: { materialIds: [material.id] }
                    });
                }

                const courseCards = snapshot.flashcards.filter(card => card.courseId === course.id);
                const groupedCards = new Map();
                for (const card of courseCards) {
                    const materialId = card.materialIds[0] || null;
                    if (!groupedCards.has(materialId)) groupedCards.set(materialId, []);
                    groupedCards.get(materialId).push(card);
                }
                for (const [materialId, cards] of groupedCards) {
                    const low = cards.filter(card => card.correctCount + card.incorrectCount > 0 && card.masteryLevel <= 2).length;
                    const unseen = cards.filter(card => card.correctCount + card.incorrectCount === 0).length;
                    if (!low && !unseen) continue;
                    const material = courseMaterials.find(item => item.id === materialId);
                    candidates.push({
                        id: `flashcards:${course.id}:${materialId || "course"}`,
                        type: "flashcards",
                        course: { id: course.id, code: course.courseCode, name: course.courseName },
                        title: `${material?.name || course.courseCode} flashcards`,
                        score: 34 + low * 7 + unseen * 2 + examUrgency(exam?.days ?? null),
                        minimum: 10, preferred: 15, maximum: 25,
                        reasons: [
                            low ? `${low} card${low === 1 ? "" : "s"} still learning` : null,
                            unseen ? `${unseen} card${unseen === 1 ? "" : "s"} not reviewed yet` : null,
                            exam && exam.days <= 14 ? dueReason(exam.days, exam.title) : null
                        ].filter(Boolean),
                        action: { label: "Review Flashcards", href: `flashcards.html?courseId=${course.id}${materialId ? `&materialId=${materialId}` : ""}` },
                        source: { materialIds: materialId ? [materialId] : [] }
                    });
                }

                const guides = snapshot.guides.filter(guide => guide.courseId === course.id);
                if (guides.length && exam && exam.days >= 0 && exam.days <= 14) candidates.push({
                    id: `study-guide:${course.id}:${guides[0].id}`,
                    type: "study_guide",
                    course: { id: course.id, code: course.courseCode, name: course.courseName },
                    title: `${exam.title} study guide`,
                    score: 24 + examUrgency(exam.days),
                    minimum: 15, preferred: 20, maximum: 30,
                    reasons: [dueReason(exam.days, exam.title), "Saved study guide available"],
                    action: { label: "Open Study Guide", href: `history.html?courseId=${course.id}` },
                    source: { studyGuideId: guides[0].id, materialIds: guides[0].materialIds }
                });

                const hasCourseStudyCandidate = candidates.some(candidate => candidate.course.id === course.id && candidate.type !== "task");
                if (exam && !hasCourseStudyCandidate) candidates.push({
                    id: `exam-plan:${course.id}:${stablePart(exam.title + exam.dueAt)}`,
                    type: "recommendations",
                    course: { id: course.id, code: course.courseCode, name: course.courseName },
                    title: `Prepare for ${exam.title}`,
                    score: 30 + examUrgency(exam.days),
                    minimum: 10, preferred: 15, maximum: 25,
                    reasons: [dueReason(exam.days, exam.title)],
                    action: { label: "Open What to Study", href: `recommendations.html?courseId=${course.id}` },
                    source: { examId: exam.id }
                });
            }

            const deduped = [...new Map(candidates.sort((a, b) => b.score - a.score)
                .map(candidate => [candidate.id, candidate])).values()];
            const plan = allocatePlan(deduped, minutes, excludedIds);
            const upcoming = tasks.slice(0, 6).map(task => ({
                id: task.id,
                course: { id: task.courseId, code: task.courseCode, name: task.courseName },
                title: task.title,
                type: task.type,
                dueAt: task.dueAt,
                days: daysUntil(task.dueAt, now, timezoneOffset),
                overdue: new Date(task.dueAt) < now,
                href: ["exam", "quiz"].includes(task.type)
                    ? `recommendations.html?courseId=${task.courseId}`
                    : `planner.html?courseId=${task.courseId}`
            }));
            const firstCourse = courses[0];
            let onboarding = null;
            if (!courses.length) onboarding = {
                title: "Add your first course",
                copy: "Create a course before Study Signal can build an evidence-based plan.",
                action: { label: "Add Course", href: "index.html?newCourse=1#courses" }
            };
            else if (!plan.length) {
                const hasMaterials = snapshot.materials.length > 0;
                onboarding = hasMaterials ? {
                    title: "Create some study evidence",
                    copy: "Take a practice quiz or review flashcards to reveal useful priorities.",
                    action: { label: "Take a Practice Quiz", href: `quiz.html?courseId=${firstCourse.id}` }
                } : {
                    title: "Add course material",
                    copy: "Upload a syllabus or course material so Study Signal has something real to plan from.",
                    action: { label: "Add Materials", href: `materials.html?courseId=${firstCourse.id}&upload=1` }
                };
            }
            const result = {
                generatedAt: now.toISOString(),
                budgetMinutes: minutes,
                allocatedMinutes: plan.reduce((sum, item) => sum + item.minutes, 0),
                upcoming,
                exams: exams.slice(0, 3),
                plan,
                onboarding
            };
            analyticsService?.trackEvent({
                userId,
                eventName: "plan_generated",
                metadata: { minutes, itemCount: plan.length }
            });
            return result;
        }
    };
}

module.exports = {
    DEFAULT_MINUTES,
    allocatePlan,
    createDailyPlanService,
    daysUntil,
    examUrgency,
    recommendationScore,
    taskUrgency
};
