const express = require("express");
const cors = require("cors");
const defaultConfig = require("./config");
const { createDatabase } = require("./database/connection");
const { runMigrations } = require("./database/migration-runner");
const { createUsersRepository } = require("./repositories/users.repository");
const { createCoursesRepository } = require("./repositories/courses.repository");
const { createUnitsRepository } = require("./repositories/units.repository");
const { createMaterialsRepository } = require("./repositories/materials.repository");
const { createCourseService } = require("./services/course.service");
const { createUnitService } = require("./services/unit.service");
const { createMaterialService } = require("./services/material.service");
const { createTextExtractionService } = require("./services/text-extraction.service");
const { createLocalFileStorage } = require("./services/local-file-storage");
const { createOllamaClient } = require("./services/ollama-client");
const { ALLOWED_EXTENSIONS } = require("./services/material-type");
const { createCurrentUserMiddleware } = require("./middleware/current-user");
const { registerHealthRoutes } = require("./routes/health.routes");
const { createCoursesRouter } = require("./routes/courses.routes");
const { createUnitsRouter } = require("./routes/units.routes");
const {
    createCourseMaterialsRouter,
    createLegacyMaterialsRouter
} = require("./routes/materials.routes");
const { notFoundHandler } = require("./middleware/not-found");
const { errorHandler } = require("./middleware/error-handler");

