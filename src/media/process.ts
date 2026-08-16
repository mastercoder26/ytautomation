import { spawn } from "node:child_process";

export type ProcessOptions = {
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  stdin?: string | Uint8Array;
  env?: NodeJS.ProcessEnv;
};

export type ProcessResult = { stdout: string; stderr: string; exitCode: number };

export const safeNativeEnvironment = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  TMPDIR: process.env.TMPDIR ?? "",
  LANG: process.env.LANG ?? "C",
  LC_ALL: "C"
});

export class ProcessExecutionError extends Error {
  readonly code: "TIMEOUT" | "OUTPUT_LIMIT" | "NON_ZERO_EXIT" | "SPAWN_FAILED";
  readonly stderr: string;

  constructor(code: ProcessExecutionError["code"], message: string, stderr = "") {
    super(message);
    this.name = "ProcessExecutionError";
    this.code = code;
    this.stderr = stderr;
  }
}

export const runProcess = (
  command: string,
  args: readonly string[],
  options: ProcessOptions
): Promise<ProcessResult> =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], {
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      ...(options.env ? { env: options.env } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {})
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const terminate = (): void => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // Fall back to killing the direct child below.
        }
      }
      child.kill("SIGKILL");
    };

    const settleError = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      terminate();
      rejectPromise(error);
    };

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > options.maxOutputBytes) {
        settleError(new ProcessExecutionError("OUTPUT_LIMIT", "Process output exceeded the configured limit"));
      }
      return next;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.stdin.end(options.stdin);
    child.on("error", (error) => {
      settleError(new ProcessExecutionError("SPAWN_FAILED", `Unable to start process: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitCode !== 0) {
        rejectPromise(
          new ProcessExecutionError("NON_ZERO_EXIT", `Process exited with code ${exitCode ?? -1}`, stderr)
        );
        return;
      }
      resolvePromise({ stdout, stderr, exitCode: 0 });
    });

    const timeout = setTimeout(() => {
      settleError(new ProcessExecutionError("TIMEOUT", "Process timed out"));
    }, options.timeoutMs);
    timeout.unref();
  });
