import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

        if (body.length > 8_000_000) {
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
const server = http.createServer(async (request, response) => {
    try {
        if (
            request.method === "POST" &&
            request.url === "/api/chat"
        ) {
            const rawBody = await readRequestBody(request);
            const body = JSON.parse(rawBody);

            if (
                (
                    typeof body.message !== "string" ||
                    body.message.trim() === ""
                ) &&!body.image
            ) {
                sendJson(response, 400, {
                    error: "A message or image is required."
                });
                return;
            }
            const image = validateImage(body.image);

            const storedReference = image
                ? await storeImage(image)
                : null;

            const imageForJason = image
                ? {
                    ...image,
                    ...storedReference
                }
                : null;

            const events = [];

            let result;

            try {
                result = await sendMessage(
                    body.message || "",
                    {
                        image: imageForJason,
                        onEvent(event) {
                            events.push(event);
                        }
                    }
                );
            } catch (error) {
                if (storedReference) {
                    await deleteStoredImage(
                        storedReference.id
                    );
                }

                throw error;
            }
            
            sendJson(response, 200, {
                reply: result.reply,
                provider: result.provider,
                events
            });

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

        if (!status.longTermMemoryAvailable) {
            console.warn(
                "Long-term memory is disabled."
            );
        }

        server.listen(PORT, () => {
            console.log(
                `Jason web interface: http://localhost:${PORT}`
            );
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