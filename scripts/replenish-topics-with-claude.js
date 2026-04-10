#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_TOPICS_PATH = "topics.json";
const DEFAULT_USED_PATH = "used-topics.json";
const DEFAULT_PUBLISHED_PATH = "published-slugs.json";
const DEFAULT_COUNT = 100;
const DEFAULT_TIMEOUT_MS = 420000;

function parseArgs(argv) {
  const options = {
    topicsPath: DEFAULT_TOPICS_PATH,
    usedPath: DEFAULT_USED_PATH,
    publishedPath: DEFAULT_PUBLISHED_PATH,
    count: DEFAULT_COUNT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--topics") {
      options.topicsPath = readOptionValue(argv, index, "--topics");
      index += 1;
      continue;
    }

    if (arg === "--used") {
      options.usedPath = readOptionValue(argv, index, "--used");
      index += 1;
      continue;
    }

    if (arg === "--published") {
      options.publishedPath = readOptionValue(argv, index, "--published");
      index += 1;
      continue;
    }

    if (arg === "--count") {
      const text = readOptionValue(argv, index, "--count");
      const parsed = Number.parseInt(text, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
        throw new Error("--count must be an integer between 1 and 500.");
      }
      options.count = parsed;
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const text = readOptionValue(argv, index, "--timeout-ms");
      const parsed = Number.parseInt(text, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
      options.timeoutMs = parsed;
      index += 1;
      continue;
    }

    throw new Error(
      "Unknown argument: " +
        `${arg}\nUsage: node scripts/replenish-topics-with-claude.js ` +
        "[--topics topics.json] " +
        "[--used used-topics.json] " +
        "[--published published-slugs.json] " +
        "[--count 100] " +
        "[--timeout-ms 420000]"
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
  const timeout = options.timeoutMs;
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
  });

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

function summarizeCommandError(error) {
  if (!error || typeof error.message !== "string") {
    return "unknown error";
  }
  return error.message.split(/\r?\n/u)[0];
}

function throwClaudeInvocationError(error, timeoutMs) {
  if (error.commandNotFound) {
    throw new Error(
      'Claude Code CLI command "claude" was not found in PATH.\n' +
        "Please ensure Claude Code is installed and accessible (example: claude --version)."
    );
  }

  if (error.spawnErrorCode === "ETIMEDOUT") {
    throw new Error(
      `Claude topic generation timed out after ${timeoutMs} ms.\n` +
        "Try increasing --timeout-ms and check Claude authentication with: claude auth status"
    );
  }
}

function runClaudeWithCompatibility(repoRoot, argsWithToolsDisabled, argsWithoutTools, timeoutMs) {
  try {
    return runCommandWithWindowsCmdFallback("claude", argsWithToolsDisabled, {
      cwd: repoRoot,
      timeoutMs,
    });
  } catch (primaryError) {
    if (primaryError.commandNotFound || primaryError.spawnErrorCode === "ETIMEDOUT") {
      throwClaudeInvocationError(primaryError, timeoutMs);
    }

    try {
      return runCommandWithWindowsCmdFallback("claude", argsWithoutTools, {
        cwd: repoRoot,
        timeoutMs,
      });
    } catch (retryError) {
      if (retryError.commandNotFound || retryError.spawnErrorCode === "ETIMEDOUT") {
        throwClaudeInvocationError(retryError, timeoutMs);
      }

      const firstSummary = summarizeCommandError(primaryError);
      const secondSummary = summarizeCommandError(retryError);
      throw new Error(
        "Claude invocation failed in both compatibility modes.\n" +
          `Attempt 1 (--tools ""): ${firstSummary}\n` +
          `Attempt 2 (without --tools): ${secondSummary}\n` +
          "Check Claude authentication and environment with: claude auth status"
      );
    }
  }
}

function readJsonFile(filePath, label, { allowMissing = false, fallbackValue = null } = {}) {
  let rawText;
  try {
    rawText = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && allowMissing) {
      return fallbackValue;
    }
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

function writeJsonFile(filePath, data) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(filePath, text, "utf8");
}

function validateTopicsArray(topics, label) {
  if (!Array.isArray(topics)) {
    throw new Error(`${label} must be an array.`);
  }
}

function validateStringArray(values, label) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }

  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "string" || values[index].trim() === "") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
  }
}

