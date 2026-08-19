const flashcardContext = StudyAI.courseContext;
const flashcardCourseId = flashcardContext.getCourseId();
const initialMaterialId = flashcardContext.getMaterialId();
const reviewSection = document.querySelector("#flashcard-review");
const emptySection = document.querySelector("#flashcard-empty");
const cardElement = document.querySelector("#flashcard");
const filterSelect = document.querySelector("#flashcard-filter");
const generateModal = document.querySelector("#generate-card-modal");
const manualModal = document.querySelector("#manual-card-modal");
const deleteModal = document.querySelector("#delete-card-modal");
let flashcards = [];
let currentCard = 0;
let materialSelector = null;

if (!flashcardCourseId) {
    flashcardContext.goToMyCourses("Choose a course before opening flashcards.");
}

function courseUrl() {
    return flashcardContext.url("course.html", { courseId: flashcardCourseId });
}

function current() {
    return flashcards[currentCard];
}

function closeModal(modal) {
    modal.classList.remove("open");
}

function displayCard() {
    if (flashcards.length === 0) {
        reviewSection.hidden = true;
        emptySection.hidden = false;
        document.querySelector("#card-total").textContent = "0";
        return;
    }
    currentCard = Math.min(currentCard, flashcards.length - 1);
    const card = current();
    emptySection.hidden = true;
    reviewSection.hidden = false;
    document.querySelector("#card-total").textContent = flashcards.length;
    document.querySelector("#flashcard-question").textContent = card.front;
    document.querySelector("#flashcard-answer").textContent = card.back;
    document.querySelector("#flashcard-progress-label").textContent =
        `${currentCard + 1} of ${flashcards.length}`;
    document.querySelector("#flashcard-mastery").textContent = card.reviewCount === 0
        ? "New card"
        : `Mastery ${card.masteryLevel}/5 · ${card.reviewCount} reviews`;
    document.querySelector("#flashcard-progress").style.width =
        `${((currentCard + 1) / flashcards.length) * 100}%`;
    document.querySelector("#previous-card").disabled = currentCard === 0;
    document.querySelector("#next-card").disabled = currentCard === flashcards.length - 1;
    cardElement.classList.remove("flipped");
}

async function loadCards() {
    const materialId = Number(filterSelect.value) || null;
    const query = materialId ? `?materialId=${materialId}` : "";
    try {
        flashcards = await StudyAI.api.get(
            `/api/courses/${flashcardCourseId}/flashcards${query}`
        );
        currentCard = 0;
        displayCard();
    } catch (error) {
        if (error.status === 404) {
            return flashcardContext.goToMyCourses("That course is unavailable.");
        }
        document.querySelector("#flashcard-page-error").textContent = error.message;
    }
}

function syncFilterUrl() {
    const materialId = Number(filterSelect.value) || null;
    window.history.replaceState(null, "", flashcardContext.url("flashcards.html", {
        courseId: flashcardCourseId,
        materialId
    }));
}

async function initialize() {
    if (!flashcardCourseId) return;
    document.querySelector("#flashcards-back-link").href = courseUrl();
    try {
        const [course, materials] = await Promise.all([
            StudyAI.api.get(`/api/courses/${flashcardCourseId}`),
            StudyAI.api.get(`/api/courses/${flashcardCourseId}/materials`)
        ]);
        document.title = `${course.courseCode} Flashcards | Study Signal`;
        document.querySelector("#flashcards-title").textContent = `${course.courseCode} Flashcards`;
        materials.forEach(material => {
            const option = document.createElement("option");
            option.value = material.id;
            option.textContent = material.originalFilename;
            filterSelect.appendChild(option);
        });
        if (initialMaterialId) {
            filterSelect.value = String(initialMaterialId);
            if (filterSelect.value !== String(initialMaterialId)) {
                return flashcardContext.goToMyCourses("That material is unavailable.");
            }
        }
        await loadCards();
    } catch (error) {
        if (error.status === 404) {
            return flashcardContext.goToMyCourses("That course is unavailable.");
        }
        document.querySelector("#flashcard-page-error").textContent = error.message;
    }
}

filterSelect.addEventListener("change", async () => {
    syncFilterUrl();
    await loadCards();
});

cardElement.addEventListener("click", () => cardElement.classList.toggle("flipped"));
document.querySelector("#previous-card").addEventListener("click", () => {
    if (currentCard > 0) { currentCard--; displayCard(); }
});
document.querySelector("#next-card").addEventListener("click", () => {
    if (currentCard < flashcards.length - 1) { currentCard++; displayCard(); }
});

