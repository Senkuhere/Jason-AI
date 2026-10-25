// rhythm.js: Jason's daily rhythm.
//   MORNING BRIEFING: the first time you are at the computer each morning, he greets you and tells you what matters today.
//   EVENING REVIEW:   in the evening he sums up the day, looks at tomorrow, and keeps a one-line note of the day.
// Both are written by the AI from everything he knows, in his own voice. Nothing here is a fixed script.
//
// Settings (change them by talking to Jason, or in .env):
//   MORNING_START_HOUR=5   MORNING_END_HOUR=14   EVENING_HOUR=21
//   WEATHER_LOCATION="Cebu City,PH"  (optional: adds the weather to the morning briefing)
import { GoogleGenAI } from "@google/genai";

import { buildAwarenessText } from "../daylog.js";
import { deliverToUser, presentClient } from "./delivery.js";
import { createStore } from "./json-store.js";
import { getLongTermMemories } from "../long-term-memory.js";
import { shortTermMemory } from "../memory.js";
import { waitingNotes, formatManila } from "../notes.js";
import { buildJasonSystemPrompt } from "../personality.js";
import { annotateTimeFacts, describeNow, manilaClock } from "../time-awareness.js";
import { getWeather } from "../utility_tools/utility.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const CHECK_EVERY_MS = 30_000;
const WRITE_TIMEOUT_MS = 25_000;
const MAX_TRIES_PER_DAY = 3;          // if writing a briefing keeps failing, he gives up for the day instead of retrying forever
const KEEP_REVIEWS = 14;

const store = createStore("rhythm.json", {
    settings: {
        morningEnabled: true,
        eveningEnabled: true,
        morningStartHour: envNumber("MORNING_START_HOUR", 5),
        morningEndHour: envNumber("MORNING_END_HOUR", 14),
        eveningHour: envNumber("EVENING_HOUR", 21)
    },
    done: { morning: "", evening: "" },          // the date each one was last given
    tries: { date: "", morning: 0, evening: 0 },
    reviews: []                                  // [{ date, text }] one line about each past day
});

let timer = null;
let busy = false;

const manilaDate = (now = Date.now()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(now));

// ---------- Settings ----------
export async function getRhythmSettings() {
    await store.load();
    return { ...store.data.settings };
}

export async function setRhythmSettings({ morningEnabled, eveningEnabled, morningStartHour, eveningHour } = {}) {
    await store.load();
    const settings = store.data.settings;
    const notes = [];
    const hour = (value, name) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 23) throw new Error(`${name} must be an hour from 0 to 23.`);
        return Math.floor(number);
    };

    if (typeof morningEnabled === "boolean") {
        settings.morningEnabled = morningEnabled;
        notes.push(morningEnabled ? "I will give you a morning briefing" : "I will skip the morning briefing");
    }

    if (typeof eveningEnabled === "boolean") {
        settings.eveningEnabled = eveningEnabled;
        notes.push(eveningEnabled ? "I will review the day with you in the evening" : "I will skip the evening review");
    }

    if (morningStartHour !== undefined && morningStartHour !== null) {
        settings.morningStartHour = hour(morningStartHour, "morningStartHour");
        notes.push(`the briefing starts from ${settings.morningStartHour}:00`);
    }

    if (eveningHour !== undefined && eveningHour !== null) {
        settings.eveningHour = hour(eveningHour, "eveningHour");
        notes.push(`the evening review comes after ${settings.eveningHour}:00`);
    }

    await store.save();
    return { settings: { ...settings }, notes };
}

// ---------- What he knows when he writes ----------
async function weatherLine() {
    const place = process.env.WEATHER_LOCATION;
    if (!place || !process.env.OPENWEATHER_API_KEY) return "";

    try {
        const weather = await Promise.race([
            getWeather(place),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000))
        ]);

        return `Weather now in ${weather.location}: ${Math.round(weather.temperatureCelsius)} degrees Celsius, ${weather.condition}.`;
    } catch {
        return "";       // no weather is better than a broken briefing
    }
}

async function gatherContext(kind) {
    const now = Date.now();

    const [awareness, memories, waiting, weather] = await Promise.all([
        buildAwarenessText(now).catch(() => ""),
        getLongTermMemories("", 40).catch(() => []),
        waitingNotes(now).catch(() => []),
        kind === "morning" ? weatherLine() : ""
    ]);

    const lastReview = store.data.reviews.filter(review => review.date !== manilaDate(now)).slice(-1)[0];

    return [
        `Now: ${describeNow(now)}.`,
        awareness,
        "",
        "Things you know about the user (a [time check] tells you what is past, now or coming):",
        memories.length
            ? memories.map(memory => `- [${memory.category}] ${annotateTimeFacts(String(memory.content).slice(0, 220), now)}`).join("\n")
            : "- (nothing saved yet)",
        "",
        "Your notebook (things waiting):",
        waiting.length
            ? waiting.slice(0, 12).map(note => `- (${note.urgency}${note.dueAt ? `, for ${formatManila(note.dueAt)}` : ""}) ${note.text}`).join("\n")
            : "- (nothing waiting)",
        weather ? `\n${weather}` : "",
        lastReview ? `\nYour note about the last day you reviewed (${lastReview.date}): ${lastReview.text}` : ""
    ].filter(line => line !== null && line !== undefined).join("\n");
}

