import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { PROJECT_ROOT } from "../file_tools/file-tool.js";

import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";

const executeFile = promisify(execFile);

// ---------- OPEN / RUN FILES ----------

const RUN_GRACE_MS = 3_000;
const MAX_OUTPUT = 20_000;

// File types that get executed. Everything else opens in its default app.
// Change "python.exe" to "py.exe" if that's how Python starts on your PC.
const SCRIPT_RUNNERS = {
    ".py": { command: "py.exe", args: file => [file] },
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

// ---------- OPEN / LAUNCH INSTALLED APPS ----------

// How long the list of installed apps is remembered (reading it takes about a second)
const APP_LIST_CACHE_MS = 10 * 60 * 1000;

// How many suggestions to return when we are not sure which app is meant
const MAX_CANDIDATES = 8;

// Remembered list of installed apps: { loadedAt, apps }
let appListCache = null;

// ---------- 1. Reading the installed apps from Windows ----------

// Asks Windows for every app in the Start menu: [{ name, appId }]
async function loadInstalledApps() {
    // Use the cached list while it is still fresh
    if (appListCache && Date.now() - appListCache.loadedAt < APP_LIST_CACHE_MS) {
        return appListCache.apps;
    }

    // Get-StartApps lists both classic desktop apps and Microsoft Store apps.
    // The first part makes sure the output is UTF-8 so unusual app names survive.
    const script =
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
        "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress";

    const { stdout } = await executeFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        {
            windowsHide: true,
            maxBuffer: 5_000_000,
            timeout: 20_000
        }
    );

    // PowerShell returns a single object (not a list) when there is only one app
    const parsed = stdout.trim() ? JSON.parse(stdout) : [];
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    const apps = rows
        .filter(row => row && row.Name && row.AppID)
        // Hide uninstallers so a request like "open discord" can never remove it
        .filter(row => !/uninstall/i.test(row.Name))
        .map(row => ({ name: row.Name, appId: row.AppID }));

    appListCache = { loadedAt: Date.now(), apps };
    return apps;
}

// ---------- 2. Matching what the user said to an installed app ----------

// Lowercase and drop spaces and punctuation: "Visual Studio Code" -> "visualstudiocode"
function normalize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// True if every letter of `query` appears in `name` in the same order.
// This is what lets "vscode" find "Visual Studio Code" without any alias list.
function isSubsequence(query, name) {
    let position = 0;

    for (const letter of name) {
        if (letter === query[position]) {
            position++;
            if (position === query.length) return true;
        }
    }

    return false;
}

// Gives one app name a score from 0 (no match) to 100 (exact match)
function scoreApp(query, appName) {
    const q = normalize(query);
    const n = normalize(appName);

    if (!q) return 0;
    if (n === q) return 100;

    // The name starts with what the user said: "spot" -> "Spotify".
    // Shorter names win slightly.
    if (n.startsWith(q)) return 90 - Math.min(20, (n.length - q.length) * 0.5);

    // Any single word of the name starts with the query: "code" -> "Visual Studio Code"
    const words = String(appName).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some(word => word.startsWith(q))) return 80;

    // The query appears somewhere inside the name: "chrome" -> "Google Chrome"
    if (n.includes(q)) return 70;

    // Every word the user said appears in the name: "studio code" -> "Visual Studio Code"
    const queryWords = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (queryWords.length > 1 && queryWords.every(word => n.includes(word))) return 65;

    // Last resort: letters in order ("vscode" -> "Visual Studio Code").
    // Only for queries of 3+ letters so tiny queries do not match everything.
    if (q.length >= 3 && isSubsequence(q, n)) return 40 + (q.length / n.length) * 20;

    return 0;
}

// Ranks all apps for a query, best first
export function rankApps(query, apps) {
    return apps
        .map(app => ({ ...app, score: scoreApp(query, app.name) }))
        .filter(app => app.score > 0)
        // Higher score first; on a tie, the shorter name is usually the main app
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length);
}

// Decides: launch the best match, or hand the options back for the model to choose
export function chooseApp(query, apps) {
    const ranked = rankApps(query, apps);

    // Nothing matched at all
    if (ranked.length === 0) {
        return { match: null, candidates: [] };
    }

    const best = ranked[0];
    const second = ranked[1];

    // Launch only when the best match is clearly better than the runner-up
    const isClearWinner = !second || best.score - second.score >= 10;

    if (best.score >= 40 && isClearWinner) {
        return { match: best, candidates: ranked.slice(0, MAX_CANDIDATES) };
    }

    return { match: null, candidates: ranked.slice(0, MAX_CANDIDATES) };
}

