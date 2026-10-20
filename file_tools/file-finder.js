import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "./file-tool.js";

const executeFile = promisify(execFile);

// ---------- Limits ----------
const FOLDER_LABELS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"];
const MAX_DEPTH = 8;            // how many folders deep to look
const MAX_SCAN_MS = 5_000;      // stop searching after this long
const MAX_CANDIDATES = 400;     // stop collecting after this many matches
const DEFAULT_RESULTS = 15;
const MAX_RESULTS = 30;

const SKIP_FOLDERS = new Set([
    "node_modules", "$recycle.bin", "system volume information",
    "__pycache__", "site-packages"
]);

// Names Jason should never even list
const SENSITIVE_NAME = /^\.env|\.(pem|key|kdbx|ppk)$|^id_(rsa|ed25519)/i;

// ---------- Where Jason may look ----------
// Asks Windows for the real folder locations (this handles OneDrive and moved folders).
// Add extra folders in .env with JASON_SEARCH_ROOTS=D:\Games;E:\Work
async function discoverRoots() {
    const found = [];

    try {
        const script =
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
            "'Desktop=' + [Environment]::GetFolderPath('Desktop'); " +
            "'Documents=' + [Environment]::GetFolderPath('MyDocuments'); " +
            "'Downloads=' + (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; " +
            "'Pictures=' + [Environment]::GetFolderPath('MyPictures'); " +
            "'Music=' + [Environment]::GetFolderPath('MyMusic'); " +
            "'Videos=' + [Environment]::GetFolderPath('MyVideos')";

        const { stdout } = await executeFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", script],
            { windowsHide: true, timeout: 10_000, encoding: "utf8" }
        );

        for (const line of stdout.split(/\r?\n/)) {
            const separator = line.indexOf("=");
            if (separator === -1) continue;

            const label = line.slice(0, separator).trim();
            const dir = line.slice(separator + 1).trim();

            if (FOLDER_LABELS.includes(label) && dir) {
                found.push({ label, dir });
            }
        }
    } catch {
        // fall back to the usual locations below
    }

    if (found.length === 0) {
        for (const label of FOLDER_LABELS) {
            found.push({ label, dir: path.join(os.homedir(), label) });
        }
    }

    for (const extra of (process.env.JASON_SEARCH_ROOTS || "").split(";")) {
        const dir = extra.trim();
        if (dir) found.push({ label: path.basename(dir) || dir, dir });
    }

    // keep only folders that really exist
    const existing = [];

    for (const root of found) {
        try {
            if ((await fs.stat(root.dir)).isDirectory()) existing.push(root);
        } catch {
            // missing folder, skip it
        }
    }

    return existing;
}

let rootsPromise = null;

function getSearchRoots() {
    rootsPromise ??= discoverRoots();
    return rootsPromise;
}

function isInside(root, target) {
    const relative = path.relative(root, target);

    return (
        relative === "" ||
        (relative !== ".." &&
            !relative.startsWith(".." + path.sep) &&
            !path.isAbsolute(relative))
    );
}

