// reminders.js: tells the user when a reminder in notes.js comes due.
// Every 20 seconds it checks the notebook. When a reminder is due and a page is open, Jason says it in his own words.
// This runs separately from the "speak up on his own" system, so a reminder you asked for is never held back
// by its daily limit, its quiet time or its random timing.
import { GoogleGenAI } from "@google/genai";

import { dueNotes, markTold, formatManila } from "./notes.js";
import { listClients, sendToClient } from "./push-channel.js";
import { updateShortTermMemory, saveShortTermMemory } from "./memory.js";
import { buildJasonSystemPrompt } from "./personality.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const CHECK_EVERY_MS = 20_000;
const WORDING_TIMEOUT_MS = 10_000;

// Reads a positive number from .env, or uses the default
const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

// A page counts as "someone is there" if it reported recently and was touched within this many seconds.
// Generous on purpose: for a reminder it is better to show it than to miss it.
const PRESENT_IDLE_SECONDS = envNumber("REMINDER_PRESENT_IDLE_SECONDS", 900);
const REPORT_FRESH_SECONDS = envNumber("INITIATIVE_REPORT_FRESH_SECONDS", 60);

let timer = null;
let delivering = false;

// The open page the user is most likely looking at right now (or null if there is none)
function chooseClient() {
    const now = Date.now();

    const candidates = listClients().filter(client =>
        now - client.presenceAt < REPORT_FRESH_SECONDS * 1000 &&
        client.visible &&
        client.idleSeconds < PRESENT_IDLE_SECONDS
    );

    candidates.sort((a, b) => a.idleSeconds - b.idleSeconds);
    return candidates[0] || null;
}

// Jason words the reminder himself. If that fails, a plain sentence is used, so a reminder is never lost.
async function wordReminder(due) {
    const lines = due.map(note => {
        const lateMinutes = Math.round((Date.now() - note.dueAt) / 60_000);
        const late = lateMinutes >= 2 ? `, due ${lateMinutes} minutes ago` : "";
        return `- ${note.text} (urgency: ${note.urgency}${late})`;
    }).join("\n");

    const fallback = due.length === 1
        ? `Sir, a reminder: ${due[0].text}`
        : `Sir, a few reminders: ${due.map(note => note.text).join("; ")}`;

    try {
        const response = await Promise.race([
            ai.models.generateContent({
                model: MODEL,
                contents:
                    `The time is ${formatManila(Date.now())} (Manila).\n` +
                    `The user asked you to remind them of this, and it is due now:\n${lines}\n\n` +
                    "Say it to them now in your own words: one or two short, natural sentences, " +
                    "as a person in the room would. Mention the reminder itself clearly. " +
                    "Reply with the sentences only, with no quotes or labels.",
                config: {
                    systemInstruction: buildJasonSystemPrompt(),
                    thinkingConfig: { thinkingLevel: "MINIMAL" }
                }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), WORDING_TIMEOUT_MS))
        ]);

        const text = String(response.text || "").trim().replace(/^["“]+|["”]+$/g, "");
        return text.length >= 3 ? text : fallback;
    } catch (error) {
        console.warn("[reminders] Could not word the reminder, using a plain sentence:", error.message);
        return fallback;
    }
}

async function checkReminders() {
    if (delivering) return;
    delivering = true;

    try {
        const due = (await dueNotes()).slice(0, 5);
        if (due.length === 0) return;

        // Nobody is looking: the reminder simply waits, and is told as soon as someone is
        const client = chooseClient();
        if (!client) return;

        const message = await wordReminder(due);

        if (!sendToClient(client.clientId, { type: "initiative", text: message })) return;

        // Jason now knows what he said, so a reply like "okay, thanks" makes sense to him
        updateShortTermMemory("assistant", message);
        await saveShortTermMemory();
        await markTold(due.map(note => note.id));

        console.log(`[reminders] told the ${client.device}: "${message}"`);
    } catch (error) {
        console.error("[reminders] check failed (will try again):", error.message);
    } finally {
        delivering = false;
    }
}

export function startReminders() {
    if (timer) return;

    timer = setInterval(checkReminders, CHECK_EVERY_MS);
    timer.unref?.();     // never keeps Jason alive by itself

    console.log("[reminders] ready.");
}

export function stopReminders() {
    clearInterval(timer);
    timer = null;
}

// Exported so it can be tested without waiting
export { checkReminders };