// ---------- 3. The tool Jason calls ----------

export async function launchApp(name) {
    if (typeof name !== "string" || !name.trim()) {
        throw new Error("An app name is required.");
    }

    const apps = await loadInstalledApps();
    const { match, candidates } = chooseApp(name, apps);

    // Not sure which app is meant: give Jason the options so he can pick or ask the user
    if (!match) {
        return {
            ok: false,
            error: candidates.length === 0
                ? `No installed app matched "${name}".`
                : `More than one app could match "${name}". Choose one of the candidates.`,
            candidates: candidates.map(app => app.name)
        };
    }

    try {
        // This is the same thing that happens when you click the app in the Start menu
        await executeFile(
            "explorer.exe",
            [`shell:AppsFolder\\${match.appId}`],
            { windowsHide: true, timeout: 10_000 }
        );
    } catch (error) {
        // explorer.exe often reports exit code 1 even when the app started fine
        if (error.code !== 1) {
            return {
                ok: false,
                error: `Could not start ${match.name}: ${error.message}`
            };
        }
    }

    return {
        ok: true,
        execution: {
            type: "app_launch",
            platform: "windows",
            app: match.name
        },
        message: `${match.name} was started.`
    };
}

// ----------- WINDOW TOOLS ------------

// ---------- 1. The Windows helper (written in C#) ----------

// PowerShell cannot manage windows by itself, so we give it a small C# helper.
// It is compiled ONCE into a DLL in your temp folder; later starts just load the DLL.
// If you ever change the C# code, change the version in DLL_NAME (v2 -> v3)
// so the old compiled copy is not reused.
const DLL_NAME = "JasonWin-v3.dll";

const CSHARP_SOURCE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

// One row of information about a window
public class WindowInfo
{
    public long Handle { get; set; }
    public string Title { get; set; }
    public uint ProcessId { get; set; }
    public int Left { get; set; }
    public int Top { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string State { get; set; }
    public bool IsActive { get; set; }
}

// One row of information about a monitor
public class MonitorInfoRow
{
    public int Left { get; set; }
    public int Top { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public int WorkLeft { get; set; }
    public int WorkTop { get; set; }
    public int WorkWidth { get; set; }
    public int WorkHeight { get; set; }
    public bool Primary { get; set; }
}

public static class JasonWin
{
    // Means "the caller did not give a value" (used when moving or resizing)
    private const int Unset = int.MinValue;

    // Runs once, before anything else: report real screen pixels instead of scaled ones
    static JasonWin()
    {
        SetProcessDPIAware();
    }

    private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    private delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, IntPtr rect, IntPtr data);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] private static extern uint GetWindowThreadId(IntPtr hWnd, IntPtr processId);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
    [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] private static extern int DwmGetWindowRect(IntPtr hWnd, int attribute, out RECT value, int size);
    [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    // The rectangle the user actually SEES (Windows adds invisible borders to the "official" one)
    private static RECT GetVisibleRect(IntPtr hWnd)
    {
        RECT visible;
        // 9 = extended frame bounds, which excludes the invisible resize borders
        if (DwmGetWindowRect(hWnd, 9, out visible, Marshal.SizeOf(typeof(RECT))) == 0)
        {
            return visible;
        }

        RECT outer;
        GetWindowRect(hWnd, out outer);
        return outer;
    }

    // Returns every window the user would recognise as an open app window
    public static List<WindowInfo> ListWindows()
    {
        List<WindowInfo> result = new List<WindowInfo>();
        IntPtr foreground = GetForegroundWindow();

        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
        {
            // Skip hidden windows and windows without a title
            if (!IsWindowVisible(hWnd)) return true;

            int length = GetWindowTextLength(hWnd);
            if (length == 0) return true;

            // Skip small floating tool windows (-20 = extended style, 0x80 = tool window, 0x40000 = app window)
            int exStyle = GetWindowLong(hWnd, -20);
            bool isToolWindow = (exStyle & 0x80) != 0;
            bool isAppWindow = (exStyle & 0x40000) != 0;
            if (isToolWindow && !isAppWindow) return true;

            // Skip cloaked windows: suspended Store apps and windows on other virtual desktops (14 = cloaked)
            int cloaked = 0;
            DwmGetWindowAttribute(hWnd, 14, out cloaked, 4);
            if (cloaked != 0) return true;

            StringBuilder text = new StringBuilder(length + 1);
            GetWindowText(hWnd, text, text.Capacity);
            string title = text.ToString();

            // The desktop itself is not an app window
            if (title == "Program Manager") return true;

            RECT rect = GetVisibleRect(hWnd);

            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);

            string state = "normal";
            if (IsIconic(hWnd)) state = "minimized";
            else if (IsZoomed(hWnd)) state = "maximized";

            WindowInfo info = new WindowInfo();
            info.Handle = hWnd.ToInt64();
            info.Title = title;
            info.ProcessId = processId;
            info.Left = rect.Left;
            info.Top = rect.Top;
            info.Width = rect.Right - rect.Left;
            info.Height = rect.Bottom - rect.Top;
            info.State = state;
            info.IsActive = (hWnd == foreground);
            result.Add(info);

            return true; // keep going to the next window
        }, IntPtr.Zero);

