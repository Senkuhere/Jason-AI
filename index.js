import "dotenv/config";
import readline from "readline";
import {
    initializeJason,
    shutdownJason,
    sendMessage
} from "./jason-core.js";

import { startScreenAwareness } from "./utility_tools/computer-control.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function chat() {
    rl.question("You: ", async message => {
        const trimmedMessage = message.trim();

        if (trimmedMessage.toLowerCase() === "exit") {
            try {
                await shutdownJason();
            } catch (error) {
                console.error(
                    "Shutdown failed:",
                    error.message
                );
            }

            rl.close();
            console.log("Jason is offline.");
            process.exit(0);
        }
        const startedAt = Date.now();
        const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
        try {
            const result = await sendMessage(trimmedMessage, {
                onEvent(event) {
                    console.log(`[${elapsed()}] ${event.type} ${event.name ?? ""}`);
                    if (event.type === "provider_selected") {
                        console.log(
                            `Selected provider: ${event.name}`
                        );
                    }

                    if (event.type === "tool_started") {
                        console.log(
                            `Jason requested tool: ${event.name}`
                        );
                    }
                    if (event.type?.endsWith("_failed")) {
                        const details =
                            typeof event.error === "object"
                                ? JSON.stringify(event.error, null, 2)
                                : String(event.error);

                        const source = event.name
                            ? ` ${event.name}`
                            : "";

                        console.error(
                            `[Jason] ${event.type}${source}:`,
                            details
                        );
                    }
                }
            });

            console.log("Jason:", result.reply);
        } catch (error) {
            console.error("Error in chat:", error.message);
        }

        chat();
    });
}

async function start() {
    startScreenAwareness();   // starts the window helper and keeps the screen summary fresh
    try {
        
        const status = await initializeJason();

        if (status.longTermMemoryAvailable) {
            console.log("Database connected.");
        } else {
            console.warn(
                "Long-term memory is disabled."
            );
        }

        console.log("Jason is online.");
        console.log("Type 'exit' to stop.\n");

        chat();
    } catch (error) {
        console.error(
            "Database connection failed:",
            error.message
        );

        process.exit(1);
    }
}

start();