/* =========================================
   STUDY AI CONFIGURATION
========================================= */

/*
   Keep the backend address in one place.

   For local development, leave this as-is. If the backend
   is hosted somewhere else later, change only this value.
*/

const STUDY_AI_API_BASE_URL =
    "http://localhost:3000";


window.StudyAI = {

    apiUrl: function(path) {

        return STUDY_AI_API_BASE_URL + path;

    },


    fetchWithTimeout: async function(url, options, timeoutMs) {

        const controller = new AbortController();

        const timeout = setTimeout(
            function() {

                controller.abort();

            },
            timeoutMs || 120000
        );

        try {

            return await fetch(
                url,
                {
                    ...options,
                    signal: controller.signal
                }
            );

        } finally {

            clearTimeout(timeout);

        }

    }

};
