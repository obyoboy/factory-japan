#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_TOPIC_OUTPUT = path.join("drafts", "topic.json");
const DEFAULT_ARTICLE_INPUT = path.join("drafts", "article.json");
const DEFAULT_ARTICLE_SKILL_PATH = ".claude/skills/generate-article/SKILL.md";
const DEFAULT_GPT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const RUN_MODE_SINGLE = "single";
const RUN_MODE_UNTIL_CLAUDE_LIMIT = "until-claude-limit";
const SUPPORTED_RUN_MODES = new Set([
  RUN_MODE_SINGLE,
  RUN_MODE_UNTIL_CLAUDE_LIMIT,
]);
const ARCHIVE_ARTICLES_DIR = path.join("archive", "articles");
const ARCHIVE_TOPICS_DIR = path.join("archive", "topics");
const SCRIPTS = {
  buildPublishedSlugs: path.join("scripts", "build-published-slugs.js"),
  selectTopic: path.join("scripts", "select-topic.js"),
  publish: path.join("scripts", "publish.js"),
  markTopicUsed: path.join("scripts", "mark-topic-used.js"),
  fetchArticleImage: path.join("scripts", "fetch-article-image.js"),
  generateWithOpenAI: path.join("scripts", "generate-with-openai.js"),
  replenishTopicsWithClaude: path.join("scripts", "replenish-topics-with-claude.js"),
};

