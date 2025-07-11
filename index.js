// Cleaned version of the originally obfuscated code

(function () {
    function init() {
        console.log("Initializing...");
        // Add your initialization logic here
    }

    function generateUserList(inputText) {
        // Extracts numeric strings (e.g. user IDs) following @ symbols
        const regex = /@(\d{5,16}|0)/g;
        const matches = [...inputText.matchAll(regex)];

        return matches.map(match => match[1] + "_processed_user");
    }

    function startProcess(data) {
        try {
            const users = generateUserList(data);
            console.log("Processed Users:", users);
        } catch (error) {
            console.error("Error while processing data:", error.message);
        }
    }

    // Run the logic
    init();
    startProcess("@123456789 Hello @9876543210 world!");
})();