// ---------- find_files ----------
export async function findFiles({ query, type = "any", extension, folder } = {}) {
    const words = String(query || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    const ext = extension
        ? "." + String(extension).replace(/^\./, "").toLowerCase()
        : null;

    if (words.length === 0 && !ext) {
        throw new Error("Give a name to search for, or a file extension.");
    }

    const wantType = ["file", "folder", "any"].includes(type) ? type : "any";

    let roots = await getSearchRoots();

    if (folder) {
        const wanted = String(folder).trim().toLowerCase();
        roots = roots.filter(root => root.label.toLowerCase() === wanted);

        if (roots.length === 0) {
            const available = (await getSearchRoots()).map(root => root.label).join(", ");
            throw new Error(`"${folder}" is not a searchable folder. Searchable folders: ${available}.`);
        }
    }

    const deadline = Date.now() + MAX_SCAN_MS;
    const matches = [];
    let timedOut = false;

    for (const root of roots) {
        // Breadth-first, so files near the top of a folder are found before deep ones
        const queue = [{ dir: root.dir, depth: 0 }];

        for (let index = 0; index < queue.length; index++) {
            if (Date.now() > deadline) {
                timedOut = true;
                break;
            }

            if (matches.length >= MAX_CANDIDATES) break;

            const { dir, depth } = queue[index];

            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                continue; // no permission or the folder vanished
            }

            for (const entry of entries) {
                const name = entry.name;
                const lower = name.toLowerCase();

                if (name.startsWith(".")) continue;
                if (SENSITIVE_NAME.test(name)) continue;

                const isFolder = entry.isDirectory();
                const isFile = entry.isFile();

                // shortcuts and junctions are neither, so they are skipped
                if (!isFolder && !isFile) continue;
                if (isFolder && SKIP_FOLDERS.has(lower)) continue;

                const typeOk =
                    wantType === "any" ||
                    (wantType === "file" ? isFile : isFolder);

                const extOk = !ext || (isFile && path.extname(lower) === ext);

                if (typeOk && extOk && words.every(word => lower.includes(word))) {
                    matches.push({
                        full: path.join(dir, name),
                        name,
                        isFolder
                    });
                }

                if (isFolder && depth < MAX_DEPTH) {
                    queue.push({ dir: path.join(dir, name), depth: depth + 1 });
                }
            }
        }

        if (timedOut || matches.length >= MAX_CANDIDATES) break;
    }

    const detailed = await Promise.all(
        matches.map(async match => {
            try {
                const info = await fs.stat(match.full);
                return { ...match, size: info.size, modified: info.mtime };
            } catch {
                return { ...match, size: 0, modified: new Date(0) };
            }
        })
    );

    // Best name match first, then newest
    const needle = words.join(" ");

    const score = match => {
        if (!needle) return 1;
        const base = path.parse(match.name).name.toLowerCase();
        if (base === needle) return 3;
        if (base.startsWith(needle)) return 2;
        return 1;
    };

    detailed.sort(
        (first, second) =>
            score(second) - score(first) ||
            second.modified - first.modified
    );

    const top = detailed.slice(0, DEFAULT_RESULTS);
    const searched = [...new Set(roots.map(root => root.label))];

    if (top.length === 0) {
        return {
            ok: true,
            results: [],
            searchedFolders: searched,
            message: timedOut
                ? "Nothing found before the search time limit."
                : "No matching files or folders were found."
        };
    }

    return {
        ok: true,
        searchedFolders: searched,
        totalMatches: detailed.length,
        showing: top.length,
        ...(timedOut || detailed.length >= MAX_CANDIDATES
            ? { note: "The search stopped early, so there may be more matches." }
            : {}),
        results: top.map(match => ({
            path: match.full,
            type: match.isFolder ? "folder" : "file",
            ...(match.isFolder ? {} : { sizeKB: Math.max(1, Math.round(match.size / 1024)) }),
            modified: match.modified.toISOString().slice(0, 10)
        }))
    };
}

// ---------- open_folder ----------
// Opens a folder in File Explorer. Given a file, shows it highlighted in its folder.
// Also accepts a folder name such as "Downloads".
export async function openFolder({ folderPath } = {}) {
    if (typeof folderPath !== "string" || !folderPath.trim()) {
        throw new Error("A folder or file path is required.");
    }

    const roots = await getSearchRoots();
    const input = folderPath.trim();

    // "Downloads", "Desktop" and so on
    const byName = roots.find(root => root.label.toLowerCase() === input.toLowerCase());
    const requested = byName ? byName.dir : path.resolve(PROJECT_ROOT, input);

    let target;
    try {
        target = await fs.realpath(requested);
    } catch {
        throw new Error(`Not found: ${requested}`);
    }

    // Only the search folders and the project folder are allowed
    let allowed = false;

    for (const root of [PROJECT_ROOT, ...roots.map(item => item.dir)]) {
        try {
            if (isInside(await fs.realpath(root), target)) {
                allowed = true;
                break;
            }
        } catch {
            // that root does not exist, skip it
        }
    }

    if (!allowed) {
        throw new Error(
            "Access denied: that location is outside the project and the Desktop, " +
            "Documents, Downloads, Pictures, Music, and Videos folders."
        );
    }

    const info = await fs.stat(target);

    // explorer.exe reports exit code 1 even when it works, so do not wait on it
    const args = info.isDirectory() ? [target] : ["/select,", target];
    const child = spawn("explorer.exe", args, {
        detached: true,
        stdio: "ignore"
    });

    child.on("error", () => {});
    child.unref();

    return {
        ok: true,
        execution: { type: "open_folder", platform: "windows", path: target },
        message: info.isDirectory()
            ? `Opened the folder ${path.basename(target) || target} in File Explorer.`
            : `Showed ${path.basename(target)} in File Explorer.`
    };
}