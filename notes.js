// notes.js: Jason's notebook. Reminders ("remind me in an hour") and short-lived notes he wants to keep
// track of ("tell the user about X when they are back"). Saved in memory/notes.json so nothing is lost on a restart.
//
// A note moves through these states:
//   pending  -> waiting to be told (or waiting for its time)
//   done     -> told, or finished, or marked done; deleted automatically a day later
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIRECTORY = path.join(__dirname, "memory");
const NOTES_FILE = path.join(MEMORY_DIRECTORY, "notes.json");

const KEEP_DONE_MS = 24 * 60 * 60 * 1000;   // finished notes are removed after a day
const MAX_NOTES = 200;                      // safety limit: the notebook can never grow without end
const MAX_TEXT = 300;                       // one note is one short thought
const RETELL_MINUTES = 30;                  // an urgent note is repeated this often until it is dealt with
const MAX_TELLS_URGENT = 3;                 // ...but never more than this many times

let notes = [];
let loaded = false;
let saveChain = Promise.resolve();          // saves wait for each other, so two saves never collide

// ---------- Loading and saving ----------
export async function loadNotes() {
    if (loaded) return;
    loaded = true;

    try {
        const data = JSON.parse(await fs.readFile(NOTES_FILE, "utf8"));
        notes = Array.isArray(data.notes) ? data.notes.filter(note => note && note.id && note.text) : [];
    } catch (error) {
        notes = [];

        if (error.code !== "ENOENT") {
            // A damaged file is kept aside instead of being overwritten, so nothing is silently lost
            console.error("[notes] Could not read notes.json, starting empty:", error.message);
            await fs.rename(NOTES_FILE, `${NOTES_FILE}.damaged-${Date.now()}`).catch(() => {});
        }
    }
}

function save() {
    saveChain = saveChain.then(async () => {
        try {
            await fs.mkdir(MEMORY_DIRECTORY, { recursive: true });

            // Written to a temporary file first, then swapped in: a crash mid-write cannot damage the real file
            const temporary = `${NOTES_FILE}.tmp`;
            await fs.writeFile(temporary, JSON.stringify({ notes }, null, 2), "utf8");

            try {
                await fs.rename(temporary, NOTES_FILE);
            } catch {
                // Windows sometimes refuses the swap for a moment (antivirus, indexer): write directly instead
                await fs.writeFile(NOTES_FILE, JSON.stringify({ notes }, null, 2), "utf8");
            }
        } catch (error) {
            console.error("[notes] Could not save notes:", error.message);
        }
    });

    return saveChain;
}

// ---------- Time ----------
// "2026-10-25T09:30" is read as Manila time (UTC+8, no daylight saving). Anything with its own zone is respected.
function parseManilaTime(text) {
    const value = String(text).trim();

    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
    const looksLocal = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(value);

    const milliseconds = Date.parse(looksLocal && !hasZone ? `${value.replace(" ", "T")}+08:00` : value);

    return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function formatManila(milliseconds) {
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"
    }).format(new Date(milliseconds));
}

// Works out when a reminder is due from "in N minutes" or an exact time. Returns milliseconds, or null for "no time".
export function resolveDueTime({ remindInMinutes, remindAt } = {}, now = Date.now()) {
    if (remindInMinutes !== undefined && remindInMinutes !== null && remindInMinutes !== "") {
        const minutes = Number(remindInMinutes);

        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 525_600) {
            throw new Error("remindInMinutes must be a number of minutes between 0 and one year.");
        }

        return now + Math.round(minutes * 60_000);
    }

    if (typeof remindAt === "string" && remindAt.trim()) {
        const due = parseManilaTime(remindAt);

        if (due === null) throw new Error(`"${remindAt}" is not a date and time I can read. Use YYYY-MM-DDTHH:mm.`);
        if (due < now - 60_000) throw new Error("That time has already passed.");

        return due;
    }

    return null;
}

