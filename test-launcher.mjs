// Quick manual test: node test-launch.mjs "name of an app"
import { launchApp } from "./utility_tools/computer-control.js";

// Uses the name you type after the file name (default: notepad)
const result = await launchApp(process.argv[2] || "notepad");

// Prints what Jason would receive back from the tool
console.log(result);