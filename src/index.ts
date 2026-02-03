#!/usr/bin/env bun
/**
 * miniclawd - TypeScript version of nanobot
 *
 * A personal AI assistant with multi-channel support.
 */

import { createProgram } from "./cli/commands.js";

const program = createProgram();
program.parse();