// ---------- Making and changing notes ----------
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function cleanUp(now = Date.now()) {
    // Finished notes disappear after a day
    notes = notes.filter(note => !(note.status === "done" && now - (note.doneAt || 0) > KEEP_DONE_MS));

    // If the notebook is somehow full, the oldest finished notes go first, then the oldest of all
    if (notes.length > MAX_NOTES) {
        notes.sort((a, b) => (a.status === "done") - (b.status === "done") || a.createdAt - b.createdAt);
        notes = notes.slice(notes.length - MAX_NOTES);
    }
}

export async function addNote({ text, urgency = "normal", dueAt = null, source = "user" } = {}) {
    await loadNotes();

    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (clean.length < 2) throw new Error("A note needs some text.");

    // The same unfinished note twice is pointless
    const duplicate = notes.find(note =>
        note.status === "pending" && note.text.toLowerCase() === clean.toLowerCase() && note.dueAt === dueAt
    );
    if (duplicate) return { note: duplicate, duplicate: true };

    const note = {
        id: newId(),
        text: clean,
        kind: dueAt ? "reminder" : "note",
        urgency: ["low", "normal", "high"].includes(urgency) ? urgency : "normal",
        source: source === "jason" ? "jason" : "user",
        createdAt: Date.now(),
        dueAt: dueAt || null,
        status: "pending",
        tellCount: 0,
        toldAt: null,
        doneAt: null
    };

    notes.push(note);
    cleanUp();
    await save();

    return { note, duplicate: false };
}

// Finds a note by its id, or by words from its text
function findNote(idOrText, { includeDone = false } = {}) {
    const query = String(idOrText || "").trim().toLowerCase();
    if (!query) return null;

    const pool = notes.filter(note => includeDone || note.status !== "done");

    return pool.find(note => note.id === query)
        || pool.find(note => note.text.toLowerCase() === query)
        || pool.find(note => note.text.toLowerCase().includes(query))
        || null;
}

export async function completeNote(idOrText) {
    await loadNotes();

    const note = findNote(idOrText);
    if (!note) return null;

    note.status = "done";
    note.doneAt = Date.now();
    await save();

    return note;
}

export async function deleteNote(idOrText) {
    await loadNotes();

    const note = findNote(idOrText, { includeDone: true });
    if (!note) return null;

    notes = notes.filter(item => item !== note);
    await save();

    return note;
}

// Jason has told the user about these notes. Urgent ones come back a few times until they are dealt with.
export async function markTold(ids = []) {
    await loadNotes();

    const now = Date.now();

    for (const id of [].concat(ids)) {
        const note = notes.find(item => item.id === id && item.status === "pending");
        if (!note) continue;

        note.tellCount += 1;
        note.toldAt = now;

        if (note.urgency === "high" && note.tellCount < MAX_TELLS_URGENT) {
            note.dueAt = now + RETELL_MINUTES * 60_000;   // ask again later
            note.kind = "reminder";
        } else {
            note.status = "done";
            note.doneAt = now;
        }
    }

    cleanUp(now);
    await save();
}

// ---------- Reading ----------
export async function listNotes({ includeDone = false } = {}) {
    await loadNotes();
    cleanUp();

    return notes
        .filter(note => includeDone || note.status !== "done")
        .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt)
        .map(note => ({
            id: note.id,
            text: note.text,
            kind: note.kind,
            urgency: note.urgency,
            source: note.source,
            status: note.status,
            due: note.dueAt ? formatManila(note.dueAt) : null,
            overdue: Boolean(note.dueAt && note.status === "pending" && note.dueAt < Date.now()),
            tellCount: note.tellCount
        }));
}

// Reminders whose time has come
export async function dueNotes(now = Date.now()) {
    await loadNotes();

    return notes
        .filter(note => note.status === "pending" && note.dueAt && note.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt);
}

// Notes waiting for the right moment (no time of their own, or a time still in the future)
export async function waitingNotes(now = Date.now()) {
    await loadNotes();

    return notes.filter(note => note.status === "pending" && !(note.dueAt && note.dueAt <= now));
}

export async function noteCount() {
    await loadNotes();
    return notes.filter(note => note.status === "pending").length;
}