        return result;
    }

    // Returns every monitor: full area and the "work area" (the area without the taskbar)
    public static List<MonitorInfoRow> GetMonitors()
    {
        List<MonitorInfoRow> result = new List<MonitorInfoRow>();

        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate (IntPtr hMonitor, IntPtr hdc, IntPtr rect, IntPtr data)
        {
            MONITORINFO info = new MONITORINFO();
            info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));

            if (GetMonitorInfo(hMonitor, ref info))
            {
                MonitorInfoRow row = new MonitorInfoRow();
                row.Left = info.rcMonitor.Left;
                row.Top = info.rcMonitor.Top;
                row.Width = info.rcMonitor.Right - info.rcMonitor.Left;
                row.Height = info.rcMonitor.Bottom - info.rcMonitor.Top;
                row.WorkLeft = info.rcWork.Left;
                row.WorkTop = info.rcWork.Top;
                row.WorkWidth = info.rcWork.Right - info.rcWork.Left;
                row.WorkHeight = info.rcWork.Bottom - info.rcWork.Top;
                row.Primary = (info.dwFlags & 1) != 0;
                result.Add(row);
            }

            return true;
        }, IntPtr.Zero);

        return result;
    }

    // Does one action on one window and returns a short description of what happened
    public static string Act(long handleValue, string action, int x, int y, int width, int height)
    {
        IntPtr hWnd = new IntPtr(handleValue);

        if (!IsWindow(hWnd))
        {
            throw new Exception("That window no longer exists.");
        }

        switch (action)
        {
            case "focus":
                return BringToFront(hWnd) ? "brought to the front" : "Windows would not let it take focus";
            case "minimize":
                ShowWindow(hWnd, 6);   // 6 = SW_MINIMIZE
                return "minimized";
            case "maximize":
                ShowWindow(hWnd, 3);   // 3 = SW_MAXIMIZE
                return "maximized";
            case "restore":
                ShowWindow(hWnd, 9);   // 9 = SW_RESTORE
                return "restored";
            case "close":
                PostMessage(hWnd, 0x0010, IntPtr.Zero, IntPtr.Zero);   // 0x0010 = WM_CLOSE (a polite request)
                return "asked to close";
            case "move":
                return Place(hWnd, x, y, width, height);
            default:
                throw new Exception("Unknown action: " + action);
        }
    }

        // Presses and releases one key the given number of times (used for media and volume keys)
    private static void TapKey(byte vk, int times)
    {
        for (int i = 0; i < times; i++)
        {
            keybd_event(vk, 0, 1, UIntPtr.Zero);   // 1 = extended key, pressed
            keybd_event(vk, 0, 3, UIntPtr.Zero);   // 3 = extended key, released
        }
    }

    // Media and volume keys. Each volume step changes the volume by about 2 percent.
    public static string MediaKey(string name, int percent)
    {
        int steps = Math.Max(1, percent / 2);

        switch (name)
        {
            case "play_pause":
                TapKey(0xB3, 1);
                return "play/pause pressed";
            case "next":
                TapKey(0xB0, 1);
                return "skipped to the next track";
            case "previous":
                TapKey(0xB1, 1);
                return "went back to the previous track";
            case "stop":
                TapKey(0xB2, 1);
                return "stopped playback";
            case "mute":
                TapKey(0xAD, 1);
                return "mute toggled";
            case "volume_up":
                TapKey(0xAF, steps);
                return "volume raised by about " + (steps * 2) + " percent";
            case "volume_down":
                TapKey(0xAE, steps);
                return "volume lowered by about " + (steps * 2) + " percent";
            case "set_volume":
                TapKey(0xAE, 50);                          // all the way down first
                if (percent >= 2) TapKey(0xAF, percent / 2);   // then up to the target
                return "volume set to about " + percent + " percent";
            default:
                throw new Exception("Unknown media key: " + name);
        }
    }

    // Brings a window to the front. Windows blocks this for background programs, so we
    // briefly "attach" to the current front window's input, which is the usual workaround.
    private static bool BringToFront(IntPtr hWnd)
    {
        if (IsIconic(hWnd)) ShowWindow(hWnd, 9);   // un-minimize first

        IntPtr foreground = GetForegroundWindow();
        uint myThread = GetCurrentThreadId();
        uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadId(foreground, IntPtr.Zero);
        bool attached = false;

        if (foregroundThread != 0 && foregroundThread != myThread)
        {
            attached = AttachThreadInput(myThread, foregroundThread, true);
        }

        BringWindowToTop(hWnd);
        ShowWindow(hWnd, 5);   // 5 = SW_SHOW (keeps its current size)
        SetForegroundWindow(hWnd);

        if (attached) AttachThreadInput(myThread, foregroundThread, false);

        return GetForegroundWindow() == hWnd;
    }

    // Moves and/or resizes a window to the VISIBLE rectangle given. Any value left out stays as it is.
    private static string Place(IntPtr hWnd, int x, int y, int width, int height)
    {
        // A maximized or minimized window ignores moves, so restore it first
        if (IsIconic(hWnd) || IsZoomed(hWnd)) ShowWindow(hWnd, 9);

        RECT outer;
        GetWindowRect(hWnd, out outer);
        RECT visible = GetVisibleRect(hWnd);

        // The invisible border Windows adds on each side
        int insetLeft = visible.Left - outer.Left;
        int insetTop = visible.Top - outer.Top;
        int insetRight = outer.Right - visible.Right;
        int insetBottom = outer.Bottom - visible.Bottom;

        // The rectangle we want to SEE: use the given values, keep the rest
        int wantLeft = (x == Unset) ? visible.Left : x;
        int wantTop = (y == Unset) ? visible.Top : y;
        int wantWidth = (width == Unset) ? (visible.Right - visible.Left) : width;
        int wantHeight = (height == Unset) ? (visible.Bottom - visible.Top) : height;

        // Convert to the "official" rectangle by adding the invisible borders back
        MoveWindow(
            hWnd,
            wantLeft - insetLeft,
            wantTop - insetTop,
            wantWidth + insetLeft + insetRight,
            wantHeight + insetTop + insetBottom,
            true);

        return "moved to x=" + wantLeft + ", y=" + wantTop + ", width=" + wantWidth + ", height=" + wantHeight;
    }
}
`;

// ---------- 2. The PowerShell script that stays running ----------

// Part A: load the helper (compile it the first time, reuse the DLL afterwards)
const LOAD_HELPER_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- LOAD HELPER BEGIN ---
$dll = Join-Path $env:TEMP '${DLL_NAME}'

# First run only: compile the C# helper into a DLL (takes about a second)
if (-not (Test-Path $dll)) {
    $source = @'
${CSHARP_SOURCE}
'@
    Add-Type -TypeDefinition $source -OutputAssembly $dll
}

# Load the DLL unless the compile step above already made the type available
if (-not ('JasonWin' -as [type])) {
    Add-Type -Path $dll
}
# --- LOAD HELPER END ---
`;