function createApp(options = {}) {

const config = {
    ...defaultConfig,
    ...(options.config || {})
};

const app = express();

const db = options.database || createDatabase(config.databasePath);

const migrationResult = runMigrations({
    database: db,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory,
    createBackup: config.migrationBackup
});

const fileStorage =
    options.fileStorage ||
    createLocalFileStorage({
        uploadDirectory: config.uploadDirectory
    });

fileStorage.ensureReady();

const upload =
    options.uploadMiddleware ||
    fileStorage.createUploadMiddleware({
        maxFileSize: config.maxUploadBytes,
        allowedExtensions: ALLOWED_EXTENSIONS
    });

const aiClient =
    options.aiClient ||
    createOllamaClient({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel
    });

app.locals.database = db;
app.locals.fileStorage = fileStorage;
app.locals.migrations = migrationResult;

const defaultRepositories = {
    users: createUsersRepository(db),
    courses: createCoursesRepository(db),
    units: createUnitsRepository(db),
    materials: createMaterialsRepository(db)
};
const repositories = {
    ...defaultRepositories,
    ...(options.repositories || {}),
    ...(options.extendRepositories
        ? options.extendRepositories(defaultRepositories)
        : {})
};

const coursesService = createCourseService({
    coursesRepository: repositories.courses
});
const unitsService = createUnitService({
    coursesService,
    unitsRepository: repositories.units
});
const textExtractionService =
    options.textExtractionService ||
    createTextExtractionService({ fileStorage });
const materialService = createMaterialService({
    coursesRepository: repositories.courses,
    coursesService,
    unitsRepository: repositories.units,
    materialsRepository: repositories.materials,
    textExtractionService,
    fileStorage
});

// =========================================
// MIDDLEWARE
// =========================================

app.use(cors());

app.use(express.json());


console.log(
    "Database connected."
);


console.log(
    "Materials table ready."
);


// =========================================
// TEST ROUTE
// =========================================

registerHealthRoutes(app);

app.use(createCurrentUserMiddleware({
    usersRepository: repositories.users,
    developmentEmail: config.developmentUserEmail
}));

app.use(
    "/api/courses/:courseId/units",
    createUnitsRouter({ unitsService })
);
app.use(
    "/api/courses/:courseId/materials",
    createCourseMaterialsRouter({ materialService, upload })
);
app.use(
    "/api/courses",
    createCoursesRouter({ coursesService })
);
app.use(
    "/api/materials",
    createLegacyMaterialsRouter({ materialService, upload })
);


// =========================================
// OLLAMA AI
// =========================================

async function askOllama(prompt) {

    return aiClient.generate(prompt);

}

// =========================================
// VERIFY AI-GENERATED QUIZ
// =========================================

async function verifyQuiz(quiz, courseContent) {

    const verificationPrompt = `
You are a strict quality-control reviewer for a college
practice quiz.

Review the quiz below for mathematical, factual, and
conceptual accuracy.

Use ONLY the provided course material.

For EVERY question, check:

1. Is the question supported by the course material?
2. Is there exactly ONE correct answer?
3. Does correctAnswer point to the ACTUALLY correct option?
4. Does the explanation agree with the correct answer?
5. Are formulas and calculations correct?
6. Are the answer choices logically valid?
7. Is the question clear and unambiguous?

If ANY question is incorrect, mark the entire quiz invalid.

Return ONLY valid JSON.

Use exactly this format:

{
  "valid": true,
  "issues": []
}

OR:

{
  "valid": false,
  "issues": [
    "Question 2: The correct answer should be option 3 because..."
  ]
}

QUIZ:

${JSON.stringify(quiz, null, 2)}

COURSE MATERIAL:

${courseContent}
`;


    try {

        const response =
            await askOllama(
                verificationPrompt
            );


        let cleanedResponse =
            response.trim();


        cleanedResponse =
            cleanedResponse
                .replace(
                    /^```json\s*/i,
                    ""
                )
                .replace(
                    /^```\s*/i,
                    ""
                )
                .replace(
                    /\s*```$/i,
                    ""
                )
                .trim();


        const firstBrace =
            cleanedResponse.indexOf(
                "{"
            );


        const lastBrace =
            cleanedResponse.lastIndexOf(
                "}"
            );


        if (
            firstBrace !== -1 &&
            lastBrace !== -1
        ) {

            cleanedResponse =
                cleanedResponse.substring(
                    firstBrace,
                    lastBrace + 1
                );

        }


        const verification =
            JSON.parse(
                cleanedResponse
            );


        return verification;


    } catch (error) {

        console.error(
            "Quiz verification failed:",
            error
        );


        return {

            valid: false,

            issues: [
                "The quiz could not be verified."
            ]

        };

    }

}

// =========================================
// GENERATE STUDY GUIDE
// =========================================

app.post(
    "/api/study-guide",
    async function(req, res) {

        try {

            const materialIds =
                req.body.materialIds;


            if (
                !materialIds ||
                materialIds.length === 0
            ) {

                return res.status(400).json({

                    error:
                        "No materials were selected."

                });

            }


            const legacyCourse =
                repositories.courses.findLegacyOwned(req.user.id);

            const materials =
                repositories.materials.findContextByIds(
                    legacyCourse.id,
                    req.user.id,
                    materialIds
                );


            if (materials.length === 0) {

                return res.status(404).json({

                    error:
                        "No materials were found."

                });

            }


            /*
                Combine the extracted text
                from all selected materials.
            */

            let courseContent = "";


            materials.forEach(
                function(material) {

                    courseContent +=
                        `\n\n===== ${material.name} =====\n\n`;

                    courseContent +=
                        material.text_content || "";

                }
            );


            const prompt = `
You are Study AI, an AI study assistant helping a college student prepare for an exam.

Your job is to create an accurate study guide using ONLY the course material provided below.

IMPORTANT RULES:

1. Do NOT use outside knowledge unless it is necessary to clarify something already stated in the material.
2. Do NOT invent facts, formulas, definitions, examples, or topics.
3. If the material does not provide enough information to answer something, say that the material does not provide enough information.
4. Preserve mathematical formulas and notation as accurately as possible.
5. Focus on concepts that are actually emphasized in the course material.
6. Explain difficult concepts clearly and concisely.
7. Prioritize information that would realistically help the student prepare for an exam.
8. Do not mention that you are an AI.
9. Do not include an introduction or conclusion outside the required sections.
10. Use numbered lists inside each section.

Return the study guide using EXACTLY this structure:

KEY CONCEPTS

1. [Important concept]
   Explanation: [Clear explanation based on the course material]

2. [Important concept]
   Explanation: [Clear explanation based on the course material]

3. [Important concept]
   Explanation: [Clear explanation based on the course material]


DEFINITIONS

1. [Term]: [Definition]

2. [Term]: [Definition]

3. [Term]: [Definition]


FORMULAS

1. [Formula]
   Meaning: [Explain what the formula represents]

2. [Formula]
   Meaning: [Explain what the formula represents]


COMMON MISTAKES

1. [Common mistake students might make based on the material]

2. [Common mistake students might make based on the material]

3. [Common mistake students might make based on the material]


EXAM QUESTIONS

1. [Question the student should be able to answer]

2. [Question the student should be able to answer]

3. [Question the student should be able to answer]

4. [Question the student should be able to answer]

5. [Question the student should be able to answer]


ADDITIONAL TIPS

1. [Useful study recommendation based on the material]

2. [Useful study recommendation based on the material]


COURSE MATERIAL:

${courseContent}
`;


            console.log(
                "Sending material to Ollama..."
            );


            const answer =
                await askOllama(
                    prompt
                );


            console.log(
                "Study guide generated."
            );


            res.json({

                success: true,

                studyGuide:
                    answer

            });


        } catch (error) {

            console.error(
                "Study guide error:",
                error
            );


            res.status(500).json({

                error:
                    "Could not generate study guide."

            });

        }

    }
);

// =========================================
// GENERATE AI PRACTICE QUIZ
// =========================================

app.post(
    "/api/quiz",
    async function(req, res) {

        try {

            const materialIds =
                req.body.materialIds;

            const questionCount =
                Number(req.body.questionCount) || 10;


            // ---------------------------------
            // CHECK MATERIAL IDS
            // ---------------------------------

            if (
                !Array.isArray(materialIds) ||
                materialIds.length === 0
            ) {

                return res.status(400).json({

                    error:
                        "No materials were selected."

                });

            }


            // ---------------------------------
            // CHECK QUESTION COUNT
            // ---------------------------------

            const allowedQuestionCounts = [
                5,
                10,
                15,
                20
            ];


            if (
                !allowedQuestionCounts.includes(
                    questionCount
                )
            ) {

                return res.status(400).json({

                    error:
                        "Invalid question count. Choose 5, 10, 15, or 20."

                });

            }


            // ---------------------------------
            // FIND MATERIALS
            // ---------------------------------

            const legacyCourse =
                repositories.courses.findLegacyOwned(req.user.id);

            const materials =
                repositories.materials.findContextByIds(
                    legacyCourse.id,
                    req.user.id,
                    materialIds
                );


            if (materials.length === 0) {

                return res.status(404).json({

                    error:
                        "No materials were found."

                });

            }


            // ---------------------------------
            // COMBINE COURSE MATERIAL
            // ---------------------------------

            let courseContent = "";


            materials.forEach(
                function(material) {

                    courseContent +=
                        `\n\n===== ${material.name} =====\n\n`;

                    courseContent +=
                        material.text_content || "";

                }
            );


            // ---------------------------------
            // GENERATE QUIZ
            // ---------------------------------

            const maxAttempts = 3;

            let quiz = null;


            for (
                let attempt = 1;
                attempt <= maxAttempts;
                attempt++
            ) {

                console.log(
                    `Generating ${questionCount}-question quiz (attempt ${attempt}/${maxAttempts})...`
                );


                const prompt = `
You are Study AI, an expert college-level study assistant.

Create a high-quality multiple-choice practice quiz
using ONLY the course material provided below.

The student requested EXACTLY ${questionCount} questions.

==============================
ABSOLUTE REQUIREMENTS
==============================

1. Return EXACTLY ${questionCount} questions.

2. Each question must have EXACTLY 4 answer choices.

3. There must be EXACTLY ONE correct answer.

4. The correct answer may be in ANY of the four positions.

5. Distribute correct answers across positions.
   Do NOT repeatedly use the same position.

6. Avoid patterns such as:
   A, A, A, A
   B, B, B, B
   C, C, C, C
   D, D, D, D

7. Questions must be based ONLY on the course material.

8. Do not invent information.

9. Do not use outside knowledge.

10. Avoid duplicate or nearly identical questions.

11. Questions should test actual understanding.

12. Include conceptual, definition, formula,
    and application questions when supported
    by the material.

13. Incorrect answers should be plausible.

14. Make sure the correct answer actually matches
    the explanation.

15. Check every question mathematically before
    returning the quiz.

16. Keep explanations concise.

==============================
IMPORTANT
==============================

The correctAnswer field must contain ONLY:

0 = first answer
1 = second answer
2 = third answer
3 = fourth answer

Do NOT assume the correct answer should be
the first or second option.

Before returning the quiz, internally verify:

- There are exactly ${questionCount} questions.
- Every question has 4 options.
- Every correctAnswer is 0, 1, 2, or 3.
- Every correctAnswer actually matches the correct option.
- Correct answers are distributed among the four positions.
- No questions are duplicates.
- Every question is supported by the course material.

==============================
OUTPUT FORMAT
==============================

Return ONLY valid JSON.

No markdown.
No code fences.
No explanation outside the JSON.

Use exactly this structure:

{
  "questions": [
    {
      "question": "Question text",
      "options": [
        "Answer A",
        "Answer B",
        "Answer C",
        "Answer D"
      ],
      "correctAnswer": 0,
      "explanation": "Brief explanation."
    }
  ]
}

==============================
COURSE MATERIAL
==============================

${courseContent}
`;


                const answer =
                    await askOllama(
                        prompt
                    );


                console.log(
                    "Quiz generated."
                );


                console.log(
                    "Raw Ollama response:"
                );

                console.log(
                    answer
                );


                // ---------------------------------
                // CLEAN RESPONSE
                // ---------------------------------

                let cleanedAnswer =
                    answer.trim();


                cleanedAnswer =
                    cleanedAnswer
                        .replace(
                            /^```json\s*/i,
                            ""
                        )
                        .replace(
                            /^```\s*/i,
                            ""
                        )
                        .replace(
                            /\s*```$/i,
                            ""
                        )
                        .trim();


                // ---------------------------------
                // FIND JSON OBJECT
                // ---------------------------------

                const firstBrace =
                    cleanedAnswer.indexOf(
                        "{"
                    );


                const lastBrace =
                    cleanedAnswer.lastIndexOf(
                        "}"
                    );


                if (
                    firstBrace !== -1 &&
                    lastBrace !== -1
                ) {

                    cleanedAnswer =
                        cleanedAnswer.substring(
                            firstBrace,
                            lastBrace + 1
                        );

                }


                // ---------------------------------
                // PARSE JSON
                // ---------------------------------

                try {

                    quiz =
                        JSON.parse(
                            cleanedAnswer
                        );

                } catch (parseError) {

                    console.error(
                        "Invalid JSON from Ollama."
                    );

                    quiz = null;

                    continue;

                }


                // ---------------------------------
                // BASIC VALIDATION
                // ---------------------------------

                if (
                    !quiz ||
                    !Array.isArray(
                        quiz.questions
                    )
                ) {

                    console.error(
                        "Quiz did not contain a questions array."
                    );

                    quiz = null;

                    continue;

                }


                // ---------------------------------
                // QUESTION COUNT VALIDATION
                // ---------------------------------

                if (
                    quiz.questions.length !==
                    questionCount
                ) {

                    console.error(
                        `Expected ${questionCount} questions but received ${quiz.questions.length}. Retrying...`
                    );

                    quiz = null;

                    continue;

                }


                // ---------------------------------
                // QUESTION VALIDATION
                // ---------------------------------

                let validQuiz = true;


                for (
                    const question
                    of quiz.questions
                ) {

                    if (
                        typeof question.question !== "string" ||
                        question.question.trim() === "" ||
                        !Array.isArray(
                            question.options
                        ) ||
                        question.options.length !== 4 ||
                        question.options.some(
                            option =>
                                typeof option !== "string" ||
                                option.trim() === ""
                        ) ||
                        typeof question.correctAnswer !== "number" ||
                        !Number.isInteger(
                            question.correctAnswer
                        ) ||
                        question.correctAnswer < 0 ||
                        question.correctAnswer > 3 ||
                        typeof question.explanation !== "string"
                    ) {

                        validQuiz = false;

                        break;

                    }

                }


                if (!validQuiz) {

                    console.error(
                        "Quiz contained an incorrectly formatted question. Retrying..."
                    );

                    quiz = null;

                    continue;

                }


                // ---------------------------------
                // CHECK FOR DUPLICATE QUESTIONS
                // ---------------------------------

                const questionTexts =
                    quiz.questions.map(
                        question =>
                            question.question
                                .trim()
                                .toLowerCase()
                    );


                const uniqueQuestions =
                    new Set(
                        questionTexts
                    );


                if (
                    uniqueQuestions.size !==
                    questionTexts.length
                ) {

                    console.error(
                        "Quiz contained duplicate questions. Retrying..."
                    );

                    quiz = null;

                    continue;

                }


                // ---------------------------------
                // CHECK ANSWER DISTRIBUTION
                // ---------------------------------

                const answerPositions = [
                    0,
                    0,
                    0,
                    0
                ];


                quiz.questions.forEach(
                    function(question) {

                        answerPositions[
                            question.correctAnswer
                        ]++;

                    }
                );


                console.log(
                    "Correct answer distribution:",
                    answerPositions
                );


                /*
                    If the quiz has enough questions,
                    make sure the AI isn't putting
                    every answer in the same position.
                */

                if (questionCount >= 10) {

                    const maxPosition =
                        Math.max(
                            ...answerPositions
                        );


                    if (
                        maxPosition >
                        Math.ceil(
                            questionCount * 0.6
                        )
                    ) {

                        console.error(
                            "Correct answers were poorly distributed. Retrying..."
                        );

                        quiz = null;

                        continue;

                    }

                }


                // ---------------------------------
                // QUIZ PASSED VALIDATION
                // ---------------------------------

                console.log(
                    "Quiz passed validation."
                );

                break;

            }


            // ---------------------------------
            // CHECK FINAL RESULT
            // ---------------------------------

            if (!quiz) {

                return res.status(500).json({

                    error:
                        "The AI could not generate a valid quiz after several attempts. Please try again."

                });

            }


            // ---------------------------------
            // SEND QUIZ TO FRONTEND
            // ---------------------------------

            res.json({

                success:
                    true,

                quiz:
                    quiz

            });


        } catch (error) {

            console.error(
                "Quiz generation error:",
                error
            );


            res.status(500).json({

                error:
                    "Could not generate practice quiz."

            });

        }

    }
);

app.use(notFoundHandler);
app.use(errorHandler);

return app;

}

module.exports = {
    createApp
};
