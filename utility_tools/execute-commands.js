import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { PROJECT_ROOT } from "../file_tools/file-tool.js";

const executeFile = promisify(execFile);
const execFileAsync = promisify(execFile);

export async function getWifiNetwork() {
    const { stdout } = await executeFile(
        "netsh.exe",
        ["wlan", "show", "interfaces"],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        output: stdout
    };
}

export async function getNetworkConfiguration() {
    const { stdout } = await executeFile(
        "ipconfig.exe",
        ["/all"],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        output: stdout
    };
}

export async function getNetworkAdapters() {
    const command =
        "Get-NetAdapter | " +
        "Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress | " +
        "ConvertTo-Json -Compress";

    const { stdout } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command
        ],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        adapters: JSON.parse(stdout)
    };
}

export async function getNetworkDetails() {
    const results = await Promise.allSettled([
        getWifiNetwork(),
        getNetworkConfiguration(),
        getNetworkAdapters()
    ]);

    const [wifi, configuration, adapters] = results;

    return {
        ok: results.every(result =>
            result.status === "fulfilled"
        ),
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            commands: [
                "netsh wlan show interfaces",
                "ipconfig /all",
                "Get-NetAdapter"
            ]
        },
        wifi:
            wifi.status === "fulfilled"
                ? wifi.value
                : {
                    ok: false,
                    error: wifi.reason.message
                },
        configuration:
            configuration.status === "fulfilled"
                ? configuration.value
                : {
                    ok: false,
                    error: configuration.reason.message
                },
        adapters:
            adapters.status === "fulfilled"
                ? adapters.value
                : {
                    ok: false,
                    error: adapters.reason.message
                }
    };
}

export async function checkInternetConnection() {
    const { stdout, stderr } = await executeFile(
        "ping.exe",
        [
            "1.1.1.1",
            "-n",
            "1",
            "-w",
            "3000"
        ],
        {
            windowsHide: true,
            maxBuffer: 50_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "ping 1.1.1.1 -n 1 -w 3000"
        },
        output: stdout,
        errorOutput: stderr || null
    };
}

export async function checkDnsResolution() {
    const { stdout, stderr } = await executeFile(
        "nslookup.exe",
        ["google.com"],
        {
            windowsHide: true,
            maxBuffer: 50_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "nslookup google.com"
        },
        output: stdout,
        errorOutput: stderr || null
    };
}

export async function getTailscaleStatus() {
    const { stdout, stderr } = await executeFile(
        "tailscale.exe",
        ["status", "--json"],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "tailscale status --json"
        },
        status: JSON.parse(stdout),
        errorOutput: stderr || null
    };
}

export async function getTailscaleIps() {
    const { stdout, stderr } = await executeFile(
        "tailscale.exe",
        ["ip"],
        {
            windowsHide: true,
            maxBuffer: 20_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "tailscale ip"
        },
        addresses: stdout
            .trim()
            .split(/\r?\n/)
            .filter(Boolean),
        errorOutput: stderr || null
    };
}

export async function getDiskSpace() {
    const command =
        "Get-PSDrive -PSProvider FileSystem | " +
        "Select-Object Name, Used, Free, Root | " +
        "ConvertTo-Json -Compress";

    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command
        ],
        {
            windowsHide: true,
            maxBuffer: 50_000
        }
    );

    const parsed = JSON.parse(stdout);

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-PSDrive -PSProvider FileSystem"
        },
        drives: Array.isArray(parsed)
            ? parsed
            : [parsed],
        errorOutput: stderr || null
    };
}

export async function getRunningProcesses() {
    const { stdout, stderr } = await executeFile(
        "tasklist.exe",
        [],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "tasklist"
        },
        processes: stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .slice(3),
        errorOutput: stderr || null
    };
}

export async function getBatteryStatus() {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Battery | Select-Object Name, BatteryStatus, EstimatedChargeRemaining, DesignCapacity, FullChargeCapacity | ConvertTo-Json -Compress"
        ],
        {
            windowsHide: true,
            maxBuffer: 50_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-CimInstance Win32_Battery"
        },
        battery: stdout
            ? JSON.parse(stdout)
            : null,
        errorOutput: stderr || null
    };
}

export async function getWindowsUpdatesStatus() {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-HotFix | Select-Object HotFixID, InstalledOn, Description | Sort-Object InstalledOn | ConvertTo-Json -Compress"
        ],
        {
            windowsHide: true,
            maxBuffer: 80_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-HotFix"
        },
        updates: stdout
            ? JSON.parse(stdout)
            : [],
        errorOutput: stderr || null
    };
}

export async function getFirewallStatus() {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction | ConvertTo-Json -Compress"
        ],
        {
            windowsHide: true,
            maxBuffer: 50_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-NetFirewallProfile"
        },
        firewall: stdout
            ? JSON.parse(stdout)
            : [],
        errorOutput: stderr || null
    };
}

