#!/usr/bin/env node
import { resolve } from "node:path";
import { homedir } from "node:os";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { buildBrandPreflightServer } from "./server.js";
import type { MediaContainerConfig } from "../media/container.js";

const workspaceRoot = resolve(process.env.BRANDPREFLIGHT_WORKSPACE_ROOT ?? process.cwd());
const dataRoot = resolve(process.env.BRANDPREFLIGHT_DATA_DIR ?? resolve(homedir(), ".brandpreflight"));
const mediaRuntime = process.env.BRANDPREFLIGHT_MEDIA_RUNTIME;
const mediaContainer: MediaContainerConfig | undefined =
  (mediaRuntime === "docker" || mediaRuntime === "podman") && process.env.BRANDPREFLIGHT_MEDIA_IMAGE
    ? { runtime: mediaRuntime, image: process.env.BRANDPREFLIGHT_MEDIA_IMAGE }
    : undefined;

void serveStdio(
  () => buildBrandPreflightServer({
    allowedRoots: [workspaceRoot],
    dataRoot,
    ...(process.env.BRANDPREFLIGHT_FFMPEG ? { ffmpegCommand: process.env.BRANDPREFLIGHT_FFMPEG } : {}),
    ...(process.env.BRANDPREFLIGHT_FFPROBE ? { ffprobeCommand: process.env.BRANDPREFLIGHT_FFPROBE } : {}),
    ...(process.env.BRANDPREFLIGHT_WHISPER_COMMAND
      ? { whisperCommand: process.env.BRANDPREFLIGHT_WHISPER_COMMAND }
      : {}),
    ...(process.env.BRANDPREFLIGHT_WHISPER_MODEL
      ? { whisperModelPath: process.env.BRANDPREFLIGHT_WHISPER_MODEL }
      : {}),
    ...(mediaContainer ? { mediaContainer } : {})
  }),
  { transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 2_500_000 }) }
);
console.error("BrandPreflight MCP server running on stdio");
