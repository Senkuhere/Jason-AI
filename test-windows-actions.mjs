// Manual test of the window tools. Examples:
//   node test-window-actions.mjs screen
//   node test-window-actions.mjs notepad minimize
//   node test-window-actions.mjs notepad restore
//   node test-window-actions.mjs notepad move 0 0 960 1000
import { windowAction, getScreenInfo, stopWindowHelper } from "./utility_tools/computer-control.js";

// Words after the file name: target, action, then optional x y width height
const [, , target, action, x, y, width, height] = process.argv;

// Turns "960" into the number 960, and leaves missing values undefined
const number = value => (value === undefined ? undefined : Number(value));

const startedAt = Date.now();

if (target === "screen") {
    // Show the monitors
    console.log(JSON.stringify(await getScreenInfo(), null, 2));
} else {
    // Do the action and print what Jason would receive back
    console.log(
        await windowAction({
            target,
            action,
            x: number(x),
            y: number(y),
            width: number(width),
            height: number(height)
        })
    );
}

console.log(`done in ${Date.now() - startedAt} ms`);
stopWindowHelper();