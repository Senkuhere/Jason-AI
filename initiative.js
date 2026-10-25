// initiative.js: lets Jason speak up on his own, occasionally, when there is something worth saying.
// A "heartbeat" wakes up now and then, checks that the moment is right (code rules), and then asks
// Gemini one question: "is there anything genuinely worth saying?". Silence is the default.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

import { shortTermMemory, 
         updateShortTermMemory, 
         saveShortTermMemory 
} from "./memory.js";

import { getLongTermMemories } from "./long-term-memory.js";

import { getScreenContext, 
         getSystemIdleSeconds 
} from "./utility_tools/computer-control.js";

import { listClients, 
         sendToClient 
} from "./push-channel.js";

// The few read-only tools he may use to look around before deciding (see initiative-tools.js)
import { decideWithTools, 
         lookAroundToolNames 
} from "./initiative-tools.js";

import { buildJasonSystemPrompt } from "./personality.js";

// Jason's notebook: what is waiting to be told, and crossing notes off once he has told you
import { waitingNotes, markTold, formatManila } from "./notes.js";

// Awareness of time and of the user's day, and Jason's own ideas
import { annotateTimeFacts } from "./time-awareness.js";
import { buildAwarenessText, logEvent } from "./daylog.js";
import { startIdeas, ideasText, markIdeasShared } from "./ideas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, "memory", "initiative.json");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_INITIATIVE_MODEL || "gemini-3.1-flash-lite";

// ======================================================================
// How talkative Jason is
// ======================================================================
const MODES = {
    // checkEveryMinutes: how often he considers speaking (the real time varies a little, to feel natural)
    // minGapMinutes:     the least time between two of his messages
    // maxPerDay:         the most messages in one day
    rare:   { checkEveryMinutes: 60, minGapMinutes: 120, maxPerDay: 4,  description: "only now and then" },
    normal: { checkEveryMinutes: 10, minGapMinutes: 15,  maxPerDay: 30,  description: "once in a while" },
    chatty: { checkEveryMinutes: 2, minGapMinutes: 8,  maxPerDay: 50, description: "fairly often" }
};

// No messages during these hours, Manila time. Change them in .env with INITIATIVE_QUIET_START and INITIATIVE_QUIET_END.
const QUIET_START_HOUR = Number(process.env.INITIATIVE_QUIET_START ?? 23);   // 11 PM
const QUIET_END_HOUR = Number(process.env.INITIATIVE_QUIET_END ?? 7);        // 7 AM

// Reads a positive number from .env, or uses the default if it is missing or not a valid number
const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

// ---------- When someone counts as "around" ----------
// Each value can be changed in .env without touching the code (the number after the name is the default)
const LAPTOP_PRESENT_IDLE_SECONDS = envNumber("INITIATIVE_LAPTOP_IDLE_SECONDS", 300);   // keyboard or mouse used within 5 minutes
const PHONE_PRESENT_IDLE_SECONDS  = envNumber("INITIATIVE_PHONE_IDLE_SECONDS", 180);    // phone page touched within 3 minutes
const REPORT_FRESH_SECONDS        = envNumber("INITIATIVE_REPORT_FRESH_SECONDS", 60);   // a page silent for this long counts as asleep or closed
const RECENT_CHAT_MINUTES         = envNumber("INITIATIVE_RECENT_CHAT_MINUTES", 10);    // the device you last messaged from counts as "around" this long
const USER_QUIET_SECONDS          = envNumber("INITIATIVE_USER_QUIET_SECONDS", 30);     // never speak this soon after you talked to Jason
const INITIAL_DELAY_MINUTES       = envNumber("INITIATIVE_FIRST_CHECK_MINUTES", 3);     // the first check after Jason starts

// ---------- How much he can see when deciding ----------
const CHAT_HISTORY_MESSAGES = Math.round(envNumber("INITIATIVE_HISTORY_MESSAGES", 25));   // recent chat messages he reads (the most Jason keeps is 50)
const RECENT_SAID_COUNT     = Math.round(envNumber("INITIATIVE_RECENT_SAID", 12));         // his own recent remarks he must not repeat

