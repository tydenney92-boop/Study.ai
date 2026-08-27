const { normalizeLexicalText, lexicalTerms } = require("./lexical-retrieval-backend");

const EXAM_LANGUAGE = /\b(exam|midterm|final|test|study[ -]?guide|review (?:topics|questions|material|section)|learning objectives?|will (?:cover|be tested)|tested on)\b/i;
const TOPIC_STOP_WORDS = new Set(["explain", "which", "would", "could", "should", "about", "question", "following"]);

function topicTerms(value) {
    return [...new Set(lexicalTerms(value).filter(term =>
        term.length >= 4 && !TOPIC_STOP_WORDS.has(term)
    ))];
}

function conciseLabel(value, maximum = 110) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trim()}…`;
}

function materialHref(courseId, materialId) {
    return `material.html?courseId=${courseId}&materialId=${materialId}`;
}

function quizHref(courseId, quizId) {
    return `quiz.html?courseId=${courseId}&quizId=${quizId}`;
}

function flashcardHref(courseId, materialId = null) {
    const suffix = materialId ? `&materialId=${materialId}` : "";
    return `flashcards.html?courseId=${courseId}${suffix}`;
}

function overlapsMaterial(terms, material) {
    if (terms.length === 0) return false;
    const normalized = normalizeLexicalText(material.extractedText);
    return terms.some(term => normalized.includes(` ${term} `) ||
        normalized.startsWith(`${term} `) || normalized.endsWith(` ${term}`));
}

function confidenceFor(candidate) {
    const evidenceKinds = new Set(candidate.evidence.map(item => item.kind));
    if (
        evidenceKinds.size >= 2 || candidate.quizMisses >= 2 ||
        candidate.flashcardIncorrect >= 2
    ) return "strong";
    if (candidate.quizAttempts > 0 || candidate.flashcardReviews > 0) return "moderate";
    return "limited";
}

function reasonFor(candidate) {
    const reasons = [];
    if (candidate.quizMisses) {
        reasons.push(`${candidate.quizMisses} missed quiz answer${candidate.quizMisses === 1 ? "" : "s"}`);
    } else if (candidate.quizCorrect) {
        reasons.push(`${candidate.quizCorrect} correct quiz answer${candidate.quizCorrect === 1 ? "" : "s"}`);
    }
    if (candidate.flashcardReviews === 0 && candidate.hasFlashcard) {
        reasons.push("an unreviewed flashcard");
    } else if (candidate.flashcardIncorrect) {
        reasons.push(`${candidate.flashcardIncorrect} Still Learning review${candidate.flashcardIncorrect === 1 ? "" : "s"}`);
    } else if (candidate.hasFlashcard) {
        reasons.push(`flashcard mastery ${candidate.bestMastery}/5`);
    }
    if (candidate.examRelevant) reasons.push("explicit exam or review language in a source material");
    if (reasons.length === 0) reasons.push("limited study activity so far");
    return `Based on ${reasons.join(", and ")}.`;
}

function publicRecommendation(candidate, courseId) {
    let action;
    if (candidate.quizId) {
        action = { label: "Retake Quiz", href: quizHref(courseId, candidate.quizId) };
    } else if (candidate.hasFlashcard) {
        action = {
            label: "Review Flashcards",
            href: flashcardHref(courseId, candidate.materialIds[0] || null)
        };
    } else {
        action = {
            label: "Review Material",
            href: materialHref(courseId, candidate.materialIds[0])
        };
    }
    return {
        topic: candidate.label,
        reason: reasonFor(candidate),
        confidence: confidenceFor(candidate),
        evidence: [...new Set(candidate.evidence.map(item => item.label))],
        action
    };
}

function createRecommendationsService({ coursesService, recommendationsRepository }) {
    return {
        course(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            const attempts = recommendationsRepository.quizAttempts(courseId, userId);
            const flashcards = recommendationsRepository.flashcards(courseId, userId);
            const materials = recommendationsRepository.extractedMaterials(courseId, userId);
            const guides = recommendationsRepository.studyGuides(courseId, userId);
            const examMaterials = materials.filter(material => EXAM_LANGUAGE.test(material.extractedText));
            const candidates = [];

            function addCandidate(candidate) {
                const terms = topicTerms(candidate.label);
                const existing = candidates.find(item => {
                    const otherTerms = topicTerms(item.label);
                    const intersection = terms.filter(term => otherTerms.includes(term)).length;
                    return intersection >= 1 && intersection / Math.min(terms.length, otherTerms.length) >= 0.34;
                });
                if (!existing) {
                    candidates.push(candidate);
                    return candidate;
                }
                existing.score += candidate.score;
                existing.quizMisses += candidate.quizMisses;
                existing.quizCorrect += candidate.quizCorrect;
                existing.quizAttempts += candidate.quizAttempts;
                existing.flashcardIncorrect += candidate.flashcardIncorrect;
                existing.flashcardReviews += candidate.flashcardReviews;
                existing.hasFlashcard ||= candidate.hasFlashcard;
                existing.bestMastery = Math.min(existing.bestMastery, candidate.bestMastery);
                existing.quizId ||= candidate.quizId;
                existing.materialIds = [...new Set([...existing.materialIds, ...candidate.materialIds])];
                existing.evidence.push(...candidate.evidence);
                return existing;
            }

            const quizTopics = new Map();
            attempts.forEach(attempt => {
                const questions = attempt.quiz.questions || [];
                attempt.answers.forEach((answer, index) => {
                    const questionIndex = Number(answer.questionNumber || index + 1) - 1;
                    const question = questions[questionIndex];
                    if (!question?.question) return;
                    const key = `${attempt.quizId}:${normalizeLexicalText(question.question)}`;
                    let topic = quizTopics.get(key);
                    if (!topic) {
                        topic = {
                            label: conciseLabel(question.question), score: 0,
                            quizMisses: 0, quizCorrect: 0, quizAttempts: 0,
                            flashcardIncorrect: 0, flashcardReviews: 0,
                            hasFlashcard: false, bestMastery: 5,
                            quizId: attempt.quizId,
                            materialIds: attempt.materialIds,
                            evidence: []
                        };
                        quizTopics.set(key, topic);
                    }
                    topic.quizAttempts++;
                    if (answer.correct === false) {
                        topic.quizMisses++;
                        topic.score += 4;
                    } else if (answer.correct === true) {
                        topic.quizCorrect++;
                        topic.score -= 1;
                    }
                });
            });
            quizTopics.forEach(topic => {
                topic.evidence.push({ kind: "quiz", label: "Quiz history" });
                addCandidate(topic);
            });

            flashcards.forEach(card => {
                const score = card.reviewCount === 0
                    ? 3
                    : Math.max(0, 5 - card.masteryLevel) + card.incorrectCount * 2 - card.correctCount * 0.35;
                addCandidate({
                    label: conciseLabel(card.front), score,
                    quizMisses: 0, quizCorrect: 0, quizAttempts: 0,
                    flashcardIncorrect: card.incorrectCount,
                    flashcardReviews: card.reviewCount,
                    hasFlashcard: true,
                    bestMastery: card.masteryLevel,
                    materialIds: card.materialIds,
                    evidence: [{ kind: "flashcard", label: "Flashcard review history" }]
                });
            });

            examMaterials.forEach(material => {
                let matched = false;
                candidates.forEach(candidate => {
                    if (
                        candidate.materialIds.includes(material.id) &&
                        overlapsMaterial(topicTerms(candidate.label), material)
                    ) {
                        candidate.score += 3;
                        candidate.examRelevant = true;
                        candidate.evidence.push({ kind: "exam_material", label: material.name });
                        matched = true;
                    }
                });
                if (!matched) {
                    addCandidate({
                        label: `Review ${material.name}`, score: 2,
                        quizMisses: 0, quizCorrect: 0, quizAttempts: 0,
                        flashcardIncorrect: 0, flashcardReviews: 0,
                        hasFlashcard: false, bestMastery: 5,
                        examRelevant: true, materialIds: [material.id],
                        evidence: [{ kind: "exam_material", label: material.name }]
                    });
                }
            });

            const ordered = candidates.sort((left, right) =>
                right.score - left.score || left.label.localeCompare(right.label)
            );
            const focusFirst = ordered.filter(item =>
                item.quizMisses > 0 || item.flashcardIncorrect > 0 || item.score >= 6
            ).slice(0, 5);
            const focusSet = new Set(focusFirst);
            const keepFresh = ordered.filter(item =>
                !focusSet.has(item) &&
                ((item.quizCorrect > 0 && item.quizMisses === 0) ||
                 (item.hasFlashcard && item.bestMastery >= 4 && item.flashcardIncorrect === 0))
            ).slice(0, 4);
            const excluded = new Set([...focusFirst, ...keepFresh]);
            const reviewNext = ordered.filter(item => !excluded.has(item)).slice(0, 5);

            const activityCount = attempts.length + flashcards.reduce(
                (total, card) => total + card.reviewCount,
                0
            );
            return {
                courseId,
                evidenceSummary: {
                    quizAttempts: attempts.length,
                    flashcards: flashcards.length,
                    flashcardReviews: flashcards.reduce((sum, card) => sum + card.reviewCount, 0),
                    examRelatedMaterials: examMaterials.length,
                    savedStudyGuides: guides.length
                },
                hasExamSpecificEvidence: examMaterials.length > 0,
                isNewCourse: materials.length === 0 && activityCount === 0,
                sections: {
                    focusFirst: focusFirst.map(item => publicRecommendation(item, courseId)),
                    reviewNext: reviewNext.map(item => publicRecommendation(item, courseId)),
                    keepFresh: keepFresh.map(item => publicRecommendation(item, courseId))
                }
            };
        }
    };
}

module.exports = {
    EXAM_LANGUAGE,
    createRecommendationsService,
    topicTerms
};
