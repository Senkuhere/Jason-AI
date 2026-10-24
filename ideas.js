// ideas.js: Jason's own ideas. From time to time, using everything he knows about the user, he thinks of an idea
// and writes it in memory/ideas.json. The next time the moment is right, he can bring one up and talk it over.
// Settings in .env: IDEAS=off turns it off, IDEAS_EVERY_MINUTES changes how often he thinks (default 75).
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

import { buildJasonSystemPrompt } from "./personality.js";
import { listClients } from "./push-channel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIRECTORY = path.join(__dirname, "memory");
const IDEAS_FILE = path.join(MEMORY_DIRECTORY, "ideas.json");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_INITIATIVE_MODEL || "gemini-3.1-flash-lite";

const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const IDEA_EVERY_MINUTES = envNumber("IDEAS_EVERY_MINUTES", 75);
const MAX_UNSHARED = 6;          // he stops thinking of new ones while this many are waiting
const MAX_IDEAS = 40;            // the file can never grow without end
const KEEP_SHARED_DAYS = 7;      // ideas he already shared are kept this long, then forgotten
const GENERATE_TIMEOUT_MS = 30_000;

let ideas = [];
let loaded = false;
let saveChain = Promise.resolve();
let timer = null;
let started = false;
let generating = false;

// ---------- Loading and saving ----------
async function load() {
    if (loaded) return;
    loaded = true;

    try {
        const data = JSON.parse(await fs.readFile(IDEAS_FILE, "utf8"));
        ideas = Array.isArray(data.ideas) ? data.ideas.filter(idea => idea && idea.id && idea.text) : [];
    } catch (error) {
        ideas = [];

        if (error.code !== "ENOENT") {
            console.error("[ideas] Could not read ideas.json, starting empty:", error.message);
            await fs.rename(IDEAS_FILE, `${IDEAS_FILE}.damaged-${Date.now()}`).catch(() => {});
        }
    }
}

function save() {
    saveChain = saveChain.then(async () => {
        try {
            await fs.mkdir(MEMORY_DIRECTORY, { recursive: true });

            const text = JSON.stringify({ ideas }, null, 2);
            const temporary = `${IDEAS_FILE}.tmp`;

            await fs.writeFile(temporary, text, "utf8");

            try {
                await fs.rename(temporary, IDEAS_FILE);
            } catch {
                await fs.writeFile(IDEAS_FILE, text, "utf8");
            }
        } catch (error) {
            console.error("[ideas] Could not save ideas:", error.message);
        }
    });

    return saveChain;
}

function cleanUp(now = Date.now()) {
    ideas = ideas.filter(idea =>
        idea.status !== "shared" || now - (idea.sharedAt || 0) < KEEP_SHARED_DAYS * 86_400_000
    );

    if (ideas.length > MAX_IDEAS) {
        ideas.sort((a, b) => (a.status === "new") - (b.status === "new") || a.createdAt - b.createdAt);
        ideas = ideas.slice(ideas.length - MAX_IDEAS);
    }
}

// ---------- Is it the same idea again? ----------
function wordSet(text) {
    return new Set(
        String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(word => word.length > 3)
    );
}

function similar(first, second) {
    const a = wordSet(first);
    const b = wordSet(second);
    if (a.size === 0 || b.size === 0) return false;

    let shared = 0;
    for (const word of a) if (b.has(word)) shared++;

    return shared / (a.size + b.size - shared) >= 0.5;
}

