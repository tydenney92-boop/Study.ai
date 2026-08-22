const notesContext = StudyAI.courseContext;
const notesCourseId = notesContext.getCourseId();
const notesMaterialId = notesContext.getMaterialId();
const notesBackLink = document.querySelector("#notes-back-link");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-message");
const chatMessages = document.querySelector("#chat-messages");
let notesMaterialSelector = null;
let asking = false;

if (!notesCourseId) {
    notesContext.goToMyCourses("Choose a course before opening Ask My Notes.");
}

function selectedMaterialIds() {
    return notesMaterialSelector ? notesMaterialSelector.getSelectedIds() : [];
}

function updateInputState() {
    const count = selectedMaterialIds().length;
    const enabled = count > 0 && !asking;
    chatInput.disabled = !enabled;
    sendButton.disabled = !enabled;
    document.querySelectorAll(".suggestion").forEach(button => {
        button.disabled = !enabled;
    });
    document.querySelector("#notes-status-label").textContent = count === 0
        ? "Choose materials"
        : `${count} source${count === 1 ? "" : "s"} selected`;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addUserMessage(message) {
    const element = document.createElement("div");
    element.className = "message user";
    const content = document.createElement("div");
    content.className = "message-content";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    content.appendChild(paragraph);
    element.appendChild(content);
    chatMessages.appendChild(element);
    scrollToBottom();
}

function addAssistantMessage(answer, sources) {
    const element = document.createElement("div");
    element.className = "message assistant";
    element.innerHTML = '<div class="message-avatar">S</div><div class="message-content"><p></p><div class="answer-sources"><strong>Selected materials</strong><div></div></div></div>';
    element.querySelector("p").textContent = answer;
    const sourceList = element.querySelector(".answer-sources div");
    sources.forEach(source => {
        const chip = document.createElement("span");
        chip.textContent = source.name;
        sourceList.appendChild(chip);
    });
    chatMessages.appendChild(element);
    scrollToBottom();
}

function addLoadingMessage() {
    const element = document.createElement("div");
    element.className = "message assistant notes-loading-message";
    element.innerHTML = '<div class="message-avatar">S</div><div class="message-content"><p>Reading the selected materials…</p></div>';
    chatMessages.appendChild(element);
    scrollToBottom();
    return element;
}

function addErrorMessage(error, question, materialIds) {
    const element = document.createElement("div");
    element.className = "message assistant error-message";
    element.innerHTML = '<div class="message-avatar">!</div><div class="message-content"><p></p><button class="secondary-tool-button">Try Again</button></div>';
    element.querySelector("p").textContent = error.message;
    element.querySelector("button").addEventListener("click", () => {
        element.remove();
        askQuestion(question, materialIds, false);
    });
    chatMessages.appendChild(element);
    scrollToBottom();
}

async function askQuestion(question, materialIds = selectedMaterialIds(), showUser = true) {
    const trimmed = question.trim();
    if (!trimmed || materialIds.length === 0 || asking) return;
    if (showUser) addUserMessage(trimmed);
    chatInput.value = "";
    asking = true;
    updateInputState();
    const loading = addLoadingMessage();
    try {
        const response = await StudyAI.api.post(
            `/api/courses/${notesCourseId}/ask`,
            { materialIds, question: trimmed },
            { timeoutMs: 120000 }
        );
        loading.remove();
        addAssistantMessage(response.answer, response.sources);
    } catch (error) {
        loading.remove();
        if (error.status === 404) {
            return notesContext.goToMyCourses("That course or material is unavailable.");
        }
        addErrorMessage(error, trimmed, materialIds);
    } finally {
        asking = false;
        updateInputState();
        chatInput.focus();
    }
}

sendButton.addEventListener("click", () => askQuestion(chatInput.value));
chatInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        askQuestion(chatInput.value);
    }
});
document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => askQuestion(button.textContent));
});

async function initializeNotes() {
    if (!notesCourseId) return;
    notesBackLink.href = notesContext.url("course.html", { courseId: notesCourseId });
    try {
        const course = await StudyAI.api.get(`/api/courses/${notesCourseId}`);
        document.querySelector("#notes-course-label").textContent = `← ${course.courseCode}`;
        document.querySelector("#notes-assistant-label").textContent = `${course.courseCode} assistant`;
        document.querySelector("#notes-page-subtitle").textContent =
            `Ask grounded questions about ${course.courseCode} materials.`;
        notesMaterialSelector = await StudyAI.materialSelection.mount({
            container: document.querySelector("#notes-material-selection"),
            courseId: notesCourseId,
            initialMaterialIds: notesMaterialId ? [notesMaterialId] : []
        });
        if (notesMaterialSelector.getUsableCount() === 0) {
            document.querySelector("#notes-status-label").textContent = "No usable materials";
            document.querySelector("#notes-material-selection").insertAdjacentHTML(
                "afterbegin",
                `<div class="notes-material-empty"><strong>No usable extracted text</strong><span>Upload a typed PDF, DOCX, PPTX, or TXT file to ask grounded questions.</span><a class="primary-button compact-action" href="materials.html?courseId=${encodeURIComponent(notesCourseId)}&upload=1">+ Add Materials</a></div>`
            );
        }
        document.querySelector("#notes-material-selection").addEventListener(
            "change",
            updateInputState
        );
        updateInputState();
        if (notesMaterialSelector.getUsableCount() === 0) {
            document.querySelector("#notes-status-label").textContent = "No usable materials";
        }
    } catch (error) {
        if (error.status === 404) {
            return notesContext.goToMyCourses("That course is unavailable.");
        }
        document.querySelector("#notes-page-error").textContent = error.message;
    }
}

initializeNotes();
