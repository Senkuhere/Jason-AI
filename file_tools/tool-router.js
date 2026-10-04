import {
    createFolderDirectory,
    readProjectFile,
    writeProjectFile,
    appendProjectFile,
    editProjectFile,
    listProjectDirectory,

} from "./file-tool.js";

import {
    calculator,
    getCurrentDate
 } from "../utility_tools/utility.js";

export async function executeTool(name, args) {
    if (name === "read_project_file") {
        return readProjectFile(args.filePath);
    }
    if (name === "write_project_file") {
        return writeProjectFile(args.filePath, args.content);
    }
    if (name === "create_folder_directory") {
        return createFolderDirectory(args.directoryPath);
    }
    if (name === "edit_project_file") {
    return editProjectFile(
        args.filePath,
        args.oldText,
        args.newText
    );
    }
    if (name === "append_project_file") {
    return appendProjectFile(
        args.filePath,
        args.content
    );
    }
    if (name === "list_project_directory") {
    return listProjectDirectory(
        args.directoryPath,
        args.recursive
    );
    }
    if (name === "calculator") {
    return calculator(args.expression);
    }
    if (name === "get_current_date") {
    return getCurrentDate();
    }

    throw new Error(`Unknown tool: ${name}`);
}