function parseArgs(argv) {
  const options = {
    topicOutput: DEFAULT_TOPIC_OUTPUT,
    articleInput: DEFAULT_ARTICLE_INPUT,
    skipBuildPublished: false,
    generateWithClaude: false,
    runMode: RUN_MODE_SINGLE,
    fetchImageWithPexels: true,
    waitForArticle: false,
    skillPath: DEFAULT_ARTICLE_SKILL_PATH,
    claudeTimeoutMs: 420000,
    gptModel: DEFAULT_GPT_MODEL,
    gptTimeoutMs: 420000,
    gptFallback: true,
    stopOnClaudeLimit: false,
    autoReplenishTopics: true,
    replenishTopicCount: 100,
    replenishTimeoutMs: 420000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--topic-output") {
      options.topicOutput = readOptionValue(argv, index, "--topic-output");
      index += 1;
      continue;
    }

    if (arg === "--article-input") {
      options.articleInput = readOptionValue(argv, index, "--article-input");
      index += 1;
      continue;
    }

    if (arg === "--skip-build-published") {
      options.skipBuildPublished = true;
      continue;
    }

    if (arg === "--generate-with-claude") {
      options.generateWithClaude = true;
      continue;
    }

    if (arg === "--run-mode") {
      const runMode = readOptionValue(argv, index, "--run-mode").trim().toLowerCase();
      if (!SUPPORTED_RUN_MODES.has(runMode)) {
        throw new Error(
          `--run-mode must be one of: ${Array.from(SUPPORTED_RUN_MODES).join(", ")}`
        );
      }
      options.runMode = runMode;
      index += 1;
      continue;
    }

    if (arg === "--until-claude-limit") {
      options.runMode = RUN_MODE_UNTIL_CLAUDE_LIMIT;
      continue;
    }

    if (arg === "--fetch-image-with-pexels") {
      options.fetchImageWithPexels = true;
      continue;
    }

    if (arg === "--skip-image-fetch") {
      options.fetchImageWithPexels = false;
      continue;
    }

    if (arg === "--wait-for-article") {
      options.waitForArticle = true;
      continue;
    }

    if (arg === "--skill") {
      options.skillPath = readOptionValue(argv, index, "--skill");
      index += 1;
      continue;
    }

    if (arg === "--claude-timeout-ms") {
      const timeoutText = readOptionValue(argv, index, "--claude-timeout-ms");
      const parsed = Number.parseInt(timeoutText, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--claude-timeout-ms must be a positive integer.");
      }
      options.claudeTimeoutMs = parsed;
      index += 1;
      continue;
    }

    if (arg === "--gpt-model") {
      options.gptModel = readOptionValue(argv, index, "--gpt-model");
      index += 1;
      continue;
    }

    if (arg === "--gpt-timeout-ms") {
      const timeoutText = readOptionValue(argv, index, "--gpt-timeout-ms");
      const parsed = Number.parseInt(timeoutText, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--gpt-timeout-ms must be a positive integer.");
      }
      options.gptTimeoutMs = parsed;
      index += 1;
      continue;
    }

    if (arg === "--no-gpt-fallback") {
      options.gptFallback = false;
      continue;
    }

    if (arg === "--auto-replenish-topics") {
      options.autoReplenishTopics = true;
      continue;
    }

    if (arg === "--no-auto-replenish-topics") {
      options.autoReplenishTopics = false;
      continue;
    }

    if (arg === "--replenish-topic-count") {
      const countText = readOptionValue(argv, index, "--replenish-topic-count");
      const parsed = Number.parseInt(countText, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
        throw new Error("--replenish-topic-count must be an integer between 1 and 500.");
      }
      options.replenishTopicCount = parsed;
      index += 1;
      continue;
    }

    if (arg === "--replenish-timeout-ms") {
      const timeoutText = readOptionValue(argv, index, "--replenish-timeout-ms");
      const parsed = Number.parseInt(timeoutText, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--replenish-timeout-ms must be a positive integer.");
      }
      options.replenishTimeoutMs = parsed;
      index += 1;
      continue;
    }

    throw new Error(
      "Unknown argument: " +
        `${arg}\nUsage: node scripts/run-pipeline.js ` +
        "[--topic-output drafts/topic.json] " +
        "[--article-input drafts/article.json] " +
        "[--skip-build-published] " +
        "[--generate-with-claude] " +
        "[--run-mode single|until-claude-limit] " +
        "[--until-claude-limit] " +
        "[--fetch-image-with-pexels] " +
        "[--skip-image-fetch] " +
        "[--wait-for-article] " +
        "[--skill .claude/skills/generate-article/SKILL.md] " +
        "[--claude-timeout-ms 420000] " +
        "[--gpt-model gpt-5] " +
        "[--gpt-timeout-ms 420000] " +
        "[--no-gpt-fallback] " +
        "[--auto-replenish-topics] " +
        "[--no-auto-replenish-topics] " +
        "[--replenish-topic-count 100] " +
        "[--replenish-timeout-ms 420000]"
    );
  }

  return options;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function quoteArgForDisplay(arg) {
  const text = String(arg);
  if (/[ \t"]/u.test(text)) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteArgForDisplay).join(" ");
}

function quoteArgForCmd(arg) {
  const text = String(arg);
  if (text === "") {
    return "\"\"";
  }
  if (/[ \t"]/u.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function formatWindowsCmdCommand(command, args) {
  return [command, ...args].map(quoteArgForCmd).join(" ");
}

function runCommand(command, args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const allowedExitCodes = options.allowedExitCodes || [0];
  const printOutput = options.printOutput !== false;
  const timeout = options.timeoutMs;
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
  });

  if (printOutput && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (printOutput && result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      const error = new Error(
        `Command timed out after ${timeout} ms: ${formatCommand(command, args)}`
      );
      error.exitCode = 1;
      error.spawnErrorCode = result.error.code;
      throw error;
    }

    const error = new Error(
      `Failed to start command: ${formatCommand(command, args)}\nReason: ${result.error.message}`
    );
    error.exitCode = 1;
    error.commandNotFound = result.error.code === "ENOENT";
    error.spawnErrorCode = result.error.code;
    throw error;
  }

  const status = typeof result.status === "number" ? result.status : 1;
  if (!allowedExitCodes.includes(status)) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const detail = stderr || stdout;
    const detailLine = detail ? `\nOutput: ${detail}` : "";
    const error = new Error(
      `Command failed (exit code ${status}): ${formatCommand(command, args)}${detailLine}`
    );
    error.exitCode = status;
    throw error;
  }

  return result;
}

function isWindowsSpawnPermissionError(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }
  return process.platform === "win32" && /EPERM/i.test(error.message);
}

function runCommandWithWindowsCmdFallback(command, args, options = {}) {
  try {
    return runCommand(command, args, options);
  } catch (error) {
    if (!isWindowsSpawnPermissionError(error)) {
      throw error;
    }

    const cmdExecutable = process.env.ComSpec || "cmd.exe";
    const cmdText = formatWindowsCmdCommand(command, args);
    return runCommand(cmdExecutable, ["/d", "/s", "/c", cmdText], options);
  }
}

