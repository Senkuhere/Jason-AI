export const toolDefinitions = [
    {
        functionDeclarations: [
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
            }
        ]
    }
];