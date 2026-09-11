const STEP_DEFINITIONS = [
    { id: "course", title: "Create your first course", actionLabel: "Create Course" },
    { id: "syllabus", title: "Upload your syllabus", actionLabel: "Upload Syllabus" },
    { id: "deadlines", title: "Import assignments and exams", actionLabel: "Import Deadlines" },
    { id: "materials", title: "Upload notes or slides", actionLabel: "Add Materials" },
    { id: "study", title: "Try a study tool", actionLabel: "Practice Quiz" },
    { id: "today", title: "View your Today plan", actionLabel: "Open Today" }
];

function createOnboardingService({
    onboardingRepository, coursesService, progressRepository, tasksRepository, quizzesRepository
}) {
    function status(userId) {
        const preferences = onboardingRepository.find(userId);
        const courses = coursesService.list(userId);
        const snapshot = progressRepository.snapshot(userId);
        const tasks = tasksRepository.listOwned(userId, {});
        const syllabus = snapshot.materials.find(material =>
            material.extractionStatus === "extracted" && material.materialRole === "syllabus"
        );
        const studyMaterial = snapshot.materials.find(material =>
            material.extractionStatus === "extracted" && material.materialRole !== "syllabus"
        );
        const importedDeadline = tasks.find(task => task.scheduleSourceMaterialId !== null);
        const generatedQuiz = courses.some(course => quizzesRepository.listOwned(course.id, userId).length > 0);
        const hasStudyActivity = generatedQuiz || snapshot.attempts.length > 0 ||
            snapshot.flashcards.length > 0 || snapshot.guides.length > 0;
        const fallbackCourse = courses[0] || null;
        const syllabusCourse = syllabus
            ? courses.find(course => course.id === syllabus.courseId) || fallbackCourse
            : fallbackCourse;
        const materialCourse = studyMaterial
            ? courses.find(course => course.id === studyMaterial.courseId) || fallbackCourse
            : syllabusCourse;
        const completion = {
            course: courses.length > 0,
            syllabus: Boolean(syllabus),
            deadlines: Boolean(importedDeadline),
            materials: Boolean(studyMaterial),
            study: hasStudyActivity,
            today: Boolean(preferences.todayViewedAt)
        };
        const hrefs = {
            course: "index.html?newCourse=1#courses",
            syllabus: fallbackCourse
                ? `materials.html?courseId=${fallbackCourse.id}&upload=1&role=syllabus`
                : "index.html?newCourse=1#courses",
            deadlines: syllabusCourse
                ? `course.html?courseId=${syllabusCourse.id}&importSchedule=1`
                : fallbackCourse
                    ? `materials.html?courseId=${fallbackCourse.id}&upload=1&role=syllabus`
                    : "index.html?newCourse=1#courses",
            materials: syllabusCourse
                ? `materials.html?courseId=${syllabusCourse.id}&upload=1&role=general`
                : "index.html?newCourse=1#courses",
            study: materialCourse
                ? `quiz.html?courseId=${materialCourse.id}${studyMaterial ? `&materialId=${studyMaterial.id}` : ""}`
                : "index.html?newCourse=1#courses",
            today: "today.html"
        };
        const steps = STEP_DEFINITIONS.map(definition => ({
            ...definition,
            completed: completion[definition.id],
            href: hrefs[definition.id]
        }));
        const completedCount = steps.filter(step => step.completed).length;
        const completed = completedCount === steps.length;
        const nextStep = steps.find(step => !step.completed) || null;
        const hasMeaningfulSetup = completedCount > 0;
        return {
            showWelcome: !hasMeaningfulSetup && !preferences.welcomeDismissedAt && !preferences.skippedAt,
            showChecklist: !completed && !preferences.skippedAt,
            showResume: !completed && Boolean(preferences.skippedAt),
            skipped: Boolean(preferences.skippedAt),
            completed,
            completedCount,
            totalSteps: steps.length,
            steps,
            nextStep,
            courseContext: fallbackCourse && {
                id: fallbackCourse.id,
                code: fallbackCourse.courseCode,
                name: fallbackCourse.courseName
            }
        };
    }

    return {
        status,
        update(userId, action) {
            if (action === "dismiss_welcome") onboardingRepository.dismissWelcome(userId);
            else if (action === "skip") onboardingRepository.skip(userId);
            else if (action === "resume") onboardingRepository.resume(userId);
            else if (action === "view_today") onboardingRepository.markTodayViewed(userId);
            else return null;
            return status(userId);
        }
    };
}

module.exports = { STEP_DEFINITIONS, createOnboardingService };