// Part B: the commands the helper understands, and the loop that answers them.
// Node sends one JSON line per request; this script answers with one JSON line.
const COMMAND_LOOP_SCRIPT = `
# Every open window, with the program name added (chrome, Code, Spotify...)
function Get-JasonWindows {
    $names = @{}
    Get-Process | ForEach-Object { $names[[uint32]$_.Id] = $_.ProcessName }

    $rows = @()
    foreach ($w in [JasonWin]::ListWindows()) {
        $rows += [pscustomobject]@{
            handle = $w.Handle
            app    = $names[[uint32]$w.ProcessId]
            title  = $w.Title
            state  = $w.State
            active = $w.IsActive
            left   = $w.Left
            top    = $w.Top
            width  = $w.Width
            height = $w.Height
        }
    }

    # The caller wraps this in @(...), which makes it a list even with 0 or 1 items
    return $rows
}

# Every monitor, with its full area and its work area (the part without the taskbar)
function Get-JasonMonitors {
    $rows = @()
    foreach ($m in [JasonWin]::GetMonitors()) {
        $rows += [pscustomobject]@{
            primary    = $m.Primary
            left       = $m.Left
            top        = $m.Top
            width      = $m.Width
            height     = $m.Height
            workLeft   = $m.WorkLeft
            workTop    = $m.WorkTop
            workWidth  = $m.WorkWidth
            workHeight = $m.WorkHeight
        }
    }

    return $rows
}

# One action (focus, minimize, maximize, restore, close, move) on one window
function Invoke-JasonAction($request) {
    # A missing number is sent to the helper as "not given"
    $unset = [int]::MinValue
    $x = if ($null -ne $request.x) { [int]$request.x } else { $unset }
    $y = if ($null -ne $request.y) { [int]$request.y } else { $unset }
    $w = if ($null -ne $request.width) { [int]$request.width } else { $unset }
    $h = if ($null -ne $request.height) { [int]$request.height } else { $unset }

    $message = [JasonWin]::Act([long]$request.handle, [string]$request.action, $x, $y, $w, $h)
    return [pscustomobject]@{ message = $message }
}

# One media or volume key press
function Invoke-JasonMedia($request) {
    $amount = if ($null -ne $request.amount) { [int]$request.amount } else { 0 }
    $message = [JasonWin]::MediaKey([string]$request.key, $amount)
    return [pscustomobject]@{ message = $message }
}

# Tell Node we are ready, then answer requests until Node closes the connection
[Console]::Out.WriteLine('{"ready":true}')

while ($true) {
    $line = [Console]::In.ReadLine()

    # null means Node went away: stop, so no stray PowerShell is left running
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }

    $id = $null

    try {
        $request = $line | ConvertFrom-Json
        $id = $request.id
        $data = $null

        switch ($request.cmd) {
            'list'     { $data = @(Get-JasonWindows) }
            'monitors' { $data = @(Get-JasonMonitors) }
            'act'      { $data = Invoke-JasonAction $request }
            'media'    { $data = Invoke-JasonMedia $request }
            default    { throw "Unknown command: $($request.cmd)" }
        }

        $response = @{ id = $id; ok = $true; data = $data }
    }
    catch {
        $response = @{ id = $id; ok = $false; error = $_.Exception.Message }
    }

    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $response -Compress -Depth 6))
}
`;

