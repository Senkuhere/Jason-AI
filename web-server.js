import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transcribeAudio } from "./speech.js";

import { getLongTermMemories } from "./long-term-memory.js";

import {
    initializeJason,
    shutdownJason,
    sendMessage
} from "./jason-core.js";

import {
    shortTermMemory
} from "./memory.js";

import {
    storeImage,
    readStoredImage,
    deleteStoredImage
} from "./storage/image-storage.js";

import { openChannel, 
         sendToClient, 
         updatePresence 
} from "./push-channel.js";

import { startInitiative, 
         noteRequestStarted, 
         noteRequestFinished } 
from "./initiative.js";

// Tells you when a reminder from Jason's notebook comes due
import { startReminders } from "./reminders.js";

// Keeps the story of the user's day (what is open on the computer, and when)
import { startDayLog } from "./daylog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UI_DIRECTORY = path.join(
    __dirname,
    "prototype-jason-ui"
);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });

    response.end(JSON.stringify(data));
}

async function readRequestBody(request) {
    let body = "";

    for await (const chunk of request) {
        body += chunk;

        if (body.length > 60_000_000) {
            throw new Error("Request body is too large.");
        }
    }

    return body;
}

async function serveStaticFile(request, response) {
    const requestedPath =
        request.url === "/"
            ? "index.html"
            : request.url.slice(1);

    const filePath = path.resolve(
        UI_DIRECTORY,
        requestedPath
    );

    const relativePath = path.relative(
        UI_DIRECTORY,
        filePath
    );

    if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        sendJson(response, 403, {
            error: "Access denied."
        });
        return;
    }

    try {
        const file = await fs.readFile(filePath);
        const extension = path.extname(filePath);

        response.writeHead(200, {
            "Content-Type":
                MIME_TYPES[extension] ||
                "application/octet-stream"
        });

        response.end(file);
    } catch {
        sendJson(response, 404, {
            error: "File not found."
        });
    }
}
function validateImage(image) {
    if (image === null || image === undefined) {
        return null;
    }

    if (typeof image !== "object") {
        throw new Error("Invalid image attachment.");
    }

    const allowedTypes = new Set([
        "image/png",
        "image/jpeg",
        "image/webp"
    ]);

    if (!allowedTypes.has(image.mimeType)) {
        throw new Error(
            "Only PNG, JPEG, and WebP images are supported."
        );
    }

    if (
        typeof image.data !== "string" ||
        image.data.length === 0
    ) {
        throw new Error("The image data is missing.");
    }

    if (image.data.length > 7_000_000) {
        throw new Error("The image is too large.");
    }

    return {
        mimeType: image.mimeType,
        data: image.data
    };
}
const UPLOADS_DIRECTORY = path.join(__dirname, "jason_uploads");
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const ALLOWED_FILE_EXTENSIONS = new Set([
    ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".txt", ".md",
    ".json", ".html", ".css", ".js", ".py", ".xml", ".yml", ".yaml", ".log"
]);

function validateFile(file) {
    if (file === null || file === undefined) {
        return null;
    }

    if (typeof file !== "object") {
        throw new Error("Invalid file attachment.");
    }

    const name = path
        .basename(String(file.name || "file"))
        .replace(/[^\w.\- ()]/g, "_");

    const extension = path.extname(name).toLowerCase();

    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
        throw new Error(
            `Files of type ${extension || "unknown"} are not supported.`
        );
    }

    if (typeof file.data !== "string" || file.data.length === 0) {
        throw new Error("The file data is missing.");
    }

    const buffer = Buffer.from(file.data, "base64");

    if (buffer.length > MAX_FILE_BYTES) {
        throw new Error("The file is too large (15 MB max).");
    }

    return { name, buffer };
}

async function storeUploadedFile({ name, buffer }, index = 0) {
    await fs.mkdir(UPLOADS_DIRECTORY, { recursive: true });

    const savedPath = path.join(
        UPLOADS_DIRECTORY,
        `${Date.now()}-${index}-${name}`
    );
    await fs.writeFile(savedPath, buffer);

    return savedPath;
}