function normalizeTopicText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function toPromptPath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function inferSiteLabel(repoRoot) {
  const baseName = path.basename(repoRoot).toLowerCase();
  if (baseName.includes("dating")) {
    return "a Japan dating guide for foreign men";
  }
  if (baseName.includes("factory")) {
    return "a Japan factory work guide for foreign workers";
  }
  return "a multilingual Japan lifestyle guide";
}

function extractCategories(topics) {
  const set = new Set();
  for (const item of topics) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    if (typeof item.category === "string" && item.category.trim() !== "") {
      set.add(item.category.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function extractExistingTopicTexts(topics) {
  const normalizedSet = new Set();
  const display = [];

  for (const item of topics) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    if (typeof item.topic !== "string" || item.topic.trim() === "") {
      continue;
    }
    const topicText = item.topic.trim();
    const normalized = normalizeTopicText(topicText);
    if (normalized === "" || normalizedSet.has(normalized)) {
      continue;
    }
    normalizedSet.add(normalized);
    display.push(topicText);
  }

  return {
    normalizedSet,
    display,
  };
}

function parseClaudeJsonArray(stdoutText) {
  const trimmed = stdoutText.trim();
  if (trimmed === "") {
    throw new Error("Claude returned empty output.");
  }

  const candidates = [trimmed];
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (codeFenceMatch && codeFenceMatch[1]) {
    candidates.push(codeFenceMatch[1].trim());
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  let lastError = null;
  for (const candidate of uniqueCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.topics)) {
        return parsed.topics;
      }
      lastError = new Error("JSON parsed but did not contain an array.");
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Claude output was not valid JSON array: ${lastError.message}`);
}

function buildPrompt(
  repoRoot,
  options,
  siteLabel,
  categories,
  excludedIds,
  existingTopicTexts,
  requestedCount,
  failureHint
) {
  const topicsPathDisplay = toPromptPath(repoRoot, path.resolve(repoRoot, options.topicsPath));
  const usedPathDisplay = toPromptPath(repoRoot, path.resolve(repoRoot, options.usedPath));
  const publishedPathDisplay = toPromptPath(
    repoRoot,
    path.resolve(repoRoot, options.publishedPath)
  );

  const categoryListText =
    categories.length > 0
      ? categories.map((value) => `- ${value}`).join("\n")
      : "- Use practical categories that fit this site.";
  const excludedIdText = excludedIds.map((value) => `- ${value}`).join("\n");
  const existingTopicText = existingTopicTexts.map((value) => `- ${value}`).join("\n");
  const failureLine = failureHint ? `\nPrevious attempt failed: ${failureHint}\n` : "";

  return (
    `You are planning SEO article topics for ${siteLabel}.\n` +
    `Generate up to ${requestedCount} NEW topic objects in this batch.\n` +
    "Return JSON ONLY. No markdown, no explanation.\n\n" +
    "Output must be a JSON array where each item is:\n" +
    "{\n" +
    '  "id": "lowercase-kebab-case-slug",\n' +
    '  "category": "Category Name",\n' +
    '  "topic": "English article topic",\n' +
    '  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],\n' +
    '  "priority": 8\n' +
    "}\n\n" +
    "Hard rules:\n" +
    "- Exactly 100% valid JSON array output.\n" +
    `- Return at least 1 and at most ${requestedCount} items in this batch.\n` +
    `- Prefer returning exactly ${requestedCount} items when possible.\n` +
    "- id must be unique, lowercase kebab-case, and use only [a-z0-9-].\n" +
    "- category must be chosen from allowed categories.\n" +
    "- topic must be in English and practical for real users.\n" +
    "- keywords must contain exactly 4 non-empty strings.\n" +
    "- priority must be an integer from 1 to 10.\n" +
    "- Do not reuse or paraphrase existing topics too closely.\n" +
    "- Do not use any id from the excluded id list.\n" +
    "- Make sure all generated topics are mutually distinct.\n\n" +
    `Allowed categories (from ${topicsPathDisplay}):\n${categoryListText}\n\n` +
    `Excluded IDs (combined from ${topicsPathDisplay}, ${usedPathDisplay}, ${publishedPathDisplay}):\n` +
    `${excludedIdText}\n\n` +
    `Existing topic titles to avoid overlap:\n${existingTopicText}\n` +
    failureLine
  );
}

function validateGeneratedTopics(
  generatedTopics,
  maxCount,
  categories,
  excludedIdSet,
  existingTopicNormalizedSet
) {
  if (!Array.isArray(generatedTopics)) {
    throw new Error("Claude output must be a JSON array.");
  }
  if (generatedTopics.length === 0) {
    throw new Error("Claude output must contain at least 1 topic.");
  }
  if (!Number.isInteger(maxCount) || maxCount <= 0) {
    throw new Error("maxCount must be a positive integer.");
  }

  const allowedCategorySet = new Set(categories);
  const seenIds = new Set();
  const seenTopics = new Set();
  const normalizedTopics = [];
  const processCount = Math.min(generatedTopics.length, maxCount);

  for (let index = 0; index < processCount; index += 1) {
    const item = generatedTopics[index];
    const label = `topics[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label} must be an object.`);
    }

    if (typeof item.id !== "string" || item.id.trim() === "") {
      throw new Error(`${label}.id must be a non-empty string.`);
    }
    const id = item.id.trim().toLowerCase();
    if (!isKebabCase(id)) {
      throw new Error(`${label}.id must be lowercase kebab-case.`);
    }
    if (excludedIdSet.has(id)) {
      throw new Error(`${label}.id already exists: ${id}`);
    }
    if (seenIds.has(id)) {
      throw new Error(`${label}.id is duplicated in generated output: ${id}`);
    }
    seenIds.add(id);

    if (typeof item.category !== "string" || item.category.trim() === "") {
      throw new Error(`${label}.category must be a non-empty string.`);
    }
    const category = item.category.trim();
    if (allowedCategorySet.size > 0 && !allowedCategorySet.has(category)) {
      throw new Error(`${label}.category must be one of allowed categories: ${category}`);
    }

    if (typeof item.topic !== "string" || item.topic.trim() === "") {
      throw new Error(`${label}.topic must be a non-empty string.`);
    }
    const topic = item.topic.trim();
    const normalizedTopic = normalizeTopicText(topic);
    if (normalizedTopic === "") {
      throw new Error(`${label}.topic must contain visible text.`);
    }
    if (existingTopicNormalizedSet.has(normalizedTopic)) {
      throw new Error(`${label}.topic overlaps with existing topics: ${topic}`);
    }
    if (seenTopics.has(normalizedTopic)) {
      throw new Error(`${label}.topic is duplicated in generated output: ${topic}`);
    }
    seenTopics.add(normalizedTopic);

    if (!Array.isArray(item.keywords) || item.keywords.length !== 4) {
      throw new Error(`${label}.keywords must be an array with exactly 4 strings.`);
    }
    const keywords = item.keywords.map((value, keywordIndex) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${label}.keywords[${keywordIndex}] must be a non-empty string.`);
      }
      return value.trim();
    });

    if (typeof item.priority !== "number" || !Number.isFinite(item.priority)) {
      throw new Error(`${label}.priority must be a finite number.`);
    }
    const priority = Math.round(item.priority);
    if (priority < 1 || priority > 10) {
      throw new Error(`${label}.priority must be between 1 and 10.`);
    }

    normalizedTopics.push({
      id,
      category,
      topic,
      keywords,
      priority,
    });
  }

  return normalizedTopics;
}

