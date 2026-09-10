const { normalizeLexicalText, lexicalTerms } = require("./lexical-retrieval-backend");

const TOPIC_STOP_WORDS = new Set([
    "explain", "which", "would", "could", "should", "about", "question",
    "following", "what", "does", "your", "from", "with", "this", "that"
]);

function topicTerms(value) {
    return [...new Set(lexicalTerms(value).filter(term =>
        term.length >= 4 && !TOPIC_STOP_WORDS.has(term)
    ))];
}

function conciseLabel(value, maximum = 110) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trim()}…`;
}

function overlaps(left, right) {
    const a = topicTerms(left);
    const b = topicTerms(right);
    if (!a.length || !b.length) return false;
    const common = a.filter(term => b.includes(term)).length;
    return common >= 1 && common / Math.min(a.length, b.length) >= 0.3;
}

function hrefs(courseId, candidate) {
    const materialId = candidate.materialIds[0] || null;
    const actions = [];
    if (candidate.quizId) actions.push({
        label: "Practice Related Quiz",
        href: `quiz.html?courseId=${courseId}&quizId=${candidate.quizId}`
    });
    if (candidate.hasFlashcard) actions.push({
        label: "Review Weak Flashcards",
        href: `flashcards.html?courseId=${courseId}${materialId ? `&materialId=${materialId}` : ""}`
    });
    if (materialId) actions.push({
        label: "Review Material",
        href: `material.html?courseId=${courseId}&materialId=${materialId}`
    });
    if (!actions.length) actions.push({ label: "Practice This Course", href: `quiz.html?courseId=${courseId}` });
    return actions;
}

function evidenceLevel(candidate) {
    const weakQuiz = candidate.quizMisses > 0;
    const weakCards = candidate.flashcardIncorrect > 0 ||
        (candidate.hasFlashcard && candidate.flashcardReviews > 0 && candidate.bestMastery <= 2);
    if ((candidate.explicitExam && (weakQuiz || weakCards)) ||
        (weakQuiz && weakCards) || candidate.quizMisses >= 2) return "strong";
    if (candidate.explicitExam || candidate.examScoped || weakQuiz || weakCards || candidate.hasFlashcard) {
        return "moderate";
    }
    return "limited";
}

function reason(candidate) {
    const parts = [];
    if (candidate.explicitExam) parts.push("explicitly listed in a selected exam-planning source");
    else if (candidate.examScoped) parts.push("included in your selected exam scope");
    if (candidate.quizMisses) parts.push(`${candidate.quizMisses} missed quiz answer${candidate.quizMisses === 1 ? "" : "s"}`);
    else if (candidate.quizCorrect) parts.push(`${candidate.quizCorrect} correct quiz answer${candidate.quizCorrect === 1 ? "" : "s"}`);
    if (candidate.flashcardIncorrect) parts.push(`${candidate.flashcardIncorrect} Still Learning review${candidate.flashcardIncorrect === 1 ? "" : "s"}`);
    else if (candidate.hasFlashcard && candidate.flashcardReviews === 0) parts.push("flashcards not reviewed yet");
    else if (candidate.hasFlashcard) parts.push(`flashcard mastery ${candidate.bestMastery}/5`);
    if (!parts.length) parts.push("limited study activity so far");
    return `Based on ${parts.join(", and ")}.`;
}

function publicItem(candidate, courseId) {
    const actions = hrefs(courseId, candidate);
    return {
        topic: candidate.label,
        reason: reason(candidate),
        confidence: evidenceLevel(candidate),
        evidence: [...new Set(candidate.evidence.map(item => item.label))],
        evidenceDetails: candidate.evidence,
        examRelevance: {
            listed: candidate.explicitExam,
            selectedScope: candidate.examScoped,
            statements: [...new Set(candidate.examStatements)]
        },
        actions,
        action: actions[0],
        materialIds: candidate.materialIds,
        signals: {
            quizMisses: candidate.quizMisses,
            quizCorrect: candidate.quizCorrect,
            quizAttempts: candidate.quizAttempts,
            flashcardIncorrect: candidate.flashcardIncorrect,
            flashcardReviews: candidate.flashcardReviews,
            bestMastery: candidate.bestMastery,
            hasFlashcard: candidate.hasFlashcard,
            explicitExam: candidate.explicitExam,
            examScoped: candidate.examScoped,
            lastAttemptAt: candidate.lastAttemptAt,
            lastReviewedAt: candidate.lastReviewedAt,
            reviewGap: candidate.evidence.some(item => item.kind === "review_gap")
        }
    };
}

function blank(label, materialIds = []) {
    return {
        label: conciseLabel(label), score: 0, quizMisses: 0, quizCorrect: 0,
        quizAttempts: 0, flashcardIncorrect: 0, flashcardReviews: 0,
        hasFlashcard: false, bestMastery: 5, quizId: null,
        materialIds: [...materialIds], evidence: [], examStatements: [],
        explicitExam: false, examScoped: false, lastAttemptAt: null, lastReviewedAt: null
    };
}

function latest(left, right) {
    return [left, right].filter(Boolean).sort().at(-1) || null;
}

function createRecommendationsService({
    coursesService, recommendationsRepository, examPlansRepository, examScopeService
}) {
    return {
        course(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            const attempts = recommendationsRepository.quizAttempts(courseId, userId);
            const flashcards = recommendationsRepository.flashcards(courseId, userId);
            const materials = recommendationsRepository.extractedMaterials(courseId, userId);
            const guides = recommendationsRepository.studyGuides(courseId, userId);
            const materialMap = new Map(materials.map(material => [material.id, material]));
            const rawPlan = examPlansRepository.findOwned(courseId, userId);
            const plan = {
                ...rawPlan,
                unitIds: rawPlan.unitIds.filter(id => materials.some(material => material.unitId === id)),
                materialIds: rawPlan.materialIds.filter(id => materialMap.has(id)),
                sourceMaterialIds: rawPlan.sourceMaterialIds.filter(id => materialMap.has(id))
            };
            const sourceMaterials = plan.sourceMaterialIds.map(id => materialMap.get(id));
            const scopeStatements = examScopeService.statements({ courseId, userId, sourceMaterials });
            const scopedIds = new Set([
                ...plan.materialIds,
                ...materials.filter(material => plan.unitIds.includes(material.unitId)).map(material => material.id)
            ]);
            const candidates = [];

            function add(candidate) {
                const existing = candidates.find(item => overlaps(item.label, candidate.label));
                if (!existing) { candidates.push(candidate); return candidate; }
                existing.score += candidate.score;
                for (const key of ["quizMisses", "quizCorrect", "quizAttempts", "flashcardIncorrect", "flashcardReviews"]) {
                    existing[key] += candidate[key];
                }
                existing.hasFlashcard ||= candidate.hasFlashcard;
                existing.bestMastery = Math.min(existing.bestMastery, candidate.bestMastery);
                existing.quizId ||= candidate.quizId;
                existing.explicitExam ||= candidate.explicitExam;
                existing.examScoped ||= candidate.examScoped;
                existing.lastAttemptAt = latest(existing.lastAttemptAt, candidate.lastAttemptAt);
                existing.lastReviewedAt = latest(existing.lastReviewedAt, candidate.lastReviewedAt);
                existing.materialIds = [...new Set([...existing.materialIds, ...candidate.materialIds])];
                existing.evidence.push(...candidate.evidence);
                existing.examStatements.push(...candidate.examStatements);
                return existing;
            }

            const quizTopics = new Map();
            attempts.forEach(attempt => attempt.answers.forEach((answer, index) => {
                const questionIndex = Number(answer.questionNumber || index + 1) - 1;
                const question = attempt.quiz.questions?.[questionIndex];
                if (!question?.question) return;
                const key = normalizeLexicalText(question.question);
                let candidate = quizTopics.get(key);
                if (!candidate) {
                    candidate = blank(question.question, attempt.materialIds);
                    candidate.quizId = attempt.quizId;
                    quizTopics.set(key, candidate);
                }
                candidate.quizAttempts++;
                candidate.lastAttemptAt = latest(candidate.lastAttemptAt, attempt.createdAt);
                if (answer.correct === false) {
                    candidate.quizMisses++;
                    candidate.score += candidate.quizMisses > 1 ? 5 : 4;
                } else if (answer.correct === true) {
                    candidate.quizCorrect++;
                    candidate.score -= 1.5;
                }
            }));
            quizTopics.forEach(candidate => {
                candidate.evidence.push({ kind: "quiz", label: "Quiz answer history" });
                add(candidate);
            });

            flashcards.forEach(card => {
                const candidate = blank(card.front, card.materialIds);
                candidate.hasFlashcard = true;
                candidate.bestMastery = card.masteryLevel;
                candidate.flashcardIncorrect = card.incorrectCount;
                candidate.flashcardReviews = card.reviewCount;
                candidate.lastReviewedAt = card.lastReviewedAt;
                candidate.score = card.reviewCount === 0
                    ? 1.5
                    : Math.max(0, 4 - card.masteryLevel) + card.incorrectCount * 2.5 - card.correctCount * 0.4;
                candidate.evidence.push({ kind: "flashcard", label: "Flashcard review history" });
                add(candidate);
            });

            scopeStatements.forEach(scope => {
                const labels = scope.topics.length ? scope.topics : [`Review ${scope.materialName}`];
                labels.forEach(label => {
                    const candidate = blank(label, [scope.materialId]);
                    candidate.explicitExam = true;
                    candidate.score = 4;
                    candidate.examStatements.push(scope.statement);
                    candidate.evidence.push({ kind: "exam_source", label: scope.materialName });
                    add(candidate);
                });
            });

            scopedIds.forEach(materialId => {
                const material = materialMap.get(materialId);
                if (!material) return;
                let candidate = candidates.find(item => item.materialIds.includes(materialId));
                if (!candidate) candidate = add(blank(`Review ${material.name}`, [materialId]));
                candidate.examScoped = true;
                candidate.score += 2;
                candidate.evidence.push({ kind: "exam_scope", label: "Selected exam scope" });
            });

            candidates.forEach(candidate => {
                if ((candidate.explicitExam || candidate.examScoped) &&
                    candidate.quizAttempts === 0 && candidate.flashcardReviews === 0) {
                    candidate.score += 2;
                    candidate.evidence.push({ kind: "review_gap", label: "No recorded practice yet" });
                }
            });
            const ordered = candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
            const focusFirst = ordered.filter(item =>
                (item.explicitExam && (item.quizMisses || item.flashcardIncorrect)) ||
                (item.quizMisses && item.flashcardIncorrect) || item.quizMisses >= 2 || item.score >= 9
            ).slice(0, 6);
            const focusSet = new Set(focusFirst);
            const keepFresh = ordered.filter(item => !focusSet.has(item) &&
                item.quizCorrect > 0 && item.quizMisses === 0 &&
                (!item.hasFlashcard || (item.bestMastery >= 4 && item.flashcardIncorrect === 0))
            ).slice(0, 5);
            const excluded = new Set([...focusFirst, ...keepFresh]);
            const reviewNext = ordered.filter(item => !excluded.has(item)).slice(0, 7);
            const reviewCount = flashcards.reduce((sum, card) => sum + card.reviewCount, 0);
            return {
                courseId,
                examPlan: {
                    examName: plan.examName, examDate: plan.examDate,
                    unitIds: plan.unitIds, materialIds: plan.materialIds,
                    sourceMaterialIds: plan.sourceMaterialIds,
                    scopeStatements
                },
                evidenceSummary: {
                    quizAttempts: attempts.length, flashcards: flashcards.length,
                    flashcardReviews: reviewCount,
                    examRelatedMaterials: sourceMaterials.length,
                    explicitExamStatements: scopeStatements.length,
                    savedStudyGuides: guides.length
                },
                hasExamSpecificEvidence: scopeStatements.length > 0,
                hasExamPlan: Boolean(plan.examName || plan.examDate || plan.unitIds.length ||
                    plan.materialIds.length || plan.sourceMaterialIds.length),
                isNewCourse: materials.length === 0 && attempts.length + reviewCount === 0,
                sections: {
                    focusFirst: focusFirst.map(item => publicItem(item, courseId)),
                    reviewNext: reviewNext.map(item => publicItem(item, courseId)),
                    keepFresh: keepFresh.map(item => publicItem(item, courseId))
                }
            };
        }
    };
}

module.exports = { createRecommendationsService, topicTerms };
