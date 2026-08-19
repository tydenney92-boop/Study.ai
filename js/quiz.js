/* =========================================
   STUDY AI — PRACTICE QUIZ
========================================= */


/* =========================================
   ELEMENTS
========================================= */

const setupScreen =
    document.querySelector("#quiz-setup");

const quizInterface =
    document.querySelector("#quiz-interface");

const quizLengthButtons =
    document.querySelectorAll(
        ".quiz-length-button"
    );


const answerContainer =
    document.querySelector("#answer-container");

const submitButton =
    document.querySelector("#submit-answer");

const resultBox =
    document.querySelector("#quiz-result");

const currentQuestion =
    document.querySelector("#current-question");

const totalQuestions =
    document.querySelector("#total-questions");

const progressBar =
    document.querySelector("#quiz-progress-bar");

const questionText =
    document.querySelector("#question");


/* =========================================
   QUIZ VARIABLES
========================================= */

let questions = [];

let selectedAnswer = null;

let questionNumber = 1;

let quizSubmitted = false;

let score = 0;

let selectedQuestionCount = 5;

let generatedQuizId = null;

let submittedAnswers = [];


/* =========================================
   GET MATERIAL ID
========================================= */

const courseId =
    StudyAI.courseContext.getCourseId();

const materialId =
    StudyAI.courseContext.getMaterialId();

const savedQuizId = (() => {
    const value = Number(new URLSearchParams(window.location.search).get("quizId"));
    return Number.isInteger(value) && value > 0 ? value : null;
})();

let selectedMaterialIds = materialId ? [Number(materialId)] : [];
const quizOrigin = StudyAI.courseContext.toolOrigin();
const quizReturnUrl = savedQuizId
    ? StudyAI.courseContext.url("history.html", { courseId })
    : StudyAI.courseContext.toolBackUrl();

if (!courseId) {
    StudyAI.courseContext.goToMyCourses("Choose a course before starting a quiz.");
}

const quizBackLink =
    document.querySelector("#quiz-back-link");


if (courseId) {
    quizBackLink.href = quizReturnUrl;

    document.querySelector("#quiz-interface-back-link").href =
        quizBackLink.href;
}


/* =========================================
   QUIZ LENGTH SELECTION
========================================= */

quizLengthButtons.forEach(
    function(button) {

        button.addEventListener(
            "click",
            function() {

                selectedQuestionCount =
                    Number(
                        button.dataset.questionCount
                    );


                startQuiz();

            }
        );

    }
);


/* =========================================
   START QUIZ
========================================= */

async function startQuiz() {

    if (!courseId || selectedMaterialIds.length === 0) {

        alert(
            "No course material was selected."
        );

        return;

    }


    setupScreen.style.display =
        "none";


    quizInterface.style.display =
        "block";


    questionText.textContent =
        "Generating your quiz...";


    answerContainer.innerHTML = "";


    submitButton.style.display =
        "none";


    resultBox.classList.remove(
        "show"
    );


    try {

        console.log(
            "Generating",
            selectedQuestionCount,
            "questions..."
        );


        const result =
            await StudyAI.api.post(
                `/api/courses/${courseId}/quizzes`,
                {
                    materialIds: selectedMaterialIds,
                    questionCount: selectedQuestionCount
                },
                { timeoutMs: 180000 }
            );


        questions =
            result.quiz.questions;

        generatedQuizId =
            result.id;

        submittedAnswers = [];

        score = 0;

        questionNumber = 1;


        if (
            !questions ||
            questions.length === 0
        ) {

            throw new Error(
                "The AI did not generate any questions."
            );

        }


        /*
            Use however many questions
            the AI actually returned.
        */

        totalQuestions.textContent =
            questions.length;


        questionNumber =
            1;


        score =
            0;


        loadQuestion();


    } catch (error) {

        console.error(
            "Quiz generation error:",
            error
        );


        questionText.textContent =
            "Unable to generate quiz.";


        answerContainer.innerHTML = "";

        const errorMessage =
            document.createElement("p");

        errorMessage.style.cssText =
            "color:#dc2626;text-align:center;padding:20px;";

        errorMessage.textContent =
            error.name === "AbortError"
                ? "The quiz took too long to generate. Please try again."
                : error.message;

        const retryButton =
            document.createElement("button");

        retryButton.className =
            "primary-button";

        retryButton.textContent =
            "Try Again";

        retryButton.addEventListener(
            "click",
            startQuiz
        );

        answerContainer.appendChild(errorMessage);
        answerContainer.appendChild(retryButton);


        submitButton.style.display =
            "none";

    }

}


