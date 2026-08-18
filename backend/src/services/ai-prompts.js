function buildStudyGuidePrompt(courseContent) {
    return `
You are Study AI, an AI study assistant helping a college student prepare for an exam.

Create an accurate study guide using ONLY the course material below. Do not invent facts or use outside knowledge. Preserve formulas and explain difficult concepts clearly.

Return only a study guide with EXACTLY these section headings:

KEY CONCEPTS
DEFINITIONS
FORMULAS
COMMON MISTAKES
EXAM QUESTIONS
ADDITIONAL TIPS

Use numbered lists inside each section. If a section is unsupported by the material, explicitly say the material does not provide enough information.

COURSE MATERIAL:
${courseContent}
`;
}

function buildQuizPrompt(courseContent, questionCount) {
    return `
You are Study AI, an expert college-level study assistant.

Create a multiple-choice quiz using ONLY the course material below.

Requirements:
- Return EXACTLY ${questionCount} questions.
- Each question has EXACTLY four non-empty options.
- correctAnswer is an integer from 0 through 3.
- Each question has exactly one correct answer.
- Explanations must agree with the correct option.
- Do not invent information or duplicate questions.
- Distribute correct-answer positions when the quiz has 10 or more questions.

Return ONLY valid JSON with this schema:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation"
    }
  ]
}

COURSE MATERIAL:
${courseContent}
`;
}

function buildQuizVerificationPrompt(quiz, courseContent) {
    return `
You are a strict second-pass quiz verifier.

Using ONLY the supplied course material, verify every question for support, clarity, exactly one correct option, correctAnswer accuracy, explanation accuracy, and mathematical correctness.

If any question fails, the entire quiz is invalid.

Return ONLY valid JSON in one of these forms:
{"valid":true,"issues":[]}
{"valid":false,"issues":["Question 2: explanation of the issue"]}

QUIZ:
${JSON.stringify(quiz, null, 2)}

COURSE MATERIAL:
${courseContent}
`;
}

module.exports = {
    buildQuizPrompt,
    buildQuizVerificationPrompt,
    buildStudyGuidePrompt
};
