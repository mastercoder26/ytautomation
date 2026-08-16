#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { extractRequirementCandidates } from "./brief/extract.js";
import { extractPdfText } from "./brief/pdf.js";
import { buildAnalysisEnvelope } from "./byom/envelope.js";
import { issueShareApproval } from "./consent/approval.js";
import { calculateReadiness } from "./domain/scoring.js";
import { digestCampaign } from "./domain/campaign-binding.js";
import {
  campaignInputSchema,
  evidenceSchema,
  processingStatusSchema,
  reviewContextSchema,
  transcriptSegmentSchema
} from "./domain/schemas.js";
import { doctorLocalTools, prepareVideo } from "./media/prepare.js";
import { readImportedFile } from "./media/file-policy.js";
import { deleteArtifactDirectory } from "./media/artifacts.js";
import { agentFindingsSchema } from "./domain/agent-findings.js";
import { scoreReview } from "./pipeline/score-review.js";
import { serveReport } from "./reports/server.js";
import { writeReviewSession } from "./reviews/store.js";
import type { MediaContainerConfig } from "./media/container.js";

export type CliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

const defaultIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value)
};

const help = `BrandPreflight local sponsored-content QA

Commands:
  doctor
  review --brief FILE --video FILE [--root DIR] [--data-dir DIR] [--campaign-id ID] [--name NAME]
  score --review ID --input FINDINGS.json [--root DIR] [--data-dir DIR]
  open REPORT_ID [--data-dir DIR]
  skill
  approve --campaign FILE --root DIR --data-dir DIR
  brief --text FILE|--pdf FILE --campaign-id ID --name NAME --root DIR
  prepare --campaign FILE --video FILE --root DIR --data-dir DIR [--frame-interval SECONDS]
  packet --input FILE --root DIR
  score --input FILE --root DIR
  clean --artifact ID --data-dir DIR --yes true
`;

const parseFlags = (args: readonly string[]): ReadonlyMap<string, string> => {
  const entries: Array<readonly [string, string]> = [];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) throw new Error(`Invalid argument near ${flag ?? "end"}`);
    entries.push([flag.slice(2), value]);
  }
  return new Map(entries);
};

const requireFlag = (flags: ReadonlyMap<string, string>, name: string): string => {
  const value = flags.get(name);
  if (!value) throw new Error(`Missing required flag --${name}`);
  return value;
};

const printJson = (io: CliIo, value: unknown): void => {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
};

const readJson = async (path: string, root: string): Promise<unknown> => {
  const { data } = await readImportedFile(path, [root], "json");
  return JSON.parse(data.toString("utf8"));
};

const packetInputSchema = z
  .object({
    campaign: campaignInputSchema,
    transcript: z.array(transcriptSegmentSchema).max(20_000),
    visualObservations: z
      .array(
        z
          .object({
            startMs: z.number().int().min(0),
            endMs: z.number().int().min(0),
            description: z.string().trim().min(1).max(4_000)
          })
          .strict()
      )
      .max(1_000)
  })
  .strict();

const scoreInputSchema = z
  .object({
    campaign: campaignInputSchema,
    evidence: z.array(evidenceSchema).max(5_000),
    processing: processingStatusSchema.optional(),
    reviewContext: reviewContextSchema
  })
  .strict();

const configuredMediaContainer = (): MediaContainerConfig | undefined => {
  const mediaRuntime = process.env.BRANDPREFLIGHT_MEDIA_RUNTIME;
  return (mediaRuntime === "docker" || mediaRuntime === "podman") && process.env.BRANDPREFLIGHT_MEDIA_IMAGE
    ? { runtime: mediaRuntime, image: process.env.BRANDPREFLIGHT_MEDIA_IMAGE }
    : undefined;
};

const defaultDataRoot = (): string => resolve(process.env.BRANDPREFLIGHT_DATA_DIR ?? resolve(homedir(), ".brandpreflight"));

const openBrowser = (url: string): void => {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.unref();
};