export async function getWindowsDefenderStatus() {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-MpComputerStatus | Select-Object AntivirusEnabled, AntispywareEnabled, RealTimeProtectionEnabled, NISEnabled, AMServiceEnabled, TotalSignatureCount, ProductStatus | ConvertTo-Json -Compress"
        ],
        {
            windowsHide: true,
            maxBuffer: 80_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-MpComputerStatus"
        },
        defender: stdout
            ? JSON.parse(stdout)
            : null,
        errorOutput: stderr || null
    };
}

export async function getInstalledPrograms() {
    const command =
        "$keys = @(" +
        "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
        "  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'" +
        ");" +
        "Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.DisplayName } | " +
        "Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation | " +
        "Sort-Object DisplayName | " +
        "ConvertTo-Json -Compress";

    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command
        ],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-ItemProperty on uninstall registry keys"
        },
        programs: stdout
            ? JSON.parse(stdout)
            : [],
        errorOutput: stderr || null
    };
}

export async function getEventLogs({ logName = "System", maxEvents = 25 } = {}) {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Get-WinEvent -LogName "${logName}" -MaxEvents ${maxEvents} | Select-Object TimeCreated, LevelDisplayName, Id, ProviderName, Message | ConvertTo-Json -Compress`
        ],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: `Get-WinEvent -LogName "${logName}" -MaxEvents ${maxEvents}`
        },
        logs: stdout
            ? JSON.parse(stdout)
            : [],
        errorOutput: stderr || null
    };
}

export async function getServicesStatus() {
    const { stdout, stderr } = await executeFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Service | Select-Object Name, DisplayName, State, StartMode, Status, PathName | Sort-Object Name | ConvertTo-Json -Compress"
        ],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "Get-CimInstance Win32_Service"
        },
        services: stdout
            ? JSON.parse(stdout)
            : [],
        errorOutput: stderr || null
    };
}

export async function getNearbyWifiNetworks() {
    const { stdout, stderr } = await executeFile(
        "netsh.exe",
        ["wlan", "show", "network", "mode=bssid"],
        {
            windowsHide: true,
            maxBuffer: 200_000
        }
    );

    const lines = stdout.split(/\r?\n/);
    const networks = [];
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) continue;

        if (trimmed.startsWith("SSID")) {
            if (current) networks.push(current);

            current = {
                ssid: trimmed.replace(/^SSID\s*[:\-]?\s*/i, "").trim(),
                bssid: null,
                signal: null,
                channel: null,
                authentication: null
            };
            continue;
        }

        if (current && trimmed.startsWith("Network type")) {
            current.authentication = trimmed.split(":").slice(1).join(":").trim();
            continue;
        }

        if (current && trimmed.startsWith("Signal")) {
            current.signal = trimmed.split(":").slice(1).join(":").trim();
            continue;
        }

        if (current && trimmed.startsWith("Channel")) {
            current.channel = trimmed.split(":").slice(1).join(":").trim();
            continue;
        }

        if (current && trimmed.startsWith("BSSID")) {
            current.bssid = trimmed.split(":").slice(1).join(":").trim();
            continue;
        }
    }

    if (current) networks.push(current);

    return {
        ok: true,
        execution: {
            type: "read_only_windows_command",
            platform: "windows",
            command: "netsh wlan show network mode=bssid"
        },
        networks,
        rawOutput: stdout,
        errorOutput: stderr || null
    };
}

export async function getCurrentWifiPassword() {
    if (process.platform !== "win32") {
        return { ok: false, error: "This tool only works on Windows." };
    }

    try {
        // 1. Find the network you're currently connected to
        const { stdout: interfaces } = await execFileAsync(
            "netsh",
            ["wlan", "show", "interfaces"],
            { windowsHide: true }
        );

        // Match the "SSID" line but not the "BSSID" line
        const ssidMatch = interfaces.match(/^\s*SSID\s*:\s*(.+)$/m);
        const ssid = ssidMatch?.[1]?.trim();

        if (!ssid) {
            return { ok: false, error: "Not connected to a Wi-Fi network." };
        }

        // 2. Read that network's saved profile with the key shown
        const { stdout: profile } = await execFileAsync(
            "netsh",
            ["wlan", "show", "profile", `name=${ssid}`, "key=clear"],
            { windowsHide: true }
        );

        const keyMatch = profile.match(/^\s*Key Content\s*:\s*(.+)$/m);
        const password = keyMatch?.[1]?.trim();

        if (!password) {
            return {
                ok: false,
                ssid,
                error: "No password found (open network, or no saved key)."
            };
        }

        return { ok: true, ssid, password };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}