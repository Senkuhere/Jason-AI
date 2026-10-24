// time-awareness.js: helps Jason reason about TIME. Models are poor at comparing "classes 1pm-4pm" with
// "it is now 5:49 PM". This file does that comparison in code and writes the result next to the fact,
// so he cannot miss it. It works on any remembered fact that contains a time range or a weekday, not on one topic.

const TIME_ZONE = "Asia/Manila";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// ---------- The current moment in Manila ----------
export function manilaClock(now = Date.now()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date(now));

    const get = type => parts.find(part => part.type === type)?.value;

    return {
        weekday: WEEKDAYS.indexOf(String(get("weekday")).toLowerCase()),   // 0 = Sunday
        minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute"))    // minutes since midnight
    };
}

export function formatClock(minutes) {
    const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hour = Math.floor(total / 60);
    return `${hour % 12 || 12}:${String(total % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function partOfDay(minutes) {
    const hour = Math.floor(minutes / 60);
    if (hour < 5) return "night";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 21) return "evening";
    return "night";
}

// "Saturday, 24 October 2026, 5:49 PM (evening)"
export function describeNow(now = Date.now()) {
    const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(new Date(now));

    const { minutes } = manilaClock(now);
    return `${date}, ${formatClock(minutes)} (${partOfDay(minutes)})`;
}

// 109 -> "1 hour 49 minutes"
export function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    if (total < 1) return "less than a minute";

    const hours = Math.floor(total / 60);
    const rest = total % 60;
    const parts = [];

    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (rest) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);

    return parts.join(" ");
}

// "just now", "12 min ago", "3 h ago", "2 days ago" (for timestamps on conversation messages)
export function timeAgoShort(timestamp, now = Date.now()) {
    const milliseconds = new Date(timestamp).getTime();
    if (!Number.isFinite(milliseconds)) return "earlier";

    const minutes = Math.round((now - milliseconds) / 60_000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;

    return `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) === 1 ? "" : "s"} ago`;
}

// ---------- Reading times and days out of a sentence ----------
const MERIDIEM = "a\\.?m\\.?|p\\.?m\\.?";
const RANGE = new RegExp(
    `(\\d{1,2})(?::(\\d{2}))?\\s*(${MERIDIEM})?\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(${MERIDIEM})?`,
    "gi"
);

const isPm = text => /^p/i.test(text);

function toMinutes(hour, minute, meridiem) {
    if (hour > 24 || minute > 59) return null;
    if (!meridiem) return hour * 60 + minute;
    if (hour < 1 || hour > 12) return null;
    return (hour % 12 + (isPm(meridiem) ? 12 : 0)) * 60 + minute;
}

// Finds time ranges such as "1pm-4pm", "1 to 4 pm", "13:00-16:00". Plain numbers like "1-4" are ignored.
function findRanges(text) {
    const ranges = [];

    for (const match of text.matchAll(RANGE)) {
        const [whole, h1, m1, mer1, h2, m2, mer2] = match;

        // Needs an am/pm somewhere, or a clock format (10:30) on both sides, to be sure it is a time
        if (!mer1 && !mer2 && !(m1 && m2)) continue;

        const startHour = Number(h1);
        const endHour = Number(h2);

        let start = toMinutes(startHour, Number(m1 || 0), mer1 || mer2);
        let end = toMinutes(endHour, Number(m2 || 0), mer2 || mer1);

        if (start === null || end === null) continue;

        // "11-1pm": the start cannot be after the end when only the end said am/pm, so the start is the other half of the day
        if (!mer1 && mer2 && start > end) start -= 720;
        // "10am-1": the end follows the same logic
        if (mer1 && !mer2 && end < start) end += 720;

        ranges.push({ text: whole.trim(), start: (start + 1440) % 1440, end: end % 1440 });
    }

    return ranges.slice(0, 2);
}

// Which weekdays a sentence talks about (and whether it says "every day")
function findDays(text) {
    const lower = text.toLowerCase();
    const days = new Set();

    WEEKDAYS.forEach((name, index) => {
        if (new RegExp(`\\b${name}s?\\b`).test(lower)) days.add(index);
    });

    // Common short forms (only the unambiguous ones)
    [["mon", 1], ["tue", 2], ["tues", 2], ["wed", 3], ["thu", 4], ["thur", 4], ["thurs", 4], ["fri", 5]].forEach(([short, index]) => {
        if (new RegExp(`\\b${short}\\b`).test(lower)) days.add(index);
    });

    if (/\bweekdays?\b/.test(lower)) [1, 2, 3, 4, 5].forEach(day => days.add(day));
    if (/\bweekends?\b/.test(lower)) [0, 6].forEach(day => days.add(day));

    return { days: [...days].sort(), daily: /\b(every ?day|daily|each day)\b/.test(lower) };
}

const dayName = index => WEEKDAYS[index][0].toUpperCase() + WEEKDAYS[index].slice(1);

function inDays(from, to) {
    const distance = (to - from + 7) % 7;
    if (distance === 0) return "today";
    if (distance === 1) return "tomorrow";
    return `in ${distance} days`;
}

// Adds a short "time check" to a remembered fact when it mentions a time range or a weekday.
// Facts with neither are returned unchanged.
export function annotateTimeFacts(text, now = Date.now()) {
    const content = String(text ?? "");
    const clock = manilaClock(now);
    const { days, daily } = findDays(content);
    const hints = [];

    // Does a schedule in this fact apply today? (No weekday mentioned means every day.)
    const appliesToday = daily || days.length === 0 || days.includes(clock.weekday);

    for (const range of findRanges(content)) {
        const label = `${formatClock(range.start)} to ${formatClock(range.end)}`;

        if (!appliesToday) {
            hints.push(`the ${label} schedule is on ${days.map(dayName).join(", ")}, not today (today is ${dayName(clock.weekday)})`);
            continue;
        }

        const crossesMidnight = range.start > range.end;
        const happeningNow = crossesMidnight
            ? clock.minutes >= range.start || clock.minutes < range.end
            : clock.minutes >= range.start && clock.minutes < range.end;

        if (happeningNow) {
            const left = (range.end - clock.minutes + 1440) % 1440;
            hints.push(`${label} is happening right now (ends in ${formatDuration(left)})`);
        } else if (clock.minutes < range.start) {
            hints.push(`${label} has not started yet today (starts in ${formatDuration(range.start - clock.minutes)})`);
        } else {
            hints.push(`${label} has already ended today (it ended ${formatDuration(clock.minutes - range.end)} ago)`);
        }
    }

    // Days mentioned without a time range: how far away they are
    if (days.length > 0 && days.length <= 3 && hints.length === 0) {
        hints.push(days.map(day => `${dayName(day)} is ${inDays(clock.weekday, day)}`).join(", "));
    }

    if (hints.length === 0) return content;

    return `${content} [time check, now ${formatClock(clock.minutes)} ${dayName(clock.weekday)}: ${hints.join("; ")}]`;
}
