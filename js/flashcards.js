/* =========================================
   FLASHCARD DATA
========================================= */

const flashcards = [

    {
        question:
            "What is price elasticity of demand?",

        answer:
            "Price elasticity of demand measures how responsive the quantity demanded of a good is to a change in its price."
    },


    {
        question:
            "What is the law of demand?",

        answer:
            "The law of demand states that, holding other factors constant, quantity demanded generally decreases as price increases."
    },


    {
        question:
            "What is GDP?",

        answer:
            "GDP is the market value of all final goods and services produced within a country during a given period."
    },


    {
        question:
            "What is fiscal policy?",

        answer:
            "Fiscal policy involves government decisions about spending and taxation."
    },


    {
        question:
            "What is monetary policy?",

        answer:
            "Monetary policy involves actions taken by a central bank to influence the money supply, interest rates, and economic conditions."
    },


    {
        question:
            "What is opportunity cost?",

        answer:
            "Opportunity cost is the value of the next-best alternative that must be given up when making a choice."
    },


    {
        question:
            "What happens when demand increases?",

        answer:
            "An increase in demand shifts the demand curve to the right, generally increasing equilibrium price and quantity."
    },


    {
        question:
            "What is inflation?",

        answer:
            "Inflation is a sustained increase in the overall price level of goods and services in an economy."
    },


    {
        question:
            "What is a normal good?",

        answer:
            "A normal good is one for which demand increases when consumer income increases."
    },


    {
        question:
            "What does the Federal Reserve do?",

        answer:
            "The Federal Reserve is the central bank of the United States and is responsible for conducting monetary policy and supporting financial stability."
    }

];


/* =========================================
   VARIABLES
========================================= */

let currentCard = 0;

const flashcard =
    document.querySelector("#flashcard");

const question =
    document.querySelector("#flashcard-question");

const answer =
    document.querySelector("#flashcard-answer");

const cardCount =
    document.querySelector("#card-count");

const progress =
    document.querySelector("#flashcard-progress");

const previousButton =
    document.querySelector("#previous-card");

const nextButton =
    document.querySelector("#next-card");

const learningButton =
    document.querySelector("#still-learning");

const knowButton =
    document.querySelector("#know-card");


/* =========================================
   DISPLAY CARD
========================================= */

function displayCard() {

    const card =
        flashcards[currentCard];


    question.textContent =
        card.question;


    answer.textContent =
        card.answer;


    cardCount.textContent =
        `${currentCard + 1} / ${flashcards.length}`;


    const percentage =
        ((currentCard + 1) / flashcards.length) * 100;


    progress.style.width =
        percentage + "%";


    flashcard.classList.remove("flipped");

}


/* =========================================
   FLIP CARD
========================================= */

flashcard.addEventListener(
    "click",
    function() {

        flashcard.classList.toggle(
            "flipped"
        );

    }
);


/* =========================================
   NEXT
========================================= */

nextButton.addEventListener(
    "click",
    function() {

        if (
            currentCard <
            flashcards.length - 1
        ) {

            currentCard++;

            displayCard();

        }

    }
);


/* =========================================
   PREVIOUS
========================================= */

previousButton.addEventListener(
    "click",
    function() {

        if (currentCard > 0) {

            currentCard--;

            displayCard();

        }

    }
);


/* =========================================
   REVIEW BUTTONS
========================================= */

learningButton.addEventListener(
    "click",
    function() {

        nextCard();

    }
);


knowButton.addEventListener(
    "click",
    function() {

        nextCard();

    }
);


function nextCard() {

    if (
        currentCard <
        flashcards.length - 1
    ) {

        currentCard++;

        displayCard();

    }

}


/* =========================================
   START
========================================= */

displayCard();