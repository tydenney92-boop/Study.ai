// =========================================
// MATERIAL VIEWER
// =========================================


// Get the material ID from the URL.
//
// Example:
//
// material.html?id=3
//
// gives us:
//
// id = 3

const urlParams =
    new URLSearchParams(
        window.location.search
    );


const materialId =
    urlParams.get("id");


// Get elements from the page

const title =
    document.querySelector(
        "#material-title"
    );


const subtitle =
    document.querySelector(
        "#material-subtitle"
    );


const type =
    document.querySelector(
        "#material-type"
    );


const unit =
    document.querySelector(
        "#material-unit"
    );


const size =
    document.querySelector(
        "#material-size"
    );


const date =
    document.querySelector(
        "#material-date"
    );


const content =
    document.querySelector(
        "#material-content"
    );


const status =
    document.querySelector(
        "#content-status"
    );


const errorBox =
    document.querySelector(
        "#material-error"
    );


const quizLink =
    document.querySelector(
        "#material-quiz-link"
    );

const studyGuideLink =
    document.querySelector(
        "#material-study-guide-link"
    );

const flashcardsLink =
    document.querySelector(
        "#material-flashcards-link"
    );


// =========================================
// CHECK MATERIAL ID
// =========================================

if (!materialId) {

    showError();

}


if (materialId) {

    const selectedMaterial =
        encodeURIComponent(materialId);

    quizLink.href =
        "quiz.html?materialId=" + selectedMaterial;

    studyGuideLink.href =
        "study-guide.html?materialId=" + selectedMaterial;

    flashcardsLink.href =
        "flashcards.html?materialId=" + selectedMaterial;

}


// =========================================
// LOAD MATERIAL
// =========================================

async function loadMaterial() {

    try {

        const response =
            await StudyAI.fetchWithTimeout(
                StudyAI.apiUrl(
                    "/api/materials/" +
                    encodeURIComponent(materialId)
                )
            );


        if (!response.ok) {

            throw new Error(
                "Could not load material."
            );

        }


        const material =
            await response.json();


        displayMaterial(
            material
        );


    } catch (error) {

        console.error(
            "Error loading material:",
            error
        );


        showError();

    }

}


// =========================================
// DISPLAY MATERIAL
// =========================================

function displayMaterial(
    material
) {

    // Title

    title.textContent =
        material.name;


    // Subtitle

    subtitle.textContent =
        `${material.original_name}`;


    // Type

    type.textContent =
        material.type.toUpperCase();


    // Unit

    unit.textContent =
        formatUnit(
            material.unit
        );


    // File size

    size.textContent =
        formatFileSize(
            material.file_size
        );


    // Date

    date.textContent =
        formatDate(
            material.created_at
        );


    // Content

    if (
        material.text_content &&
        material.text_content.trim() !== ""
    ) {

        content.textContent =
            material.text_content;


        status.textContent =
            "Text extracted";


    } else {

        content.innerHTML = `

            <div class="empty-content">

                <div>
                    —
                </div>

                <h3>
                    No extracted text
                </h3>

                <p>
                    This material does not contain
                    readable text yet.
                </p>

            </div>

        `;


        status.textContent =
            "No text available";

    }

}


// =========================================
// FORMAT UNIT
// =========================================

function formatUnit(
    unit
) {

    if (!unit) {

        return "—";

    }


    return unit
        .replace(
            "unit",
            "Unit "
        );

}


// =========================================
// FORMAT FILE SIZE
// =========================================

function formatFileSize(
    bytes
) {

    if (!bytes) {

        return "—";

    }


    if (bytes < 1024) {

        return `${bytes} B`;

    }


    if (bytes < 1024 * 1024) {

        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;

    }


    return `${(
        bytes /
        (1024 * 1024)
    ).toFixed(1)} MB`;

}


// =========================================
// FORMAT DATE
// =========================================

function formatDate(
    dateString
) {

    if (!dateString) {

        return "—";

    }


    const date =
        new Date(
            dateString
        );


    return date.toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );

}


// =========================================
// SHOW ERROR
// =========================================

function showError() {

    errorBox.style.display =
        "block";


    document
        .querySelector(
            ".material-content-panel"
        )
        .style.display =
            "none";

}


// =========================================
// START
// =========================================

if (materialId) {

    loadMaterial();

}
