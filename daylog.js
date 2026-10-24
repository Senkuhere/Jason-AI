// daylog.js: Jason's picture of the user's DAY. Once a minute it notes what is open on the computer and whether
// the user is at it, and it keeps what the user said to him, so he knows what happened earlier today, and what
// is coming later. Everything is saved on this computer in memory/daylog.json (the last 3 days only).
// Turn it off with DAYLOG=off in .env.
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getScreenContext, getSystemIdleSeconds } from "./utility_tools/computer-control.js";
import { listNotes } from "./notes.js";
import { recentSharedIdeas } from "./ideas.js";
import { describeNow, formatClock, formatDuration, manilaClock, timeAgoShort } from "./time-awareness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIRECTORY = path.join(__dirname, "memory");
const LOG_FILE = path.join(MEMORY_DIRECTORY, "daylog.json");

const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const SAMPLE_EVERY_MS = 60_000;                                       // look at the computer once a minute
const AWAY_SECONDS = envNumber("DAYLOG_AWAY_SECONDS", 300);           // no keyboard or mouse for this long = away
const KEEP_DAYS = 3;
const MAX_SEGMENTS = 400;                                             // per day
const MAX_MESSAGES = 80;                                              // per day
const MAX_EVENTS = 40;                                                // per day
const MAX_TEXT_CHARACTERS = 1800;                                     // the most he is shown at once

let days = {};                 // "2026-10-24" -> { segments, messages, events }
let loaded = false;
let timer = null;
let sampleCount = 0;
let saveChain = Promise.resolve();

// ---------- Days ----------
function manilaDate(now = Date.now()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(now));   // 2026-10-24
}

function today(now = Date.now()) {
    const key = manilaDate(now);
    days[key] ??= { segments: [], messages: [], events: [] };
    return days[key];
}

function forgetOldDays(now = Date.now()) {
    const keep = [...Array(KEEP_DAYS)].map((_, index) => manilaDate(now - index * 86_400_000));
    for (const key of Object.keys(days)) if (!keep.includes(key)) delete days[key];
}

// ---------- Saving and loading ----------
async function load() {
    if (loaded) return;
    loaded = true;

    try {
        const data = JSON.parse(await fs.readFile(LOG_FILE, "utf8"));
        days = data && typeof data.days === "object" ? data.days : {};
    } catch (error) {
        days = {};
        if (error.code !== "ENOENT") {
            console.error("[daylog] Could not read daylog.json, starting empty:", error.message);
            await fs.rename(LOG_FILE, `${LOG_FILE}.damaged-${Date.now()}`).catch(() => {});
        }
    }
}

function save() {
    saveChain = saveChain.then(async () => {
        try {
            await fs.mkdir(MEMORY_DIRECTORY, { recursive: true });

            const text = JSON.stringify({ days });
            const temporary = `${LOG_FILE}.tmp`;

            await fs.writeFile(temporary, text, "utf8");

            try {
                await fs.rename(temporary, LOG_FILE);
            } catch {
                await fs.writeFile(LOG_FILE, text, "utf8");
            }
        } catch (error) {
            console.error("[daylog] Could not save:", error.message);
        }
    });

    return saveChain;
}

// ---------- Recording ----------
// What is the user doing on the computer right now? Returns { app, title } or null if unknown.
async function readActivity() {
    let idle = 0;

    try {
        idle = await getSystemIdleSeconds();
    } catch {
        // not available: assume the user is there
    }

    if (idle >= AWAY_SECONDS) return { app: "(away from the computer)", title: "" };

    const screen = String(getScreenContext() || "");

    // The screen information is old (the helper stopped): better to record nothing than something false
    if (!screen || /may be out of date/.test(screen)) return null;

    const match = screen.match(/^Active window: (.+?) "(.*)" \(/m);

    return match
        ? { app: match[1].trim(), title: match[2].trim() }
        : { app: "(desktop)", title: "" };
}

async function sample() {
    try {
        await load();

        const activity = await readActivity();
        if (!activity) return;

        const now = Date.now();
        const day = today(now);
        const last = day.segments[day.segments.length - 1];

        // Same app as a moment ago: the same stretch of time. Otherwise a new one begins.
        if (last && last.app === activity.app && now - last.to < SAMPLE_EVERY_MS * 4) {
            last.to = now;

            if (activity.title && last.titles.length < 3 && !last.titles.includes(activity.title.slice(0, 70))) {
                last.titles.push(activity.title.slice(0, 70));
            }
        } else {
            day.segments.push({
                app: activity.app,
                titles: activity.title ? [activity.title.slice(0, 70)] : [],
                from: now,
                to: now
            });

            if (day.segments.length > MAX_SEGMENTS) day.segments.shift();
        }

        forgetOldDays(now);

        // Saved every third look, so the disk is not written every minute
        if (++sampleCount % 3 === 0) await save();
    } catch (error) {
        console.warn("[daylog] a look at the computer failed (will try again):", error.message);
    }
}

// What the user said to Jason (called for every message)
export async function logUserMessage(text) {
    try {
        await load();

        const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 140);
        if (!clean) return;

        const day = today();
        day.messages.push({ at: Date.now(), text: clean });
        if (day.messages.length > MAX_MESSAGES) day.messages.shift();

        save();
    } catch (error) {
        console.warn("[daylog] could not log a message:", error.message);
    }
}

