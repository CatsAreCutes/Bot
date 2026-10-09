// ========================================
// Gorilla Tag Help Bot
// Room Code Sender
// ========================================

const roomForm = document.getElementById("roomForm");
const roomCodeInput = document.getElementById("roomCode");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

roomForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const roomCode = roomCodeInput.value.trim();

    if (!roomCode) {
        statusText.textContent = "Please enter a room code.";
        return;
    }

    sendButton.disabled = true;
    sendButton.textContent = "SENDING...";

    statusText.textContent = "Sending room code to HelpBot...";

    try {
        // Send the room code to our own server.
        const response = await fetch("/api/join", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                roomCode: roomCode
            })
        });

        const responseText = await response.text();

        let result = {};

        try {
            result = JSON.parse(responseText);
        } catch {
            result = {};
        }

        if (!response.ok) {
            throw new Error(
                result.error ||
                "The server could not process the room code."
            );
        }

        statusText.textContent =
            result.message ||
            "The server received the room code. " +
            "The in-game bot connection still needs to be verified.";

    } catch (error) {
        console.error("HelpBot error:", error);

        statusText.textContent =
            "Could not send the room code. " +
            "Check that server.js is running and has the /api/join endpoint.";

    } finally {
        sendButton.disabled = false;
        sendButton.textContent = "SEND";
    }
});
