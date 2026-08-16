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

const params =
    new URLSearchParams(
        window.location.search
    );

const materialId =
    params.get("materialId");


/* =========================================
   GENERATE STUDY GUIDE
========================================= */

async function generateStudyGuide() {

    if (!materialId) {

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

        const response =
            await fetch(
                "http://localhost:3000/api/study-guide",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            materialIds: [
                                Number(materialId)
                            ]

                        })

                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Could not generate study guide."
            );

        }


        displayStudyGuide(
            result.studyGuide
        );


    } catch (error) {

        console.error(
            "Study guide error:",
            error
        );


        guideSummary.textContent =
            "There was a problem generating the study guide.";

        alert(
            error.message
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

function displayStudyGuide(guide) {

    /* -----------------------------------------
       BASIC PAGE INFORMATION
    ----------------------------------------- */

    pageTitle.textContent =
        "AI Study Guide";

    guideTitle.textContent =
        "AI Study Guide";

    guideSummary.textContent =
        "Generated from your uploaded course material.";

    sourceMaterial.textContent =
        "Material #" + materialId;



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
        formulas
    );



    /* -----------------------------------------
       ADD COMMON MISTAKES
    ----------------------------------------- */

    addExtraGuideSection(
        "Common Mistakes",
        mistakes
    );



    /* -----------------------------------------
       ADD EXAM QUESTIONS
    ----------------------------------------- */

    addExtraGuideSection(
        "Exam Questions",
        questions
    );

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


    const endIndex =
        text.toUpperCase().indexOf(
            endTitle,
            contentStart
        );


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
    content
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


    headingNumber.textContent =
        "AI";


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

if (materialId) {

    generateStudyGuide();

}