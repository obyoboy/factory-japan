#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_TOPIC_OUTPUT = path.join("drafts", "topic.json");
const DEFAULT_ARTICLE_INPUT = path.join("drafts", "article.json");
const ARTICLE_SKILL_PATH = ".claude/skills/write-article/SKILL.md";
const ARCHIVE_ARTICLES_DIR = path.join("archive", "articles");
const ARCHIVE_TOPICS_DIR = path.join("archive", "topics");
const SCRIPTS = {
  buildPublishedSlugs: path.join("scripts", "build-published-slugs.js"),
  selectTopic: path.join("scripts", "select-topic.js"),
  publish: path.join("scripts", "publish.js"),
  markTopicUsed: path.join("scripts", "mark-topic-used.js"),
};

function parseArgs(argv) {
  const options = {
    topicOutput: DEFAULT_TOPIC_OUTPUT,
    articleInput: DEFAULT_ARTICLE_INPUT,
    skipBuildPublished: false,
    generateWithClaude: false,
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

    throw new Error(
      "Unknown argument: " +
        `${arg}\nUsage: node scripts/run-pipeline.js ` +
        "[--topic-output drafts/topic.json] " +
        "[--article-input drafts/article.json] " +
        "[--skip-build-published] " +
        "[--generate-with-claude]"
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
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (printOutput && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (printOutput && result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
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

function isWindowsNodeSpawnPermissionError(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }
  return process.platform === "win32" && /EPERM/i.test(error.message);
}

function runNodeScript(repoRoot, scriptRelativePath, scriptArgs) {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Required script not found: ${scriptRelativePath}`);
  }

  const nodeArgs = [scriptPath, ...scriptArgs];
  try {
    runCommand(process.execPath, nodeArgs, { cwd: repoRoot });
  } catch (error) {
    if (!isWindowsNodeSpawnPermissionError(error)) {
      throw error;
    }

    const cmdExecutable = process.env.ComSpec || "cmd.exe";
    const cmdText = formatWindowsCmdCommand(process.execPath, nodeArgs);
    runCommand(cmdExecutable, ["/d", "/s", "/c", cmdText], { cwd: repoRoot });
  }
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

function printClaudeInstructions(repoRoot, topicPath, articlePath) {
  const topicDisplay = path.relative(repoRoot, topicPath);
  const articleDisplay = path.relative(repoRoot, articlePath);

  console.log("");
  console.log("Pipeline paused. Next step (Claude Code):");
  console.log(
    `Read \`${topicDisplay}\` and use \`${ARTICLE_SKILL_PATH}\` to generate \`${articleDisplay}\`.`
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

function assertArticleSkillExists(repoRoot) {
  const skillPath = path.join(repoRoot, ARTICLE_SKILL_PATH);
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
    `Article skill file not found: ${ARTICLE_SKILL_PATH}${availableSkillsMessage}`
  );
}

function buildClaudePrompt(repoRoot, topicPath, articlePath) {
  const topicDisplay = toPromptPath(repoRoot, topicPath);
  const articleDisplay = toPromptPath(repoRoot, articlePath);

  return (
    `Read \`${topicDisplay}\` and follow \`${ARTICLE_SKILL_PATH}\`.\n\n` +
    "Requirements:\n" +
    "- Follow the required schema strictly.\n" +
    "- Return one valid JSON object via stdout only.\n" +
    "- Do not write or modify any files yourself.\n" +
    "- Do not include markdown code fences or extra commentary.\n" +
    "- Keep EN as the source meaning, and make TL/VI natural translations.\n" +
    `- The JSON should be ready to save as \`${articleDisplay}\`.\n` +
    "- Do not modify any other files."
  );
}

function parseClaudeJsonOutput(stdoutText) {
  const normalized = String(stdoutText || "").replace(/^\uFEFF/, "").trim();
  if (normalized === "") {
    throw new Error(
      "Claude returned empty output. Expected a single JSON object on stdout."
    );
  }

  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(
      "Claude output was not valid JSON. Ensure it returns JSON only to stdout without extra explanation."
    );
  }
}

function saveArticleJson(articlePath, articleData) {
  const outputDir = path.dirname(articlePath);
  fs.mkdirSync(outputDir, { recursive: true });
  const text = `${JSON.stringify(articleData, null, 2)}\n`;
  fs.writeFileSync(articlePath, text, "utf8");
}

function runClaudeGenerate(repoRoot, topicPath, articlePath) {
  assertArticleSkillExists(repoRoot);
  assertFileExists(topicPath, "topic output");

  if (fs.existsSync(articlePath)) {
    console.warn(
      `Warning: existing file will be overwritten by Claude generation: ${path.relative(
        repoRoot,
        articlePath
      )}`
    );
    warnArticleTopicFreshness(topicPath, articlePath);
  }

  const prompt = buildClaudePrompt(repoRoot, topicPath, articlePath);
  let result;
  try {
    result = runCommand("claude", ["-p", prompt], {
      cwd: repoRoot,
      printOutput: false,
    });
  } catch (error) {
    if (error.commandNotFound) {
      throw new Error(
        'Claude Code CLI command "claude" was not found in PATH.\n' +
          "Please ensure Claude Code is installed and accessible (example: claude --version)."
      );
    }
    throw error;
  }

  const articleData = parseClaudeJsonOutput(result.stdout);
  saveArticleJson(articlePath, articleData);
  console.log(`Saved article JSON: ${path.relative(repoRoot, articlePath)}`);
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
  runStep("publish", "Publish article", completedSteps, () => {
    runNodeScript(repoRoot, SCRIPTS.publish, ["--input", options.articleInput]);
  });

  runStep("mark-topic-used", "Mark topic as used", completedSteps, () => {
    runNodeScript(repoRoot, SCRIPTS.markTopicUsed, ["--topic", options.topicOutput]);
  });

  const archiveResult = runStep("archive-drafts", "Archive draft files", completedSteps, () =>
    archiveDraftFiles(repoRoot, topicOutputPath, articleInputPath)
  );

  console.log("Archived files:");
  console.log(`- ${path.relative(repoRoot, archiveResult.articleArchivePath)}`);
  console.log(`- ${path.relative(repoRoot, archiveResult.topicArchivePath)}`);
}

function runPipeline() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
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
    runStep("select-topic", "Select topic", completedSteps, () => {
      runNodeScript(repoRoot, SCRIPTS.selectTopic, ["--output", options.topicOutput]);
      assertFileExists(topicOutputPath, "topic output");
    });

    runStep(
      "generate-with-claude",
      "Generate article.json with Claude Code",
      completedSteps,
      () => {
        runClaudeGenerate(repoRoot, topicOutputPath, articleInputPath);
        assertFileExists(articleInputPath, "article input");
      }
    );

    assertPublishInputs(topicOutputPath, articleInputPath);
    warnArticleTopicFreshness(topicOutputPath, articleInputPath);
    runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps);

    console.log("");
    console.log("Pipeline completed successfully.");
    console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
    return;
  }

  if (!fs.existsSync(articleInputPath)) {
    runStep("select-topic", "Select topic", completedSteps, () => {
      runNodeScript(repoRoot, SCRIPTS.selectTopic, ["--output", options.topicOutput]);
      assertFileExists(topicOutputPath, "topic output");
    });

    assertArticleSkillExists(repoRoot);

    console.log("");
    console.log("Pipeline status: waiting for drafts/article.json generation.");
    console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
    printClaudeInstructions(repoRoot, topicOutputPath, articleInputPath);
    return;
  }

  assertPublishInputs(topicOutputPath, articleInputPath);
  warnArticleTopicFreshness(topicOutputPath, articleInputPath);
  runPublishAndPostSteps(repoRoot, options, topicOutputPath, articleInputPath, completedSteps);

  console.log("");
  console.log("Pipeline completed successfully.");
  console.log(`Completed steps: ${completedSteps.join(" -> ")}`);
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