// ======================================================================
// State
// ======================================================================
let settings = {
    mode: process.env.INITIATIVE_MODE || "normal",
    autonomousScreenVision: ["on", "true", "1"].includes(           // Whether initiative may capture an actual screenshot.
        String(process.env.INITIATIVE_SCREEN_VISION || "").toLowerCase() // Window titles remain available even when this is false.
    ),
    quietUntil: null,     // a time (milliseconds), set by "be quiet for an hour"
    checkEveryMinutes: null,   // set by "check in every 20 minutes". null = use the mode's own rhythm
    lastSpokeAt: 0,
    day: "",              // today's date in Manila, to count messages per day
    sentToday: 0,
    recent: []            // the last few things he said on his own: [{ text, at }]
};

let started = false;
let timer = null;
let thinking = false;           // true while a decision is being made
let busyRequests = 0;           // how many chat requests are running right now
let lastUserMessageAt = 0;      // when you last talked to Jason
let lastUserClientId = null;    // and from which device

// ---------- Hooks used by web-server.js ----------
export function noteRequestStarted(clientId) {
    busyRequests++;
    lastUserMessageAt = Date.now();
    if (clientId) lastUserClientId = clientId;
}

export function noteRequestFinished() {
    busyRequests = Math.max(0, busyRequests - 1);
    lastUserMessageAt = Date.now();
}

// ======================================================================
// Settings file
// ======================================================================
async function loadSettings() {
    try {
        const saved = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8"));
        settings = { ...settings, ...saved };
    } catch (error) {
        // no saved settings yet: the defaults above are used
    }

    if (settings.mode !== "off" && !MODES[settings.mode]) settings.mode = "normal";
    if (!Array.isArray(settings.recent)) settings.recent = [];
}

// Saves wait for each other, and are swapped in from a temporary file, so a crash can never leave a damaged file
let settingsSaveChain = Promise.resolve();

function saveSettings() {
    settingsSaveChain = settingsSaveChain.then(async () => {
        try {
            await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });

            const text = JSON.stringify(settings, null, 2);
            const temporary = `${SETTINGS_FILE}.tmp`;

            await fs.writeFile(temporary, text, "utf8");

            try {
                await fs.rename(temporary, SETTINGS_FILE);
            } catch {
                await fs.writeFile(SETTINGS_FILE, text, "utf8");   // Windows sometimes refuses the swap briefly
            }
        } catch (error) {
            console.warn("[initiative] could not save settings:", error.message);
        }
    });

    return settingsSaveChain;
}

// ======================================================================
// Time helpers (Manila time)
// ======================================================================
function manilaNow() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Manila",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", hour12: false
    }).formatToParts(new Date());

    const get = type => parts.find(part => part.type === type)?.value;

    return {
        hour: Number(get("hour")) % 24,          // some systems write midnight as 24
        day: `${get("year")}-${get("month")}-${get("day")}`
    };
}

