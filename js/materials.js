/* =========================================
   MATERIALS PAGE
========================================= */


const materialsContainer =
    document.querySelector("#materials-container");

const emptyMaterials =
    document.querySelector("#empty-materials");

const searchInput =
    document.querySelector("#material-search");

const unitFilter =
    document.querySelector("#unit-filter");

const typeFilter =
    document.querySelector("#type-filter");


/* =========================================
   UPLOAD ELEMENTS
========================================= */

const uploadButton =
    document.querySelector("#upload-button");

const uploadButtonBottom =
    document.querySelector(
        "#upload-button-bottom"
    );

const fileInput =
    document.querySelector("#file-input");


const uploadModal =
    document.querySelector("#upload-modal");

const closeUploadModal =
    document.querySelector(
        "#close-upload-modal"
    );

const cancelUpload =
    document.querySelector(
        "#cancel-upload"
    );

const modalFileButton =
    document.querySelector(
        "#modal-file-button"
    );

const modalFileInput =
    document.querySelector(
        "#file-input"
    );

const selectedFile =
    document.querySelector(
        "#selected-file"
    );

const uploadUnitModal =
    document.querySelector(
        "#upload-unit-modal"
    );

const confirmUpload =
    document.querySelector(
        "#confirm-upload"
    );


let allMaterials = [];

let selectedUploadFile = null;



/* =========================================
   LOAD MATERIALS
========================================= */

async function loadMaterials() {

    try {

        const response =
            await fetch(
                "http://localhost:3000/api/materials"
            );


        if (!response.ok) {

            throw new Error(
                "Could not load materials."
            );

        }


        allMaterials =
            await response.json();


        displayMaterials(
            allMaterials
        );


    } catch (error) {

        console.error(
            "Error loading materials:",
            error
        );

    }

}



/* =========================================
   DISPLAY MATERIALS
========================================= */

function displayMaterials(
    materials
) {

    materialsContainer.innerHTML =
        "";


    if (materials.length === 0) {

        emptyMaterials.style.display =
            "block";

        return;

    }


    emptyMaterials.style.display =
        "none";


    const units = {};


    materials.forEach(
        function(material) {

            if (!units[material.unit]) {

                units[material.unit] =
                    [];

            }


            units[
                material.unit
            ].push(material);

        }
    );


    Object.keys(units).forEach(
        function(unit) {

            const unitMaterials =
                units[unit];


            const section =
                document.createElement(
                    "section"
                );

            section.className =
                "material-unit";


            section.dataset.unit =
                unit;



            /* =================================
               UNIT HEADER
            ================================= */

            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "unit-header";


            const titleWrapper =
                document.createElement(
                    "div"
                );


            const number =
                document.createElement(
                    "span"
                );

            number.className =
                "unit-number";

            number.textContent =
                unit.toUpperCase();


            const heading =
                document.createElement(
                    "h2"
                );

            heading.textContent =
                getUnitName(unit);


            titleWrapper.appendChild(
                number
            );

            titleWrapper.appendChild(
                heading
            );


            const count =
                document.createElement(
                    "span"
                );

            count.className =
                "unit-count";

            count.textContent =
                unitMaterials.length +
                (
                    unitMaterials.length === 1
                        ? " material"
                        : " materials"
                );


            header.appendChild(
                titleWrapper
            );

            header.appendChild(
                count
            );



            /* =================================
               MATERIAL GRID
            ================================= */

            const grid =
                document.createElement(
                    "div"
                );

            grid.className =
                "materials-grid";


            unitMaterials.forEach(
                function(material) {

                    grid.appendChild(
                        createMaterialCard(
                            material
                        )
                    );

                }
            );


            section.appendChild(
                header
            );

            section.appendChild(
                grid
            );


            materialsContainer.appendChild(
                section
            );

        }
    );

}



/* =========================================
   MATERIAL CARD
========================================= */

function createMaterialCard(
    material
) {

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "material-card";


    /*
        Make the entire card clickable.

        Example:

        material.html?id=3
    */

    card.addEventListener(
        "click",
        function() {

            window.location.href =
                `material.html?id=${material.id}`;

        }
    );


    /* =================================
       ICON
    ================================= */

    const icon =
        document.createElement(
            "div"
        );

    icon.className =
        "material-icon " +
        material.type;

    icon.textContent =
        getMaterialLabel(
            material.type
        );



    /* =================================
       INFO
    ================================= */

    const info =
        document.createElement(
            "div"
        );

    info.className =
        "material-info";


    const title =
        document.createElement(
            "h3"
        );

    title.textContent =
        material.name;


    const description =
        document.createElement(
            "p"
        );

    description.textContent =
        getMaterialDescription(
            material
        );


    const details =
        document.createElement(
            "span"
        );

    details.textContent =
        getMaterialTypeLabel(
            material.type
        );


    info.appendChild(
        title
    );

    info.appendChild(
        description
    );

    info.appendChild(
        details
    );



    /* =================================
       MENU BUTTON
    ================================= */

    const menu =
    document.createElement(
        "button"
    );

    menu.className =
        "material-menu";

    menu.textContent =
        "Study";

    menu.setAttribute(
        "aria-label",
        "Material options"
    );

    menu.addEventListener(
    "click",
    function() {

        window.location.href =
            "study-guide.html?materialId=" +
            material.id;

    }
    );


    /*
        Prevent clicking the menu from
        opening the material viewer.
    */

    menu.addEventListener(
        "click",
        function(event) {

            event.stopPropagation();

        }
    );


    /* =================================
       BUILD CARD
    ================================= */

    card.appendChild(
        icon
    );

    card.appendChild(
        info
    );

    card.appendChild(
        menu
    );


    return card;

}