async function review(outcome) {
    if (!current()) return;
    document.querySelector("#know-card").disabled = true;
    document.querySelector("#still-learning").disabled = true;
    try {
        flashcards[currentCard] = await StudyAI.api.post(
            `/api/courses/${flashcardCourseId}/flashcards/${current().id}/reviews`,
            { outcome }
        );
        if (currentCard < flashcards.length - 1) currentCard++;
        displayCard();
    } catch (error) {
        document.querySelector("#flashcard-page-error").textContent = error.message;
    } finally {
        document.querySelector("#know-card").disabled = false;
        document.querySelector("#still-learning").disabled = false;
    }
}
document.querySelector("#know-card").addEventListener("click", () => review("know_it"));
document.querySelector("#still-learning").addEventListener("click", () => review("still_learning"));

function openManual() {
    document.querySelector("#manual-card-form").reset();
    document.querySelector("#manual-card-error").textContent = "";
    manualModal.classList.add("open");
    document.querySelector("#manual-card-front").focus();
}
document.querySelector("#add-card-button").addEventListener("click", openManual);
document.querySelector("#empty-add-button").addEventListener("click", openManual);
document.querySelector("#manual-card-close").addEventListener("click", () => closeModal(manualModal));
document.querySelector("#manual-card-cancel").addEventListener("click", () => closeModal(manualModal));
document.querySelector("#manual-card-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await StudyAI.api.post(`/api/courses/${flashcardCourseId}/flashcards`, {
            front: document.querySelector("#manual-card-front").value,
            back: document.querySelector("#manual-card-back").value
        });
        closeModal(manualModal);
        filterSelect.value = "";
        syncFilterUrl();
        await loadCards();
    } catch (error) {
        document.querySelector("#manual-card-error").textContent = error.message;
    } finally { button.disabled = false; }
});

async function openGenerate() {
    document.querySelector("#generate-card-error").textContent = "";
    generateModal.classList.add("open");
    if (materialSelector) return;
    try {
        materialSelector = await StudyAI.materialSelection.mount({
            container: document.querySelector("#flashcard-material-selection"),
            courseId: flashcardCourseId,
            initialMaterialIds: initialMaterialId ? [initialMaterialId] : []
        });
        document.querySelector("#flashcard-material-selection").addEventListener("change", () => {
            document.querySelector("#confirm-generate-cards").disabled =
                materialSelector.getSelectedIds().length === 0;
        });
        document.querySelector("#confirm-generate-cards").disabled =
            materialSelector.getSelectedIds().length === 0;
    } catch (error) {
        document.querySelector("#generate-card-error").textContent = error.message;
    }
}
document.querySelector("#generate-cards-button").addEventListener("click", openGenerate);
document.querySelector("#empty-generate-button").addEventListener("click", openGenerate);
document.querySelector("#generate-card-close").addEventListener("click", () => closeModal(generateModal));
document.querySelector("#generate-card-cancel").addEventListener("click", () => closeModal(generateModal));
document.querySelector("#confirm-generate-cards").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Generating…";
    try {
        await StudyAI.api.post(
            `/api/courses/${flashcardCourseId}/flashcards/generate`,
            {
                materialIds: materialSelector.getSelectedIds(),
                cardCount: Number(document.querySelector("#flashcard-count").value)
            },
            { timeoutMs: 180000 }
        );
        closeModal(generateModal);
        filterSelect.value = "";
        syncFilterUrl();
        await loadCards();
    } catch (error) {
        document.querySelector("#generate-card-error").textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = "Generate Cards";
    }
});

document.querySelector("#delete-card-button").addEventListener("click", () => {
    if (current()) deleteModal.classList.add("open");
});
document.querySelector("#delete-card-close").addEventListener("click", () => closeModal(deleteModal));
document.querySelector("#delete-card-cancel").addEventListener("click", () => closeModal(deleteModal));
document.querySelector("#confirm-delete-card").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        await StudyAI.api.delete(
            `/api/courses/${flashcardCourseId}/flashcards/${current().id}`
        );
        closeModal(deleteModal);
        await loadCards();
    } catch (error) {
        document.querySelector("#delete-card-error").textContent = error.message;
    } finally { button.disabled = false; }
});

initialize();
