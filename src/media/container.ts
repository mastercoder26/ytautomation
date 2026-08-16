import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { runProcess, type ProcessOptions, type ProcessResult } from "./process.js";

export type MediaContainerConfig = {
  runtime: "docker" | "podman";
  image: string;
};

const PINNED_IMAGE = /^(?:[a-zA-Z0-9._/:@-]+@)?sha256:[a-f0-9]{64}$/;
const COMMAND = /^[a-zA-Z0-9._-]+$/;

const assertPinnedImage = (image: string): void => {
  if (!PINNED_IMAGE.test(image)) {
    throw new Error("Container image must be pinned by sha256 digest");
  }
};

const mapJobPath = (value: string, jobRoot: string): string => {
  const canonicalRoot = resolve(jobRoot);
  const escapedRoot = canonicalRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escapedRoot, "g"), "/job");
};

export const createMediaContainerRunner = (
  config: MediaContainerConfig,
  jobRoot: string,
  runner: typeof runProcess = runProcess
): ((command: string, args: readonly string[], options: ProcessOptions) => Promise<ProcessResult>) => {
  assertPinnedImage(config.image);
  const canonicalRoot = resolve(jobRoot);

  return async (command, args, options) => {
    if (!COMMAND.test(command)) throw new Error("Native media command must be a container command name");
    const mappedArgs = args.map((argument) => mapJobPath(argument, canonicalRoot));
    const containerName = `brandpreflight-media-${randomUUID()}`;
    const wallTimeSeconds = Math.max(1, Math.floor(options.timeoutMs / 1_000) - 1);
    const containerArgs = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--network",
      "none",
      "--read-only",
      "--memory",
      "1024m",
      "--memory-swap",
      "1024m",
      "--cpus",
      "2",
      "--pids-limit",
      "64",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      `${process.getuid?.() ?? 65534}:${process.getgid?.() ?? 65534}`,
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--mount",
      `type=bind,src=${canonicalRoot},dst=/job,rw`,
      config.image,
      "/usr/bin/timeout",
      "--signal=KILL",
      `${wallTimeSeconds}s`,
      command,
      ...mappedArgs
    ];
    const { cwd: _ignoredCwd, ...boundedOptions } = options;
    return runner(config.runtime, containerArgs, {
      ...boundedOptions,
      terminationCleanup: {
        command: config.runtime,
        args: ["rm", "--force", containerName]
      },
      env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" }
    });
  };
};

export const buildPdfContainerInvocation = (
  config: MediaContainerConfig
): {
  command: string;
  args: string[];
  terminationCleanup: { command: string; args: string[] };
} => {
  assertPinnedImage(config.image);
  const containerName = `brandpreflight-pdf-${randomUUID()}`;
  return {
    command: config.runtime,
    terminationCleanup: {
      command: config.runtime,
      args: ["rm", "--force", containerName]
    },
    args: [
      "run",
      "--rm",
      "--interactive",
      "--name",
      containerName,
      "--network",
      "none",
      "--read-only",
      "--memory",
      "512m",
      "--memory-swap",
      "512m",
      "--cpus",
      "1",
      "--pids-limit",
      "32",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      `${process.getuid?.() ?? 65534}:${process.getgid?.() ?? 65534}`,
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=32m",
      config.image,
      "/usr/bin/timeout",
      "--signal=KILL",
      "25s",
      "node",
      "--max-old-space-size=256",
      "--permission",
      "--allow-addons",
      "--allow-fs-read=/app/dist/brief",
      "--allow-fs-read=/app/node_modules",
      "--allow-fs-read=/app/package.json",
      "/app/dist/brief/pdf-worker.js"
    ]
  };
};
