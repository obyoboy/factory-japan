#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_INPUT_PATH = path.join("drafts", "article.json");
const SCRIPT_SEQUENCE = [
  "validate-article.js",
  "generate-article.js",
  "update-index-cards.js",
];

function parseArgs(argv) {
  if (argv.length === 0) {
    return { inputPath: DEFAULT_INPUT_PATH };
  }

  if (argv.length === 2 && argv[0] === "--input" && argv[1].trim() !== "") {
    return { inputPath: argv[1] };
  }

  if (argv.length === 1 && !argv[0].startsWith("-")) {
    return { inputPath: argv[0] };
  }

  throw new Error(
    "Usage: node scripts/publish.js [drafts/article.json] or --input drafts/article.json"
  );
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

function runCommand(command, args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const allowExitCodes = options.allowExitCodes || [0];
  const printOutput = options.printOutput !== false;

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (printOutput) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (result.error) {
    const error = new Error(
      `Failed to start command: ${formatCommand(command, args)}\nReason: ${result.error.message}`
    );
    error.exitCode = 1;
    throw error;
  }

  const status = typeof result.status === "number" ? result.status : 1;
  if (!allowExitCodes.includes(status)) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const parts = [`Command failed (exit code ${status}): ${formatCommand(command, args)}`];
    if (stderr) {
      parts.push(`stderr: ${stderr}`);
    } else if (stdout) {
      parts.push(`stdout: ${stdout}`);
    }

    const error = new Error(parts.join("\n"));
    error.exitCode = status;
    throw error;
  }

  return result;
}

function runNodeScript(repoRoot, scriptFileName, inputPath) {
  const scriptPath = path.join(repoRoot, "scripts", scriptFileName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Required script not found: scripts/${scriptFileName}`);
  }

  runCommand(process.execPath, [scriptPath, "--input", inputPath], {
    cwd: repoRoot,
  });
}

function readSlugFromInput(inputAbsolutePath) {
  let raw;
  try {
    raw = fs.readFileSync(inputAbsolutePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Input file not found: ${inputAbsolutePath}`);
    }
    throw new Error(`Failed to read input JSON: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON format in input file: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input JSON root must be an object.");
  }

  if (typeof parsed.slug !== "string" || parsed.slug.trim() === "") {
    throw new Error('Input JSON must include a non-empty "slug".');
  }

  return parsed.slug.trim();
}

function ensureStagedChangesExist(repoRoot) {
  const result = runCommand("git", ["diff", "--cached", "--quiet"], {
    cwd: repoRoot,
    allowExitCodes: [0, 1],
    printOutput: false,
  });
  const status = typeof result.status === "number" ? result.status : 1;

  if (status === 0) {
    const error = new Error(
      "No staged changes found after `git add .`. Nothing to commit."
    );
    error.exitCode = 1;
    throw error;
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const inputAbsolutePath = path.resolve(repoRoot, args.inputPath);
    const executedSteps = [];

    for (const scriptFileName of SCRIPT_SEQUENCE) {
      runNodeScript(repoRoot, scriptFileName, args.inputPath);
      executedSteps.push(`node scripts/${scriptFileName} --input ${args.inputPath}`);
    }

    const slug = readSlugFromInput(inputAbsolutePath);

    runCommand("git", ["add", "."], { cwd: repoRoot });
    executedSteps.push("git add .");

    ensureStagedChangesExist(repoRoot);
    executedSteps.push("git diff --cached --quiet (staged changes confirmed)");

    const commitMessage = `Add article: ${slug}`;
    runCommand("git", ["commit", "-m", commitMessage], { cwd: repoRoot });
    executedSteps.push(`git commit -m "${commitMessage}"`);

    runCommand("git", ["push", "origin", "main"], { cwd: repoRoot });
    executedSteps.push("git push origin main");

    console.log("Publish completed.");
    console.log("Executed steps:");
    for (const step of executedSteps) {
      console.log(`- ${step}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode || 1);
  }
}

main();
