#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TOPIC_PATH = path.join("drafts", "topic.json");
const DEFAULT_USED_PATH = "used-topics.json";

function parseArgs(argv) {
  const options = {
    topicPath: DEFAULT_TOPIC_PATH,
    usedPath: DEFAULT_USED_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--topic") {
      options.topicPath = readOptionValue(argv, index, "--topic");
      index += 1;
      continue;
    }

    if (arg === "--used") {
      options.usedPath = readOptionValue(argv, index, "--used");
      index += 1;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}\nUsage: node scripts/mark-topic-used.js [--topic drafts/topic.json] [--used used-topics.json]`
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

function readJsonFile(filePath, label) {
  let rawText;
  try {
    rawText = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} file not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label} file (${filePath}): ${error.message}`);
  }

  try {
    const normalizedText = rawText.replace(/^\uFEFF/, "");
    return JSON.parse(normalizedText);
  } catch (error) {
    if (error.name === "SyntaxError") {
      throw new Error(`Invalid JSON in ${label} file (${filePath}): ${error.message}`);
    }
    throw new Error(`Failed to parse ${label} file (${filePath}): ${error.message}`);
  }
}

function readTopicId(topicFilePath) {
  const topicData = readJsonFile(topicFilePath, "topic");
  if (!topicData || typeof topicData !== "object" || Array.isArray(topicData)) {
    throw new Error(`topic file must be an object: ${topicFilePath}`);
  }

  if (typeof topicData.id !== "string" || topicData.id.trim() === "") {
    throw new Error(`topic.id must be a non-empty string: ${topicFilePath}`);
  }

  return topicData.id.trim();
}

function readUsedTopicIds(usedFilePath) {
  if (!fs.existsSync(usedFilePath)) {
    return [];
  }

  const usedTopicIds = readJsonFile(usedFilePath, "used-topics");
  if (!Array.isArray(usedTopicIds)) {
    throw new Error(`used-topics file must be an array: ${usedFilePath}`);
  }

  for (let index = 0; index < usedTopicIds.length; index += 1) {
    const topicId = usedTopicIds[index];
    if (typeof topicId !== "string" || topicId.trim() === "") {
      throw new Error(`used-topics[${index}] must be a non-empty string: ${usedFilePath}`);
    }
  }

  return usedTopicIds;
}

function appendIfMissing(topicId, usedTopicIds) {
  const exists = usedTopicIds.includes(topicId);
  if (exists) {
    return { added: false, updatedIds: usedTopicIds };
  }

  return { added: true, updatedIds: [...usedTopicIds, topicId] };
}

function writeUsedTopicIds(usedFilePath, usedTopicIds) {
  const outputDir = path.dirname(usedFilePath);
  fs.mkdirSync(outputDir, { recursive: true });

  const text = `${JSON.stringify(usedTopicIds, null, 2)}\n`;
  fs.writeFileSync(usedFilePath, text, "utf8");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const topicFilePath = path.resolve(repoRoot, options.topicPath);
    const usedFilePath = path.resolve(repoRoot, options.usedPath);

    const topicId = readTopicId(topicFilePath);
    const usedTopicIds = readUsedTopicIds(usedFilePath);
    const result = appendIfMissing(topicId, usedTopicIds);

    if (result.added) {
      writeUsedTopicIds(usedFilePath, result.updatedIds);
      console.log(`Added used topic id: ${topicId}`);
    } else {
      console.log(`Topic id already exists in used-topics: ${topicId}`);
    }

    console.log(`Used topics file: ${path.relative(repoRoot, usedFilePath)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