const WORKER_SCRIPT = LOAD_HELPER_SCRIPT + COMMAND_LOOP_SCRIPT;

// ---------- 3. Node side: talking to the always-running PowerShell ----------

// Passwords and API keys in Jason's environment should not be handed to child programs
function safeEnvironment() {
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
        if (/key|token|secret|password|database|^db_/i.test(key)) {
            delete env[key];
        }
    }

    return env;
}

class PowerShellWorker {
    constructor() {
        this.child = null;          // the running PowerShell process
        this.readyPromise = null;   // resolves when the helper is loaded and listening
        this.pending = new Map();   // requests waiting for an answer: id -> { resolve, reject, timer }
        this.nextId = 1;            // request numbers, so answers match their questions
        this.lastErrors = "";       // the last bit of PowerShell's error output, for messages
    }

    // Starts PowerShell if it is not already running (the first start takes 1-2 seconds)
    start() {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise((resolve, reject) => {
            // The script is too big for the command line, so it is saved as a file
            const scriptDirectory = path.join(os.tmpdir(), "jason");
            const scriptPath = path.join(scriptDirectory, "window-helper.ps1");
            mkdirSync(scriptDirectory, { recursive: true });
            writeFileSync(scriptPath, WORKER_SCRIPT, "utf8");

            const child = spawn(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy", "Bypass",
                    "-File", scriptPath
                ],
                {
                    windowsHide: true,
                    stdio: ["pipe", "pipe", "pipe"],
                    env: safeEnvironment()
                }
            );

            this.child = child;
            let isReady = false;

            // Give up if the helper has not said "ready" within 30 seconds
            const startupTimer = setTimeout(() => {
                child.kill();
            }, 30_000);

            // Each line PowerShell prints is one JSON message
            const lines = createInterface({ input: child.stdout });

            lines.on("line", rawLine => {
                // Remove the invisible byte-order mark PowerShell may print first
                const line = rawLine.replace(/^\uFEFF/, "").trim();
                if (!line) return;

                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    return; // not one of ours; ignore stray output
                }

                if (message.ready) {
                    isReady = true;
                    clearTimeout(startupTimer);
                    resolve();
                    return;
                }

                const waiting = this.pending.get(message.id);
                if (!waiting) return;

                clearTimeout(waiting.timer);
                this.pending.delete(message.id);

                if (message.ok) {
                    waiting.resolve(message.data);
                } else {
                    waiting.reject(new Error(message.error || "The window helper reported an error."));
                }
            });

            child.stderr.on("data", chunk => {
                this.lastErrors = (this.lastErrors + chunk).slice(-2000);
            });

            // If the process cannot start or stops, fail everything waiting and allow a fresh start later
            const handleStop = reason => {
                clearTimeout(startupTimer);

                const error = new Error(
                    `The window helper stopped (${reason}). ${this.lastErrors}`.trim()
                );

                for (const waiting of this.pending.values()) {
                    clearTimeout(waiting.timer);
                    waiting.reject(error);
                }
                this.pending.clear();

                this.child = null;
                this.readyPromise = null;

                if (!isReady) reject(error);
            };

            child.on("error", error => handleStop(error.message));
            child.on("exit", code => handleStop(`exit code ${code}`));

            // Writing to a stopped process must never crash Jason
            child.stdin.on("error", () => {});

            // The helper must not keep Jason running when everything else is finished
            child.unref();
            child.stdin.unref();
            child.stdout.unref();
            child.stderr.unref();
        });

        return this.readyPromise;
    }

    // Sends one request and waits for its answer
    async request(command, params = {}, timeoutMs = 15_000) {
        await this.start();

        return new Promise((resolve, reject) => {
            const child = this.child;

            if (!child || !child.stdin.writable) {
                reject(new Error("The window helper is not running."));
                return;
            }

            const id = this.nextId++;

            // Do not wait forever for an answer
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`The window helper did not answer "${command}" in time.`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });

            child.stdin.write(JSON.stringify({ id, cmd: command, ...params }) + "\n");
        });
    }

    // Stops the helper (it also stops by itself when Jason closes)
    stop() {
        if (this.child) this.child.kill();
    }
}

