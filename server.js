// ============================================
// Gorilla Tag Help Bot
// Node.js server + Groq AI
// ============================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const PUBLIC_FOLDER = __dirname;

const server = http.createServer(async (req, res) => {
  // ------------------------------------------
  // CORS and basic response headers
  // ------------------------------------------

  res.setHeader("X-Content-Type-Options", "nosniff");

  // ------------------------------------------
  // Home page
  // ------------------------------------------

  if (req.method === "GET" && req.url === "/") {
    return sendFile(res, "index.html", "text/html; charset=utf-8");
  }

  if (req.method === "GET" && req.url === "/index.html") {
    return sendFile(res, "index.html", "text/html; charset=utf-8");
  }

  if (req.method === "GET" && req.url === "/script.js") {
    return sendFile(
      res,
      "script.js",
      "application/javascript; charset=utf-8"
    );
  }

  // ------------------------------------------
  // Status endpoint
  // ------------------------------------------

  if (req.method === "GET" && req.url === "/api/status") {
    return sendJSON(res, 200, {
      success: true,
      name: "Gorilla Tag Help Bot",
      serverRunning: true,
      groqConfigured: Boolean(GROQ_API_KEY),
      gameConnected: false,
      message: GROQ_API_KEY
        ? "Server is running and Groq is configured. No in-game bot is connected yet."
        : "Server is running, but the GROQ_API_KEY environment variable is missing."
    });
  }

  // ------------------------------------------
  // Receive a Gorilla Tag room code
  // ------------------------------------------

  if (req.method === "POST" && req.url === "/api/join") {
    try {
      const body = await readJSON(req);

      // Normalize the code:
      // "test" becomes "TEST".
      const roomCode = String(body.roomCode || "")
        .trim()
        .toUpperCase();

      if (!roomCode) {
        return sendJSON(res, 400, {
          success: false,
          message: "Please enter a Gorilla Tag room code."
        });
      }

      // Prevent unexpectedly long or malformed input.
      if (
        roomCode.length > 32 ||
        !/^[A-Z0-9_-]+$/.test(roomCode)
      ) {
        return sendJSON(res, 400, {
          success: false,
          message:
            "That room code contains unsupported characters. Please check it and try again."
        });
      }

      console.log("Received room code:", roomCode);

      // This server does not control a Gorilla Tag game client.
      // Do not pretend that the bot has joined the room.

      return sendJSON(res, 200, {
        success: true,
        roomCode: roomCode,
        serverRunning: true,
        groqConfigured: Boolean(GROQ_API_KEY),
        gameConnected: false,
        message:
          `Room code received: ${roomCode}. ` +
          "The code was converted to uppercase. " +
          "The website server cannot join Gorilla Tag by itself; " +
          "an actual game-side bot or compatible mod still needs to be connected."
      });
    } catch (error) {
      console.error("Room-code error:", error);

      return sendJSON(res, 400, {
        success: false,
        message:
          error.message || "The room code could not be processed."
      });
    }
  }

  // ------------------------------------------
  // Ask Groq for Gorilla Tag coaching
  // ------------------------------------------

  if (req.method === "POST" && req.url === "/api/coach") {
    try {
      const body = await readJSON(req);
      const question = String(body.question || "").trim();

      if (!question) {
        return sendJSON(res, 400, {
          success: false,
          message: "Please enter a Gorilla Tag question."
        });
      }

      if (question.length > 2000) {
        return sendJSON(res, 400, {
          success: false,
          message: "Please keep your question under 2,000 characters."
        });
      }

      if (!GROQ_API_KEY) {
        return sendJSON(res, 503, {
          success: false,
          message:
            "Groq is not configured. Add GROQ_API_KEY in your Render environment variables."
        });
      }

      const answer = await askGroq(question);

      return sendJSON(res, 200, {
        success: true,
        answer: answer
      });
    } catch (error) {
      console.error("Groq coaching error:", error);

      return sendJSON(res, 500, {
        success: false,
        message:
          "Groq could not answer right now. Check the Render logs for details."
      });
    }
  }

  // ------------------------------------------
  // Not found
  // ------------------------------------------

  return sendJSON(res, 404, {
    success: false,
    message: "That server route does not exist."
  });
});

// ============================================
// Serve a file
// ============================================

function sendFile(res, filename, contentType) {
  const filePath = path.join(PUBLIC_FOLDER, filename);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      console.error("Could not read file:", filename, error);

      return sendJSON(res, 500, {
        success: false,
        message: `Could not load ${filename}.`
      });
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
}

// ============================================
// Send JSON
// ============================================

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

// ============================================
// Read JSON request body
// ============================================

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let finished = false;

    req.on("data", (chunk) => {
      if (finished) return;

      data += chunk;

      if (data.length > 8192) {
        finished = true;
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (finished) return;

      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });

    req.on("error", (error) => {
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
  });
}

// ============================================
// Ask Groq AI for coaching
// ============================================

async function askGroq(question) {
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
            content:
              "You are Gorilla Tag Help Bot, a friendly and clear " +
              "Gorilla Tag movement coach. Explain beginner skills " +
              "such as alternating hand pushes against the ground, " +
              "turning, and safe practice. You can also explain " +
              "advanced movement concepts such as wall running. " +
              "Give honest, practical instructions. Do not claim " +
              "you are inside the game, have joined a room, or can " +
              "see or control a player. You are an AI coach, not " +
              "an actual Gorilla Tag player."
          },

          {
            role: "user",)
            content: question
          }
        ],

        max_tokens: 900,
        temperature: 0.7
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();

    console.error("Groq API response:", details);

    throw new Error(`Groq API returned HTTP ${response.status}.`);
  }

  const data = await response.json();

  const answer = data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("Groq returned an empty answer.");
  }

  return answer.trim();
}

// ============================================
// Start server
// ============================================

server.listen(PORT, HOST, () => {
  console.log("======================================");
  console.log(" Gorilla Tag Help Bot server started");
  console.log(" Port:", PORT);
  console.log(" Groq configured:", Boolean(GROQ_API_KEY));
  console.log(" Game bot connected: No");
  console.log("======================================");
});
