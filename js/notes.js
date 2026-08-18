const chatInput =
    document.querySelector("#chat-input");

const sendButton =
    document.querySelector("#send-message");

const chatMessages =
    document.querySelector("#chat-messages");

const suggestions =
    document.querySelectorAll(".suggestion");

const notesContext = window.StudyAI?.courseContext;
const notesBackLink = document.querySelector("#notes-back-link");
const notesCourseLabel = document.querySelector("#notes-course-label");

if (notesContext?.courseId && notesBackLink) {
    notesBackLink.href = notesContext.url("course.html");
    StudyAI.api.get(`/api/courses/${notesContext.courseId}`)
        .then(function(course) {
            notesCourseLabel.textContent = `← ${course.courseCode || course.courseName}`;
        })
        .catch(function() {
            notesCourseLabel.textContent = "← Course";
        });
}


/* =========================================
   SEND MESSAGE
========================================= */

function sendMessage(message) {

    if (!message.trim()) {
        return;
    }


    addUserMessage(message);


    chatInput.value = "";


    setTimeout(function() {

        addAssistantMessage(
            generateDemoResponse(message)
        );

    }, 600);

}


/* =========================================
   USER MESSAGE
========================================= */

function addUserMessage(message) {

    const messageElement =
        document.createElement("div");


    messageElement.className =
        "message user";


    messageElement.innerHTML = `

        <div class="message-content">

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;


    chatMessages.appendChild(
        messageElement
    );


    scrollToBottom();

}


/* =========================================
   AI MESSAGE
========================================= */

function addAssistantMessage(message) {

    const messageElement =
        document.createElement("div");


    messageElement.className =
        "message assistant";


    messageElement.innerHTML = `

        <div class="message-avatar">
            S
        </div>

        <div class="message-content">

            <p>
                ${message}
            </p>

        </div>

    `;


    chatMessages.appendChild(
        messageElement
    );


    scrollToBottom();

}


/* =========================================
   DEMO AI RESPONSES
========================================= */

function generateDemoResponse(message) {

    const lowerMessage =
        message.toLowerCase();


    if (
        lowerMessage.includes("elasticity")
    ) {

        return `
            <strong>Price elasticity of demand</strong>
            measures how responsive quantity demanded
            is to a change in price.

            <br><br>

            The basic formula is:

            <br><br>

            <strong>
                % Change in Quantity Demanded ÷
                % Change in Price
            </strong>

            <br><br>

            If demand is elastic, quantity demanded
            responds relatively strongly to a change
            in price.
        `;

    }


    if (
        lowerMessage.includes("gdp")
    ) {

        return `
            <strong>GDP</strong>, or gross domestic product,
            measures the market value of final goods and
            services produced within an economy during
            a given period.

            <br><br>

            Remember the four major components:

            <br><br>

            <strong>
                C + I + G + NX
            </strong>
        `;

    }


    if (
        lowerMessage.includes("quiz")
    ) {

        return `
            Based on your recent performance,
            I'd recommend focusing on
            <strong>Fiscal Policy</strong>.

            <br><br>

            You could start with a short
            10-question practice quiz.
        `;

    }


    return `
        That's a great question.

        <br><br>

        In the future, Study AI will search your
        uploaded course materials and generate
        an answer specifically from your notes.

        <br><br>

        For now, this is a demonstration of the
        chat interface.
    `;

}


/* =========================================
   SUGGESTIONS
========================================= */

suggestions.forEach(function(button) {

    button.addEventListener(
        "click",
        function() {

            sendMessage(
                button.textContent
            );

        }
    );

});


/* =========================================
   SEND BUTTON
========================================= */

sendButton.addEventListener(
    "click",
    function() {

        sendMessage(
            chatInput.value
        );

    }
);


/* =========================================
   ENTER KEY
========================================= */

chatInput.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage(
                chatInput.value
            );

        }

    }
);


/* =========================================
   SCROLL
========================================= */

function scrollToBottom() {

    chatMessages.scrollTop =
        chatMessages.scrollHeight;

}


/* =========================================
   SECURITY HELPER
========================================= */

function escapeHTML(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}