// Messages are handled one at a time, in order. Two messages at once would mix up Jason's memory.
let chatQueue = Promise.resolve();

function runOneAtATime(task) {
    const run = chatQueue.then(task, task);
    chatQueue = run.catch(() => {});     // a failed message never blocks the next one
    return run;
}

// A safety net: a stray error in some background task is logged instead of stopping Jason
process.on("unhandledRejection", reason => {
    console.error("[Jason] Unhandled promise rejection (Jason keeps running):", reason);
});

process.on("uncaughtException", error => {
    console.error("[Jason] Unexpected error (Jason keeps running):", error);
});

const server = http.createServer(async (request, response) => {
    try {
        if (
            request.method === "POST" &&
            request.url === "/api/chat"
        ) {
            const rawBody = await readRequestBody(request);
            const body = JSON.parse(rawBody);

            // Which page sent this message (so early sentences go back to that page only)
            const clientId =
                typeof body.clientId === "string" ? body.clientId.slice(0, 64) : null;

            const rawImages = Array.isArray(body.images)
                ? body.images
                : body.image
                    ? [body.image]
                    : [];

            const rawFiles = Array.isArray(body.files)
                ? body.files
                : body.file
                    ? [body.file]
                    : [];

            if (
                rawImages.length > MAX_ATTACHMENTS ||
                rawFiles.length > MAX_ATTACHMENTS
            ) {
                sendJson(response, 400, {
                    error: `You can attach up to ${MAX_ATTACHMENTS} images and ${MAX_ATTACHMENTS} files per message.`
                });
                return;
            }

            const hasText =
                typeof body.message === "string" &&
                body.message.trim() !== "";

            if (!hasText && rawImages.length === 0 && rawFiles.length === 0) {
                sendJson(response, 400, {
                    error: "A message, image, or file is required."
                });
                return;
            }

            const images = rawImages
                .map(item => validateImage(item))
                .filter(Boolean);

            const files = rawFiles
                .map(item => validateFile(item))
                .filter(Boolean);

            let messageForJason = hasText ? body.message.trim() : "";

            if (files.length > 0) {
                const savedFiles = [];

                for (const [index, file] of files.entries()) {
                    savedFiles.push({
                        name: file.name,
                        path: await storeUploadedFile(file, index)
                    });
                }

                if (!messageForJason) {
                    messageForJason =
                        files.length === 1
                            ? "Please read the attached file and give me a short summary."
                            : "Please read the attached files and give me a short summary of each.";
                }

                messageForJason +=
                    "\n\n" +
                    savedFiles
                        .map(
                            saved =>
                                `[Attached file: "${saved.name}" saved at ${saved.path}. ` +
                                "Use the read_document tool to read it.]"
                        )
                        .join("\n");
            }

            const storedReferences = [];

            for (const image of images) {
                storedReferences.push(await storeImage(image));
            }

            const imagesForJason = images.map((image, index) => ({
                ...image,
                ...storedReferences[index]
            }));

            const events = [];

            let result;

            // Tells the initiative system that you are talking to Jason right now (so he never interrupts)
            noteRequestStarted(clientId);

            try {
                result = await runOneAtATime(() => sendMessage(
                    messageForJason,
                    {
                        images: imagesForJason,
                        onEvent(event) {
                            // Streamed answer text goes straight to the page that asked, and stays out of the events list
                            if (event.type === "reply_delta" || event.type === "reply_abort") {
                                if (clientId) {
                                    sendToClient(
                                        clientId,
                                        event.type === "reply_delta"
                                            ? { type: "reply_delta", text: event.text }
                                            : { type: "reply_abort" }
                                    );
                                }
                                return;
                            }
                            events.push(event);

                            // The moment a tool starts, send its short sentence to the page that asked,
                            // so it can be spoken now instead of after the whole request finishes
                            if (
                                event.type === "tool_started" &&
                                clientId &&
                                typeof event.args?.say === "string" &&
                                event.args.say.trim()
                            ) {
                                sendToClient(clientId, {
                                    type: "say",
                                    text: event.args.say.trim()
                                });
                            }

                            if (event.type === "tool_started") {
                                console.log(
                                    `Jason requested tool: ${event.name}`,
                                    JSON.stringify(event.args)
                                );
                            }

                            if (event.type === "tool_finished") {
                                console.log(
                                    `Tool finished: ${event.name}`,
                                    JSON.stringify(event.result)?.slice(0, 300)
                                );
                            }

                            if (event.type?.endsWith("_failed")) {
                                console.error(
                                    `[Jason] ${event.type} ${event.name ?? ""}:`,
                                    event.error
                                );
                            }
                        }
                    }
                ));
            } catch (error) {
                for (const reference of storedReferences) {
                    await deleteStoredImage(reference.id);
                }

                throw error;
            } finally {
                // Always runs, even after an error, so Jason is never stuck thinking you are still busy
                noteRequestFinished();
            }

            sendJson(response, 200, {
                reply: result.reply,
                provider: result.provider,
                events
            });

            return;
        }
        
                // Speech to text: the browser sends a recording, and we answer with what was said
        if (
            request.method === "POST" &&
            request.url === "/api/transcribe"
        ) {
            const body = JSON.parse(await readRequestBody(request));
            const text = await transcribeAudio(body.audio);

            sendJson(response, 200, { text });
            return;
        }

                // The live connection: the page connects once, and the server can push messages through it
        if (
            request.method === "GET" &&
            request.url.startsWith("/api/events")
        ) {
            const url = new URL(request.url, "http://localhost");
            const clientId = url.searchParams.get("clientId") || "";
            const device = url.searchParams.get("device") === "phone" ? "phone" : "laptop";

            // The id is made up by the page: letters, digits, dashes, underscores only
            if (!/^[\w-]{8,64}$/.test(clientId)) {
                sendJson(response, 400, { error: "A valid clientId is required." });
                return;
            }

            openChannel(clientId, device, response);
            return;   // the connection stays open
        }

        // A page reports whether it is visible, focused, and how long since you touched it
        if (
            request.method === "POST" &&
            request.url === "/api/presence"
        ) {
            const report = JSON.parse(await readRequestBody(request));

            updatePresence(String(report.clientId || ""), report);

            sendJson(response, 200, { ok: true });
            return;
        }
        
        if (
            request.method === "GET" &&
            request.url === "/api/history"
        ) {
            sendJson(response, 200, {
                messages: shortTermMemory.messages.slice(-50)
            });

            return;
        }
        if (
            request.method === "GET" &&
            request.url.startsWith("/api/images/")
        ) {
            const imageId = request.url
                .slice("/api/images/".length);

            try {
                const image = await readStoredImage(
                    imageId
                );

                response.writeHead(200, {
                    "Content-Type": image.mimeType,
                    "Cache-Control": "private, max-age=3600"
                });

                response.end(image.data);
            } catch (error) {
                sendJson(response, 404, {
                    error: error.message
                });
            }

            return;
        }
        if (request.method === "GET") {
            await serveStaticFile(request, response);
            return;
        }

        sendJson(response, 405, {
            error: "Method not allowed."
        });
    } catch (error) {
        console.error("Web request failed:", error.message);

        sendJson(response, 500, {
            error: error.message
        });
    }
});

async function start() {
    try {
        const status = await initializeJason();
        // Load the memories into RAM now, so the first message is not slowed down
        void getLongTermMemories("").catch(() => {});
            
        if (!status.longTermMemoryAvailable) {
            console.warn(
                "Long-term memory is disabled."
            );
        }

        server.listen(PORT, "127.0.0.1", () => {
            console.log(
                `Jason web interface: http://localhost:${PORT}`
            );
            // Start the heartbeat that lets Jason speak up on his own
            startInitiative();
            startReminders();
            startDayLog();
        });
    } catch (error) {
        console.error(
            "Jason failed to start:",
            error.message
        );

        process.exit(1);
    }
}

async function shutdown() {
    try {
        await shutdownJason();
    } catch (error) {
        console.error(
            "Shutdown failed:",
            error.message
        );
    } finally {
        server.close(() => {
            process.exit(0);
        });
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();