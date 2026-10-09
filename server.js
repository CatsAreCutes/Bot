// ============================================
// Gorilla Tag Help Bot
// Server + Groq AI
// No external Node.js packages required
// ============================================

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Render supplies the PORT environment variable.
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

// Set this in Render's Environment Variables.
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Groq model.
const GROQ_MODEL =
    process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const PUBLIC_FILES = {
    "/": {
        file: "index.html",
        type: "text/html; charset=utf-8"
    },

    "/index.html": {
        file: "index.html",
        type: "text/html; charset=utf-8"
    },

    "/script.js": {
        file: "script.js",
        type: "text/javascript; charset=utf-8"
    }
};

// --------------------------------------------
// Send JSON responses
// --------------------------------------------

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });

    res.end(JSON.stringify(data));
}

// --------------------------------------------
// Read incoming JSON safely
// --------------------------------------------

async function readJSON(req) {
    let body = "";
    const MAX_BODY_SIZE = 4096;

    for await (const chunk of req) {
        body += chunk.toString("utf8");

        if (Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE) {
            throw new Error("REQUEST_TOO_LARGE");
        }
    }

    return JSON.parse(body);
}

// --------------------------------------------
// Call Groq AI
// --------------------------------------------

async function askGroqForStatus() {
    if (!GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY_MISSING");
    }

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: GROQ_MODEL,

                messages: [
                    {
                        role: "system",

                        content: `
You are Gorilla Tag Help Bot.

You help Gorilla Tag players learn:
- Basic hand-powered movement.
- Turning and steering.
- Maintaining momentum.
- Jumping and climbing.
- Advanced techniques such as wall running.

You speak in a friendly, robotic style.

IMPORTANT:
The website has received a Gorilla Tag room code.
However, this server does not yet have a working
connection to an in-game Gorilla Tag bot.

Never claim that you joined a lobby, saw players,
or controlled a gorilla when you did not.

Explain the actual connection status honestly.
Keep your response short and friendly.
                        `.trim()
                    },

                    {
                        role: "user",

                        content:
                            "The creator submitted a room code. " +
                            "Give a brief, honest status update."
                    }
                ],

                max_completion_tokens: 160
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        console.error(
            "Groq API error:",
            response.status,
            errorText.slice(0, 500)
        );

        throw new Error("GROQ_REQUEST_FAILED");
    }

    const data = await response.json();

    const message =
        data.choices?.[0]?.message?.content;

    if (typeof message !== "string" || !message.trim()) {
        throw new Error("GROQ_EMPTY_RESPONSE");
    }

    return message.trim();
}

// --------------------------------------------
// Main HTTP server
// --------------------------------------------

const server = http.createServer(async (req, res) => {
    const requestURL = new URL(
        req.url,
        "http://localhost"
    );

    const pathname = requestURL.pathname;

    // ----------------------------------------
    // Website files
    // ----------------------------------------

    if (req.method === "GET" && PUBLIC_FILES[pathname]) {
        const publicFile = PUBLIC_FILES[pathname];

        const filePath = path.join(
            __dirname,
            publicFile.file
        );

        try {
            const content = await fs.promises.readFile(filePath);

            res.writeHead(200, {
                "Content-Type": publicFile.type,
                "X-Content-Type-Options": "nosniff"
            });

            res.end(content);

        } catch (error) {
            console.error("File error:", error.message);

            sendJSON(res, 500, {
                error: "Could not load the website files."
            });
        }

        return;
    }

    // ----------------------------------------
    // Check server status
    // ----------------------------------------

    if (req.method === "GET" && pathname === "/api/status") {
        sendJSON(res, 200, {
            ok: true,
            server: "Gorilla Tag Help Bot",
            groqConfigured: Boolean(GROQ_API_KEY)
        });

        return;
    }

    // ----------------------------------------
    // Receive a Gorilla Tag room code
    // ----------------------------------------

    if (req.method === "POST" && pathname === "/api/join") {
        let body;

        try {
            body = await readJSON(req);

        } catch (error) {
            sendJSON(
                res,
                400,
                {
                    error:
                        error.message === "REQUEST_TOO_LARGE"
                            ? "Request is too large."
                            : "Invalid JSON request."
                }
            );

            return;
        }

        const roomCode =
            typeof body.roomCode === "string"
                ? body.roomCode.trim()
                : "";

        if (!roomCode || roomCode.length > 100) {
            sendJSON(res, 400, {
                error: "Please enter a valid room code."
            });

            return;
        }

        console.log("A room-code submission was received.");

        // The code has been received, but this server
        // cannot join a Gorilla Tag lobby by itself.

        if (!GROQ_API_KEY) {
            sendJSON(res, 503, {
                error:
                    "Groq is not configured. " +
                    "Add GROQ_API_KEY in Render Environment Variables."
            });

            return;
        }

        try {
            const aiMessage = await askGroqForStatus();

            sendJSON(res, 200, {
                ok: true,

                message: aiMessage,

                roomCodeReceived: true,

                gameConnected: false
            });

        } catch (error) {
            console.error("HelpBot error:", error.message);

            sendJSON(res, 502, {
                error:
                    error.message === "GROQ_REQUEST_FAILED"
                        ? "Groq returned an error. Check the API key and model."
                        : "Could not get a response from Groq."
            });
        }

        return;
    }

    // ----------------------------------------
    // Unknown address
    // ----------------------------------------

    sendJSON(res, 404, {
        error: "Not found."
    });
});

// --------------------------------------------
// Start server
// --------------------------------------------

server.listen(PORT, HOST, () => {
    console.log(
        `Gorilla Tag Help Bot running on port ${PORT}`
    );

    console.log(
        `Groq API key configured: ${Boolean(GROQ_API_KEY)}`
    );
});
