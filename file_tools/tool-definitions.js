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
}
        ]
    }
];