/* =========================================
   OPEN UPLOAD MODAL
========================================= */

function openUploadModal() {

    uploadModal.classList.add(
        "active"
    );

}



/* =========================================
   CLOSE UPLOAD MODAL
========================================= */

function closeModal() {

    uploadModal.classList.remove(
        "active"
    );


    selectedUploadFile =
        null;


    selectedFile.textContent =
        "";

    modalFileInput.value =
        "";

}



/* =========================================
   CHOOSE FILE
========================================= */

modalFileButton.addEventListener(
    "click",
    function() {

        modalFileInput.click();

    }
);


modalFileInput.addEventListener(
    "change",
    function() {

        if (
            modalFileInput.files.length === 0
        ) {

            return;

        }


        selectedUploadFile =
            modalFileInput.files[0];


        selectedFile.textContent =
            selectedUploadFile.name;

    }
);



/* =========================================
   UPLOAD TO BACKEND
========================================= */

async function uploadMaterial() {

    if (!selectedUploadFile) {

        alert(
            "Please choose a file first."
        );

        return;

    }


    const formData =
        new FormData();


    formData.append(
        "file",
        selectedUploadFile
    );


    formData.append(
        "unit",
        uploadUnitModal.value
    );


    confirmUpload.disabled =
        true;

    confirmUpload.textContent =
        "Uploading...";


    try {

        const response =
            await fetch(
                "http://localhost:3000/api/materials",
                {
                    method: "POST",
                    body: formData
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Upload failed."
            );

        }


        console.log(
            "Upload successful:",
            result
        );


        closeModal();


        await loadMaterials();


    } catch (error) {

        console.error(
            "Upload error:",
            error
        );


        alert(
            "There was a problem uploading the file."
        );

    }


    confirmUpload.disabled =
        false;

    confirmUpload.textContent =
        "Upload Material";

}



/* =========================================
   MODAL BUTTONS
========================================= */

uploadButton.addEventListener(
    "click",
    openUploadModal
);


uploadButtonBottom.addEventListener(
    "click",
    openUploadModal
);


closeUploadModal.addEventListener(
    "click",
    closeModal
);


cancelUpload.addEventListener(
    "click",
    closeModal
);


confirmUpload.addEventListener(
    "click",
    uploadMaterial
);



/* =========================================
   CLOSE MODAL OUTSIDE
========================================= */

uploadModal.addEventListener(
    "click",
    function(event) {

        if (
            event.target ===
            uploadModal
        ) {

            closeModal();

        }

    }
);



/* =========================================
   SEARCH + FILTER
========================================= */

function filterMaterials() {

    const search =
        searchInput.value
            .toLowerCase()
            .trim();


    const unit =
        unitFilter.value;


    const type =
        typeFilter.value;


    const filtered =
        allMaterials.filter(
            function(material) {

                const matchesSearch =
                    material.name
                        .toLowerCase()
                        .includes(search);


                const matchesUnit =
                    unit === "all" ||
                    material.unit === unit;


                const matchesType =
                    type === "all" ||
                    material.type === type;


                return (
                    matchesSearch &&
                    matchesUnit &&
                    matchesType
                );

            }
        );


    displayMaterials(
        filtered
    );

}


searchInput.addEventListener(
    "input",
    filterMaterials
);


unitFilter.addEventListener(
    "change",
    filterMaterials
);


typeFilter.addEventListener(
    "change",
    filterMaterials
);



/* =========================================
   HELPERS
========================================= */

function getUnitName(
    unit
) {

    const names = {

        unit1:
            "Introduction to Economics",

        unit2:
            "Supply & Demand",

        unit3:
            "Macroeconomics",

        unit4:
            "GDP & Economic Growth",

        unit5:
            "Fiscal & Monetary Policy"

    };


    return names[unit] ||
        "Course Materials";

}



function getMaterialLabel(
    type
) {

    const labels = {

        pdf:
            "PDF",

        notes:
            "TXT",

        slides:
            "PPT"

    };


    return labels[type] ||
        "FILE";

}



function getMaterialTypeLabel(
    type
) {

    const labels = {

        pdf:
            "PDF",

        notes:
            "Notes",

        slides:
            "Slides"

    };


    return labels[type] ||
        "File";

}



function getMaterialDescription(
    material
) {

    const descriptions = {

        "ECON 110 Syllabus":
            "Course syllabus and schedule",

        "Lecture 1 — Scarcity":
            "Scarcity and opportunity cost",

        "Elasticity Lecture":
            "Price and income elasticity"

    };


    return descriptions[
        material.name
    ] ||
        "Course material";

}



/* =========================================
   START
========================================= */

loadMaterials();