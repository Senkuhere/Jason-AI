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
    ]
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