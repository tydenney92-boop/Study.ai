const notesContext = StudyAI.courseContext;
const notesCourseId = notesContext.getCourseId();
const notesMaterialId = notesContext.getMaterialId();
const notesBackLink = document.querySelector("#notes-back-link");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-message");
const chatMessages = document.querySelector("#chat-messages");
const conversationSelect = document.querySelector("#conversation-select");
const initialConversationId = (() => {
    const value = Number(new URLSearchParams(window.location.search).get("conversationId"));
    return Number.isInteger(value) && value > 0 ? value : null;
})();
let currentConversationId = initialConversationId;
let notesMaterialSelector = null;
let asking = false;

if (!notesCourseId) notesContext.goToMyCourses("Choose a course before opening Ask My Notes.");

function selectedMaterialIds() {
    return notesMaterialSelector ? notesMaterialSelector.getSelectedIds() : [];
}

function updateInputState() {
    const count = selectedMaterialIds().length;
    const enabled = count > 0 && !asking;
    chatInput.disabled = !enabled;
    sendButton.disabled = !enabled;
    document.querySelectorAll(".suggestion").forEach(button => { button.disabled = !enabled; });
    document.querySelector("#notes-status-label").textContent = count === 0
        ? "Choose materials"
        : `${count} source${count === 1 ? "" : "s"} selected`;
}

function scrollToBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

function welcomeMarkup() {
    return `<div class="message assistant"><div class="message-avatar">S</div><div class="message-content"><p>Select one or more usable course materials, then ask a question. I can clarify, connect, and explain the concepts they establish.</p></div></div><div class="suggestion-row"><button class="suggestion">Summarize the main ideas</button><button class="suggestion">Explain the most important concept</button><button class="suggestion">What should I review first?</button></div>`;
}

function bindSuggestions() {
    document.querySelectorAll(".suggestion").forEach(button => {
        button.addEventListener("click", () => askQuestion(button.textContent));
    });
    updateInputState();
}

