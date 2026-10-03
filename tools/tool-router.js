import { readProjectFile } from "./file-tool.js";

export async function executeTool(name, args) {
    if (name === "read_project_file") {
        return readProjectFile(args.filePath);
    }

    throw new Error(`Unknown tool: ${name}`);
}