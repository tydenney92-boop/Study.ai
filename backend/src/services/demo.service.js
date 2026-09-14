const crypto = require("crypto");

function relativeIso(days, hour = 17, minute = 0) {
    const value = new Date();
    value.setDate(value.getDate() + days);
    value.setHours(hour, minute, 0, 0);
    return value.toISOString();
}

function createDemoService({ database, usersRepository }) {
    const seed = database.transaction(userId => {
        const insertCourse = database.prepare(`
            INSERT INTO courses (user_id, course_name, course_code, semester)
            VALUES (?, ?, ?, 'Demo Term')
        `);
        const insertUnit = database.prepare("INSERT INTO units (course_id, name, unit_number) VALUES (?, ?, ?)");
        const insertMaterial = database.prepare(`
            INSERT INTO materials (course_id, unit_id, display_name, original_filename, stored_filename,
                material_type, extracted_text, file_size, mime_type, upload_status, extraction_status,
                extraction_method, material_role)
            VALUES (?, ?, ?, ?, ?, 'notes', ?, ?, 'text/plain', 'ready', 'extracted', 'native', ?)
        `);
        const insertTask = database.prepare(`
            INSERT INTO course_tasks (course_id, title, type, description, due_at, completed_at,
                priority, unit_id, material_id, estimated_minutes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const econId = Number(insertCourse.run(userId, "Applied Econometrics", "ECON 378").lastInsertRowid);
        const stratId = Number(insertCourse.run(userId, "Competitive Strategy", "STRAT 401").lastInsertRowid);
        const regressionUnit = Number(insertUnit.run(econId, "Regression and inference", 1).lastInsertRowid);
        const competitionUnit = Number(insertUnit.run(stratId, "Competitive advantage", 1).lastInsertRowid);
        const regressionMaterial = Number(insertMaterial.run(
            econId, regressionUnit, "Regression review notes", "regression-review-notes.txt",
            "demo-regression-review.txt",
            "Regression estimates the relationship between an outcome and explanatory variables. The midterm exam covers linear regression, coefficient interpretation, confidence intervals, and omitted-variable bias.",
            2800, "exam_review"
        ).lastInsertRowid);
        const syllabusMaterial = Number(insertMaterial.run(
            econId, null, "ECON 378 course syllabus", "econ-378-syllabus.txt", "demo-econ-syllabus.txt",
            "ECON 378 schedule and policies. Regression problem set due date is listed in the Planner. The course includes an econometrics midterm.",
            1200, "syllabus"
        ).lastInsertRowid);
        const caseMaterial = Number(insertMaterial.run(
            stratId, competitionUnit, "Porter five forces case notes", "porter-five-forces-case-notes.txt",
            "demo-strategy-case-notes.txt",
            "Use supplier power, buyer power, rivalry, substitutes, and barriers to entry to analyze the airline industry case.",
            1900, "general"
        ).lastInsertRowid);

        const regressionTaskId = Number(insertTask.run(econId, "Regression problem set", "assignment", "Interpret coefficients and confidence intervals.", relativeIso(1, 23, 59), null, "high", regressionUnit, regressionMaterial, 60).lastInsertRowid);
        insertTask.run(econId, "Econometrics midterm", "exam", "Covers regression and inference.", relativeIso(5, 10), null, "high", regressionUnit, regressionMaterial, 120);
        insertTask.run(econId, "Regression practice quiz", "quiz", "A short check before the midterm.", relativeIso(3, 17), null, "normal", regressionUnit, regressionMaterial, 30);
        insertTask.run(stratId, "Airline industry case brief", "assignment", "Apply the five forces framework.", relativeIso(4, 17), null, "normal", competitionUnit, caseMaterial, 45);
        insertTask.run(stratId, "Read: competitive advantage", "reading", "Prepare annotations for discussion.", relativeIso(2, 9), relativeIso(-1, 15), "low", competitionUnit, caseMaterial, 30);
        database.prepare("UPDATE course_tasks SET schedule_source_material_id = ?, schedule_import_key = ? WHERE id = ?")
            .run(syllabusMaterial, "demo-regression-problem-set", regressionTaskId);

        database.prepare("INSERT INTO onboarding_preferences (user_id, today_viewed_at) VALUES (?, CURRENT_TIMESTAMP)")
            .run(userId);

        database.prepare(`
            INSERT INTO course_exam_settings (course_id, exam_name, exam_date, selected_unit_ids_json,
                scoped_material_ids_json, source_material_ids_json)
            VALUES (?, 'Econometrics midterm', ?, ?, ?, ?)
        `).run(econId, relativeIso(5, 10).slice(0, 10), JSON.stringify([regressionUnit]),
            JSON.stringify([regressionMaterial]), JSON.stringify([regressionMaterial]));

        const quiz = {
            title: "Regression foundations", questions: [
                { question: "What does a regression coefficient represent?", options: ["Estimated change in the outcome for a one-unit predictor change", "The sample size", "A guaranteed causal effect", "The model p-value"], answer: 0 },
                { question: "What does a 95% confidence interval describe?", options: ["A plausible range for an estimate", "The chance the data are correct", "The exam score", "The residual count"], answer: 0 },
                { question: "Why can omitted-variable bias occur?", options: ["A relevant factor is left out and relates to included variables", "The regression has an intercept", "The sample is too large", "Coefficients are rounded"], answer: 0 }
            ]
        };
        const quizId = Number(database.prepare("INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json) VALUES (?, ?, ?)")
            .run(userId, econId, JSON.stringify(quiz)).lastInsertRowid);
        database.prepare("INSERT INTO quiz_materials (quiz_id, material_id) VALUES (?, ?)").run(quizId, regressionMaterial);
        database.prepare("INSERT INTO quiz_sources (quiz_id, source_order, material_id, material_name) VALUES (?, 0, ?, 'Regression review notes')").run(quizId, regressionMaterial);
        const attempts = [
            { score: 60, correct: [false, true, false] },
            { score: 67, correct: [true, false, false] }
        ];
        const insertAttempt = database.prepare("INSERT INTO quiz_attempts (user_id, quiz_id, score, answers_json, results_json, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        attempts.forEach((attempt, index) => insertAttempt.run(userId, quizId, attempt.score,
            JSON.stringify(attempt.correct.map((correct, questionNumber) => ({ questionNumber: questionNumber + 1, correct }))),
            JSON.stringify({ correct: attempt.correct.filter(Boolean).length, total: 3 }), relativeIso(-3 + index, 14)));

        const insertCard = database.prepare(`
            INSERT INTO flashcards (user_id, course_id, front, back, mastery_level, correct_count, incorrect_count, last_reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const linkCard = database.prepare("INSERT INTO flashcard_materials (flashcard_id, material_id) VALUES (?, ?)");
        [["Coefficient interpretation", "The expected outcome change for a one-unit predictor change, holding other included variables constant.", 1, 1, 3], ["Confidence interval", "A range of values compatible with the estimate under the model assumptions.", 2, 2, 2], ["Omitted-variable bias", "Bias caused when a relevant omitted factor is correlated with an included predictor.", 1, 0, 4], ["R-squared", "The share of variation in the outcome explained by the fitted model.", 4, 5, 0]].forEach(([front, back, mastery, correct, incorrect], index) => {
            const cardId = Number(insertCard.run(userId, econId, front, back, mastery, correct, incorrect, relativeIso(-2 + index, 16)).lastInsertRowid);
            linkCard.run(cardId, regressionMaterial);
        });
        return { econId, stratId };
    });

    return {
        create() {
            const user = usersRepository.create({
                name: "Demo Student",
                email: `demo+${crypto.randomUUID()}@study-signal.invalid`,
                passwordHash: null,
                isDemo: true
            });
            try {
                const courses = seed(user.id);
                return { user, courses };
            } catch (error) {
                usersRepository.deleteDemoById(user.id);
                throw error;
            }
        },
        exit(userId) {
            return usersRepository.deleteDemoById(userId);
        }
    };
}

module.exports = { createDemoService };
