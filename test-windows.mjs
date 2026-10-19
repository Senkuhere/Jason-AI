// Quick manual test: node test-windows.mjs
import { listWindows } from "./utility_tools/computer-control.js";

// Measure how long the whole call takes
const startedAt = Date.now();
const result = await listWindows();

// Show the windows as a table
console.table(
    result.windows.map(w => ({
        app: w.app,
        title: String(w.title).slice(0, 45),
        state: w.state,
        active: w.active,
        x: w.left,
        y: w.top,
        width: w.width,
        height: w.height
    }))
);

console.log(`${result.count} windows in ${Date.now() - startedAt} ms`);