// ---------- Reading and changing ideas ----------
export async function addIdea({ text, topic = "", why = "" }) {
    await load();

    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (clean.length < 15) throw new Error("An idea needs a little more than that.");

    if (ideas.some(idea => similar(idea.text, clean))) return { idea: null, duplicate: true };

    const idea = {
        id: `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        text: clean,
        topic: String(topic || "").slice(0, 40),
        why: String(why || "").slice(0, 160),
        status: "new",
        createdAt: Date.now(),
        sharedAt: null
    };

    ideas.push(idea);
    cleanUp();
    await save();

    return { idea, duplicate: false };
}

// Ideas he has thought of but not yet told the user
export async function unsharedIdeas() {
    await load();
    return ideas.filter(idea => idea.status === "new");
}

export async function recentSharedIdeas(days = 2) {
    await load();
    const since = Date.now() - days * 86_400_000;
    return ideas.filter(idea => idea.status === "shared" && (idea.sharedAt || 0) > since).slice(-3);
}

export async function markIdeasShared(ids = []) {
    await load();

    let changed = false;

    for (const id of [].concat(ids)) {
        const idea = ideas.find(item => item.id === id && item.status === "new");
        if (!idea) continue;

        idea.status = "shared";
        idea.sharedAt = Date.now();
        changed = true;
    }

    if (changed) await save();
}

export async function dropIdea(idOrText) {
    await load();

    const query = String(idOrText || "").trim().toLowerCase();
    const idea = ideas.find(item => item.id === query || item.text.toLowerCase().includes(query));
    if (!idea) return null;

    ideas = ideas.filter(item => item !== idea);
    await save();

    return idea;
}

// What he is shown when deciding whether to bring an idea up
export async function ideasText() {
    const waiting = await unsharedIdeas();

    if (waiting.length === 0) return "- (no new ideas waiting)";

    return waiting.slice(0, 6).map(idea =>
        `- [${idea.id}]${idea.topic ? ` (${idea.topic})` : ""} ${idea.text}${idea.why ? ` — why it fits: ${idea.why}` : ""}`
    ).join("\n");
}

// ---------- Thinking of a new idea ----------
const IDEA_TASK = `
RIGHT NOW YOU ARE NOT ANSWERING A MESSAGE. You are thinking, quietly, of an idea of your own to share with the
user later, the way a thoughtful assistant who knows them well sometimes says "I had a thought...".

Base it on everything you know: their studies, projects, habits, what they did today, what is coming up, and what
they have talked about. Make it specific to THIS person, never generic advice. It can be, for example: a way to
improve something they are building (including yourself, Jason), a study or planning idea tied to something
coming up, something interesting to try or learn, a question worth exploring together, or a small experiment to
make their day better. Use your own judgment about what would really be useful or interesting to them.

Rules:
- One idea only, written the way you would first say it to them: one or two natural sentences, in your own voice.
- Never repeat or rephrase an idea listed under "Ideas you already have".
- If nothing genuinely good comes to mind, return an empty idea. That is fine.

Reply with JSON only: {"idea": "...", "topic": "two to four words", "why": "very short reason it fits them"}
`;

function parseIdea(text) {
    const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
        const data = JSON.parse(raw.slice(start, end + 1));
        return typeof data.idea === "string" ? data : null;
    } catch {
        return null;
    }
}

// One attempt at a new idea. getContext() gives him everything he knows right now (see initiative.js).
export async function thinkOfIdea(getContext) {
    await load();

    if (generating) return null;
    generating = true;

    try {
        const existing = ideas.length
            ? ideas.map(idea => `- ${idea.text}`).join("\n")
            : "- (none yet)";

        const context = `${await getContext()}\n\nIdeas you already have (do not repeat them):\n${existing}`;

        const response = await Promise.race([
            ai.models.generateContent({
                model: MODEL,
                contents: context,
                config: {
                    systemInstruction: `${buildJasonSystemPrompt()}\n\n${IDEA_TASK}`,
                    thinkingConfig: { thinkingLevel: process.env.GEMINI_IDEAS_THINKING || "LOW" }
                }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), GENERATE_TIMEOUT_MS))
        ]);

        const data = parseIdea(response.text);
        if (!data || !data.idea.trim()) return null;

        const { idea } = await addIdea({ text: data.idea, topic: data.topic, why: data.why });
        return idea;
    } finally {
        generating = false;
    }
}

// ---------- The schedule ----------
// getContext: gives him everything he knows. canRun: returns true if now is a fine time (not quiet hours, not off).
function scheduleNext(options, delay) {
    clearTimeout(timer);
    if (!started) return;

    // About every IDEA_EVERY_MINUTES, but never exactly: a random time between 65% and 135% of it
    const wait = delay ?? IDEA_EVERY_MINUTES * 60_000 * (0.65 + Math.random() * 0.7);

    timer = setTimeout(async () => {
        try {
            await load();
            const waiting = ideas.filter(idea => idea.status === "new").length;

            // Only when someone has a page open (nobody to tell otherwise), he is allowed to, and the list is not full
            if (listClients().length > 0 && options.canRun() && waiting < MAX_UNSHARED) {
                const idea = await thinkOfIdea(options.getContext);
                if (idea) console.log(`[ideas] new idea: "${idea.text}"`);
            }
        } catch (error) {
            console.warn("[ideas] could not think of an idea (will try later):", error.message);
        }

        scheduleNext(options);
    }, wait);

    timer.unref?.();
}

export function startIdeas({ getContext, canRun = () => true }) {
    if (started || process.env.IDEAS === "off") return;

    started = true;
    // The first idea comes 10 to 20 minutes after start, once he has seen a little of the day
    scheduleNext({ getContext, canRun }, (10 + Math.random() * 10) * 60_000);

    console.log(`[ideas] ready. He thinks of an idea about every ${IDEA_EVERY_MINUTES} minutes.`);
}

export function stopIdeas() {
    started = false;
    clearTimeout(timer);
}
