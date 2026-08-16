#!/usr/bin/env node
import { resolve } from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildBrandPreflightServer } from "./server.js";

const workspaceRoot = resolve(process.env.BRANDPREFLIGHT_WORKSPACE_ROOT ?? process.cwd());
const dataRoot = resolve(process.env.BRANDPREFLIGHT_DATA_DIR ?? ".brandpreflight");

void serveStdio(() =>
  buildBrandPreflightServer({
    allowedRoots: [workspaceRoot],
    dataRoot,
    ...(process.env.BRANDPREFLIGHT_FFMPEG ? { ffmpegCommand: process.env.BRANDPREFLIGHT_FFMPEG } : {}),
    ...(process.env.BRANDPREFLIGHT_FFPROBE ? { ffprobeCommand: process.env.BRANDPREFLIGHT_FFPROBE } : {}),
    ...(process.env.BRANDPREFLIGHT_WHISPER_COMMAND
      ? { whisperCommand: process.env.BRANDPREFLIGHT_WHISPER_COMMAND }
      : {}),
    ...(process.env.BRANDPREFLIGHT_WHISPER_MODEL
      ? { whisperModelPath: process.env.BRANDPREFLIGHT_WHISPER_MODEL }
      : {})
  })
);
console.error("BrandPreflight MCP server running on stdio");