/* =========================================
   LOAD QUESTION
========================================= */

function loadQuestion() {

    const question =
        questions[
            questionNumber - 1
        ];


    if (!question) {

        finishQuiz();

        return;

    }


    selectedAnswer =
        null;


    quizSubmitted =
        false;


    questionText.textContent =
        question.question;


    currentQuestion.textContent =
        questionNumber;


    totalQuestions.textContent =
        questions.length;


    const progress =
        (
            questionNumber /
            questions.length
        ) * 100;


    progressBar.style.width =
        progress + "%";


    resultBox.classList.remove(
        "show"
    );


    submitButton.textContent =
        "Submit Answer";


    submitButton.style.display =
        "block";


    answerContainer.innerHTML =
        "";


    /*
        Create answer buttons
        dynamically from the AI response.
    */

    question.options.forEach(
        function(option, index) {

            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "answer-option";


            button.textContent =
                option;


            button.addEventListener(
                "click",
                function() {

                    selectAnswer(
                        button,
                        index
                    );

                }
            );


            answerContainer.appendChild(
                button
            );

        }
    );

}


/* =========================================
   SELECT ANSWER
========================================= */

function selectAnswer(
    button,
    index
) {

    if (quizSubmitted) {

        return;

    }


    const answerButtons =
        document.querySelectorAll(
            ".answer-option"
        );


    answerButtons.forEach(
        function(otherButton) {

            otherButton.classList.remove(
                "selected"
            );

        }
    );


    button.classList.add(
        "selected"
    );


    selectedAnswer =
        index;

}


/* =========================================
   SUBMIT BUTTON
========================================= */

submitButton.addEventListener(
    "click",
    function() {

        if (
            selectedAnswer === null
        ) {

            alert(
                "Please select an answer first."
            );

            return;

        }


        if (!quizSubmitted) {

            submitQuestion();

        } else {

            nextQuestion();

        }

    }
);


/* =========================================
   SUBMIT QUESTION
========================================= */

function submitQuestion() {

    const question =
        questions[
            questionNumber - 1
        ];


    quizSubmitted =
        true;


    const answerButtons =
        document.querySelectorAll(
            ".answer-option"
        );


    answerButtons.forEach(
        function(button, index) {

            if (
                index ===
                question.correctAnswer
            ) {

                button.classList.add(
                    "correct"
                );

            }


            if (
                index === selectedAnswer &&
                selectedAnswer !==
                question.correctAnswer
            ) {

                button.classList.add(
                    "incorrect"
                );

            }

        }
    );


    const isCorrect =
        selectedAnswer ===
        question.correctAnswer;


    if (isCorrect) {

        score++;

    }

    submittedAnswers[questionNumber - 1] = {
        questionNumber,
        selectedAnswer,
        correctAnswer: question.correctAnswer,
        correct: isCorrect
    };


    const feedbackTitle =
        resultBox.querySelector(
            ".feedback-title"
        );


    const feedbackText =
        resultBox.querySelector(
            "p"
        );


    if (isCorrect) {

        feedbackTitle.textContent =
            "Correct!";

        feedbackTitle.style.color =
            "#15803d";

    } else {

        feedbackTitle.textContent =
            "Not quite.";

        feedbackTitle.style.color =
            "#dc2626";

    }


    feedbackText.textContent =
        question.explanation ||
        "Review this concept in your course material.";


    resultBox.classList.add(
        "show"
    );


    submitButton.textContent =
        questionNumber ===
        questions.length

            ? "Finish Quiz"

            : "Next Question";

}


/* =========================================
   NEXT QUESTION
========================================= */

function nextQuestion() {

    if (
        questionNumber >=
        questions.length
    ) {

        finishQuiz();

        return;

    }


    questionNumber++;


    loadQuestion();

}


/* =========================================
   FINISH QUIZ
========================================= */