// Something Jason did or said on his own (a reminder, something he brought up)
export async function logEvent(kind, text) {
    try {
        await load();

        const day = today();
        day.events.push({ at: Date.now(), kind: String(kind), text: String(text || "").replace(/\s+/g, " ").slice(0, 140) });
        if (day.events.length > MAX_EVENTS) day.events.shift();

        save();
    } catch (error) {
        console.warn("[daylog] could not log an event:", error.message);
    }
}

// ---------- Writing the picture of the day ----------
// Neighbouring stretches in the same app become one run
function toRuns(segments) {
    const runs = [];

    for (const segment of segments) {
        const last = runs[runs.length - 1];

        if (last && last.app === segment.app) {
            last.to = segment.to;
            for (const title of segment.titles) if (last.titles.length < 2 && !last.titles.includes(title)) last.titles.push(title);
        } else {
            runs.push({ app: segment.app, titles: [...segment.titles].slice(0, 2), from: segment.from, to: segment.to });
        }
    }

    return runs;
}

const clock = milliseconds => formatClock(manilaClock(milliseconds).minutes);

export async function buildAwarenessText(now = Date.now()) {
    if (process.env.DAYLOG === "off") return "";

    try {
        await load();

        const day = today(now);
        const lines = [`What you know about the user's day (now: ${describeNow(now)}):`];

        // On the computer, in order
        // Very short stretches are noise and are left out, except the latest one (what is happening right now)
        const allRuns = toRuns(day.segments);
        const runs = allRuns
            .filter((run, index) =>
                index === allRuns.length - 1 || run.to - run.from >= 3 * 60_000 || run.app.startsWith("(")
            )
            .slice(-12);

        const present = day.segments.find(segment => !segment.app.startsWith("(away"));

        if (present) lines.push(`- First seen at the computer today: ${clock(present.from)}.`);

        if (runs.length) {
            lines.push("- On the computer today: " + runs.map(run =>
                `${clock(run.from)}–${clock(run.to)} ${run.app}${run.titles[0] ? ` ("${run.titles[0]}")` : ""}`
            ).join("; ") + ".");
        }

        // What the user told him
        const lastMessage = day.messages[day.messages.length - 1];

        if (lastMessage) {
            lines.push(`- The user last wrote to you ${timeAgoShort(lastMessage.at, now)}.`);
            lines.push("- What the user said to you today: " + day.messages.slice(-10).map(message =>
                `${clock(message.at)} "${message.text}"`
            ).join("; ") + ".");
        } else {
            lines.push("- The user has not written to you yet today.");
        }

        // What he did on his own
        if (day.events.length) {
            lines.push("- What you did on your own today: " + day.events.slice(-5).map(event =>
                `${clock(event.at)} ${event.kind} "${event.text}"`
            ).join("; ") + ".");
        }

        // Yesterday, briefly
        const yesterday = days[manilaDate(now - 86_400_000)];

        if (yesterday?.segments.length) {
            const totals = {};

            for (const segment of yesterday.segments) {
                if (segment.app.startsWith("(")) continue;
                totals[segment.app] = (totals[segment.app] || 0) + (segment.to - segment.from) / 60_000;
            }

            const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([app, minutes]) => `${app} (${formatDuration(minutes)})`);

            if (top.length) lines.push(`- Yesterday the user mostly used: ${top.join(", ")}.`);
        }

        // Later: reminders and notes with a time
        const coming = (await listNotes())
            .filter(note => note.due && note.status === "pending")
            .slice(0, 5)
            .map(note => `${note.due}: ${note.text}`);

        if (coming.length) lines.push(`- Coming up in your notebook: ${coming.join("; ")}.`);

        // Ideas he shared recently, so he can talk them over
        const shared = await recentSharedIdeas(2);

        if (shared.length) {
            lines.push("- Ideas you brought up recently: " + shared.map(idea => `"${idea.text}"`).join("; ") + ".");
        }

        lines.push(
            "Use this to understand what the user has been doing and what is next. " +
            "Do not read it back unless it is relevant, and compare times with the current time before you mention them."
        );

        const text = lines.join("\n");
        return text.length > MAX_TEXT_CHARACTERS ? text.slice(0, MAX_TEXT_CHARACTERS - 1) + "…" : text;
    } catch (error) {
        return "";
    }
}

// ---------- Start and stop ----------
export function startDayLog() {
    if (timer || process.env.DAYLOG === "off") return;

    timer = setInterval(sample, SAMPLE_EVERY_MS);
    timer.unref?.();

    sample();
    console.log("[daylog] ready.");
}

export function stopDayLog() {
    clearInterval(timer);
    timer = null;
}

export { sample as sampleNow };
