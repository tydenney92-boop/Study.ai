/* =========================================
   STUDY GUIDE
========================================= */


/* =========================================
   PAGE ELEMENTS
========================================= */

const pageTitle =
    document.querySelector("#guide-page-title");

const pageSubtitle =
    document.querySelector("#guide-page-subtitle");

const guideTitle =
    document.querySelector("#guide-title");

const guideSummary =
    document.querySelector("#guide-summary");

const keyConcepts =
    document.querySelector("#key-concepts");

const importantTopics =
    document.querySelector("#important-topics");

const sourceMaterial =
    document.querySelector("#source-material");

const generateButton =
    document.querySelector("#generate-guide-button");

const loadingBox =
    document.querySelector("#guide-loading");


/* =========================================
   GET MATERIAL ID FROM URL
========================================= */

const courseId =
    StudyAI.courseContext.getCourseId();

const materialId =
    StudyAI.courseContext.getMaterialId();

const savedGuideId = (() => {
    const value = Number(new URLSearchParams(window.location.search).get("guideId"));
    return Number.isInteger(value) && value > 0 ? value : null;
})();

let selectedMaterialIds = materialId ? [Number(materialId)] : [];

if (!courseId) {
    StudyAI.courseContext.goToMyCourses("Choose a course before creating a study guide.");
}

const guideQuizLink =
    document.querySelector("#guide-quiz-link");


if (courseId && materialId) {

    guideQuizLink.href =
        StudyAI.courseContext.url("quiz.html", {
            courseId,
            materialId
        });

    document.querySelector("#guide-back-link").href =
        StudyAI.courseContext.url("material.html", {
            courseId,
            materialId
        });

}
else if (courseId) {
    document.querySelector("#guide-back-link").href =
        StudyAI.courseContext.url("course.html", { courseId });
}

if (courseId && !materialId) {
    guideQuizLink.href = StudyAI.courseContext.url("quiz.html", { courseId });
}


/* =========================================
   GENERATE STUDY GUIDE
========================================= */

async function generateStudyGuide() {

    if (!courseId || selectedMaterialIds.length === 0) {

        guideSummary.textContent =
            "No course material has been selected.";

        return;

    }


    generateButton.disabled =
        true;

    generateButton.textContent =
        "Generating...";

    loadingBox.style.display =
        "block";


    try {

        const result =
            await StudyAI.api.post(
                `/api/courses/${courseId}/study-guides`,
                { materialIds: selectedMaterialIds },
                { timeoutMs: 120000 }
            );


        displayStudyGuide(
            result.generatedContent,
            result
        );


    } catch (error) {

        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }

        console.error(
            "Study guide error:",
            error
        );


        guideSummary.textContent =
            "There was a problem generating the study guide.";

        StudyAI.ui.notify(
            error.name === "AbortError"
                ? "The study guide took too long to generate. Please try again."
                : error.message,
            { type: "error" }
        );

    }


    generateButton.disabled =
        false;

    generateButton.textContent =
        "Generate Study Guide";

    loadingBox.style.display =
        "none";

}


/* =========================================
   DISPLAY STUDY GUIDE
========================================= */

function displayStudyGuide(guide, metadata = null) {

    /* -----------------------------------------
       BASIC PAGE INFORMATION
    ----------------------------------------- */

    pageTitle.textContent =
        "AI Study Guide";

    guideTitle.textContent =
        "AI Study Guide";

    guideSummary.textContent =
        "Generated from your uploaded course material.";

    sourceMaterial.textContent = metadata?.sources?.length
        ? metadata.sources.map(source => source.materialName).join(", ")
        : selectedMaterialIds.length === 1
            ? `Material #${selectedMaterialIds[0]}`
            : `${selectedMaterialIds.length} selected materials`;
    if (metadata?.createdAt) {
        guideSummary.textContent = `Saved ${new Date(`${metadata.createdAt.replace(" ", "T")}Z`).toLocaleString()}.`;
    }



    /* -----------------------------------------
       CLEAN AI RESPONSE
    ----------------------------------------- */

    let text =
        guide;


    if (
        typeof text !== "string"
    ) {

        text =
            JSON.stringify(
                text
            );

    }


    /*
       Remove markdown formatting that
       Ollama may add.
    */

    text =
        text.replace(
            /\*\*/g,
            ""
        );



    /* -----------------------------------------
       FIND SECTIONS
    ----------------------------------------- */

    const concepts =
        extractSection(
            text,
            "KEY CONCEPTS",
            "DEFINITIONS"
        );


    const definitions =
        extractSection(
            text,
            "DEFINITIONS",
            "FORMULAS"
        );


    const formulas =
        extractSection(
            text,
            "FORMULAS",
            "COMMON MISTAKES"
        );


    const mistakes =
        extractSection(
            text,
            "COMMON MISTAKES",
            "EXAM QUESTIONS"
        );


    const questions =
        extractSection(
            text,
            "EXAM QUESTIONS",
            "ADDITIONAL TIPS"
        );

    const tips =
        extractSection(
            text,
            "ADDITIONAL TIPS",
            null
        );



    /* -----------------------------------------
       DISPLAY KEY CONCEPTS
    ----------------------------------------- */

    keyConcepts.innerHTML =
        "";

    addTextAsList(
        keyConcepts,
        concepts
    );



    /* -----------------------------------------
       DISPLAY DEFINITIONS
    ----------------------------------------- */

    importantTopics.innerHTML =
        "";

    addTextAsList(
        importantTopics,
        definitions
    );



    /* -----------------------------------------
       ADD FORMULAS
    ----------------------------------------- */

    addExtraGuideSection(
        "Formulas",
        formulas,
        "03"
    );



    /* -----------------------------------------
       ADD COMMON MISTAKES
    ----------------------------------------- */

    addExtraGuideSection(
        "Common Mistakes",
        mistakes,
        "04"
    );



    /* -----------------------------------------
       ADD EXAM QUESTIONS
    ----------------------------------------- */

    addExtraGuideSection(
        "Exam Questions",
        questions,
        "05"
    );

    addExtraGuideSection(
        "Additional Tips",
        tips,
        "06"
    );

    const sourceSection = document.querySelector("#source-section");
    const quickReview = document.querySelector("#quick-review");
    if (sourceSection && quickReview) {
        sourceSection.querySelector(".guide-section-heading span").textContent = "07";
        quickReview.parentElement.insertBefore(sourceSection, quickReview);
    }

}