function finishQuiz() {

    const percentage =
        Math.round(
            (
                score /
                questions.length
            ) * 100
        );


    const quizContainer =
        document.querySelector(
            ".quiz-container"
        );


    quizContainer.innerHTML = `

        <div style="
            text-align:center;
            padding:30px 0;
        ">

            <div style="
                font-size:45px;
                margin-bottom:15px;
            ">
                🎉
            </div>


            <div class="eyebrow">
                QUIZ COMPLETE
            </div>


            <h2 style="
                margin-top:8px;
                font-size:28px;
            ">
                Great work!
            </h2>


            <p style="
                margin-top:10px;
                color:#7b8495;
            ">
                You completed the
                ${questions.length}-question
                practice quiz.
            </p>


            <div style="
                margin:30px auto;
                padding:25px;
                max-width:300px;
                background:#f8fafc;
                border-radius:12px;
            ">

                <div style="
                    color:#7b8495;
                    font-size:12px;
                ">
                    SCORE
                </div>


                <div style="
                    margin-top:5px;
                    font-size:38px;
                    font-weight:700;
                ">
                    ${percentage}%
                </div>


                <div style="
                    margin-top:5px;
                    color:#7b8495;
                    font-size:12px;
                ">
                    ${score} of
                    ${questions.length}
                    correct
                </div>

            </div>


            <button
                id="retake-quiz"
                class="primary-button"
                style="
                    margin-right:8px;
                "
            >
                Try Again
            </button>


            <a
                href="${quizReturnUrl}"
                class="primary-button"
                style="
                    display:inline-block;
                "
            >
                ${savedQuizId ? "Back to Saved Study" : quizOrigin === "material" ? "Back to Material" : "Back to Course"}
            </a>

        </div>

    `;

    const saveStatus = document.createElement("p");
    saveStatus.id = "attempt-save-status";
    saveStatus.style.cssText = "margin-top:14px;color:#7b8495;font-size:12px;";
    saveStatus.textContent = generatedQuizId
        ? "Saving this attempt…"
        : "This attempt could not be linked to a generated quiz.";
    quizContainer.querySelector("div").appendChild(saveStatus);

    if (generatedQuizId) {
        saveQuizAttempt(percentage, saveStatus);
    }


    const retakeButton =
        document.querySelector(
            "#retake-quiz"
        );


    retakeButton.addEventListener(
        "click",
        function() {

            location.reload();

        }
    );

}

async function saveQuizAttempt(percentage, statusElement) {
    try {
        await StudyAI.api.post(
            `/api/quizzes/${generatedQuizId}/attempts`,
            {
                score: percentage,
                answers: submittedAnswers,
                results: {
                    correct: score,
                    total: questions.length
                }
            }
        );
        statusElement.textContent = "Attempt saved to your course history.";
        statusElement.style.color = "#15803d";
    } catch (error) {
        statusElement.textContent = `Attempt not saved: ${error.message}`;
        statusElement.style.color = "#b42318";
    }
}

async function loadQuizContext() {
    if (!courseId) return;

    try {
        const course = await StudyAI.api.get(`/api/courses/${courseId}`);
        document.querySelector("#quiz-course-topic").textContent = course.courseCode;
        document.querySelector("#quiz-interface-course-topic").textContent = course.courseCode;
        quizBackLink.textContent = savedQuizId ? "← Saved Study" : `← Back to ${course.courseCode}`;
        document.querySelector("#quiz-interface-back-link").textContent =
            savedQuizId ? "← Saved Study" : `← Back to ${course.courseCode}`;
    } catch (error) {
        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        console.error("Could not load quiz course context:", error);
    }
}

loadQuizContext();

async function initializeQuizMaterials() {
    const container = document.querySelector("#quiz-material-selection");
    if (!courseId) return;
    if (savedQuizId) {
        document.querySelector("#quiz-material-selection-wrap").style.display = "none";
        setupScreen.style.display = "none";
        quizInterface.style.display = "block";
        questionText.textContent = "Loading saved quiz…";
        try {
            const saved = await StudyAI.api.get(`/api/courses/${courseId}/quizzes/${savedQuizId}`);
            questions = saved.quiz.questions;
            generatedQuizId = saved.id;
            selectedMaterialIds = saved.materialIds;
            submittedAnswers = [];
            score = 0;
            questionNumber = 1;
            totalQuestions.textContent = questions.length;
            loadQuestion();
        } catch (error) {
            if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That saved quiz is unavailable.");
            questionText.textContent = error.message;
        }
        return;
    }
    if (materialId) {
        document.querySelector("#quiz-material-selection-wrap").style.display = "none";
        return;
    }
    quizLengthButtons.forEach(button => { button.disabled = true; });
    try {
        const selector = await StudyAI.materialSelection.mount({
            container,
            courseId,
            initialMaterialIds: []
        });
        container.addEventListener("change", () => {
            selectedMaterialIds = selector.getSelectedIds();
            quizLengthButtons.forEach(button => {
                button.disabled = selectedMaterialIds.length === 0;
            });
        });
        selectedMaterialIds = selector.getSelectedIds();
    } catch (error) {
        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        container.innerHTML = '<div class="friendly-empty error-state"></div>';
        container.firstElementChild.textContent = error.message;
    }
}

initializeQuizMaterials();