export const runCli = async (argv: readonly string[], io: CliIo = defaultIo): Promise<number> => {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.stdout(help);
    return 0;
  }

  try {
    const flags = parseFlags(command === "open" ? rest.slice(1) : rest);
    if (command === "doctor") {
      const mediaContainer = configuredMediaContainer();
      printJson(
        io,
        await doctorLocalTools({
          ...(process.env.BRANDPREFLIGHT_FFMPEG ? { ffmpegCommand: process.env.BRANDPREFLIGHT_FFMPEG } : {}),
          ...(process.env.BRANDPREFLIGHT_FFPROBE ? { ffprobeCommand: process.env.BRANDPREFLIGHT_FFPROBE } : {}),
          ...(process.env.BRANDPREFLIGHT_WHISPER_COMMAND
            ? { whisperCommand: process.env.BRANDPREFLIGHT_WHISPER_COMMAND }
            : {}),
          ...(process.env.BRANDPREFLIGHT_WHISPER_MODEL
            ? { whisperModelPath: process.env.BRANDPREFLIGHT_WHISPER_MODEL }
            : {}),
          ...(process.env.BRANDPREFLIGHT_WATCH_SKILL_PATH
            ? { watchSkillPath: process.env.BRANDPREFLIGHT_WATCH_SKILL_PATH }
            : {}),
          ...(mediaContainer ? { mediaContainer } : {})
        })
      );
      return 0;
    }

    if (command === "review") {
      const briefPath = resolve(requireFlag(flags, "brief"));
      const videoPath = resolve(requireFlag(flags, "video"));
      const root = resolve(flags.get("root") ?? dirname(briefPath));
      const campaignId = flags.get("campaign-id") ?? `campaign-${Date.now().toString(36)}`;
      const name = flags.get("name") ?? basename(briefPath, extname(briefPath));
      const briefText = extname(briefPath).toLowerCase() === ".pdf"
        ? (await extractPdfText(briefPath, [root], undefined, configuredMediaContainer())).text
        : (await readImportedFile(briefPath, [root], "text")).data.toString("utf8");
      const campaign = campaignInputSchema.parse({
        campaignId,
        name,
        requirements: extractRequirementCandidates(briefText)
      });
      const session = await writeReviewSession(resolve(flags.get("data-dir") ?? defaultDataRoot()), { campaign });
      printJson(io, {
        reviewId: session.reviewId,
        requirements: campaign.requirements,
        findingsContract: {
          version: 1,
          reviewId: session.reviewId,
          findings: [],
          limitations: []
        },
        watchCommand: `/watch ${videoPath}`,
        limitations: []
      });
      return 0;
    }

    if (command === "skill") {
      const skillPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../skills/brandpreflight-review/SKILL.md"
      );
      printJson(io, { name: "brandpreflight-review", path: skillPath });
      return 0;
    }

    if (command === "approve") {
      const root = resolve(requireFlag(flags, "root"));
      const campaign = campaignInputSchema.parse(
        await readJson(requireFlag(flags, "campaign"), root)
      );
      printJson(
        io,
        await issueShareApproval(
          resolve(requireFlag(flags, "data-dir")),
          campaign.campaignId,
          digestCampaign(campaign)
        )
      );
      return 0;
    }

    if (command === "brief") {
      const textPath = flags.get("text");
      const pdfPath = flags.get("pdf");
      if (Boolean(textPath) === Boolean(pdfPath)) throw new Error("Provide exactly one of --text or --pdf");
      const sourcePath = resolve(textPath ?? pdfPath ?? "");
      const root = resolve(requireFlag(flags, "root"));
      const briefText = textPath
        ? (await readImportedFile(sourcePath, [root], "text")).data.toString("utf8")
        : (await extractPdfText(sourcePath, [root], undefined, configuredMediaContainer())).text;
      printJson(io, {
        campaignId: requireFlag(flags, "campaign-id"),
        name: requireFlag(flags, "name"),
        requirements: extractRequirementCandidates(briefText)
      });
      return 0;
    }

    if (command === "prepare") {
      const videoPath = resolve(requireFlag(flags, "video"));
      const root = resolve(requireFlag(flags, "root"));
      const campaign = campaignInputSchema.parse(
        await readJson(requireFlag(flags, "campaign"), root)
      );
      const frameInterval = flags.get("frame-interval");
      const mediaContainer = configuredMediaContainer();
      printJson(
        io,
        await prepareVideo({
          videoPath,
          campaignId: campaign.campaignId,
          campaignDigest: digestCampaign(campaign),
          allowedRoots: [root],
          dataRoot: resolve(requireFlag(flags, "data-dir")),
          ...(frameInterval ? { frameIntervalSeconds: Number(frameInterval) } : {}),
          ...(process.env.BRANDPREFLIGHT_FFMPEG ? { ffmpegCommand: process.env.BRANDPREFLIGHT_FFMPEG } : {}),
          ...(process.env.BRANDPREFLIGHT_FFPROBE ? { ffprobeCommand: process.env.BRANDPREFLIGHT_FFPROBE } : {}),
          ...(process.env.BRANDPREFLIGHT_WHISPER_COMMAND
            ? { whisperCommand: process.env.BRANDPREFLIGHT_WHISPER_COMMAND }
            : {}),
          ...(process.env.BRANDPREFLIGHT_WHISPER_MODEL
            ? { whisperModelPath: process.env.BRANDPREFLIGHT_WHISPER_MODEL }
            : {}),
          ...(mediaContainer ? { mediaContainer } : {})
        })
      );
      return 0;
    }

    if (command === "packet") {
      const input = packetInputSchema.parse(
        await readJson(requireFlag(flags, "input"), resolve(requireFlag(flags, "root")))
      );
      printJson(
        io,
        buildAnalysisEnvelope({
          requirements: input.campaign.requirements,
          transcript: input.transcript,
          visualObservations: input.visualObservations
        })
      );
      return 0;
    }

    if (command === "score") {
      if (flags.get("review")) {
        const root = resolve(flags.get("root") ?? dirname(requireFlag(flags, "input")));
        const findings = agentFindingsSchema.parse(await readJson(requireFlag(flags, "input"), root));
        const reviewId = requireFlag(flags, "review");
        if (findings.reviewId !== reviewId) throw new Error("Findings reviewId does not match --review");
        printJson(io, await scoreReview(resolve(flags.get("data-dir") ?? defaultDataRoot()), findings));
        return 0;
      }
      const input = scoreInputSchema.parse(
        await readJson(requireFlag(flags, "input"), resolve(requireFlag(flags, "root")))
      );
      printJson(
        io,
        calculateReadiness(input.campaign, input.evidence, input.processing, input.reviewContext)
      );
      return 0;
    }

    if (command === "open") {
      const reportId = rest[0];
      if (!reportId || reportId.startsWith("--")) throw new Error("Missing report ID");
      const server = await serveReport({ dataRoot: resolve(flags.get("data-dir") ?? defaultDataRoot()), reportId });
      openBrowser(server.url);
      io.stdout(`${JSON.stringify({ reportId, url: server.url, message: "Press Ctrl+C to stop the local report server." }, null, 2)}\n`);
      await new Promise<void>(() => undefined);
      return 0;
    }

    if (command === "clean") {
      const confirmation = requireFlag(flags, "yes") === "true";
      printJson(
        io,
        await deleteArtifactDirectory(
          resolve(requireFlag(flags, "data-dir")),
          requireFlag(flags, "artifact"),
          confirmation
        )
      );
      return 0;
    }

    io.stderr(`Unknown command: ${command}\n${help}`);
    return 2;
  } catch (error) {
    io.stderr(`BrandPreflight error: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    return 1;
  }
};

export const isCliEntrypoint = (entryPath: string | undefined, moduleUrl: string): boolean => {
  if (!entryPath) return false;
  try {
    return realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
};

const isDirectExecution = isCliEntrypoint(process.argv[1], import.meta.url);

if (isDirectExecution) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
