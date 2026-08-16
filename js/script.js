const answerButtons = document.querySelectorAll(".answer-option");
const submitButton = document.querySelector(".submit-answer");
const resultBox = document.querySelector("#quiz-result");

let selectedAnswer = null;


// QUIZ PAGE CODE
if (answerButtons.length > 0 && submitButton && resultBox) {

    answerButtons.forEach(function(button) {

        button.addEventListener("click", function() {

            answerButtons.forEach(function(otherButton) {
                otherButton.classList.remove("selected");
            });

            button.classList.add("selected");

            selectedAnswer = button.id;

            resultBox.textContent = "";
            resultBox.className = "";
        });

    });


    submitButton.addEventListener("click", function() {

        if (selectedAnswer === null) {

            resultBox.textContent =
                "Please select an answer first.";

            return;
        }

        if (selectedAnswer === "answer-b") {

            resultBox.textContent =
                "Correct! Higher prices generally lead to a lower quantity demanded.";

            resultBox.className =
                "correct-result";

        } else {

            resultBox.textContent =
                "Not quite. Think about the relationship between price and quantity demanded.";

            resultBox.className =
                "incorrect-result";
        }

    });

}

// COURSE PAGE CODE

const unitsContainer = document.querySelector("#units-container");

if (unitsContainer) {

    const urlParams = new URLSearchParams(window.location.search);
    const selectedCourse = urlParams.get("course");

    const course = courses.find(function(course) {
        return course.id === selectedCourse;
    });

    if (course) {

        const courseName = document.querySelector("#course-name");
        const courseSchool = document.querySelector("#course-school");
        const courseDescription = document.querySelector("#course-description");

        courseName.textContent = course.name;
        courseSchool.textContent = course.school;
        courseDescription.textContent = course.description;


        course.units.forEach(function(unit) {

    const progressKey =
        `progress_${course.id}_unit_${unit.id}`;

    const completedQuestions =
        JSON.parse(localStorage.getItem(progressKey)) || [];

    const attemptKey =
        `attempts_${course.id}_unit_${unit.id}`;

    const attempts =
        Number(localStorage.getItem(attemptKey)) || 0;

    const totalQuestions =
        questions.filter(function(question) {
            return (
                question.course === course.id &&
                question.unit === unit.id
            );
        }).length;

    const progress =
        totalQuestions > 0
            ? Math.round(
                (completedQuestions.length / totalQuestions) * 100
            )
            : 0;

    let status = "Not started";

    if (progress > 0 && progress < 100) {
        status = "In progress";
    }

    if (progress === 100) {
        status = "Completed";
    }

    const unitCard = document.createElement("div");

    unitCard.classList.add("unit-card");

    unitCard.innerHTML = `
        <div>
            <p class="unit-label">UNIT ${unit.id}</p>

            <h3>${unit.name}</h3>

            <p>${unit.description}</p>

            <p class="unit-status ${status.toLowerCase().replace(" ", "-")}">
                ${status}
            </p>

            <div class="unit-progress">

                <div class="progress-header">
                    <span>Progress</span>
                    <span>${progress}%</span>
                </div>

                <p class="attempt-count">
                    ${attempts} question${attempts === 1 ? "" : "s"} attempted
                </p>

                <div class="progress-track">
                    <div
                        class="progress-bar"
                        style="width: ${progress}%"
                    ></div>
                </div>

            </div>
        </div>

        <div class="unit-actions">

            <a href="quiz.html?course=${course.id}&unit=${unit.id}">
                <button>Practice Quiz</button>
            </a>

            <button
                class="reset-progress"
                data-course="${course.id}"
                data-unit="${unit.id}"
            >
                Reset Progress
            </button>

        </div>
    `;

    unitsContainer.appendChild(unitCard);

    const resetButton =
        unitCard.querySelector(".reset-progress");

    resetButton.addEventListener("click", function() {

        const confirmed =
            confirm("Are you sure you want to reset this unit's progress?");

        if (!confirmed) {
            return;
        }

        const progressKey =
            `progress_${course.id}_unit_${unit.id}`;

        const attemptKey =
            `attempts_${course.id}_unit_${unit.id}`;

        localStorage.removeItem(progressKey);
        localStorage.removeItem(attemptKey);

        location.reload();
    });

});


    }
        else {
    const courseContent = document.querySelector("#course-content");
    const courseError = document.querySelector("#course-error");

            if (courseContent) {
                courseContent.style.display = "none";
            }

            if (courseError) {
                courseError.style.display = "block";
            }
    }
}