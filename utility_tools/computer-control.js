import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { PROJECT_ROOT } from "../file_tools/file-tool.js";

const executeFile = promisify(execFile);

// ---------- OPEN / RUN FILES ----------

const RUN_GRACE_MS = 3_000;
const MAX_OUTPUT = 20_000;

// File types that get executed. Everything else opens in its default app.
// Change "python.exe" to "py.exe" if that's how Python starts on your PC.
const SCRIPT_RUNNERS = {
    ".py": { command: "python.exe", args: file => [file] },
    ".js": { command: process.execPath, args: file => [file] },
    ".mjs": { command: process.execPath, args: file => [file] }
};

function clip(text) {
    const value = String(text ?? "");
    return value.length > MAX_OUTPUT
        ? value.slice(0, MAX_OUTPUT) + "\n[output truncated]"
        : value;
}

// Scripts you run shouldn't inherit Jason's API keys and database credentials
function scriptEnvironment() {
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
        if (/key|token|secret|password|database|^db_/i.test(key)) {
            delete env[key];
        }
    }

    return env;
}

async function resolveTarget(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) {
        throw new Error("filePath is required.");
    }

    // Absolute paths are used as-is; relative ones start from the project folder
    const absolutePath = path.resolve(PROJECT_ROOT, filePath.trim());

    let info;
    try {
        info = await stat(absolutePath);
    } catch {
        throw new Error(`File not found: ${absolutePath}`);
    }

    if (!info.isFile()) {
        throw new Error(`That path is not a file: ${absolutePath}`);
    }

    return {
        absolutePath,
        extension: path.extname(absolutePath).toLowerCase()
    };
}

function chooseAction(extension, requested) {
    if (requested === "open" || requested === "run") return requested;
    return SCRIPT_RUNNERS[extension] ? "run" : "open";
}

// Runs before the y/N prompt so you can see what is about to happen
export async function prepareOpenOrRunFile({ filePath, action } = {}) {
    const { absolutePath, extension } = await resolveTarget(filePath);
    const chosen = chooseAction(extension, action);

    const preview = { description: `${chosen} ${absolutePath}` };

    if (chosen === "run" && SCRIPT_RUNNERS[extension]) {
        const text = await readFile(absolutePath, "utf8");
        preview.code =
            text.length > 2000
                ? text.slice(0, 2000) + "\n[...rest not shown]"
                : text;
    }

    return { preview, context: {} };
}

export async function openOrRunFile({ filePath, action } = {}) {
    const { absolutePath, extension } = await resolveTarget(filePath);
    const chosen = chooseAction(extension, action);

    const execution = {
        type: "file_action",
        platform: "windows",
        action: chosen,
        file: absolutePath
    };

    // OPEN: hand the file to Windows, which uses the default app for its type
    if (chosen === "open") {
        await executeFile(
            "rundll32.exe",
            ["url.dll,FileProtocolHandler", absolutePath],
            { windowsHide: true }
        );

        return {
            ok: true,
            execution,
            output: "Opened with the default application."
        };
    }

    // RUN: scripts only
    const runner = SCRIPT_RUNNERS[extension];

    if (!runner) {
        return {
            ok: false,
            execution,
            error: `No runner for ${extension || "this file type"}. Use action "open" instead.`
        };
    }

        const child = spawn(runner.command, runner.args(absolutePath), {
        cwd: path.dirname(absolutePath),
        windowsHide: true,
        env: scriptEnvironment()
    });

    let stdout = "";
    let stderr = "";

    // These keep reading after we reply, so a running program never hits a closed pipe
    child.stdout.on("data", chunk => {
        if (stdout.length < MAX_OUTPUT) stdout += chunk;
    });
    child.stderr.on("data", chunk => {
        if (stderr.length < MAX_OUTPUT) stderr += chunk;
    });

    const outcome = await new Promise(resolve => {
        const timer = setTimeout(
            () => resolve({ stillRunning: true }),
            RUN_GRACE_MS
        );

        child.once("error", error => {
            clearTimeout(timer);
            resolve({ startError: error.message });
        });

        child.once("close", code => {
            clearTimeout(timer);
            resolve({ exitCode: code });
        });
    });

    child.on("error", () => {});
    child.unref();

    if (outcome.startError) {
        return {
            ok: false,
            execution,
            error: `Could not start the program: ${outcome.startError}`
        };
    }

    // Still alive after the grace period: a window app or long-running program
    if (outcome.stillRunning) {
        return {
            ok: true,
            execution: { ...execution, pid: child.pid },
            running: true,
            output: clip(stdout),
            errorOutput: clip(stderr) || null,
            note:
                "The program started successfully and is still running in the " +
                "background. It keeps running until the user closes it."
        };
    }

    const succeeded = outcome.exitCode === 0;

    return {
        ok: succeeded,
        execution,
        exitCode: outcome.exitCode,
        output: clip(stdout),
        errorOutput: clip(stderr) || null,
        ...(succeeded
            ? {}
            : { error: clip(stderr) || `Exited with code ${outcome.exitCode}` })
    };
}