const worker = new PowerShellWorker();

export function stopWindowHelper() {
    worker.stop();
}

// ---------- 4. The tools Jason calls ----------

// list_windows: what is open right now
export async function listWindows() {
    const windows = await worker.request("list");

    return {
        ok: true,
        execution: { type: "window_list", platform: "windows" },
        count: windows.length,
        windows
    };
}


// get_screen_info: the monitors and how much room each one has
export async function getScreenInfo() {
    const monitors = await worker.request("monitors");

    return {
        ok: true,
        execution: { type: "screen_info", platform: "windows" },
        note:
            "Coordinates are screen pixels. The work area excludes the taskbar; " +
            "use it when placing windows. Positions on a second monitor can be negative or very large.",
        monitors
    };
}

const WINDOW_ACTIONS = ["focus", "minimize", "maximize", "restore", "close", "move"];

// Describes a window in a short form the model can use to pick one
function describeWindow(w) {
    return { app: w.app, title: w.title, state: w.state, handle: w.handle };
}

// Finds the window the user means: by exact handle, or by matching words against app name and title
function resolveWindow(windows, target, handle) {
    // A handle (from list_windows) is exact, so use it directly
    if (handle !== undefined && handle !== null) {
        const found = windows.find(w => w.handle === Number(handle));
        return found
            ? { window: found }
            : { error: "No window with that handle is open any more.", candidates: windows.map(describeWindow) };
    }

    if (typeof target !== "string" || !target.trim()) {
        return { error: "A target (app name or window title) or a handle is required." };
    }

    // Score every window by how well its app name OR title matches what was said
    const scored = windows
        .map(w => ({
            window: w,
            score: Math.max(scoreApp(target, w.app || ""), scoreApp(target, w.title || ""))
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
        return {
            error: `No open window matched "${target}".`,
            candidates: windows.map(describeWindow)
        };
    }

    // Anything almost as good as the best match counts as "could also be it"
    const close = scored.filter(item => scored[0].score - item.score < 10);

    if (close.length > 1) {
        return {
            error: `More than one window matches "${target}". Pick one and call again with its handle.`,
            candidates: close.map(item => describeWindow(item.window))
        };
    }

    return { window: scored[0].window };
}

// window_action: focus, minimize, maximize, restore, close or move/resize one window
export async function windowAction({ target, handle, action, x, y, width, height } = {}) {
    if (!WINDOW_ACTIONS.includes(action)) {
        throw new Error(`action must be one of: ${WINDOW_ACTIONS.join(", ")}.`);
    }

    // Moving needs at least one of x, y, width, height
    const hasPlacement = [x, y, width, height].some(v => v !== undefined && v !== null);

    if (action === "move" && !hasPlacement) {
        throw new Error("To move or resize a window, give at least one of x, y, width, height.");
    }

    const windows = await worker.request("list");
    const { window: chosen, error, candidates } = resolveWindow(windows, target, handle);

    // Could not decide which window: return the options so the model can choose or ask
    if (!chosen) {
        return { ok: false, error, candidates };
    }

    const result = await worker.request("act", {
        handle: chosen.handle,
        action,
        x, y, width, height
    });

    // Windows sometimes refuses to bring a window to the front: say so instead of claiming success
    if (action === "focus" && /would not/.test(result.message)) {
        return {
            ok: false,
            error: `${chosen.app} (${chosen.title}): ${result.message}.`
        };
    }

    return {
        ok: true,
        execution: {
            type: "window_action",
            platform: "windows",
            action,
            app: chosen.app,
            title: chosen.title
        },
        message: `${chosen.app} (${chosen.title}): ${result.message}.`
    };
}

// media_control: play/pause, next, previous, mute, and volume
const MEDIA_KEYS = [
    "play_pause", "next", "previous", "stop",
    "mute", "volume_up", "volume_down", "set_volume"
];

export async function mediaControl({ key, amount } = {}) {
    if (!MEDIA_KEYS.includes(key)) {
        throw new Error(`key must be one of: ${MEDIA_KEYS.join(", ")}.`);
    }

    let percent = 0;

    if (key === "set_volume") {
        percent = Number(amount);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new Error("set_volume needs an amount from 0 to 100.");
        }
    } else if (key === "volume_up" || key === "volume_down") {
        // "a bit louder" with no number means about 10 percent
        percent = Number.isFinite(Number(amount)) && Number(amount) > 0
            ? Math.min(Number(amount), 100)
            : 10;
    }

    const result = await worker.request("media", { key, amount: Math.round(percent) });

    return {
        ok: true,
        execution: { type: "media_control", platform: "windows", key },
        message: result.message
    };
}
// system_control: lock, sleep, shutdown, restart, brightness, theme
const SYSTEM_ACTIONS = [
    "lock", "sleep", "shutdown", "restart",
    "cancel_shutdown", "set_brightness", "set_theme"
];

// Shutdown and restart wait this long, so they can still be cancelled
const SHUTDOWN_DELAY_SECONDS = 30;

const THEME_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

export async function systemControl({ action, value } = {}) {
    if (!SYSTEM_ACTIONS.includes(action)) {
        throw new Error(`action must be one of: ${SYSTEM_ACTIONS.join(", ")}.`);
    }

    const finish = message => ({
        ok: true,
        execution: { type: "system_control", platform: "windows", action },
        message
    });

    switch (action) {
        case "lock": {
            await executeFile(
                "rundll32.exe",
                ["user32.dll,LockWorkStation"],
                { windowsHide: true }
            );
            return finish("The screen was locked.");
        }

        case "sleep": {
            // Starts after 2 seconds so Jason can answer first.
            // If hibernation is enabled on this PC, Windows may hibernate instead of sleeping.
            setTimeout(() => {
                const child = spawn(
                    "rundll32.exe",
                    ["powrprof.dll,SetSuspendState", "0,1,0"],
                    { detached: true, stdio: "ignore", windowsHide: true }
                );
                child.on("error", () => {});
                child.unref();
            }, 2_000);

            return finish("The computer will go to sleep in about 2 seconds.");
        }

        case "shutdown":
        case "restart": {
            const flag = action === "shutdown" ? "/s" : "/r";

            await executeFile(
                "shutdown.exe",
                [flag, "/t", String(SHUTDOWN_DELAY_SECONDS)],
                { windowsHide: true }
            );

            return finish(
                `The computer will ${action === "shutdown" ? "shut down" : "restart"} ` +
                `in ${SHUTDOWN_DELAY_SECONDS} seconds. The user can cancel it until then.`
            );
        }

        case "cancel_shutdown": {
            try {
                await executeFile("shutdown.exe", ["/a"], { windowsHide: true });
            } catch {
                return { ok: false, error: "There is no shutdown or restart pending to cancel." };
            }
            return finish("The pending shutdown or restart was cancelled.");
        }

        case "set_brightness": {
            const requested = Number(value);

            if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
                throw new Error("set_brightness needs a value from 0 to 100.");
            }

            // Never go fully black: the user could not see the screen to fix it
            const level = Math.max(5, Math.round(requested));

            const script =
                "$found = $false; " +
                "Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | " +
                "ForEach-Object { $found = $true; " +
                "Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness " +
                `-Arguments @{ Timeout = 1; Brightness = ${level} } | Out-Null }; ` +
                "if (-not $found) { exit 3 }";

            try {
                await executeFile(
                    "powershell.exe",
                    ["-NoProfile", "-NonInteractive", "-Command", script],
                    { windowsHide: true, timeout: 10_000 }
                );
            } catch (error) {
                if (error.code === 3) {
                    return {
                        ok: false,
                        error:
                            "Brightness cannot be changed here. Windows only allows it " +
                            "for built-in laptop screens, not external monitors."
                    };
                }
                throw error;
            }

            return finish(`Brightness was set to ${level} percent.`);
        }

        case "set_theme": {
            const mode = String(value || "").toLowerCase();

            if (mode !== "dark" && mode !== "light") {
                throw new Error('set_theme needs a value of "dark" or "light".');
            }

            const dword = mode === "light" ? "1" : "0";

            // One setting for apps, one for the taskbar and system
            for (const name of ["AppsUseLightTheme", "SystemUsesLightTheme"]) {
                await executeFile(
                    "reg.exe",
                    ["add", THEME_KEY, "/v", name, "/t", "REG_DWORD", "/d", dword, "/f"],
                    { windowsHide: true }
                );
            }

            return finish(`Windows was switched to ${mode} mode.`);
        }
    }
}