function isQuietHour(hour) {
    // A quiet period that crosses midnight (23 to 7) versus one that does not
    return QUIET_START_HOUR > QUIET_END_HOUR
        ? hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
        : hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

// "25 minutes ago", "2 hours ago"
function ago(milliseconds) {
    const minutes = Math.round(milliseconds / 60_000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function resetDayIfNeeded() {
    const { day } = manilaNow();

    if (settings.day !== day) {
        settings.day = day;
        settings.sentToday = 0;
    }
}

// ======================================================================
// Is this a good moment? (code decides this, not the AI)
// Returns the reason NOT to speak, or null if it is fine.
// ======================================================================
function whyNot() {
    if (settings.mode === "off") return "initiative is turned off";

    if (settings.quietUntil && Date.now() < settings.quietUntil) {
        return "quiet time was requested";
    }

    if (isQuietHour(manilaNow().hour)) return "it is quiet hours";

    resetDayIfNeeded();
    const rules = MODES[settings.mode];

    if (settings.sentToday >= rules.maxPerDay) return "the daily limit was reached";
    if (Date.now() - settings.lastSpokeAt < rules.minGapMinutes * 60_000) return "he spoke up recently";
    if (busyRequests > 0) return "a request is running";
    if (Date.now() - lastUserMessageAt < USER_QUIET_SECONDS * 1000) return "you were just talking to him";

    return null;
}

// ======================================================================
// Who is around, and on which device?
// ======================================================================
async function findPresentDevice() {
    const now = Date.now();

    // Only pages that reported in the last minute (a closed or sleeping page stops reporting)
    const clients = listClients().filter(
        client => now - client.presenceAt < REPORT_FRESH_SECONDS * 1000
    );

    if (clients.length === 0) return null;

    // Seconds since the keyboard or mouse was last used anywhere on the laptop
    let laptopIdle = null;

    try {
        laptopIdle = await getSystemIdleSeconds();
    } catch (error) {
        // not available: fall back to what the page reports
    }

    const candidates = [];

    for (const client of clients) {
        if (client.device === "laptop") {
            const idle = laptopIdle ?? client.idleSeconds;
            if (idle < LAPTOP_PRESENT_IDLE_SECONDS) candidates.push({ client, idleSeconds: idle });
        } else if (client.visible && client.idleSeconds < PHONE_PRESENT_IDLE_SECONDS) {
            candidates.push({ client, idleSeconds: client.idleSeconds });
        }
    }

    // The device you last messaged from counts too (this covers talking hands-free, with no keyboard)
    const sinceChat = now - lastUserMessageAt;

    if (lastUserClientId && sinceChat < RECENT_CHAT_MINUTES * 60_000) {
        const chatClient = clients.find(client => client.clientId === lastUserClientId);

        if (chatClient) candidates.push({ client: chatClient, idleSeconds: Math.round(sinceChat / 1000) });
    }

    if (candidates.length === 0) return null;

    // The device used most recently wins. On a tie, the laptop.
    candidates.sort(
        (first, second) =>
            first.idleSeconds - second.idleSeconds ||
            (first.client.device === "laptop" ? -1 : 1)
    );

    return candidates[0];
}

// ======================================================================
// Asking Gemini: is there anything worth saying?
// ======================================================================
// What Jason is being asked to do right now. Who he is (name, tone, how he addresses you) comes from
// personality.js, so it is not repeated here.
const INITIATIVE_TASK = `
RIGHT NOW YOU ARE NOT ANSWERING A MESSAGE. You are deciding whether to say something to the user on your
own initiative, the way a considerate person shares a thought. Most of the time the right choice is to say nothing.

Speak only if you have something genuinely worth saying. Use your own judgment. Some examples:
- a useful idea or suggestion connected to what they have been doing or talking about
- a gentle reminder about something they mentioned (a deadline, a plan, something they wanted to do)
- a short friendly remark or check-in, if it has been a long time since you last spoke
- an offer of help that follows from what is open on their screen

Rules:
- Keep it short and natural, like a person in the room. No lists.
- Never repeat, or rephrase, anything in "Recently said by you on your own".
- Ask at most one question. Do not nag. Do not simply read back what is on their screen.
- Never mention that you are checking, a heartbeat, your memories, or your tools.
- If you are not sure, say nothing.

- Before you mention any time or schedule, compare it with the current time. If it has already passed, it is in the past.
- Your notebook lists things waiting to be told (reminders with a time are told separately, at their time).
  If one is worth telling now, tell it naturally and put its id in "notesAddressed". If it is not the right moment, leave it.
- You may have ideas of your own waiting. If one fits the moment, bring it up as a thought you had (one idea at a time),
  invite the user's opinion, and put its id in "ideasShared". Do not force it if the moment is wrong.

Reply with JSON only:
{"speak": true or false, "message": "what you would say", "reason": "very short reason", "notesAddressed": [], "ideasShared": []}
When speak is false, message must be an empty string and both lists must be empty.
`;

// His full personality first, then the task above
function buildInitiativeInstructions() {
    return buildJasonSystemPrompt() + "\n\n" + INITIATIVE_TASK;
}

// Gives up on a request that takes too long (and cleans up the timer either way)
function withTimeout(promise, milliseconds) {
    let timeoutId;

    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("The initiative request timed out.")), milliseconds);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// What is waiting in his notebook (reminders with a time that has come are told by reminders.js instead)
async function notebookText() {
    try {
        const waiting = await waitingNotes();

        if (waiting.length === 0) return "- (nothing waiting)";

        return waiting
            .slice(0, 15)
            .map(note =>
                `- [${note.id}] (${note.urgency}${note.dueAt ? `, for ${formatManila(note.dueAt)}` : ""}) ${note.text}`
            )
            .join("\n");
    } catch (error) {
        return "- (the notebook could not be read)";
    }
}

// Two messages that say nearly the same thing (most of the same words) count as a repeat
function tooSimilar(first, second) {
    const words = text => new Set(normalize(text).split(" ").filter(word => word.length > 2));
    const a = words(first);
    const b = words(second);

    if (a.size === 0 || b.size === 0) return false;

    let shared = 0;
    for (const word of a) if (b.has(word)) shared++;

    return shared / (a.size + b.size - shared) >= 0.7;
}

// Everything Jason should know when deciding
async function buildContext(presence, forced) {
    const memories = await getLongTermMemories("", 20).catch(() => []);

    const known = memories.length
        ? memories.map(memory => `- [${memory.category}] ${annotateTimeFacts(String(memory.content).slice(0, 200))}`).join("\n")
        : "- (nothing stored yet)";

    const recentChat = shortTermMemory.messages
        .slice(-CHAT_HISTORY_MESSAGES)
        .map(message => `${message.role}: ${String(message.content).slice(0, 300)}`)
        .join("\n") || "(no recent conversation)";

    const lastMessage = shortTermMemory.messages[shortTermMemory.messages.length - 1];
    const sinceLastChat = lastMessage?.timestamp
        ? ago(Date.now() - new Date(lastMessage.timestamp).getTime())
        : "a long time ago";

    const recentlySaid = settings.recent.length
        ? settings.recent.map(item => `- ${ago(Date.now() - item.at)}: "${item.text}"`).join("\n")
        : "- (nothing yet)";

    const notebook = await notebookText();
    const awareness = await buildAwarenessText();
    const ideaList = await ideasText().catch(() => "- (ideas could not be read)");

    const lastSpoke = settings.lastSpokeAt
        ? ago(Date.now() - settings.lastSpokeAt)
        : "not yet since you started";

    const where = presence
        ? `using their ${presence.client.device} (last active ${presence.idleSeconds} seconds ago)`
        : "unknown";

    const nowText = new Intl.DateTimeFormat("en-PH", {
        dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila"
    }).format(new Date());

    return [
        `Current time (Manila): ${nowText}`,
        `How talkative you are: ${settings.mode}`,
        forced ? "The user just asked you to think of something to say right now, so say something." : "",
        `The user is: ${where}`,
        `Last conversation with the user: ${sinceLastChat}`,
        `You last spoke up on your own: ${lastSpoke} (${settings.sentToday} time${settings.sentToday === 1 ? "" : "s"} today)`,
        "",
        "Things you know about the user:",
        known,
        "",
        awareness,
        "",
        "Recent conversation:",
        recentChat,
        "",
        "Open on the user's laptop screen right now (window titles only):",
        String(getScreenContext() || "(unknown)").slice(0, 1500),
        "",
        "Your notebook (waiting to be told; ids in brackets):",
        notebook,
        "",
        "Ideas you have thought of but not yet shared (ids in brackets):",
        ideaList,
        "",
        "Recently said by you on your own (do not repeat these):",
        recentlySaid
    ].filter(line => line !== "").join("\n");
}

// Returns { speak, message, reason }
// How often a check ALSO looks around with read-only tools first (0 = never, 1 = every time).
// Only occasionally, on purpose. INITIATIVE_LOOK_CHANCE in .env (for example 0.2) overrides these.
const LOOK_AROUND_CHANCE = { rare: 0.3, normal: 0.5, chatty: 0.75 };

function lookAroundChance() {
    const fromEnv = process.env.INITIATIVE_LOOK_CHANCE;

    if (fromEnv !== undefined && fromEnv !== "" && Number.isFinite(Number(fromEnv))) {
        return Math.min(Math.max(Number(fromEnv), 0), 1);
    }

    return LOOK_AROUND_CHANCE[settings.mode] ?? 0.3;
}

async function decide(context, { forced = false } = {}) {
    // His personality plus the task of this moment
    const instructions = buildInitiativeInstructions();

    const thinkingLevel = process.env.GEMINI_INITIATIVE_THINKING || "LOW";

    // Once in a while (and always when he was asked to think of something now), look at a few
    // read-only things first: the date, the computer's state, his saved notes
    const availableLookAroundTools = lookAroundToolNames({
        allowScreenVision: settings.autonomousScreenVision
    });

    if (
        availableLookAroundTools.length > 0 &&
        (forced || Math.random() < lookAroundChance())
    ) {
        try {
            const result = await decideWithTools({
                ai, model: MODEL, instructions, context, thinkingLevel, allowScreenVision: settings.autonomousScreenVision
            });

            console.log(
                `[initiative] looked around: ${result.toolsUsed.length ? result.toolsUsed.join(", ") : "(nothing needed)"}`
            );

            return result;
        } catch (error) {
            console.warn("[initiative] looking around failed, thinking without tools:", error.message);
        }
    }

    const response = await withTimeout(
        ai.models.generateContent({
            model: MODEL,
            contents: context,
            config: {
                systemInstruction: instructions,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingLevel }
            }
        }),
        25_000
    );

    try {
        const data = JSON.parse(response.text || "{}");

        return {
            speak: data.speak === true,
            message: typeof data.message === "string" ? data.message.trim() : "",
            reason: typeof data.reason === "string" ? data.reason : "",
            // Ids of notebook notes this message tells the user about (so they can be crossed off)
            notesAddressed: Array.isArray(data.notesAddressed)
                ? data.notesAddressed.filter(id => typeof id === "string").slice(0, 10)
                : [],
            ideasShared: Array.isArray(data.ideasShared)
                ? data.ideasShared.filter(id => typeof id === "string").slice(0, 5)
                : []
        };
    } catch (error) {
        return { speak: false, message: "", reason: "the answer could not be read", notesAddressed: [], ideasShared: [] };
    }
}

// ======================================================================
// Delivering a message
// ======================================================================
const normalize = text => String(text).toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

function deliver(message, presence) {
    // To the device that is in use. For a forced test with nobody detected, to every connected page.
    const targets = presence
        ? [presence.client.clientId]
        : listClients().map(client => client.clientId);

    let delivered = 0;

    for (const clientId of targets) {
        if (sendToClient(clientId, { type: "initiative", text: message })) delivered++;
    }

    if (delivered === 0) return false;

    // Remember it: cooldown, daily count, and the conversation (so your reply to it makes sense)
    resetDayIfNeeded();
    settings.lastSpokeAt = Date.now();
    settings.sentToday++;
    settings.recent.push({ text: message, at: Date.now() });
    settings.recent = settings.recent.slice(-RECENT_SAID_COUNT);
    saveSettings();

    updateShortTermMemory("assistant", message);
    saveShortTermMemory();

    return true;
}

// ======================================================================
// The heartbeat
// ======================================================================
async function heartbeat({ force = false } = {}) {
    if (thinking) return;
    thinking = true;

    try {
        const reason = force ? null : whyNot();

        if (reason) {
            console.log(`[initiative] skipped: ${reason}`);
            return;
        }

        const presence = await findPresentDevice();

        if (!presence && !force) {
            console.log("[initiative] skipped: nobody seems to be around");
            return;
        }

        console.log(
            presence
                ? `[initiative] thinking (you are on the ${presence.client.device}, active ${presence.idleSeconds}s ago)…`
                : "[initiative] thinking (forced, no device detected)…"
        );

        const decision = await decide(await buildContext(presence, force), { forced: force });

        if (!decision.speak || !decision.message) {
            console.log(`[initiative] staying quiet: ${decision.reason || "nothing worth saying"}`);
            return;
        }

        // Things may have changed while thinking (you started talking, for example)
        if (!force && (busyRequests > 0 || Date.now() - lastUserMessageAt < USER_QUIET_SECONDS * 1000)) {
            console.log("[initiative] dropped: you started talking to him while he was thinking");
            return;
        }

        // Never repeat himself
        const repeated = settings.recent.some(item => tooSimilar(item.text, decision.message));

        if (repeated) {
            console.log("[initiative] dropped: he already said that");
            return;
        }

        const sent = deliver(decision.message.slice(0, 400), presence);

        // Remember in the day's story that he spoke up, and which ideas he shared
        if (sent) {
            logEvent("spoke up on his own", decision.message);

            if (decision.ideasShared?.length) {
                await markIdeasShared(decision.ideasShared).catch(error =>
                    console.warn("[initiative] could not update the ideas:", error.message)
                );
            }
        }

        // He has told you about these notes: they are crossed off (or repeated later, if they are urgent)
        if (sent && decision.notesAddressed?.length) {
            await markTold(decision.notesAddressed).catch(error =>
                console.warn("[initiative] could not update the notebook:", error.message)
            );
        }

        console.log(
            sent
                ? `[initiative] spoke up: "${decision.message}"`
                : "[initiative] nothing could be delivered (no connected page)"
        );
    } catch (error) {
        console.warn("[initiative] check failed:", error.message);
    } finally {
        thinking = false;
    }
}

// ======================================================================
// Scheduling
// ======================================================================
function scheduleNext(delayMilliseconds) {
    clearTimeout(timer);

    if (!started) return;

    // The wait varies by 20 percent either way, so it does not feel like a clock
    // The user's own rhythm (if they set one) wins over the mode's default
    const base = (settings.checkEveryMinutes ?? MODES[settings.mode]?.checkEveryMinutes ?? 30) * 60_000;
    const delay = delayMilliseconds ?? base * (0.8 + Math.random() * 0.4);

    timer = setTimeout(async () => {
        await heartbeat();
        scheduleNext();
    }, delay);

    // A waiting timer must not keep Jason's process alive when he is shutting down
    timer.unref?.();
}

export async function startInitiative() {
    if (process.env.INITIATIVE === "off") {
        console.log("[initiative] disabled (INITIATIVE=off in .env)");
        return;
    }

    await loadSettings();
    started = true;
    scheduleNext(INITIAL_DELAY_MINUTES * 60_000);

    // He also thinks of ideas of his own from time to time (see ideas.js), using everything he can see here
    startIdeas({
        getContext: () => buildContext(null, false),
        canRun: () => settings.mode !== "off" && !isQuietHour(manilaNow().hour)
    });

    console.log(
        `[initiative] ready. Mode: ${settings.mode}. First check in about ${INITIAL_DELAY_MINUTES} minutes. ` +
        `Quiet hours: ${QUIET_START_HOUR}:00 to ${QUIET_END_HOUR}:00 Manila time.`
    );
}

export function stopInitiative() {
    started = false;
    clearTimeout(timer);
}

// ======================================================================
// Controls (used by the initiative_settings tool)
// ======================================================================
export function getInitiativeStatus() {
    resetDayIfNeeded();

    if (settings.mode === "off") return "I am not speaking up on my own at the moment, Sir.";

    const rules = MODES[settings.mode];
    const lines = [
        `I speak up ${rules.description} (mode ${settings.mode}): at most ${rules.maxPerDay} times a day, ` +
        `and not more than once every ${rules.minGapMinutes} minutes.`
    ];

    // Mention the custom rhythm only if one was set
    if (settings.checkEveryMinutes) {
        lines.push(`I think about speaking up roughly every ${settings.checkEveryMinutes} minutes.`);
    }

    if (settings.quietUntil && Date.now() < settings.quietUntil) {
        lines.push(`I am staying quiet for another ${Math.ceil((settings.quietUntil - Date.now()) / 60_000)} minutes.`);
    }

    lines.push(
        settings.sentToday > 0
            ? `I have spoken up ${settings.sentToday} time${settings.sentToday === 1 ? "" : "s"} today, the last one ${ago(Date.now() - settings.lastSpokeAt)}.`
            : "I have not spoken up yet today."
    );

    lines.push(
        settings.autonomousScreenVision
            ? "I am allowed to inspect the actual screen when deciding whether to speak."
            : "I only use window titles for initiative and will not capture screenshots on my own."
    );
    
    return lines.join(" ");
}

// mode: off | rare | normal | chatty.  quietMinutes: stay quiet this long (0 ends quiet time).
// thinkNow: check right away whether there is something to say (for testing).
export function setInitiativeSettings({ mode, quietMinutes, thinkNow, checkEveryMinutes, screenVision } = {}) {
    const notes = [];

    if (mode) {
        // Changing the mode returns to that mode's own rhythm (a custom one can be set again below)
        settings.checkEveryMinutes = null;

        if (mode !== "off" && !MODES[mode]) {
            throw new Error('mode must be "off", "rare", "normal", or "chatty".');
        }

        settings.mode = mode;
        notes.push(
            mode === "off"
                ? "I will not speak up on my own any more"
                : `I will speak up ${MODES[mode].description}`
        );

        scheduleNext();   // the new mode may check more or less often
    }

    // How often he thinks about speaking up. 0 goes back to the mode's own rhythm.
    if (checkEveryMinutes !== undefined && checkEveryMinutes !== null) {
        const minutes = Number(checkEveryMinutes);

        if (!Number.isFinite(minutes) || minutes < 0) {
            throw new Error("checkEveryMinutes must be a number of minutes, 0 or more.");
        }

        if (minutes === 0) {
            settings.checkEveryMinutes = null;
            notes.push("I will go back to my usual rhythm");
        } else {
            // Safety limits: never more often than every 2 minutes, never rarer than once a day
            settings.checkEveryMinutes = Math.min(Math.max(minutes, 2), 1440);
            notes.push(`I will think about speaking up about every ${settings.checkEveryMinutes} minutes`);
        }

        scheduleNext();   // apply the new rhythm now
    }

    if (quietMinutes !== undefined && quietMinutes !== null) {
        const minutes = Number(quietMinutes);

        if (!Number.isFinite(minutes) || minutes < 0) {
            throw new Error("quietMinutes must be a number of minutes, 0 or more.");
        }

        if (minutes > 0) {
            settings.quietUntil = Date.now() + minutes * 60_000;
            notes.push(`I will stay quiet for ${minutes} minute${minutes === 1 ? "" : "s"}`);
        } else {
            settings.quietUntil = null;
            notes.push("I am free to speak up again");
        }
    }

    if (screenVision !== undefined) {
        if (typeof screenVision !== "boolean") {
            throw new Error("screenVision must be true or false.");
        }

        settings.autonomousScreenVision = screenVision;

        notes.push(
            screenVision
                ? "I may look at the actual screen when deciding whether something is worth mentioning"
                : "I will not capture screenshots on my own"
        );
    }

    if (thinkNow) {
        // Runs in the background: the message, if there is one, arrives a few seconds later
        heartbeat({ force: true });
        notes.push("Give me a moment to think of something");
    }

    saveSettings();

    return {
        ok: true,
        execution: { type: "initiative_settings", platform: "windows" },
        message: notes.length ? `Very well, Sir. ${notes.join(". ")}.` : getInitiativeStatus()
    };
}