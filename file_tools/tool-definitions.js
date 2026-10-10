export const toolDefinitions = [
    {
        functionDeclarations: [
            // Read file tool
            {
                name: "read_project_file",
                description: "Read a text file inside the Jason project.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        filePath: {
                            type: "STRING",
                            description: "Project-relative path, such as memory.js"
                        }
                    },
                    required: ["filePath"]
                }
            },
            // Write file tool
            {
            name: "write_project_file",
            description: "Write text content to a file inside the Jason project.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description: "Project-relative path, such as notes.txt"
                    },
                    content: {
                        type: "STRING",
                        description: "The complete text content to write"
                    }
                },
                required: ["filePath", "content"]
            }
        },
        // Create folder tool
        {
            name: "create_folder_directory",
            description: "Create a directory inside the Jason project. Parent directories are created automatically.",
            parameters: {
                type: "OBJECT",
                properties: {
                    directoryPath: {
                        type: "STRING",
                        description: "Project-relative directory path, such as website/assets"
                    }
                },
                required: ["directoryPath"]
            }
        },
        // Edit file tool
        {
            name: "edit_project_file",
            description: "Replace one exact section of an existing project file without overwriting unrelated content.",
            parameters: {
                type: "OBJECT",
                properties: {
                    filePath: {
                        type: "STRING",
                        description: "Project-relative path of the file to edit"
                    },
                    oldText: {
                        type: "STRING",
                        description: "The exact existing text to replace"
                    },
                    newText: {
                        type: "STRING",
                        description: "The replacement text"
                    }
                },
                required: ["filePath", "oldText", "newText"]
            }
        },
        // Append file tool
        {
        name: "append_project_file",
        description: "Append text to the end of an existing project file without replacing its current contents.",
        parameters: {
            type: "OBJECT",
            properties: {
                filePath: {
                    type: "STRING",
                    description: "Project-relative path of the file to modify"
                },
                content: {
                    type: "STRING",
                    description: "Text to append to the end of the file"
                }
            },
            required: ["filePath", "content"]
        }
    },
    // List directory tool
    {
    name: "list_project_directory",
    description: "List files and subdirectories inside a project directory. Use recursive true to inspect nested directories.",
    parameters: {
        type: "OBJECT",
        properties: {
            directoryPath: {
                type: "STRING",
                description: "Project-relative directory path. Use '.' for the project root."
            },
            recursive: {
                type: "BOOLEAN",
                description: "Whether to include files and directories inside nested subdirectories."
            }
        },
        required: ["directoryPath", "recursive"]
    }
},
// Calculator tool for basic arithmetic operations
{
    name: "calculator",
    description: "Perform basic arithmetic calculations using numbers, parentheses, and arithmetic operators.",
    parameters: {
        type: "OBJECT",
        properties: {
            expression: {
                type: "STRING",
                description: "A mathematical expression such as (25 * 4) + 10"
            }
        },
        required: ["expression"]
    }
},
// Current date tool
{
    name: "get_current_date",
    description: "Get the current date and time in the user's timezone.",
    parameters: {
        type: "OBJECT",
        properties: {}
    }
},
// Weather tool
{
    name: "get_weather",
    description: "Get the current weather for a city or location.",
    parameters: {
        type: "OBJECT",
        properties: {
            query: {
                type: "STRING",
                description: "A city or location, such as Manila or Cebu City."
            }
        },
        required: ["query"]
    }
},
// Web search tool
{
    name: "search_web",
    description: "Search the web for current information or an exact webpage, song, video, or other media. For media requests, return precise matching results and prefer official sources.",
    parameters: {
        type: "OBJECT",
        properties: {
            query: {
                type: "STRING",
                description: "A precise web search query."
            },
            maxResults: {
                type: "NUMBER",
                description: "Maximum number of results to return, from 1 to 10."
            }
        },
        required: ["query"]
    }
},
{
    name: "open_web_page",
    description:
        "Open a webpage in the user's default browser. Use this when the user wants to view a specific webpage or a useful URL returned by search_web.",
    parameters: {
        type: "OBJECT",
        properties: {
            url: {
                type: "STRING",
                description:
                    "The complete http or https URL to open."
            }
        },
        required: ["url"]
    }
}
        ]
    }
];