function runNodeScript(repoRoot, scriptRelativePath, scriptArgs) {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Required script not found: ${scriptRelativePath}`);
  }

  const nodeArgs = [scriptPath, ...scriptArgs];
  runCommandWithWindowsCmdFallback(process.execPath, nodeArgs, { cwd: repoRoot });
}

function runStep(stepId, description, completedSteps, action) {
  console.log("");
  console.log(`[Step] ${description}`);

  try {
    const value = action();
    completedSteps.push(stepId);
    return value;
  } catch (error) {
    const wrapped = new Error(`${description} failed.\n${error.message}`);
    wrapped.step = stepId;
    wrapped.exitCode = error.exitCode || 1;
    wrapped.completedSteps = [...completedSteps];
    throw wrapped;
  }
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function warnArticleTopicFreshness(topicPath, articlePath) {
  if (!fs.existsSync(topicPath) || !fs.existsSync(articlePath)) {
    return;
  }

  const topicStat = fs.statSync(topicPath);
  const articleStat = fs.statSync(articlePath);
  if (articleStat.mtimeMs < topicStat.mtimeMs) {
    console.warn(
      `Warning: ${path.basename(articlePath)} is older than ${path.basename(topicPath)}. ` +
        "It may be stale. Please verify topic/article consistency before publish."
    );
    return;
  }

  if (articleStat.mtimeMs > topicStat.mtimeMs) {
    console.warn(
      `Warning: ${path.basename(articlePath)} is newer than ${path.basename(topicPath)}. ` +
        "Confirm this topic/article pair is the one you want to publish."
    );
  }
}

function printClaudeInstructions(repoRoot, skillRelativePath, topicPath, articlePath) {
  const topicDisplay = path.relative(repoRoot, topicPath);
  const articleDisplay = path.relative(repoRoot, articlePath);
  const skillDisplay = toPromptPath(
    repoRoot,
    path.resolve(repoRoot, skillRelativePath)
  );

  console.log("");
  console.log("Pipeline paused. Next step (Claude Code):");
  console.log(
    `Read \`${topicDisplay}\` and use \`${skillDisplay}\` to generate \`${articleDisplay}\`.`
  );
  console.log(`Save valid JSON only to \`${articleDisplay}\`.`);
  console.log("Do not modify any other files.");
  console.log("");
  console.log("After generating article.json, run this command again:");
  console.log("node scripts/run-pipeline.js");
}

function toPromptPath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function assertArticleSkillExists(repoRoot, skillRelativePath) {
  const skillPath = path.join(repoRoot, skillRelativePath);
  if (fs.existsSync(skillPath)) {
    return;
  }

  const skillsDir = path.join(repoRoot, ".claude", "skills");
  let availableSkillsMessage = "";
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillCandidates = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${entry.name}/SKILL.md`);

    if (skillCandidates.length > 0) {
      availableSkillsMessage = `\nAvailable skills:\n- ${skillCandidates.join("\n- ")}`;
    }
  }

  throw new Error(
    `Article skill file not found: ${skillRelativePath}${availableSkillsMessage}`
  );
}

function readTextFile(filePath, label) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label} (${filePath}): ${error.message}`);
  }
}

function buildClaudePrompt(
  repoRoot,
  skillRelativePath,
  topicPath,
  articlePath,
  skillText,
  topicText
) {
  const skillDisplay = toPromptPath(
    repoRoot,
    path.resolve(repoRoot, skillRelativePath)
  );
  const topicDisplay = toPromptPath(repoRoot, topicPath);
  const articleDisplay = toPromptPath(repoRoot, articlePath);

  return (
    `Follow the skill instructions and generate article JSON.\n\n` +
    `## Skill (${skillDisplay})\n\n` +
    `${skillText.trim()}\n\n` +
    "---\n\n" +
    `## Input Topic (${topicDisplay})\n\n` +
    `${topicText.trim()}\n\n` +
    "---\n\n" +
    "## Output requirements\n\n" +
    "- Return exactly one valid JSON object via stdout only.\n" +
    "- Do not include markdown code fences.\n" +
    "- Do not include explanation or any extra text.\n" +
    "- Keep EN as source meaning and TL/VI as natural translations.\n" +
    `- The JSON must be ready to save as \`${articleDisplay}\`.\n` +
    "- Do not modify any files."
  );
}