// ---------- 5. Background awareness: what is on screen right now, kept fresh and free to read ----------

const AWARENESS_REFRESH_MS = 2_500;   // how often the open windows are re-read (each read takes ~20 ms)
const MONITOR_REFRESH_MS = 60_000;    // monitors rarely change, so they are read less often
const MAX_WINDOWS_IN_SUMMARY = 15;    // keeps the summary short
const MAX_TITLE_LENGTH = 60;          // long window titles are shortened

// The last thing we saw. Reading it costs nothing, so every message can include it.
const awareness = { windows: [], monitors: [], monitorsAt: 0, updatedAt: 0 };

let awarenessTimer = null;
let awarenessFailures = 0;
let isRefreshing = false;

// Reads the windows (and sometimes the monitors) once and remembers them
async function refreshAwareness() {
    if (isRefreshing) return;   // never run two reads at the same time
    isRefreshing = true;

    try {
        awareness.windows = await worker.request("list", {}, 5_000);

        if (Date.now() - awareness.monitorsAt > MONITOR_REFRESH_MS) {
            awareness.monitors = await worker.request("monitors", {}, 5_000);
            awareness.monitorsAt = Date.now();
        }

        awareness.updatedAt = Date.now();
        awarenessFailures = 0;
    } catch {
        awarenessFailures++;

        // Three failures in a row (for example, not running on Windows): stop trying
        if (awarenessFailures >= 3 && awarenessTimer) {
            clearInterval(awarenessTimer);
            awarenessTimer = null;
        }
    } finally {
        isRefreshing = false;
    }
}