const MORNING_TASK = `
RIGHT NOW YOU ARE NOT ANSWERING A MESSAGE. The user has just arrived at the computer for the first time today.
Give them a short, natural morning briefing, the way an excellent personal assistant would.
- Greet them in a way that fits the time of day.
- Cover only what matters TODAY: commitments (use the [time check] notes: skip anything that is not today), reminders and
  deadlines, anything waiting in your notebook, the weather if it is given, and anything from your note about the last day if it matters.
- 3 to 6 short spoken-style sentences. No lists, no headings, no reading data back like a report.
- Say only what the information below supports. If you know little about their day, give a warm short greeting and ask what the focus of the day is.
Reply with JSON only: {"message": "what you say"}
`;

const EVENING_TASK = `
RIGHT NOW YOU ARE NOT ANSWERING A MESSAGE. It is the evening and the user is at the computer. Review the day with them,
the way a thoughtful assistant would at the end of the day.
- Say briefly what the day looked like (what they worked on or talked about), without listing every detail.
- Mention what is still open: unfinished notes, and anything coming tomorrow or soon (use the [time check] notes).
- End with one short question: is there anything they want you to remember or remind them of for tomorrow?
- 3 to 6 short spoken-style sentences. No lists, no headings. Say only what the information below supports.
Also write "dayNote": one plain sentence for your own records about the day (what mattered), which you will see tomorrow.
Reply with JSON only: {"message": "what you say", "dayNote": "one sentence for your records"}
`;

function parseJson(text) {
    const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no answer");
    return JSON.parse(raw.slice(start, end + 1));
}

// Writes the briefing or review. Returns { message, dayNote }.
export async function writeBriefing(kind) {
    await store.load();

    const context = await gatherContext(kind);

    const response = await Promise.race([
        ai.models.generateContent({
            model: MODEL,
            contents: context,
            config: {
                systemInstruction: `${buildJasonSystemPrompt()}\n\n${kind === "morning" ? MORNING_TASK : EVENING_TASK}`,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingLevel: process.env.GEMINI_RHYTHM_THINKING || "LOW" }
            }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), WRITE_TIMEOUT_MS))
    ]);

    const data = parseJson(response.text);
    const message = String(data.message || "").trim();

    if (message.length < 10) throw new Error("the briefing was empty");

    return { message, dayNote: String(data.dayNote || "").trim().slice(0, 300) };
}

// Keeps the one-line note of the day (the evening review writes it; the next morning reads it)
async function rememberDay(dayNote) {
    if (!dayNote) return;

    const date = manilaDate();
    store.data.reviews = store.data.reviews.filter(review => review.date !== date);
    store.data.reviews.push({ date, text: dayNote });
    store.data.reviews = store.data.reviews.slice(-KEEP_REVIEWS);
    await store.save();
}

// For when the user asks for it: writes it and returns the text (it is not "used up" for the day)
export async function briefingNow(kind = "morning") {
    const { message, dayNote } = await writeBriefing(kind === "evening" ? "evening" : "morning");
    if (kind === "evening") await rememberDay(dayNote);
    return message;
}

// ---------- The automatic schedule ----------
// Has the user said anything to Jason in the last minute or so? Then it is not the moment to interrupt.
function inConversation() {
    const last = [...shortTermMemory.messages].reverse().find(message => message.role === "user");
    return Boolean(last && Date.now() - new Date(last.timestamp).getTime() < 90_000);
}

async function giveIfDue(kind) {
    const settings = store.data.settings;
    const today = manilaDate();
    const hour = manilaClock().minutes / 60;

    if (!(kind === "morning" ? settings.morningEnabled : settings.eveningEnabled)) return;
    if (store.data.done[kind] === today) return;

    const inWindow = kind === "morning"
        ? hour >= settings.morningStartHour && hour < settings.morningEndHour
        : hour >= settings.eveningHour;

    if (!inWindow) return;

    // He gives up for the day after a few failures
    if (store.data.tries.date !== today) store.data.tries = { date: today, morning: 0, evening: 0 };
    if (store.data.tries[kind] >= MAX_TRIES_PER_DAY) return;

    const client = presentClient(300);
    if (!client || inConversation()) return;

    store.data.tries[kind]++;

    try {
        const { message, dayNote } = await writeBriefing(kind);
        const result = await deliverToUser(message, { kind: kind === "morning" ? "morning briefing" : "evening review", client });

        if (!result.ok) return;       // nobody to tell right now: try again at the next check

        store.data.done[kind] = today;
        if (kind === "evening") await rememberDay(dayNote);
        await store.save();

        console.log(`[rhythm] ${kind} ${kind === "morning" ? "briefing" : "review"} given on the ${result.device}.`);
    } catch (error) {
        console.warn(`[rhythm] the ${kind} briefing failed (will retry):`, error.message);
        await store.save();
    }
}

async function check() {
    if (busy) return;
    busy = true;

    try {
        await store.load();
        await giveIfDue("morning");
        await giveIfDue("evening");
    } catch (error) {
        console.warn("[rhythm] check failed:", error.message);
    } finally {
        busy = false;
    }
}

export function startRhythm() {
    if (timer) return;

    timer = setInterval(check, CHECK_EVERY_MS);
    timer.unref?.();

    console.log("[rhythm] ready (morning briefing and evening review).");
}

export function stopRhythm() {
    clearInterval(timer);
    timer = null;
}

export { check as checkRhythmNow };
