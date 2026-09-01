function average(values) {
    return values.length
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
        : null;
}

function trendFor(attempts) {
    if (attempts.length < 3) return { direction: "insufficient_data", change: null };
    const change = Number((average(attempts.slice(0, 2).map(item => item.score)) -
        average(attempts.slice(2, 4).map(item => item.score))).toFixed(1));
    return { direction: change >= 5 ? "improving" : change <= -5 ? "declining" : "steady", change };
}

function latestDate(values) {
    return values.filter(Boolean).sort().at(-1) || null;
}

function createProgressService({ coursesService, progressRepository, examPlansRepository }) {
    function courseCard(snapshot, course) {
        const attempts = snapshot.attempts.filter(item => item.courseId === course.courseId);
        const cards = snapshot.flashcards.filter(item => item.courseId === course.courseId);
        const materials = snapshot.materials.filter(item => item.courseId === course.courseId);
        const reviewed = cards.filter(card => card.correctCount + card.incorrectCount > 0);
        return {
            ...course,
            attemptCount: attempts.length,
            averageScore: average(attempts.map(item => item.score)),
            latestScore: attempts[0]?.score ?? null,
            trend: trendFor(attempts),
            flashcardsReviewed: reviewed.length,
            flashcardReviewCount: cards.reduce((sum, card) => sum + card.correctCount + card.incorrectCount, 0),
            lowMasteryFlashcards: reviewed.filter(card => card.masteryLevel <= 2).length,
            unseenFlashcards: cards.length - reviewed.length,
            studiedMaterialCount: materials.filter(material =>
                material.quizCount + material.flashcardCount + material.studyGuideCount + material.askNotesCount > 0
            ).length,
            materialCount: materials.length,
            recentActivityAt: latestDate([
                ...attempts.map(item => item.createdAt),
                ...cards.map(item => item.lastReviewedAt),
                ...snapshot.guides.filter(item => item.courseId === course.courseId).map(item => item.createdAt),
                ...snapshot.conversations.filter(item => item.courseId === course.courseId).map(item => item.updatedAt)
            ])
        };
    }

    function compatibility(snapshot) {
        const courseMap = new Map(snapshot.courses.map(course => [course.courseId, course]));
        return {
            totalAttempts: snapshot.attempts.length,
            averageScore: average(snapshot.attempts.map(item => item.score)),
            recentScores: snapshot.attempts.slice(0, 10).map(item => ({
                attemptId: item.attemptId, quizId: item.quizId, courseId: item.courseId,
                courseCode: courseMap.get(item.courseId)?.courseCode,
                score: item.score, createdAt: item.createdAt
            })),
            scoreTrend: [...snapshot.attempts].reverse().slice(-10).map(item => ({
                attemptId: item.attemptId, score: item.score, createdAt: item.createdAt
            })),
            courses: snapshot.courses.map(course => courseCard(snapshot, course)),
            recentActivity: snapshot.attempts.slice(0, 10).map(item => ({
                attemptId: item.attemptId, quizId: item.quizId, score: item.score,
                createdAt: item.createdAt, courseId: item.courseId,
                courseCode: courseMap.get(item.courseId)?.courseCode,
                questionCount: item.quiz.questions?.length || 0
            }))
        };
    }

    function materialView(material, snapshot, plan, courseId) {
        const attempts = snapshot.attempts.filter(item => item.materialIds.includes(material.id));
        const cards = snapshot.flashcards.filter(item => item.materialIds.includes(material.id));
        const reviewed = cards.filter(card => card.correctCount + card.incorrectCount > 0);
        const quizAverage = average(attempts.map(item => item.score));
        const lowMastery = reviewed.filter(card => card.masteryLevel <= 2).length;
        const used = material.quizCount + material.flashcardCount + material.studyGuideCount +
            material.askNotesCount > 0 || plan.materialIds.includes(material.id) ||
            plan.sourceMaterialIds.includes(material.id);
        let coverage = used ? "activity_recorded" : "not_studied";
        if ((quizAverage !== null && quizAverage < 70) || lowMastery > 0) coverage = "needs_review";
        else if (quizAverage !== null && quizAverage >= 80 &&
            (!cards.length || reviewed.every(card => card.masteryLevel >= 3))) coverage = "performing_well";
        return {
            ...material, coverage,
            quiz: { attempts: attempts.length, averageScore: quizAverage },
            flashcards: {
                total: cards.length, reviewed: reviewed.length,
                reviewCount: cards.reduce((sum, card) => sum + card.correctCount + card.incorrectCount, 0),
                lowMastery
            },
            usage: {
                quizzes: material.quizCount, studyGuides: material.studyGuideCount,
                flashcards: material.flashcardCount, askMyNotes: material.askNotesCount,
                examScope: plan.materialIds.includes(material.id),
                examSource: plan.sourceMaterialIds.includes(material.id)
            },
            actions: {
                material: `material.html?courseId=${courseId}&materialId=${material.id}`,
                quiz: `quiz.html?courseId=${courseId}&materialId=${material.id}`,
                flashcards: `flashcards.html?courseId=${courseId}&materialId=${material.id}`
            }
        };
    }

    return {
        overall(userId) {
            return compatibility(progressRepository.snapshot(userId));
        },
        course(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            const snapshot = progressRepository.snapshot(userId, courseId);
            const base = compatibility(snapshot);
            const rawPlan = examPlansRepository.findOwned(courseId, userId);
            const unitIds = new Set(snapshot.units.map(unit => unit.id));
            const materialIds = new Set(snapshot.materials.map(material => material.id));
            const plan = {
                ...rawPlan,
                unitIds: rawPlan.unitIds.filter(id => unitIds.has(id)),
                materialIds: rawPlan.materialIds.filter(id => materialIds.has(id)),
                sourceMaterialIds: rawPlan.sourceMaterialIds.filter(id => materialIds.has(id))
            };
            const materials = snapshot.materials.map(material => materialView(material, snapshot, plan, courseId));
            const units = snapshot.units.map(unit => {
                const unitMaterials = materials.filter(material => material.unitId === unit.id);
                const linked = new Set(unitMaterials.map(material => material.id));
                const attempts = snapshot.attempts.filter(item => item.materialIds.some(id => linked.has(id)));
                const cards = snapshot.flashcards.filter(item => item.materialIds.some(id => linked.has(id)));
                return {
                    ...unit, materials: unitMaterials,
                    quizAttempts: attempts.length,
                    quizAverage: average(attempts.map(item => item.score)),
                    reviewedFlashcards: cards.filter(card => card.correctCount + card.incorrectCount > 0).length,
                    lowMasteryFlashcards: cards.filter(card =>
                        card.correctCount + card.incorrectCount > 0 && card.masteryLevel <= 2
                    ).length
                };
            });
            const insights = [];
            const trend = trendFor(snapshot.attempts);
            if (trend.direction === "improving") insights.push("Your recent quiz scores are improving.");
            if (trend.direction === "declining") insights.push("Your recent quiz scores have declined; review recent misses before the next attempt.");
            const weakUnit = units.filter(unit => (unit.quizAverage ?? 100) < 70 || unit.lowMasteryFlashcards > 0)
                .sort((a, b) => (a.quizAverage ?? 101) - (b.quizAverage ?? 101))[0];
            if (weakUnit) insights.push(`${weakUnit.name} currently has your clearest recorded review need.`);
            const unstudied = materials.find(material => material.coverage === "not_studied");
            if (unstudied) insights.push(`You have not used ${unstudied.name} in a study tool yet.`);
            const cards = snapshot.flashcards;
            const reviewed = cards.filter(card => card.correctCount + card.incorrectCount > 0);
            const timeline = [
                ...snapshot.attempts.map(item => ({ type: "quiz", label: `Quiz ${item.score}%`, createdAt: item.createdAt, href: `quiz.html?courseId=${courseId}&quizId=${item.quizId}` })),
                ...cards.filter(card => card.lastReviewedAt).map(card => ({ type: "flashcard", label: `Reviewed: ${card.front}`, createdAt: card.lastReviewedAt, href: `flashcards.html?courseId=${courseId}` })),
                ...snapshot.guides.map(item => ({ type: "study_guide", label: "Generated a study guide", createdAt: item.createdAt, href: `history.html?courseId=${courseId}` })),
                ...snapshot.conversations.map(item => ({ type: "ask_notes", label: "Asked My Notes", createdAt: item.updatedAt, href: `notes.html?courseId=${courseId}` }))
            ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 12);
            return {
                ...base, course: snapshot.courses[0], summary: base.courses[0], insights,
                examPlan: plan, units,
                unassignedMaterials: materials.filter(material => material.unitId === null),
                weakMaterials: materials.filter(material => material.coverage === "needs_review"),
                recentQuizAttempts: snapshot.attempts.slice(0, 10).map(item => ({
                    attemptId: item.attemptId, quizId: item.quizId, score: item.score,
                    correct: item.results?.correct ?? item.answers.filter(answer => answer.correct).length,
                    total: item.results?.total ?? item.quiz.questions?.length ?? 0,
                    createdAt: item.createdAt, materialIds: item.materialIds,
                    href: `quiz.html?courseId=${courseId}&quizId=${item.quizId}`
                })),
                flashcards: {
                    total: cards.length, reviewed: reviewed.length, unseen: cards.length - reviewed.length,
                    lowMastery: reviewed.filter(card => card.masteryLevel <= 2).length,
                    developing: reviewed.filter(card => card.masteryLevel === 3).length,
                    strong: reviewed.filter(card => card.masteryLevel >= 4).length
                },
                recentStudyActivity: timeline,
                attributionNote: "Quiz results are attributed to the quiz's source materials; individual questions are not linked to a single source."
            };
        }
    };
}

module.exports = { average, createProgressService, trendFor };
