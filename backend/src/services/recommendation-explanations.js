function dayLabel(days, label = "Exam") {
    if (!Number.isInteger(days)) return null;
    if (days < 0) return null;
    if (days === 0) return `${label} today`;
    if (days === 1) return `${label} tomorrow`;
    return `${label} in ${days} days`;
}

function priorityForRecommendation(tier) {
    return ({ focusFirst: "high", reviewNext: "medium", keepFresh: "low" })[tier] || "low";
}

function priorityForTask(score) {
    if (score >= 74) return "high";
    if (score >= 38) return "medium";
    return "low";
}

function buildRecommendationExplanation({
    signals = {}, examDays = null, examTitle = "Exam", taskDays = null,
    taskTitle = "Assignment", materialUnreviewed = false, savedStudyGuide = false
} = {}) {
    const reasons = [];
    const taskReason = dayLabel(taskDays, taskTitle || "Assignment");
    const examReason = dayLabel(examDays, examTitle || "Exam");
    if (taskReason) reasons.push(taskReason);
    else if (examReason) reasons.push(examReason);
    if (signals.explicitExam) reasons.push("Explicit exam source match");
    else if (signals.examScoped) reasons.push("Selected exam scope match");
    const misses = Number(signals.quizMisses || 0);
    if (misses >= 2) reasons.push(`${misses} recorded quiz misses`);
    else if (misses === 1) reasons.push("1 recorded quiz miss");
    else if (Number(signals.quizCorrect || 0)) {
        const correct = Number(signals.quizCorrect);
        reasons.push(`${correct} correct quiz answer${correct === 1 ? "" : "s"}`);
    }
    const stillLearning = Number(signals.flashcardIncorrect || 0);
    if (stillLearning) reasons.push(`${stillLearning} Still Learning flashcard review${stillLearning === 1 ? "" : "s"}`);
    else if (Number(signals.lowMasteryCards || 0)) {
        const count = Number(signals.lowMasteryCards);
        reasons.push(`${count} low-mastery flashcard${count === 1 ? "" : "s"}`);
    } else if (signals.hasFlashcard && Number(signals.flashcardReviews || 0) === 0) {
        reasons.push("Flashcards not reviewed yet");
    }
    if (materialUnreviewed || signals.reviewGap) reasons.push("Material not reviewed yet");
    if (savedStudyGuide) reasons.push("Saved study guide available");

    const summaryParts = [];
    if (taskReason) summaryParts.push("an assignment is due soon");
    else if (examReason) summaryParts.push("your exam is soon");
    if (misses) summaryParts.push("recent quiz results show weakness in this topic");
    else if (Number(signals.quizCorrect || 0)) summaryParts.push("recent quiz results show this topic is staying fresh");
    else if (stillLearning || signals.lowMasteryCards) summaryParts.push("flashcard review shows this topic needs work");
    else if (signals.explicitExam || signals.examScoped) summaryParts.push("it matches your recorded exam scope");
    else if (materialUnreviewed || signals.reviewGap) summaryParts.push("the material has not been reviewed yet");
    else if (savedStudyGuide) summaryParts.push("a saved study guide is ready");
    return {
        reasons: [...new Set(reasons)].slice(0, 3),
        summary: summaryParts.length ? `Recommended because ${summaryParts.join(" and ")}.` : null
    };
}

module.exports = { buildRecommendationExplanation, priorityForRecommendation, priorityForTask };
