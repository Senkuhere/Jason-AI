import {
    createFolderDirectory,
    readProjectFile,
    writeProjectFile,
    appendProjectFile,
    editProjectFile,
    listProjectDirectory
} from "./file_tools/file-tool.js";

import {
    calculator,
    getCurrentDate,
    getWeather,
    searchWeb,
    openWebPage
} from "./utility_tools/utility.js";

import {
    getComputerHardwareInfo,
    getOperatingSystemInfo,
    checkNetworkStatus,
    getJasonHealth
} from "./utility_tools/computer-system-info.js";

import {
    getNetworkDetails,
    checkInternetConnection,
    checkDnsResolution,
    getTailscaleStatus,
    getTailscaleIps,
    getDiskSpace,
    getRunningProcesses,
    getBatteryStatus,
    getWindowsUpdatesStatus,
    getFirewallStatus,
    getWindowsDefenderStatus,
    getInstalledPrograms,
    getEventLogs,
    getServicesStatus,
    getNearbyWifiNetworks,
    getCurrentWifiPassword
} from "./utility_tools/execute-commands.js";

import {
    prepareOpenOrRunFile,
    openOrRunFile
} from "./utility_tools/computer-control.js";

import { readDocument } from "./file_tools/document-reader.js";

function capability({
    name,
    description,
    parameters,
    execute,
    cacheable = false,
    mutating = false
}) {
    return {
        name,
        definition: {
            name,
            description,
            parameters
        },
        execute,
        cacheable,
        mutating
    };
}

