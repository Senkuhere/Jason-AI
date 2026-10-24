import {
    createFolderDirectory,
    readProjectFile,
    writeProjectFile,
    appendProjectFile,
    editProjectFile,
    listProjectDirectory
} from "./file_tools/file-tool.js";

import { findFiles, 
         openFolder 
} from "./file_tools/file-finder.js";

import {
    calculator,
    getCurrentDate,
    getWeather,
    searchWeb,
    openWebPage,
    searchAndOpen
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
    openOrRunFile,
    launchApp,
    listWindows,
    getScreenInfo,
    windowAction,
    mediaControl,
    systemControl,
    keyboardInput
} from "./utility_tools/computer-control.js";

import { lookAtScreen 
} from "./utility_tools/screen-vision.js";

import { readDocument } from "./file_tools/document-reader.js";

import { setInitiativeSettings } from "./initiative.js";

import { addNote, 
         listNotes, 
         completeNote, 
         deleteNote, 
         resolveDueTime, 
         formatManila 
} from "./notes.js";

function capability({
    name,
    description,
    parameters,
    execute,
    cacheable = false,
    mutating = false,
    instantReply = null
}) {
    // Tools that can end a request with an instant reply get one extra optional argument.
    // The model sets it when the user's request still needs more actions after this one,
    // which stops the instant reply from ending the request too early.
        const finalParameters = instantReply
        ? {
            type: "OBJECT",
            ...parameters,
            properties: {
                ...(parameters?.properties || {}),
                completesRequest: {
                    type: "BOOLEAN",
                    description:
                        "Set true on the LAST call you make in a response when, once it is done, nothing more " +
                        "is needed for the user's message. If more actions are still needed afterwards " +
                        "(for example 'open Notepad and type a list', where the next response types), set false. " +
                        "Earlier calls in the same response can be left false."
                }
            },
            // Required, so the model must decide on every call instead of forgetting
            required: [...(parameters?.required || []), "completesRequest"]
        }
        : parameters;

    return {
        name,
        definition: {
            name,
            description,
            parameters: finalParameters
        },
        execute,
        cacheable,
        mutating,
        instantReply
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
                "Calculate a mathematical expression. Use this for ALL arithmetic, even simple sums, " +
                "and never work it out yourself. Pass the expression as the user wrote it. " +
                "Supports + - * / % ^ and parentheses, plus sqrt, cbrt, abs, round, floor, ceil, " +
                "sin, cos, tan, log (base 10), ln, exp, pow, min, max, pi, and e.",
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
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence telling the user what you are opening, " +
                            "in your own words and voice. For example: \"Playing Panaginip by Nicole, Sir.\""
                    }
                },
                required: ["url", "say"]
            },
            execute: ({ url }) =>
                openWebPage(url),
            mutating: true,
            instantReply: (args, result) => {
                if (typeof args.say === "string" && args.say.trim()) {
                    return args.say.trim();
                }

                try {
                    const host = new URL(result?.url || args.url)
                        .hostname.replace(/^www\./, "");
                    return `Opening ${host}, Sir.`;
                } catch {
                    return "Opening it, Sir.";
                }
            }
        })
    ],
    [
    "search_and_open",
    capability({
        name: "search_and_open",
        description:
            "Search the web and immediately open the top result in the browser, in one step. " +
            "Use this when the user wants to play, watch, or open something and you do not know the exact URL " +
            "(a song, a video, a page). Optionally pass a site domain such as youtube.com to restrict the search. " +
            "For questions that need information, use search_web instead.",
        parameters: {
            type: "OBJECT",
            properties: {
                query: { type: "STRING", description: "What to search for" },
                site: { type: "STRING", description: "Optional domain to restrict to, e.g. youtube.com" },
                say: { type: "STRING", description: "One short, natural sentence about what you are opening, in your own voice." }
            },
            required: ["query", "say"]
        },
        execute: ({ query, site }) => searchAndOpen(query, site),
        mutating: true,
        // Also say which page was really opened, since the top search result is not always what the user meant
                    // The page title is only mentioned when it does not look like what was asked for
        instantReply: (args, result) => {
            const intro = (typeof args.say === "string" && args.say.trim()) || "Opening it, Sir.";

            return result?.title && result.matchesQuery === false
                ? `${intro} I opened "${result.title}", which may not be what you meant, Sir.`
                : intro;
            }
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
                            
                    },
                    say: {
                        type: "STRING",
                        description: 
                            "One or two short, natural sentences telling the user what you opened or started, " +
                            "in your own words and voice. If you chose it yourself, name your pick and give a short reason " +
                            "(for example: \"I picked Snake, Sir. It is quick to start and good for a short break.\")."
                    }
                },
                required: ["filePath", "say"]
            },
            prepare: prepareOpenOrRunFile,
            execute: ({ filePath, action }) =>
                openOrRunFile({ filePath, action }),
            cacheable: false,
            mutating: true,
            requiresApproval: true,
            instantReply: (args, result) => {
                const say = typeof args.say === "string" ? args.say.trim() : "";
                const name = String(args.filePath || "").split(/[\\/]/).filter(Boolean).slice(-2).join("/");

                if (result?.execution?.action === "open" || result?.execution?.action === "run") {
                    return say || `Opened ${name}, Sir.`;
                }

                if (result?.running === true) {
                    return say || `${name} is running, Sir.`;
                }

                return null; // a finished script: Jason reads the output to you
            }
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
        [
        "launch_app",
        capability({
            name: "launch_app",
            // Telling the model to use full names means common apps launch on the first try
            description:
                "Start an installed application by name. Use the app's full official name when you " +
                "know it (for example Google Chrome, Visual Studio Code, Microsoft Word, Spotify). " +
                "If the result lists candidates, pick the right one and call again, or ask the user.",
            parameters: {
                type: "OBJECT",
                properties: {
                    // The app to start
                    name: {
                        type: "STRING",
                        description: "The application's name"
                    },
                    // The confirmation Jason speaks, written by the model so it is never canned
                    say: {
                        type: "STRING",
                        description:
                            "One or two short, natural sentences telling the user what you are starting, " +
                            "in your own words and voice."
                    }
                },
                required: ["name", "say"]
            },
            execute: ({ name }) =>
                launchApp(name),
            mutating: true,
            // Only used when the app really started; failures go back to the model
            instantReply: (args, result) => {
                const say = typeof args.say === "string" ? args.say.trim() : "";
                return say || `Opening ${result?.execution?.app || args.name}, Sir.`;
            }
        })
    ],
        [
        "list_windows",
        capability({
            name: "list_windows",
            description:
                "List the windows that are open right now: the program name, window title, " +
                "state (normal, minimized, maximized), position, size, and which one is active. " +
                "Use this to see what the user has open or to find a window by app name.",
            // Takes no arguments, the same way get_current_date does
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                listWindows(),
            // Read-only, and the answer changes all the time, so never reuse an old result
            cacheable: false,
            mutating: false
        })
    ],
    /* Disabled: Jason reads the monitor layout from the screen summary in his context.
    Remove these comment marks to bring the tool back.
        [
        "get_screen_info",
        capability({
            name: "get_screen_info",
            description:
                "Get the size of each monitor and its work area (the usable area without the taskbar), " +
                "in screen pixels. The same information is normally already in your context on the " +
                "Monitors line, so only call this if that line is missing.",
            // Takes no arguments, like list_windows
            parameters: {
                type: "OBJECT",
                properties: {}
            },
            execute: () =>
                getScreenInfo(),
            // Read-only; the layout can change when monitors are connected, so never reuse old answers
            cacheable: false,
            mutating: false
        })
    ],
    */
    [
        "window_action",
        capability({
            name: "window_action",
            description:
                "To move or resize, give x, y, width, height in screen pixels, using the work area from the " +
                "Monitors line in your context.",
            parameters: {
                type: "OBJECT",
                properties: {
                    // Which window: by name...
                    target: {
                        type: "STRING",
                        description: "App name or part of the window title, as shown by list_windows"
                    },
                    // ...or exactly, when several windows match
                    handle: {
                        type: "NUMBER",
                        description: "Exact window handle from list_windows or from a candidates list"
                    },
                    // What to do
                    action: {
                        type: "STRING",
                        enum: ["focus", "minimize", "maximize", "restore", "close", "move"],
                        description: "What to do with the window"
                    },
                    // Placement (only for action = move). Any value left out stays unchanged.
                    x: { type: "NUMBER", description: "Left edge in screen pixels (move only)" },
                    y: { type: "NUMBER", description: "Top edge in screen pixels (move only)" },
                    width: { type: "NUMBER", description: "Width in pixels (move only)" },
                    height: { type: "NUMBER", description: "Height in pixels (move only)" },
                    // The confirmation Jason speaks, written by the model so it is never canned
                    say: {
                        type: "STRING",
                        description:
                            "One or two short, natural sentences telling the user what you did, " +
                            "in your own words and voice."
                    }
                },
                required: ["action", "say"]
            },
            execute: ({ target, handle, action, x, y, width, height }) =>
                windowAction({ target, handle, action, x, y, width, height }),
            mutating: true,
            // Used only when the action worked; problems and choices go back to the model
            instantReply: (args, result) => {
                const say = typeof args.say === "string" ? args.say.trim() : "";
                return say || `Done, Sir. ${result?.message ?? ""}`.trim();
            }
        })
    ],
        [
        "media_control",
        capability({
            name: "media_control",
            description:
                "Control media playback and the system volume for whatever is playing " +
                "(Spotify, YouTube in the browser, and so on). Keys: play_pause (pause or resume), " +
                "next, previous, stop, mute (toggles), volume_up, volume_down, set_volume. " +
                "For volume_up and volume_down, amount is the percent to change (default 10). " +
                "For set_volume, amount is the target from 0 to 100.",
            parameters: {
                type: "OBJECT",
                properties: {
                    key: {
                        type: "STRING",
                        enum: ["play_pause", "next", "previous", "stop", "mute", "volume_up", "volume_down", "set_volume"],
                        description: "What to do"
                    },
                    amount: {
                        type: "NUMBER",
                        description: "Percent, for the volume keys only"
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence telling the user what you did, in your own words and voice."
                    }
                },
                required: ["key", "say"]
            },
            execute: ({ key, amount }) =>
                mediaControl({ key, amount }),
            mutating: true,
            instantReply: (args) =>
                (typeof args.say === "string" && args.say.trim()) || "Done, Sir."
        })
    ],
        [
        "system_control",
        capability({
            name: "system_control",
            description:
                "Control the computer itself. Actions: lock (lock the screen), sleep, " +
                "shutdown and restart (both start a 30 second countdown that can be cancelled), " +
                "cancel_shutdown (stop a pending shutdown or restart), " +
                "set_brightness (value 0 to 100, built-in laptop screens only), " +
                "set_theme (value dark or light).",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: {
                        type: "STRING",
                        enum: ["lock", "sleep", "shutdown", "restart", "cancel_shutdown", "set_brightness", "set_theme"],
                        description: "What to do"
                    },
                    value: {
                        type: "STRING",
                        description:
                            "For set_brightness: a number from 0 to 100. For set_theme: dark or light. Not used otherwise."
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence telling the user what you did, in your own words and voice."
                    }
                },
                required: ["action", "say"]
            },
            execute: ({ action, value }) =>
                systemControl({ action, value }),
            mutating: true,
            instantReply: (args) =>
                (typeof args.say === "string" && args.say.trim()) || "Done, Sir."
        })
    ],
        [
        "find_files",
        capability({
            name: "find_files",
            description:
                "Search for files and folders by NAME in the user's Desktop, Documents, Downloads, " +
                "Pictures, Music, and Videos folders. It searches names only, never file contents. " +
                "Use it when the user mentions a file or folder and you do not have its exact path. " +
                "Use a few distinctive words from the name, not a whole sentence. " +
                "To find files by type, pass extension (for example pdf) with or without a query. " +
                "Returns up to 15 matches, best name match first, then newest. " +
                "Afterwards use open_or_run_file or read_document with the returned path, " +
                "or open_folder to show it in File Explorer. " +
                "If nothing is found, say which folders were searched and ask for another name or the full path.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description: "Words from the file or folder name, for example: resume or budget 2026"
                    },
                    type: {
                        type: "STRING",
                        enum: ["file", "folder", "any"],
                        description: "Only files, only folders, or either. Default any."
                    },
                    extension: {
                        type: "STRING",
                        description: "Optional file extension such as pdf, docx, mp3"
                    },
                    folder: {
                        type: "STRING",
                        description: "Optional: limit the search to Desktop, Documents, Downloads, Pictures, Music, or Videos"
                    }
                }
            },
            execute: ({ query, type, extension, folder }) =>
                findFiles({ query, type, extension, folder }),
            cacheable: false,
            mutating: false
        })
    ],
    [
        "open_folder",
        capability({
            name: "open_folder",
            description:
                "Open a folder in File Explorer, or show a file highlighted inside its folder. " +
                "Accepts a full path, or one of these names: Desktop, Documents, Downloads, Pictures, Music, Videos. " +
                "Only works inside those folders and the project folder. " +
                "To open a file itself, use open_or_run_file instead.",
            parameters: {
                type: "OBJECT",
                properties: {
                    folderPath: {
                        type: "STRING",
                        description: "A folder name such as Downloads, or a full path to a folder or file"
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence telling the user what you opened, in your own words and voice."
                    }
                },
                required: ["folderPath", "say"]
            },
            execute: ({ folderPath }) =>
                openFolder({ folderPath }),
            mutating: true,
            instantReply: (args) =>
                (typeof args.say === "string" && args.say.trim()) || "Opened it, Sir."
        })
    ],
        [
        "look_at_screen",
        capability({
            name: "look_at_screen",
            description:
                "Take a screenshot and answer a question about what is visible on it. " +
                "Use this whenever the user asks what is on the screen, what an error says, " +
                "what is playing or shown, or anything about the contents of a window. " +
                "The window list in your context only has titles, not contents. " +
                "A separate vision step sees only the picture and your question, so write the question " +
                "in full (for example: 'What error message is shown, and what does it say?'). " +
                "target: screen (the main monitor, default), all_screens, or window " +
                "(then give windowName, or handle from list_windows; it is brought to the front first). " +
                "Use detail high only when text is very small. " +
                "Do not look at the screen unless the question needs it.",
            parameters: {
                type: "OBJECT",
                properties: {
                    question: {
                        type: "STRING",
                        description: "A complete question about what is on the screen"
                    },
                    target: {
                        type: "STRING",
                        enum: ["screen", "all_screens", "window"],
                        description: "What to capture. Default screen."
                    },
                    windowName: {
                        type: "STRING",
                        description: "For target window: the app name or part of the title"
                    },
                    handle: {
                        type: "NUMBER",
                        description: "For target window: an exact window handle from list_windows"
                    },
                    detail: {
                        type: "STRING",
                        enum: ["normal", "high"],
                        description: "high for very small text. Default normal."
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence saying you are about to look, in your own voice."
                    }
                },
                required: ["question", "say"]
            },
            execute: ({ question, target, windowName, handle, detail }) =>
                lookAtScreen({ question, target, windowName, handle, detail }),
            cacheable: false,
            // True because a window capture can bring that window forward, and it also stops
            // the same capture from being repeated over and over in one request
            mutating: true,
            // The vision answer is already written for the user, so no second model call is needed.
            // If you later want Jason to act on what he sees, delete this line.
            instantReply: (args, result) => result?.answer || null
        })
    ],
        /*[
        "keyboard_input",
        capability({
            name: "keyboard_input",
            description:
                "Type text, or press keys, in an open program, as if the user were using the keyboard. " +
                "action type: types the text (set pressEnter true to also press Enter, for search boxes and chat fields). " +
                "action press: presses a key or combination such as enter, tab, esc, f5, ctrl+s, ctrl+shift+t, " +
                "alt+left, or an arrow key; times repeats it (up to 20). " +
                "You must name the window in target (an app name or part of the title), " +
                "or use target active only when the user says to type in the current window. " +
                "The window is brought to the front first. You cannot see where the cursor is, " +
                "so only type when the destination is clear; use look_at_screen if unsure. " +
                "Blocked: Windows-key shortcuts, Alt+F4, and typing into terminals. " +
                "Never type passwords or secrets.",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: {
                        type: "STRING",
                        enum: ["type", "press"],
                        description: "type to enter text, press for a key or key combination"
                    },
                    text: {
                        type: "STRING",
                        description: "For action type: the exact text to type"
                    },
                    keys: {
                        type: "STRING",
                        description: "For action press: a key or combination joined with +, for example ctrl+s"
                    },
                    times: {
                        type: "NUMBER",
                        description: "For action press: how many times to press it. Default 1."
                    },
                    pressEnter: {
                        type: "BOOLEAN",
                        description: 
                            "For action type: set true ONLY if the user asked to press Enter, submit, " +
                            "search, or start a new line afterwards. Default false."
                    },
                    target: {
                        type: "STRING",
                        description: "App name or part of the window title to type into, or active for the focused window"
                    },
                    handle: {
                        type: "NUMBER",
                        description: "Optional exact window handle from list_windows"
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence in the present tense saying what you are doing, " +
                            "for example 'Typing that into Notepad now, Sir.' Never say it worked or is done."
                    }
                },
                required: ["action", "target", "say"]
            },
            execute: ({ action, text, keys, times, pressEnter, target, handle }) =>
                keyboardInput({ action, text, keys, times, pressEnter, target, handle }),
            // Changes the state of a program, and stops the same input being sent twice in one request
            mutating: true,
            instantReply: (args) =>
                (typeof args.say === "string" && args.say.trim()) || "Done, Sir."
        })
    ],*/
        [
        "initiative_settings",
        capability({
            name: "initiative_settings",
            description:
                "Control how and when Jason speaks up on his own. mode: off, rare (now and then), normal " +
                "(once in a while), or chatty (fairly often). quietMinutes: stay quiet for that many minutes " +
                "(for example 60 for 'be quiet for an hour'; 0 ends quiet time). checkEveryMinutes: how often " +
                "he thinks about speaking up, in minutes (0 returns to the mode's usual rhythm). thinkNow: true " +
                "makes him think right now about something he would like to bring up on his own, using what he " +
                "knows about the user and the computer, and say it: a spontaneous remark, idea or reminder " +
                "rather than an answer to a question. Use thinkNow when the user invites him to speak up or " +
                "bring something up himself. With no arguments, it reports the current settings. Use it when " +
                "the user asks you to talk more or less, to be quiet, to stop interrupting, or asks about " +
                "these settings.",
            parameters: {
                type: "OBJECT",
                properties: {
                    mode: {
                        type: "STRING",
                        enum: ["off", "rare", "normal", "chatty"],
                        description: "How often to speak up on your own"
                    },
                    quietMinutes: {
                        type: "NUMBER",
                        description: "Stay quiet for this many minutes. 0 ends quiet time."
                    },
                    thinkNow: {
                        type: "BOOLEAN",
                        description: "Think right now about something you would like to bring up on your own, and say it"
                    },
                    checkEveryMinutes: {
                        type: "NUMBER",
                        description: "How often to think about speaking up, in minutes. 0 returns to the usual rhythm."
                    },
                }
            },
            execute: ({ mode, quietMinutes, thinkNow, checkEveryMinutes }) =>
                setInitiativeSettings({ mode, quietMinutes, thinkNow, checkEveryMinutes }),
            mutating: true,
            // The result already carries the answer, written for the user
            instantReply: (args, result) => result?.message || null
        })
    ],
        [
        "notes",
        capability({
            name: "notes",
            description:
                "Your notebook, for reminders and notes. action 'add' saves a note. Give remindInMinutes " +
                "(for example 60 for 'in an hour') or remindAt (Manila time, written YYYY-MM-DDTHH:mm) to make " +
                "it a reminder that you will tell the user when it is due. Use urgency 'high' for something " +
                "important that should be repeated until dealt with. action 'list' shows what is in the " +
                "notebook, 'done' marks a note as finished, and 'delete' removes one. For done and delete, " +
                "give the note's id, or some of its words in text. Use it whenever the user asks you to " +
                "remind them of something, to note something down, or asks what you have noted.",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: {
                        type: "STRING",
                        enum: ["add", "list", "done", "delete"],
                        description: "What to do with the notebook"
                    },
                    text: {
                        type: "STRING",
                        description: "The note itself (add), or some words of the note to find (done, delete)"
                    },
                    id: { type: "STRING", description: "The note's id, if known (done, delete)" },
                    remindInMinutes: {
                        type: "NUMBER",
                        description: "Remind the user in this many minutes (for example 60 for an hour)"
                    },
                    remindAt: {
                        type: "STRING",
                        description: "Remind the user at this Manila time, written YYYY-MM-DDTHH:mm"
                    },
                    urgency: {
                        type: "STRING",
                        enum: ["low", "normal", "high"],
                        description: "How important the note is"
                    },
                    say: {
                        type: "STRING",
                        description:
                            "One short, natural sentence confirming what you did, in your own words and voice."
                    }
                },
                required: ["action"]
            },
            execute: async ({ action, text, id, remindInMinutes, remindAt, urgency }) => {
                const execution = { type: "notes", platform: "windows" };

                if (action === "list") {
                    return { ok: true, execution, notes: await listNotes() };
                }

                if (action === "add") {
                    const dueAt = resolveDueTime({ remindInMinutes, remindAt });
                    const { note, duplicate } = await addNote({ text, urgency, dueAt, source: "user" });

                    return {
                        ok: true,
                        execution,
                        id: note.id,
                        text: note.text,
                        due: note.dueAt ? formatManila(note.dueAt) : null,
                        alreadyNoted: duplicate
                    };
                }

                if (action === "done" || action === "delete") {
                    const note = action === "done"
                        ? await completeNote(id || text)
                        : await deleteNote(id || text);

                    if (!note) {
                        return { ok: false, execution, error: "No note in the notebook matches that." };
                    }

                    return { ok: true, execution, text: note.text };
                }

                return { ok: false, execution, error: "action must be add, list, done or delete." };
            },
            mutating: true,
            // The confirmation is written by the model (the say argument); a plain one is the fallback
            instantReply: (args, result) => {
                if (args.action === "list") return null;   // the model reads the list out in its own words

                const say = typeof args.say === "string" ? args.say.trim() : "";
                if (say) return say;

                if (args.action === "add") {
                    return result?.due ? `I will remind you at ${result.due}, Sir.` : "Noted, Sir.";
                }

                return args.action === "done" ? "Marked as done, Sir." : "Removed it, Sir.";
            }
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

export function getInstantReply(name, args, result, isLastCall = true) {
    const item = getCapability(name);

    // No instant reply if the tool failed, or if the model said more steps are still needed
    // No instant reply if the tool does not support it, or if it failed
    if (!item?.instantReply || result?.ok === false) {
        return null;
    }

    // Only the LAST call of a step decides whether the whole request is finished.
    // Earlier calls in the same step were already part of that step, so their sentence just joins in.
    if (isLastCall && args?.completesRequest !== true) {
        return null;
    }

    try {
        return item.instantReply(args, result) || null;
    } catch {
        return null;
    }
}
