#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const LANGUAGE_DIRS = ["en", "tl", "vi"];
const DEFAULT_OUTPUT_PATH = "published-slugs.json";

function parseArgs(argv) {
  const options = {
    outputPath: DEFAULT_OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output") {
      options.outputPath = readOptionValue(argv, index, "--output");
      index += 1;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}\nUsage: node scripts/build-published-slugs.js [--output published-slugs.json]`
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

function readLanguageDirectory(repoRoot, languageDirName) {
  const directoryPath = path.join(repoRoot, languageDirName);
  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Language directory not found: ${languageDirName}/`);
  }

  let stat;
  try {
    stat = fs.statSync(directoryPath);
  } catch (error) {
    throw new Error(`Failed to check directory ${languageDirName}/: ${error.message}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`Expected directory but found file: ${languageDirName}/`);
  }

  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Failed to read directory ${languageDirName}/: ${error.message}`);
  }
}

function isTargetHtmlFile(fileName) {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith(".html") && lowerName !== "index.html";
}

function collectSlugsFromLanguage(repoRoot, languageDirName) {
  const entries = readLanguageDirectory(repoRoot, languageDirName);
  const slugs = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!isTargetHtmlFile(entry.name)) {
      continue;
    }

    const slug = path.basename(entry.name, path.extname(entry.name));
    if (slug.trim() === "") {
      continue;
    }

    slugs.push(slug);
  }

  return slugs;
}

function buildPublishedSlugs(repoRoot) {
  const allSlugs = [];
  for (const languageDirName of LANGUAGE_DIRS) {
    const slugs = collectSlugsFromLanguage(repoRoot, languageDirName);
    allSlugs.push(...slugs);
  }

  return Array.from(new Set(allSlugs)).sort((left, right) =>
    left.localeCompare(right, "en")
  );
}

function writePublishedSlugs(outputPath, slugs) {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const text = `${JSON.stringify(slugs, null, 2)}\n`;
  fs.writeFileSync(outputPath, text, "utf8");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const outputPath = path.resolve(repoRoot, options.outputPath);

    const slugs = buildPublishedSlugs(repoRoot);
    writePublishedSlugs(outputPath, slugs);

    console.log(`Published slugs: ${slugs.length}`);
    console.log(`Saved to: ${path.relative(repoRoot, outputPath)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
