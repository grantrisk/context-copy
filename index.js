#!/usr/bin/env node
// tells the system to execute this file with Node.js.

import { program } from "commander";
import path from "path";
import { main } from "./src/main.js";

program
    .name("context-copy")
    .version("1.0.0")
    .description("A CLI to aggregate and copy project file contents for LLM context.")
    .argument("[project-path]", "The path to the project directory", ".")
    .option(
        "-i, --ignore-file <path>",
        "Path to a custom ignore file (e.g., .contextignore)",
        ".contextignore"
    )
    .action(async (projectPath, options) => {
        // Resolve the full path to ensure consistency
        const fullPath = path.resolve(projectPath);
        await main(fullPath, options);
    });

program.parse(process.argv);
