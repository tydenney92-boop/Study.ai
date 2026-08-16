/* =========================================
   COURSE SELECTOR
========================================= */

const courseSelect =
    document.querySelector("#course-select");


const overallScore =
    document.querySelector("#overall-score");


const masteryScore =
    document.querySelector("#mastery-score");


const quizCount =
    document.querySelector("#quiz-count");


courseSelect.addEventListener(
    "change",
    function() {

        /*
         * This is currently demo data.
         *
         * Later, these numbers will come
         * from the user's database.
         */

        if (
            courseSelect.value ===
            "STRAT 412"
        ) {

            overallScore.textContent =
                "86%";

            masteryScore.textContent =
                "88%";

            quizCount.textContent =
                "12";

        }

        else if (
            courseSelect.value ===
            "Russian 201"
        ) {

            overallScore.textContent =
                "92%";

            masteryScore.textContent =
                "94%";

            quizCount.textContent =
                "15";

        }

        else {

            overallScore.textContent =
                "78%";

            masteryScore.textContent =
                "81%";

            quizCount.textContent =
                "8";

        }

    }
);


/* =========================================
   TIME RANGE
========================================= */

const timeRange =
    document.querySelector("#time-range");


const chartBars =
    document.querySelectorAll(".chart-bar");


timeRange.addEventListener(
    "change",
    function() {

        /*
         * Demo behavior.
         *
         * In the backend version,
         * this would request different
         * historical quiz data.
         */

        if (
            timeRange.value ===
            "Last 3 months"
        ) {

            const scores = [
                71,
                78,
                82,
                76,
                89
            ];

            updateChart(scores);

        }


        else if (
            timeRange.value ===
            "All time"
        ) {

            const scores = [
                65,
                73,
                79,
                84,
                89
            ];

            updateChart(scores);

        }


        else {

            const scores = [
                82,
                91,
                74,
                86,
                89
            ];

            updateChart(scores);

        }

    }
);


/* =========================================
   UPDATE CHART
========================================= */

function updateChart(scores) {

    chartBars.forEach(
        function(bar, index) {

            const score =
                scores[index];


            bar.style.height =
                score + "%";


            const label =
                bar.querySelector("span");


            label.textContent =
                score + "%";

        }
    );

}