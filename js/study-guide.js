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

    loadingBox.hidden =
        false;


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

    loadingBox.hidden =
        true;

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


    text = normalizeLegacyGuideMath(text);



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

    renderGuideContent(
        keyConcepts,
        concepts,
        "Key Concepts"
    );



    /* -----------------------------------------
       DISPLAY DEFINITIONS
    ----------------------------------------- */

    importantTopics.innerHTML =
        "";

    renderGuideContent(
        importantTopics,
        definitions,
        "Definitions"
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
   SAFE MARKDOWN + MATH RENDERING
========================================= */

function normalizeLegacyGuideMath(text) {
    let insideDisplayMath = false;
    const normalized = String(text || "").split("\n").map(line => {
        const trimmed = line.trim();
        const withoutListMarker = trimmed.replace(/^(?:[-*]|\d+\.)\s+/, "");

        if (/^\\\[$/.test(withoutListMarker)) {
            insideDisplayMath = true;
            return "\\[";
        }
        if (/^\\\]$/.test(withoutListMarker)) {
            insideDisplayMath = false;
            return "\\]";
        }
        if (insideDisplayMath) return withoutListMarker;
        return line;
    }).join("\n");

    return normalized
        .replace(/\\\(([\s\S]*?)\\\)/g, (match, math) =>
            `\\(${math.replace(/\\_/g, "_")}\\)`)
        .replace(/\\\[([\s\S]*?)\\\]/g, (match, math) =>
            `\\[${math.replace(/\\_/g, "_")}\\]`);
}

function appendMath(container, expression, displayMode) {
    const math = document.createElement(displayMode ? "div" : "span");
    math.className = displayMode ? "guide-math-display" : "guide-math-inline";
    const normalizedExpression = expression.trim().replace(/\\_/g, "_");

    if (window.katex?.render) {
        window.katex.render(normalizedExpression, math, {
            displayMode,
            throwOnError: false,
            strict: false,
            trust: false,
            output: "htmlAndMathml"
        });
    } else {
        math.textContent = normalizedExpression;
    }
    container.appendChild(math);
}

function appendInlineFormatting(container, text) {
    const pattern = /(\\\([\s\S]*?\\\)|\*\*[\s\S]+?\*\*)/g;
    let cursor = 0;

    for (const match of text.matchAll(pattern)) {
        if (match.index > cursor) {
            container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
        }
        const token = match[0];
        if (token.startsWith("\\(")) {
            appendMath(container, token.slice(2, -2), false);
        } else {
            const strong = document.createElement("strong");
            strong.textContent = token.slice(2, -2);
            container.appendChild(strong);
        }
        cursor = match.index + token.length;
    }
    if (cursor < text.length) {
        container.appendChild(document.createTextNode(text.slice(cursor)));
    }
}

function guideEntries(text) {
    const entries = [];
    let current = null;
    let insideDisplayMath = false;

    normalizeLegacyGuideMath(text).split("\n").forEach(rawLine => {
        const line = rawLine.trim();
        if (line.startsWith("\\[")) insideDisplayMath = true;
        const numbered = !insideDisplayMath && /^(\d+)\.\s+(.*)$/.exec(line);
        if (numbered) {
            current = { number: numbered[1], lines: [numbered[2]] };
            entries.push(current);
        } else {
            if (!current) {
                current = { number: null, lines: [] };
                entries.push(current);
            }
            current.lines.push(line);
        }
        if (line.endsWith("\\]")) insideDisplayMath = false;
    });

    return entries.filter(entry => entry.lines.some(Boolean));
}

function renderEntryLines(entry, lines) {
    for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index];
        if (!line) continue;

        if (line.startsWith("\\[")) {
            const equation = [line.slice(2)];
            while (!equation[equation.length - 1].includes("\\]") && index + 1 < lines.length) {
                equation.push(lines[++index]);
            }
            const joined = equation.join(" ");
            const closingIndex = joined.lastIndexOf("\\]");
            appendMath(entry, closingIndex >= 0 ? joined.slice(0, closingIndex) : joined, true);
            continue;
        }

        let className = "guide-entry-copy";
        if (/^[-*]\s+/.test(line)) {
            className += " guide-entry-subitem";
            line = line.replace(/^[-*]\s+/, "");
        }
        const heading = /^#{1,4}\s+(.*)$/.exec(line);
        const element = document.createElement(heading ? "h4" : "p");
        element.className = heading ? "guide-entry-title" : className;
        appendInlineFormatting(element, heading ? heading[1] : line);
        entry.appendChild(element);
    }
}

function renderGuideContent(container, text, sectionTitle) {
    container.innerHTML = "";
    container.className = `guide-content guide-content-${sectionTitle.toLowerCase().replace(/\s+/g, "-")}`;
    const entries = guideEntries(text);

    if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "guide-entry-copy";
        empty.textContent = "No information was generated.";
        container.appendChild(empty);
        return;
    }

    entries.forEach(({ number, lines }) => {
        const entry = document.createElement("article");
        entry.className = "guide-entry";
        if (number) {
            const marker = document.createElement("span");
            marker.className = "guide-entry-number";
            marker.textContent = number;
            marker.setAttribute("aria-hidden", "true");
            entry.appendChild(marker);
        } else {
            entry.classList.add("unnumbered");
        }
        const body = document.createElement("div");
        body.className = "guide-entry-body";
        renderEntryLines(body, lines);
        entry.appendChild(body);
        container.appendChild(entry);
    });
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


    const renderedContent = document.createElement("div");
    renderGuideContent(renderedContent, content, title);
    section.appendChild(renderedContent);


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
