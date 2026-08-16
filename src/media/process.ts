import { spawn, spawnSync } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";

export type ProcessOptions = {
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  stdin?: string | Uint8Array;
  env?: NodeJS.ProcessEnv;
  writeBudget?: { paths: readonly string[]; maxBytes: number };
  terminationCleanup?: { command: string; args: readonly string[] };
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
  readonly code: "TIMEOUT" | "OUTPUT_LIMIT" | "WRITE_LIMIT" | "NON_ZERO_EXIT" | "SPAWN_FAILED";
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
    let budgetTimer: NodeJS.Timeout | undefined;

    const pathBytes = async (path: string): Promise<number> => {
      try {
        const stats = await lstat(path);
        if (stats.isSymbolicLink()) return 0;
        if (stats.isFile()) return stats.size;
        if (!stats.isDirectory()) return 0;
        const children = await readdir(path);
        const sizes = await Promise.all(children.map((childPath) => pathBytes(`${path}/${childPath}`)));
        return sizes.reduce((sum, size) => sum + size, 0);
      } catch {
        return 0;
      }
    };

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

    const terminateExternalResource = (): void => {
      if (!options.terminationCleanup) return;
      spawnSync(options.terminationCleanup.command, [...options.terminationCleanup.args], {
        shell: false,
        stdio: "ignore",
        timeout: 5_000,
        ...(options.env ? { env: options.env } : {})
      });
    };

    const settleError = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (budgetTimer) clearInterval(budgetTimer);
      terminate();
      terminateExternalResource();
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
      if (budgetTimer) clearInterval(budgetTimer);
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
    if (options.writeBudget) {
      let checking = false;
      budgetTimer = setInterval(() => {
        if (checking || settled) return;
        checking = true;
        void Promise.all(options.writeBudget?.paths.map(pathBytes) ?? []).then((sizes) => {
          checking = false;
          if (sizes.reduce((sum, size) => sum + size, 0) > (options.writeBudget?.maxBytes ?? 0)) {
            settleError(new ProcessExecutionError("WRITE_LIMIT", "Process exceeded the artifact write budget"));
          }
        });
      }, 100);
      budgetTimer.unref();
    }
  });