function resetChat() {
    chatMessages.innerHTML = welcomeMarkup();
    bindSuggestions();
    scrollToBottom();
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

function addAssistantMessage(answer, sources = [], supportType) {
    const element = document.createElement("div");
    element.className = "message assistant";
    element.innerHTML = '<div class="message-avatar">S</div><div class="message-content"><p></p></div>';
    element.querySelector("p").textContent = answer;
    const content = element.querySelector(".message-content");
    if (supportType === "grounded_with_explanation") {
        const label = document.createElement("div");
        label.className = "answer-support-label";
        label.textContent = "Based on your notes with added explanation.";
        content.appendChild(label);
    }
    if (supportType !== "not_found" && sources.length > 0) {
        const sourceSection = document.createElement("div");
        sourceSection.className = "answer-sources";
        sourceSection.innerHTML = "<strong>Retrieved supporting materials</strong><div></div>";
        const sourceList = sourceSection.querySelector("div");
        sources.forEach(source => {
            const chip = document.createElement("span");
            chip.textContent = source.name;
            sourceList.appendChild(chip);
        });
        content.appendChild(sourceSection);
    }
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

function conversationUrl(conversationId) {
    return notesContext.url("notes.html", {
        courseId: notesCourseId,
        materialId: notesMaterialId || undefined,
        conversationId: conversationId || undefined
    });
}

function setCurrentConversation(conversationId) {
    currentConversationId = conversationId;
    window.history.replaceState(null, "", conversationUrl(conversationId));
    conversationSelect.value = conversationId ? String(conversationId) : "";
}

function conversationLabel(conversation) {
    return conversation.preview.length > 42
        ? `${conversation.preview.slice(0, 41)}…`
        : conversation.preview;
}

async function refreshConversationOptions(selectedId = currentConversationId) {
    const conversations = await StudyAI.api.get(`/api/courses/${notesCourseId}/ask/conversations`);
    conversationSelect.innerHTML = '<option value="">New conversation</option>';
    conversations.forEach(conversation => {
        const option = document.createElement("option");
        option.value = conversation.id;
        option.textContent = conversationLabel(conversation);
        conversationSelect.appendChild(option);
    });
    if (selectedId && !conversations.some(item => item.id === selectedId)) {
        const option = document.createElement("option");
        option.value = selectedId;
        option.textContent = "Current conversation";
        conversationSelect.appendChild(option);
    }
    conversationSelect.value = selectedId ? String(selectedId) : "";
    return conversations;
}

async function loadConversation(conversationId) {
    const conversation = await StudyAI.api.get(
        `/api/courses/${notesCourseId}/ask/conversations/${conversationId}`
    );
    chatMessages.innerHTML = "";
    conversation.messages.forEach(message => {
        if (message.role === "user") addUserMessage(message.content);
        else addAssistantMessage(message.content, message.sources, message.supportType);
    });
    if (conversation.messages.length === 0) resetChat();
    const lastUserMessage = [...conversation.messages].reverse().find(
        message => message.role === "user"
    );
    if (lastUserMessage && notesMaterialSelector?.setSelectedIds) {
        notesMaterialSelector.setSelectedIds(lastUserMessage.materialIds);
    }
    setCurrentConversation(conversation.id);
    scrollToBottom();
}

async function createNewConversation() {
    if (asking) return;
    const conversation = await StudyAI.api.post(
        `/api/courses/${notesCourseId}/ask/conversations`,
        {}
    );
    setCurrentConversation(conversation.id);
    resetChat();
    await refreshConversationOptions(conversation.id);
    chatInput.focus();
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
            { conversationId: currentConversationId, materialIds, question: trimmed },
            { timeoutMs: 120000 }
        );
        loading.remove();
        setCurrentConversation(response.conversationId);
        addAssistantMessage(response.answer, response.sources, response.supportType);
        await refreshConversationOptions(response.conversationId);
    } catch (error) {
        loading.remove();
        if (error.status === 404 && error.code !== "ASK_NOTES_CONVERSATION_NOT_FOUND") {
            return notesContext.goToMyCourses("That course or material is unavailable.");
        }
        if (error.code === "ASK_NOTES_CONVERSATION_NOT_FOUND") {
            setCurrentConversation(null);
            await refreshConversationOptions(null);
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
document.querySelector("#new-conversation-button").addEventListener("click", async () => {
    try { await createNewConversation(); }
    catch (error) { document.querySelector("#notes-page-error").textContent = error.message; }
});
conversationSelect.addEventListener("change", async () => {
    const selected = Number(conversationSelect.value);
    try {
        if (selected) await loadConversation(selected);
        else await createNewConversation();
    } catch (error) {
        document.querySelector("#notes-page-error").textContent = error.message;
    }
});

async function initializeNotes() {
    if (!notesCourseId) return;
    notesBackLink.href = notesContext.url("course.html", { courseId: notesCourseId });
    try {
        const course = await StudyAI.api.get(`/api/courses/${notesCourseId}`);
        document.querySelector("#notes-course-label").textContent = `← ${course.courseCode}`;
        document.querySelector("#notes-assistant-label").textContent = `${course.courseCode} tutor`;
        document.querySelector("#notes-page-subtitle").textContent =
            `Ask grounded questions and follow-ups about ${course.courseCode} materials.`;
        notesMaterialSelector = await StudyAI.materialSelection.mount({
            container: document.querySelector("#notes-material-selection"),
            courseId: notesCourseId,
            initialMaterialIds: notesMaterialId ? [notesMaterialId] : []
        });
        if (notesMaterialSelector.getUsableCount() === 0) {
            document.querySelector("#notes-status-label").textContent = "No usable materials";
            document.querySelector("#notes-material-selection").insertAdjacentHTML(
                "afterbegin",
                `<div class="notes-material-empty"><strong>No usable extracted text</strong><span>Upload a document or a readable note image to ask grounded questions.</span><a class="primary-button compact-action" href="materials.html?courseId=${encodeURIComponent(notesCourseId)}&upload=1">+ Add Materials</a></div>`
            );
        }
        document.querySelector("#notes-material-selection").addEventListener("change", updateInputState);
        const conversations = await refreshConversationOptions(initialConversationId);
        if (initialConversationId) await loadConversation(initialConversationId);
        else if (!notesMaterialId && conversations.length > 0) await loadConversation(conversations[0].id);
        else resetChat();
        updateInputState();
        if (notesMaterialSelector.getUsableCount() === 0) {
            document.querySelector("#notes-status-label").textContent = "No usable materials";
        }
    } catch (error) {
        if (error.status === 404 && error.code !== "ASK_NOTES_CONVERSATION_NOT_FOUND") {
            return notesContext.goToMyCourses("That course is unavailable.");
        }
        if (error.code === "ASK_NOTES_CONVERSATION_NOT_FOUND") {
            setCurrentConversation(null);
            resetChat();
            document.querySelector("#notes-page-error").textContent =
                "That conversation is unavailable. Start a new one below.";
            return;
        }
        document.querySelector("#notes-page-error").textContent = error.message;
    }
}

initializeNotes();