// Starts the background reading. Call it once when Jason starts.
// Set JASON_SCREEN_AWARENESS=off in .env to turn it off.
export function startScreenAwareness() {
    if (process.env.JASON_SCREEN_AWARENESS === "off" || awarenessTimer) return;

    refreshAwareness();   // first read right away; this also warms up the window helper
    awarenessTimer = setInterval(refreshAwareness, AWARENESS_REFRESH_MS);
    awarenessTimer.unref();   // this timer alone never keeps Jason running
}

// Shortens long text so one huge window title cannot bloat every message
function shorten(text) {
    const value = String(text ?? "");
    return value.length > MAX_TITLE_LENGTH
        ? value.slice(0, MAX_TITLE_LENGTH - 3) + "..."
        : value;
}

// One window as a short line of text the model can read (the handle lets it act without searching)
function describeForSummary(w) {
    return `${w.app} "${shorten(w.title)}" (${w.state}, handle ${w.handle})`;
}

// The text that is added to every message: active window, open windows, monitor layout
export function getScreenContext() {
    // Nothing read yet, or awareness is off
    if (awareness.updatedAt === 0) return "";

    const lines = [];

    // A stopped helper leaves old information behind, so warn the model
    if (Date.now() - awareness.updatedAt > 15_000) {
        lines.push("(This screen information may be out of date.)");
    }

    const active = awareness.windows.find(w => w.active);
    lines.push(
        active
            ? `Active window: ${describeForSummary(active)}`
            : "Active window: none (the desktop, or a window that is not listed)"
    );

    const others = awareness.windows
        .filter(w => !w.active)
        .slice(0, MAX_WINDOWS_IN_SUMMARY);

    if (others.length > 0) {
        lines.push("Other open windows: " + others.map(describeForSummary).join("; "));
    }

    if (awareness.monitors.length > 0) {
        lines.push(
            "Monitors: " +
            awareness.monitors
                .map((m, index) =>
                    `#${index + 1}${m.primary ? " (primary)" : ""} ${m.width}x${m.height} at (${m.left},${m.top}), ` +
                    `work area ${m.workWidth}x${m.workHeight} at (${m.workLeft},${m.workTop})`
                )
                .join("; ")
        );
    }

    return lines.join("\n");
}