const capabilities = new Map([
    [
        "read_project_file",
        capability({
            name: "read_project_file",
            description: "Read a text file inside the Jason project.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description:
                            "Project-relative path, such as memory.js"
                    }
                },
                required: ["filePath"]
            },
            execute: ({ filePath }) =>
                readProjectFile(filePath),
            cacheable: true
        })
    ],
    [
        "write_project_file",
        capability({
            name: "write_project_file",
            description:
                "Write text content to a file inside the Jason project.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description:
                            "Project-relative path, such as notes.txt"
                    },
                    content: {
                        type: "STRING",
                        description:
                            "The complete text content to write"
                    }
                },
                required: ["filePath", "content"]
            },
            execute: ({ filePath, content }) =>
                writeProjectFile(filePath, content),
            mutating: true
        })
    ],
    [
        "create_folder_directory",
        capability({
            name: "create_folder_directory",
            description:
                "Create a directory inside the Jason project.",
            parameters: {
                type: "OBJECT",
                properties: {
                    directoryPath: {
                        type: "STRING",
                        description:
                            "Project-relative directory path"
                    }
                },
                required: ["directoryPath"]
            },
            execute: ({ directoryPath }) =>
                createFolderDirectory(directoryPath),
            mutating: true
        })
    ],
    [
        "edit_project_file",
        capability({
            name: "edit_project_file",
            description:
                "Replace one exact section of an existing project file.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description:
                            "Project-relative path of the file"
                    },
                    oldText: {
                        type: "STRING",
                        description:
                            "The exact existing text to replace"
                    },
                    newText: {
                        type: "STRING",
                        description:
                            "The replacement text"
                    }
                },
                required: ["filePath", "oldText", "newText"]
            },
            execute: ({ filePath, oldText, newText }) =>
                editProjectFile(filePath, oldText, newText),
            mutating: true
        })
    ],
    [
        "append_project_file",
        capability({
            name: "append_project_file",
            description:
                "Append text to an existing project file.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description:
                            "Project-relative path of the file"
                    },
                    content: {
                        type: "STRING",
                        description:
                            "Text to append"
                    }
                },
                required: ["filePath", "content"]
            },
            execute: ({ filePath, content }) =>
                appendProjectFile(filePath, content),
            mutating: true
        })
    ],
    [
        "list_project_directory",
        capability({
            name: "list_project_directory",
            description:
                "List files and subdirectories inside a project directory.",
            parameters: {
                type: "OBJECT",
                properties: {
                    directoryPath: {
                        type: "STRING",
                        description:
                            "Project-relative directory path"
                    },
                    recursive: {
                        type: "BOOLEAN",
                        description:
                            "Whether to inspect nested directories"
                    }
                },
                required: ["directoryPath", "recursive"]
            },
            execute: ({ directoryPath, recursive }) =>
                listProjectDirectory(directoryPath, recursive),
            cacheable: true
        })
    ],
    [
        "calculator",
        capability({
            name: "calculator",
            description:
                "Perform basic arithmetic calculations.",
            parameters: {
                type: "OBJECT",
                properties: {
                    expression: {
                        type: "STRING",
                        description:
                            "An arithmetic expression"
                    }
                },
                required: ["expression"]
            },
            execute: ({ expression }) =>
                calculator(expression),
            cacheable: true
        })
    ],
    [
        "get_current_date",
        capability({
            name: "get_current_date",
            description:
                "Get the current date and time.",
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                getCurrentDate(),
            cacheable: true
        })
    ],
    [
        "get_weather",
        capability({
            name: "get_weather",
            description:
                "Get the current weather for a location.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description:
                            "A city or location"
                    }
                },
                required: ["query"]
            },
            execute: ({ query }) =>
                getWeather(query),
            cacheable: true
        })
    ],
    [
        "search_web",
        capability({
            name: "search_web",
            description:
                "Search the web for current information.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description:
                            "A precise web search query"
                    },
                    maxResults: {
                        type: "NUMBER",
                        description:
                            "Maximum results from 1 to 10"
                    }
                },
                required: ["query"]
            },
            execute: ({ query, maxResults }) =>
                searchWeb(query, maxResults),
            cacheable: true
        })
    ],
    [
        "open_web_page",
        capability({
            name: "open_web_page",
            description:
                "Open a webpage in the default browser.",
            parameters: {
                type: "OBJECT",
                properties: {
                    url: {
                        type: "STRING",
                        description:
                            "A complete http or https URL"
                    }
                },
                required: ["url"]
            },
            execute: ({ url }) =>
                openWebPage(url),
            mutating: true
        })
    ],
    [
        "get_computer_hardware_info",
        capability({
            name: "get_computer_hardware_info",
            description:
                "Read safe hardware information about the computer.",
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                getComputerHardwareInfo(),
            cacheable: true
        })
    ],
    [
        "get_operating_system_info",
        capability({
            name: "get_operating_system_info",
            description:
                "Read safe information about the computer's operating system.",
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                getOperatingSystemInfo(),
            cacheable: true
        })
    ],
    [
        "check_network_status",
        capability({
            name: "check_network_status",
            description:
                "Check internet connectivity, API reachability, and network latency.",
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                checkNetworkStatus(),
            cacheable: false
        })
    ],
    [
        "get_jason_health",
        capability({
            name: "get_jason_health",
            description:
                "Check Jason's database, memory, providers, services, and runtime health.",
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                getJasonHealth(),
            cacheable: false
        })
    ],
    [
    "list_capabilities",
    capability({
        name: "list_capabilities",
        description:
            "List Jason's currently available capabilities.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getCapabilitySummary(),
        cacheable: true
    })
    ],
    [
    "get_network_details",
    capability({
        name: "get_network_details",
        description:
            "Execute fixed, read-only Windows network commands and report the Wi-Fi connection, IP configuration, DNS, gateway, and adapter status.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getNetworkDetails(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "check_internet_connection",
    capability({
        name: "check_internet_connection",
        description:
            "Execute a read-only Windows ping command to check basic internet connectivity.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            checkInternetConnection(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "check_dns_resolution",
    capability({
        name: "check_dns_resolution",
        description:
            "Execute a read-only Windows DNS lookup to verify that domain names resolve correctly.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            checkDnsResolution(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_tailscale_status",
    capability({
        name: "get_tailscale_status",
        description:
            "Execute the read-only Tailscale status command and report the private VPN connection state and connected devices.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getTailscaleStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_tailscale_ips",
    capability({
        name: "get_tailscale_ips",
        description:
            "Execute the read-only Tailscale IP command and report this computer's private Tailscale addresses.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getTailscaleIps(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_disk_space",
    capability({
        name: "get_disk_space",
        description:
            "Execute a read-only Windows command to report available and used disk space.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getDiskSpace(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_running_processes",
    capability({
        name: "get_running_processes",
        description:
            "Execute a read-only Windows command to list currently running processes.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getRunningProcesses(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_battery_status",
    capability({
        name: "get_battery_status",
        description:
            "Execute a read-only Windows command to report the computer's battery status and charge level.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getBatteryStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_windows_updates_status",
    capability({
        name: "get_windows_updates_status",
        description:
            "Execute a read-only Windows command to list installed Windows updates and update dates.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getWindowsUpdatesStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_firewall_status",
    capability({
        name: "get_firewall_status",
        description:
            "Execute a read-only Windows command to report the firewall status profile and default action.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getFirewallStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_windows_defender_status",
    capability({
        name: "get_windows_defender_status",
        description:
            "Execute a read-only Windows command to report the Windows Defender protection status and health.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getWindowsDefenderStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_installed_programs",
    capability({
        name: "get_installed_programs",
        description:
            "Execute a read-only Windows registry query to list installed programs on the machine.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getInstalledPrograms(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_event_logs",
    capability({
        name: "get_event_logs",
        description:
            "Execute a read-only Windows event log query and report recent error or warning entries from a chosen log.",
        parameters: {
            type: "OBJECT",
            properties: {
                logName: {
                    type: "STRING",
                    description: "Windows log name such as System, Application, Security"
                },
                maxEvents: {
                    type: "NUMBER",
                    description: "Maximum event entries to return, typically 10 to 100"
                }
            }
        },
        execute: ({ logName = "System", maxEvents = 25 }) =>
            getEventLogs({ logName, maxEvents }),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_services_status",
    capability({
        name: "get_services_status",
        description:
            "Execute a read-only Windows service query to report running, stopped, or disabled services.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getServicesStatus(),
        cacheable: false,
        mutating: false
    })
    ],
    [
    "get_nearby_wifi_networks",
    capability({
        name: "get_nearby_wifi_networks",
        description:
            "Execute a read-only Windows command to list nearby Wi‑Fi networks visible to this computer.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getNearbyWifiNetworks(),
        cacheable: false,
        mutating: false
    })
    ],
        [
        "open_or_run_file",
        capability({
            name: "open_or_run_file",
            description:
                "Open a file with its default application (pdf, docx, xlsx, pptx, html, images, " +
                "text, etc.) or run a script (.py, .js) and return its output. " +
                "Accepts a full path such as C:\\Users\\me\\Documents\\report.pdf, " +
                "or a path relative to the project folder. " +
                "Use this whenever the user asks to open or run a file.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description: "Full path, or path relative to the project folder"
                    },
                    action: {
                        type: "STRING",
                        enum: ["open", "run"],
                        description:
                            "Optional. 'run' executes .py/.js and returns the output; " +
                            "'open' uses the default app. If omitted, scripts run and " +
                            "everything else opens."
                    }
                },
                required: ["filePath"]
            },
            prepare: prepareOpenOrRunFile,
            execute: ({ filePath, action }) =>
                openOrRunFile({ filePath, action }),
            cacheable: false,
            mutating: true,
            requiresApproval: true
        })
    ],
        [
    "get_current_wifi_password",
    capability({
        name: "get_current_wifi_password",
        description:
            "Read the saved password of the Wi-Fi network this computer is currently connected to. " +
            "Only use this when the user explicitly asks for their current Wi-Fi password.",
        parameters: {
            type: "OBJECT",
            properties: {}
        },
        execute: () =>
            getCurrentWifiPassword(),
        cacheable: false,
        mutating: false
    })
    ],
        [
        "read_document",
        capability({
            name: "read_document",
            description:
                "Read the text of a document: PDF, Word (.docx), PowerPoint (.pptx), " +
                "Excel (.xlsx, .xls), or a text/code file (txt, md, csv, json, py, js, html). " +
                "Use this when the user asks to read, summarize, or answer questions about a file, " +
                "or when a message says a file was attached (it gives the saved path). " +
                "Accepts a full path. Long documents come back in parts: if truncated is true, " +
                "call again with startChar set to nextStartChar. " +
                "Old .doc and .ppt files are not supported.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description: "Full path to the file"
                    },
                    startChar: {
                        type: "NUMBER",
                        description: "Optional. Where to start reading, for continuing a long document. Default 0."
                    },
                    maxChars: {
                        type: "NUMBER",
                        description: "Optional. How many characters to return. Default 20000, max 40000."
                    }
                },
                required: ["filePath"]
            },
            execute: ({ filePath, startChar, maxChars }) =>
                readDocument({ filePath, startChar, maxChars }),
            cacheable: false,
            mutating: false
        })
    ],
    
]);

export function getToolDefinitions() {
    return [
        {
            functionDeclarations: [
                ...capabilities.values()
                    .map(item => item.definition)
            ]
        }
    ];
}

export function getCapability(name) {
    return capabilities.get(name) || null;
}
export function getCapabilitySummary() {
    return [...capabilities.values()].map(item => ({
        name: item.name,
        description: item.definition.description,
        mutating: item.mutating
    }));
}

export function isCacheable(name) {
    return getCapability(name)?.cacheable === true;
}

export function isMutating(name) {
    return getCapability(name)?.mutating === true;
}

export async function executeCapability(name, args = {}) {
    const item = getCapability(name);

    if (!item) {
        throw new Error(`Unknown capability: ${name}`);
    }

    return item.execute(args);
}