function stripMarkdownCodeFence(text) {
  const trimmed = String(text || "").trim();
  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function extractFirstJsonObject(text) {
  const source = String(text || "");
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseClaudeJsonOutput(stdoutText) {
  const normalized = String(stdoutText || "").replace(/^\uFEFF/, "").trim();
  if (normalized === "") {
    throw new Error(
      "Claude returned empty output. Expected a single JSON object on stdout."
    );
  }

  const candidates = [];
  candidates.push(normalized);

  const unfenced = stripMarkdownCodeFence(normalized);
  if (unfenced && unfenced !== normalized) {
    candidates.push(unfenced);
  }

  const extractedFromNormalized = extractFirstJsonObject(normalized);
  if (extractedFromNormalized && !candidates.includes(extractedFromNormalized)) {
    candidates.push(extractedFromNormalized);
  }

  const extractedFromUnfenced = extractFirstJsonObject(unfenced);
  if (extractedFromUnfenced && !candidates.includes(extractedFromUnfenced)) {
    candidates.push(extractedFromUnfenced);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try next candidate.
    }
  }

  throw new Error(
    "Claude output was not valid JSON. Ensure it returns JSON only to stdout without extra explanation."
  );
}

function saveArticleJson(articlePath, articleData) {
  const outputDir = path.dirname(articlePath);
  fs.mkdirSync(outputDir, { recursive: true });
  const text = `${JSON.stringify(articleData, null, 2)}\n`;
  fs.writeFileSync(articlePath, text, "utf8");
}

function summarizeCommandError(error) {
  const text =
    error && typeof error.message === "string" ? error.message.trim() : String(error || "");
  if (text === "") {
    return "Unknown error.";
  }

  const reasonMatch = text.match(/\nReason:\s*([\s\S]*)$/);
  if (reasonMatch && reasonMatch[1]) {
    return reasonMatch[1].trim();
  }

  const outputMatch = text.match(/\nOutput:\s*([\s\S]*)$/);
  if (outputMatch && outputMatch[1]) {
    return outputMatch[1].trim();
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : text;
}

function throwClaudeInvocationError(error, claudeTimeoutMs) {
  if (error.commandNotFound) {
    throw new Error(
      'Claude Code CLI command "claude" was not found in PATH.\n' +
        "Please ensure Claude Code is installed and accessible (example: claude --version)."
    );
  }
  if (error.spawnErrorCode === "ETIMEDOUT") {
    throw new Error(
      `Claude generation timed out after ${claudeTimeoutMs} ms.\n` +
        "Try increasing --claude-timeout-ms, and check Claude authentication with: claude auth status"
    );
  }
  throw error;
}

function buildArticleJsonSchema() {
  return {
    type: "object",
    required: ["slug", "lastUpdated", "readTimeMinutes", "languages"],
    additionalProperties: true,
    properties: {
      slug: { type: "string", minLength: 1 },
      lastUpdated: { type: "string", minLength: 1 },
      readTimeMinutes: { type: "number" },
      languages: {
        type: "object",
        required: ["en", "tl", "vi"],
        additionalProperties: true,
        properties: {
          en: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
          tl: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
          vi: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  };
}

function isArticleLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (typeof value.slug !== "string" || value.slug.trim() === "") {
    return false;
  }
  if (!value.languages || typeof value.languages !== "object") {
    return false;
  }
  for (const lang of ["en", "tl", "vi"]) {
    if (!value.languages[lang] || typeof value.languages[lang] !== "object") {
      return false;
    }
  }
  return true;
}

function findArticleLikeObjectDeep(node, maxDepth = 6, currentDepth = 0) {
  if (currentDepth > maxDepth) {
    return null;
  }

  if (isArticleLikeObject(node)) {
    return node;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findArticleLikeObjectDeep(item, maxDepth, currentDepth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  for (const key of Object.keys(node)) {
    const found = findArticleLikeObjectDeep(node[key], maxDepth, currentDepth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function normalizeClaudeArticleOutput(stdoutText) {
  const parsed = parseClaudeJsonOutput(stdoutText);
  const articleObject = findArticleLikeObjectDeep(parsed);
  if (articleObject) {
    return articleObject;
  }
  throw new Error(
    "Claude returned JSON, but it did not match expected article structure (slug/languages.en|tl|vi)."
  );
}

function runClaudeWithCompatibility(repoRoot, argsWithToolsDisabled, argsWithoutTools, claudeTimeoutMs) {
  try {
    return runCommandWithWindowsCmdFallback("claude", argsWithToolsDisabled, {
      cwd: repoRoot,
      printOutput: false,
      timeoutMs: claudeTimeoutMs,
    });
  } catch (primaryError) {
    if (primaryError.commandNotFound || primaryError.spawnErrorCode === "ETIMEDOUT") {
      throwClaudeInvocationError(primaryError, claudeTimeoutMs);
    }

    console.warn(
      "Claude invocation failed with tools disabled. Retrying without --tools for CLI compatibility..."
    );
    try {
      return runCommandWithWindowsCmdFallback("claude", argsWithoutTools, {
        cwd: repoRoot,
        printOutput: false,
        timeoutMs: claudeTimeoutMs,
      });
    } catch (retryError) {
      if (retryError.commandNotFound || retryError.spawnErrorCode === "ETIMEDOUT") {
        throwClaudeInvocationError(retryError, claudeTimeoutMs);
      }

      const firstSummary = summarizeCommandError(primaryError);
      const secondSummary = summarizeCommandError(retryError);
      throw new Error(
        "Claude invocation failed in both compatibility modes.\n" +
          `Attempt 1 (--tools \"\"): ${firstSummary}\n` +
          `Attempt 2 (without --tools): ${secondSummary}\n` +
          "Check Claude authentication and environment with: claude auth status"
      );
    }
  }
}

function runClaudeGenerate(
  repoRoot,
  skillRelativePath,
  topicPath,
  articlePath,
  claudeTimeoutMs
) {
  assertArticleSkillExists(repoRoot, skillRelativePath);
  assertFileExists(topicPath, "topic output");

  const skillAbsolutePath = path.resolve(repoRoot, skillRelativePath);
  const skillText = readTextFile(skillAbsolutePath, "article skill file");
  const topicText = readTextFile(topicPath, "topic output");

  if (fs.existsSync(articlePath)) {
    console.warn(
      `Warning: existing file will be overwritten by Claude generation: ${path.relative(
        repoRoot,
        articlePath
      )}`
    );
    warnArticleTopicFreshness(topicPath, articlePath);
  }

  const prompt = buildClaudePrompt(
    repoRoot,
    skillRelativePath,
    topicPath,
    articlePath,
    skillText,
    topicText
  );
  const claudeArgsToolsDisabled = ["-p", prompt, "--tools", ""];
  const claudeArgsDefaultTools = ["-p", prompt];
  console.log(
    `Calling Claude Code (tools disabled, timeout ${Math.round(
      claudeTimeoutMs / 1000
    )}s)...`
  );
  const result = runClaudeWithCompatibility(
    repoRoot,
    claudeArgsToolsDisabled,
    claudeArgsDefaultTools,
    claudeTimeoutMs
  );

  let articleData;
  try {
    articleData = normalizeClaudeArticleOutput(result.stdout);
  } catch (parseError) {
    console.warn(
      "Claude output was not valid article JSON. Retrying with JSON schema enforcement..."
    );
    const schemaText = JSON.stringify(buildArticleJsonSchema());
    const strictArgsWithToolsDisabled = [
      "-p",
      prompt,
      "--tools",
      "",
      "--output-format",
      "json",
      "--json-schema",
      schemaText,
    ];
    const strictArgsDefaultTools = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--json-schema",
      schemaText,
    ];

    const strictResult = runClaudeWithCompatibility(
      repoRoot,
      strictArgsWithToolsDisabled,
      strictArgsDefaultTools,
      claudeTimeoutMs
    );

    try {
      articleData = normalizeClaudeArticleOutput(strictResult.stdout);
    } catch (strictParseError) {
      throw new Error(
        "Claude output was not valid JSON. Ensure it returns JSON only to stdout without extra explanation."
      );
    }
  }
  saveArticleJson(articlePath, articleData);
  console.log(`Saved article JSON: ${path.relative(repoRoot, articlePath)}`);
}

function isClaudeLimitError(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }

  const text = error.message;
  const hasClaudeContext = /claude|anthropic/i.test(text);
  if (!hasClaudeContext) {
    return false;
  }

  const patterns = [
    /you(?:'|\u2019)?ve hit your limit/i,
    /\busage limit\b/i,
    /\brate limit\b/i,
    /\brequest limit\b/i,
    /too many requests/i,
    /\bquota exceeded\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function isTopicPoolExhaustedError(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }

  const text = error.message;
  const patterns = [
    /no unused unpublished topics available/i,
    /no unused topics available/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function replenishTopicsWithClaude(repoRoot, options) {
  runNodeScript(repoRoot, SCRIPTS.replenishTopicsWithClaude, [
    "--count",
    String(options.replenishTopicCount),
    "--timeout-ms",
    String(options.replenishTimeoutMs),
  ]);
}

function shouldFallbackToGpt(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }

  const text = error.message.toLowerCase();
  const patterns = [
    /you(?:'|\u2019)?ve hit your limit/i,
    /command "claude" was not found/i,
    /claude generation timed out/i,
    /authentication/i,
    /unauthorized/i,
    /forbidden/i,
    /claude invocation failed in both compatibility modes/i,
    /claude output was not valid article json/i,
    /claude output was not valid json/i,
    /did not match expected article structure/i,
    /returned empty output/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function runOpenAiFallbackGenerate(
  repoRoot,
  options,
  topicPath,
  articlePath,
  claudeError
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(
      "Claude generation failed and GPT fallback is enabled, but OPENAI_API_KEY is not set.\n" +
        `Claude failure reason: ${summarizeCommandError(claudeError)}`
    );
  }

  console.warn(
    `Claude generation failed. Falling back to OpenAI (${options.gptModel}).`
  );
  console.warn(`Claude failure reason: ${summarizeCommandError(claudeError)}`);

  runNodeScript(repoRoot, SCRIPTS.generateWithOpenAI, [
    "--topic",
    options.topicOutput,
    "--output",
    options.articleInput,
    "--skill",
    options.skillPath,
    "--model",
    options.gptModel,
    "--timeout-ms",
    String(options.gptTimeoutMs),
  ]);

  assertFileExists(articlePath, "article input");
}

function runArticleGenerateWithFallback(
  repoRoot,
  options,
  topicPath,
  articlePath
) {
  try {
    runClaudeGenerate(
      repoRoot,
      options.skillPath,
      topicPath,
      articlePath,
      options.claudeTimeoutMs
    );
  } catch (error) {
    if (options.stopOnClaudeLimit && isClaudeLimitError(error)) {
      throw error;
    }
    if (!options.gptFallback || !shouldFallbackToGpt(error)) {
      throw error;
    }
    runOpenAiFallbackGenerate(repoRoot, options, topicPath, articlePath, error);
  }
}

function readJsonFile(filePath, label) {
  let rawText;
  try {
    rawText = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label} (${filePath}): ${error.message}`);
  }

  try {
    const normalized = rawText.replace(/^\uFEFF/, "");
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${error.message}`);
  }
}

function readRequiredId(data, fieldName, label) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  if (typeof data[fieldName] !== "string" || data[fieldName].trim() === "") {
    throw new Error(`${label} must include non-empty "${fieldName}".`);
  }

  return data[fieldName].trim();
}

function createTimestampText(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const millis = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`;
}

function resolveArchiveTargetPath(archiveDirPath, fileStem) {
  const baseTargetPath = path.join(archiveDirPath, `${fileStem}.json`);
  if (!fs.existsSync(baseTargetPath)) {
    return baseTargetPath;
  }

  const timestamp = createTimestampText(new Date());
  for (let index = 1; index <= 1000; index += 1) {
    const suffix = index === 1 ? timestamp : `${timestamp}-${index}`;
    const candidatePath = path.join(archiveDirPath, `${fileStem}-${suffix}.json`);
    if (!fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(`Could not find archive filename for "${fileStem}" in ${archiveDirPath}`);
}

function moveFile(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }
  }

  fs.copyFileSync(sourcePath, targetPath);
  fs.unlinkSync(sourcePath);
}

function archiveDraftFiles(repoRoot, topicPath, articlePath) {
  assertFileExists(topicPath, "topic output");
  assertFileExists(articlePath, "article input");

  const topicData = readJsonFile(topicPath, "topic file");
  const articleData = readJsonFile(articlePath, "article file");

  const topicId = readRequiredId(topicData, "id", "topic file");
  const articleSlug = readRequiredId(articleData, "slug", "article file");

  const archiveArticlesPath = path.join(repoRoot, ARCHIVE_ARTICLES_DIR);
  const archiveTopicsPath = path.join(repoRoot, ARCHIVE_TOPICS_DIR);
  fs.mkdirSync(archiveArticlesPath, { recursive: true });
  fs.mkdirSync(archiveTopicsPath, { recursive: true });

  const articleArchivePath = resolveArchiveTargetPath(archiveArticlesPath, articleSlug);
  const topicArchivePath = resolveArchiveTargetPath(archiveTopicsPath, topicId);

  try {
    moveFile(articlePath, articleArchivePath);
    moveFile(topicPath, topicArchivePath);
  } catch (error) {
    throw new Error(`Failed to archive draft files: ${error.message}`);
  }

  return {
    articleArchivePath,
    topicArchivePath,
  };
}

function assertPublishInputs(topicPath, articlePath) {
  assertFileExists(topicPath, "topic output");
  assertFileExists(articlePath, "article input");
}

function runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps) {
  runStep("mark-topic-used", "Mark topic as used", completedSteps, () => {
    runNodeScript(repoRoot, SCRIPTS.markTopicUsed, ["--topic", options.topicOutput]);
  });

  runStep("publish", "Publish article", completedSteps, () => {
    runNodeScript(repoRoot, SCRIPTS.publish, ["--input", options.articleInput]);
  });
}

function runSelectTopicStep(repoRoot, options, topicOutputPath, completedSteps) {
  const selectTopic = () => {
    runNodeScript(repoRoot, SCRIPTS.selectTopic, ["--output", options.topicOutput]);
    assertFileExists(topicOutputPath, "topic output");
  };

  try {
    runStep("select-topic", "Select topic", completedSteps, selectTopic);
  } catch (error) {
    if (!options.autoReplenishTopics || !isTopicPoolExhaustedError(error)) {
      throw error;
    }

    console.warn(
      "Topic pool exhausted. Replenishing topics with Claude, then retrying topic selection."
    );
    runStep("replenish-topics", "Replenish topics with Claude", completedSteps, () => {
      replenishTopicsWithClaude(repoRoot, options);
    });
    runStep("select-topic", "Select topic", completedSteps, selectTopic);
  }
}

function runFetchImageStep(repoRoot, options, articleInputPath, completedSteps) {
  if (!options.fetchImageWithPexels) {
    console.log("Skipped: fetch-image-with-pexels (--skip-image-fetch)");
    return;
  }

  runStep("fetch-image", "Fetch article image with Pexels", completedSteps, () => {
    runNodeScript(repoRoot, SCRIPTS.fetchArticleImage, [
      "--input",
      options.articleInput,
      "--topic",
      options.topicOutput,
    ]);
    assertFileExists(articleInputPath, "article input");
  });
}

function runPipelineOnce(repoRoot, options) {
  const topicOutputPath = path.resolve(repoRoot, options.topicOutput);
  const articleInputPath = path.resolve(repoRoot, options.articleInput);
  const completedSteps = [];

  if (!options.skipBuildPublished) {
    runStep("build-published-slugs", "Build published slugs", completedSteps, () => {
      runNodeScript(repoRoot, SCRIPTS.buildPublishedSlugs, []);
    });
  } else {
    console.log("Skipped: build-published-slugs (--skip-build-published)");
  }

  if (options.generateWithClaude) {
    runSelectTopicStep(repoRoot, options, topicOutputPath, completedSteps);

    runStep(
      "generate-with-claude",
      "Generate article.json (Claude with GPT fallback)",
      completedSteps,
      () => {
        runArticleGenerateWithFallback(
          repoRoot,
          options,
          topicOutputPath,
          articleInputPath
        );
        assertFileExists(articleInputPath, "article input");
      }
    );

    assertPublishInputs(topicOutputPath, articleInputPath);
    warnArticleTopicFreshness(topicOutputPath, articleInputPath);
    runFetchImageStep(repoRoot, options, articleInputPath, completedSteps);
    runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps);

    console.log("");
    console.log("Pipeline completed successfully.");
    console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
    return;
  }

  if (!fs.existsSync(articleInputPath)) {
    runSelectTopicStep(repoRoot, options, topicOutputPath, completedSteps);

    if (options.waitForArticle) {
      assertArticleSkillExists(repoRoot, options.skillPath);
      console.log("");
      console.log("Pipeline status: waiting for drafts/article.json generation.");
      console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
      printClaudeInstructions(
        repoRoot,
        options.skillPath,
        topicOutputPath,
        articleInputPath
      );
      return;
    }

    runStep(
      "generate-with-claude",
      "Generate article.json (Claude with GPT fallback)",
      completedSteps,
      () => {
        runArticleGenerateWithFallback(
          repoRoot,
          options,
          topicOutputPath,
          articleInputPath
        );
        assertFileExists(articleInputPath, "article input");
      }
    );

    assertPublishInputs(topicOutputPath, articleInputPath);
    warnArticleTopicFreshness(topicOutputPath, articleInputPath);
    runFetchImageStep(repoRoot, options, articleInputPath, completedSteps);
    runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps);

    console.log("");
    console.log("Pipeline completed successfully.");
    console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
    return;
  }

  if (!fs.existsSync(topicOutputPath)) {
    throw new Error(
      `topic output not found: ${path.relative(
        repoRoot,
        topicOutputPath
      )}\nRun with --generate-with-claude, or prepare both topic/article manually.`
    );
  }

  assertPublishInputs(topicOutputPath, articleInputPath);
  warnArticleTopicFreshness(topicOutputPath, articleInputPath);
  runFetchImageStep(repoRoot, options, articleInputPath, completedSteps);
  runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps);

  console.log("");
  console.log("Pipeline completed successfully.");
  console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
}

function runUntilClaudeLimit(repoRoot, options) {
  if (!options.generateWithClaude) {
    throw new Error("--run-mode until-claude-limit requires --generate-with-claude.");
  }

  if (options.waitForArticle) {
    throw new Error(
      "--run-mode until-claude-limit cannot be combined with --wait-for-article."
    );
  }

  const loopOptions = {
    ...options,
    stopOnClaudeLimit: true,
    gptFallback: false,
  };
  let completedArticles = 0;

  if (options.gptFallback) {
    console.log(
      "Info: GPT fallback is disabled in until-claude-limit mode so this run uses Claude only."
    );
  }

  while (true) {
    console.log("");
    console.log(
      `=== Continuous run ${completedArticles + 1} (${RUN_MODE_UNTIL_CLAUDE_LIMIT}) ===`
    );

    try {
      runPipelineOnce(repoRoot, loopOptions);
      completedArticles += 1;
    } catch (error) {
      if (isClaudeLimitError(error)) {
        console.log("");
        console.log("Claude limit reached. Stopping continuous run.");
        console.log(`Articles completed before limit: ${completedArticles}`);
        return;
      }

      if (isTopicPoolExhaustedError(error)) {
        console.log("");
        console.log("No unused topics remaining. Stopping continuous run.");
        console.log(`Articles completed before topic exhaustion: ${completedArticles}`);
        return;
      }

      throw error;
    }
  }
}

function runPipeline() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();

  if (options.runMode === RUN_MODE_UNTIL_CLAUDE_LIMIT) {
    runUntilClaudeLimit(repoRoot, options);
    return;
  }

  runPipelineOnce(repoRoot, options);
}

function main() {
  try {
    runPipeline();
  } catch (error) {
    const stepLabel = error.step ? ` (step: ${error.step})` : "";
    console.error(`Error${stepLabel}: ${error.message}`);
    if (Array.isArray(error.completedSteps) && error.completedSteps.length > 0) {
      console.error(`Completed steps before failure: ${error.completedSteps.join(" -> ")}`);
    }
    process.exit(error.exitCode || 1);
  }
}

main();