function generateTopicsWithClaude(repoRoot, prompt, timeoutMs) {
  const argsWithToolsDisabled = ["-p", prompt, "--tools", ""];
  const argsWithoutTools = ["-p", prompt];
  const result = runClaudeWithCompatibility(
    repoRoot,
    argsWithToolsDisabled,
    argsWithoutTools,
    timeoutMs
  );
  return parseClaudeJsonArray(result.stdout || "");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();

    const topicsPath = path.resolve(repoRoot, options.topicsPath);
    const usedPath = path.resolve(repoRoot, options.usedPath);
    const publishedPath = path.resolve(repoRoot, options.publishedPath);

    const topics = readJsonFile(topicsPath, "topics");
    const usedTopicIds = readJsonFile(usedPath, "used-topics");
    const publishedSlugs = readJsonFile(publishedPath, "published-slugs", {
      allowMissing: true,
      fallbackValue: [],
    });

    validateTopicsArray(topics, "topics");
    validateStringArray(usedTopicIds, "used-topics");
    validateStringArray(publishedSlugs, "published-slugs");

    const categories = extractCategories(topics);
    const siteLabel = inferSiteLabel(repoRoot);
    const { normalizedSet: existingTopicNormalizedSet, display: existingTopicTexts } =
      extractExistingTopicTexts(topics);
    const excludedIds = Array.from(
      new Set([
        ...topics
          .filter((item) => item && typeof item === "object" && !Array.isArray(item))
          .map((item) => String(item.id || "").trim().toLowerCase())
          .filter(Boolean),
        ...usedTopicIds.map((value) => value.trim().toLowerCase()),
        ...publishedSlugs.map((value) => value.trim().toLowerCase()),
      ])
    ).sort();
    const excludedIdSet = new Set(excludedIds);
    const mutableExistingTopicNormalizedSet = new Set(existingTopicNormalizedSet);
    const mutableExistingTopicTexts = [...existingTopicTexts];

    if (excludedIds.length === 0) {
      throw new Error("Could not build excluded topic id list.");
    }
    if (existingTopicTexts.length === 0) {
      throw new Error("Could not read existing topic titles from topics.json.");
    }

    const normalizedGeneratedTopics = [];
    const maxRounds = Math.max(20, options.count);
    const attemptsPerRound = 3;

    for (let round = 1; normalizedGeneratedTopics.length < options.count; round += 1) {
      if (round > maxRounds) {
        throw new Error(
          `Could not collect ${options.count} topics after ${maxRounds} rounds. Collected: ${normalizedGeneratedTopics.length}`
        );
      }

      const remaining = options.count - normalizedGeneratedTopics.length;
      let acceptedBatch = null;
      let lastError = null;

      for (let attempt = 1; attempt <= attemptsPerRound; attempt += 1) {
        const failureHint = lastError ? summarizeCommandError(lastError) : "";
        const prompt = buildPrompt(
          repoRoot,
          options,
          siteLabel,
          categories,
          Array.from(excludedIdSet).sort(),
          mutableExistingTopicTexts,
          remaining,
          failureHint
        );

        console.log(
          `Calling Claude Code for topic replenishment (need ${remaining} more, round ${round}, attempt ${attempt}/${attemptsPerRound}, timeout ${Math.round(
            options.timeoutMs / 1000
          )}s)...`
        );

        try {
          const generatedTopics = generateTopicsWithClaude(repoRoot, prompt, options.timeoutMs);
          acceptedBatch = validateGeneratedTopics(
            generatedTopics,
            remaining,
            categories,
            excludedIdSet,
            mutableExistingTopicNormalizedSet
          );
          if (acceptedBatch.length === 0) {
            throw new Error("Claude returned 0 valid topics in this batch.");
          }
          break;
        } catch (error) {
          lastError = error;
          if (attempt < attemptsPerRound) {
            console.warn(`Retrying topic generation after validation error: ${error.message}`);
          }
        }
      }

      if (!acceptedBatch) {
        throw new Error(
          `Topic replenishment failed while ${remaining} topics were still missing: ${lastError.message}`
        );
      }

      normalizedGeneratedTopics.push(...acceptedBatch);
      for (const item of acceptedBatch) {
        excludedIdSet.add(item.id);
        const normalizedTopic = normalizeTopicText(item.topic);
        mutableExistingTopicNormalizedSet.add(normalizedTopic);
        mutableExistingTopicTexts.push(item.topic);
      }

      console.log(
        `Accepted ${acceptedBatch.length} topics in round ${round}. Progress: ${normalizedGeneratedTopics.length}/${options.count}`
      );
    }

    const updatedTopics = [...topics, ...normalizedGeneratedTopics];
    writeJsonFile(topicsPath, updatedTopics);
    console.log(`Added ${normalizedGeneratedTopics.length} topics to ${options.topicsPath}`);
    console.log(`topics.json total count: ${updatedTopics.length}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
