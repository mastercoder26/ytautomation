import { spawnSync } from "node:child_process";

const runtime = process.env.BRANDPREFLIGHT_MEDIA_RUNTIME === "podman" ? "podman" : "docker";
const tag = "brandpreflight-media:smoke";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: false,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? -1}`);
  }
  return result.stdout?.trim() ?? "";
};

run(runtime, ["build", "-f", "containers/media/Dockerfile", "-t", tag, "."]);
const image = run(runtime, ["image", "inspect", "--format", "{{.Id}}", tag], { capture: true });
if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Container runtime returned an invalid image ID");

run(
  process.execPath,
  ["./node_modules/vitest/vitest.mjs", "run", "tests/integration/pdf-container.test.ts"],
  {
    env: {
      ...process.env,
      BRANDPREFLIGHT_CONTAINER_SMOKE: "1",
      BRANDPREFLIGHT_MEDIA_RUNTIME: runtime,
      BRANDPREFLIGHT_MEDIA_IMAGE: image
    }
  }
);