/* =========================================
   EXTRACT SECTION
========================================= */

function extractSection(
    text,
    startTitle,
    endTitle
) {

    const startIndex =
        text.toUpperCase().indexOf(
            startTitle
        );


    if (startIndex === -1) {

        return "";

    }


    const contentStart =
        startIndex +
        startTitle.length;


    const endIndex = endTitle
        ? text.toUpperCase().indexOf(endTitle, contentStart)
        : -1;


    if (endIndex === -1) {

        return text
            .substring(
                contentStart
            )
            .trim();

    }


    return text
        .substring(
            contentStart,
            endIndex
        )
        .trim();

}


/* =========================================
   ADD TEXT AS LIST
========================================= */

function addTextAsList(
    container,
    text
) {

    if (!text) {

        const li =
            document.createElement(
                "li"
            );

        li.textContent =
            "No information was generated.";

        container.appendChild(
            li
        );

        return;

    }


    const lines =
        text
            .split("\n")
            .map(
                function(line) {

                    return line
                        .trim();

                }
            )
            .filter(
                function(line) {

                    return (
                        line.length > 0
                    );

                }
            );


    lines.forEach(
        function(line) {

            /*
               Remove numbering such as:

               1.
               2.
               3.
            */

            line =
                line.replace(
                    /^\d+\.\s*/,
                    ""
                );


            const li =
                document.createElement(
                    "li"
                );


            li.textContent =
                line;


            container.appendChild(
                li
            );

        }
    );

}


/* =========================================
   ADD EXTRA GUIDE SECTION
========================================= */

function addExtraGuideSection(
    title,
    content,
    number
) {

    if (!content) {

        return;

    }


    /*
       Remove an existing version of
       this section if the button is
       clicked again.
    */

    const existingSection =
        document.querySelector(
            `[data-ai-section="${title}"]`
        );


    if (existingSection) {

        existingSection.remove();

    }


    const section =
        document.createElement(
            "section"
        );


    section.className =
        "guide-section";

    section.id = title.toLowerCase().replace(/\s+/g, "-");


    section.dataset.aiSection =
        title;


    const heading =
        document.createElement(
            "div"
        );


    heading.className =
        "guide-section-heading";


    const headingNumber =
        document.createElement(
            "span"
        );


    headingNumber.textContent = number;


    const headingTitle =
        document.createElement(
            "h3"
        );


    headingTitle.textContent =
        title;


    heading.appendChild(
        headingNumber
    );

    heading.appendChild(
        headingTitle
    );


    section.appendChild(
        heading
    );


    /*
       Convert the AI text into
       individual list items.
    */

    const list =
        document.createElement(
            "ul"
        );


    list.className =
        "guide-list";


    const lines =
        content
            .split("\n")
            .map(
                function(line) {

                    return line.trim();

                }
            )
            .filter(
                function(line) {

                    return line.length > 0;

                }
            );


    lines.forEach(
        function(line) {

            line =
                line.replace(
                    /^\d+\.\s*/,
                    ""
                );


            const li =
                document.createElement(
                    "li"
                );


            li.textContent =
                line;


            list.appendChild(
                li
            );

        }
    );


    section.appendChild(
        list
    );


    const studyGuide =
        document.querySelector(
            ".study-guide"
        );


    const quickReview =
        document.querySelector(
            ".quick-review"
        );


    studyGuide.insertBefore(
        section,
        quickReview
    );

}


/* =========================================
   GENERATE BUTTON
========================================= */

generateButton.addEventListener(
    "click",
    generateStudyGuide
);


/* =========================================
   START
========================================= */

async function loadSavedGuide() {
    document.querySelector("#guide-material-selection-wrap").style.display = "none";
    generateButton.style.display = "none";
    document.querySelector("#guide-back-link").href =
        StudyAI.courseContext.url("history.html", { courseId });
    document.querySelector("#guide-back-link").textContent = "← Saved Study";
    try {
        const guide = await StudyAI.api.get(
            `/api/courses/${courseId}/study-guides/${savedGuideId}`
        );
        selectedMaterialIds = guide.materialIds;
        displayStudyGuide(guide.generatedContent, guide);
    } catch (error) {
        if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That saved guide is unavailable.");
        guideSummary.textContent = error.message;
    }
}

if (courseId && savedGuideId) {
    loadSavedGuide();
}
else if (courseId && materialId) {

    document.querySelector("#guide-material-selection-wrap").style.display = "none";
    generateButton.disabled = false;
    guideSummary.textContent = "Generate a guide from the selected material when you are ready.";

}
else if (courseId) {
    generateButton.disabled = true;
    StudyAI.materialSelection.mount({
        container: document.querySelector("#guide-material-selection"),
        courseId,
        actionButton: generateButton
    }).then(selector => {
        document.querySelector("#guide-material-selection").addEventListener("change", () => {
            selectedMaterialIds = selector.getSelectedIds();
        });
    }).catch(error => {
        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        guideSummary.textContent = error.message;
    });
}
