#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TOPICS_PATH = "topics.json";
const DEFAULT_USED_PATH = "used-topics.json";
const DEFAULT_OUTPUT_PATH = path.join("drafts", "topic.json");

function parseArgs(argv) {
  const options = {
    topicsPath: DEFAULT_TOPICS_PATH,
    usedPath: DEFAULT_USED_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
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

    if (arg === "--output") {
      options.outputPath = readOptionValue(argv, index, "--output");
      index += 1;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}\nUsage: node scripts/select-topic.js [--topics topics.json] [--used used-topics.json] [--output drafts/topic.json]`
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
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} file not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label} file (${filePath}): ${error.message}`);
  }

  try {
    const normalized = raw.replace(/^\uFEFF/, "");
    return JSON.parse(normalized);
  } catch (error) {
    if (error.name === "SyntaxError") {
      throw new Error(`Invalid JSON in ${label} file (${filePath}): ${error.message}`);
    }
    throw new Error(`Failed to parse ${label} file (${filePath}): ${error.message}`);
  }
}

function assertNonEmptyString(value, fieldLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${fieldLabel}: expected non-empty string`);
  }
}

function assertPriority(value, fieldLabel) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Invalid ${fieldLabel}: expected finite number`);
  }
}

function assertKeywords(value, fieldLabel) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldLabel}: expected array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      throw new Error(`${fieldLabel}[${index}] must be a string`);
    }
  }
}

function validateTopicItem(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`topics[${index}] must be an object`);
  }

  assertNonEmptyString(item.id, `topics[${index}].id`);
  assertNonEmptyString(item.category, `topics[${index}].category`);
  assertNonEmptyString(item.topic, `topics[${index}].topic`);
  assertKeywords(item.keywords, `topics[${index}].keywords`);
  assertPriority(item.priority, `topics[${index}].priority`);
}

function validateTopics(topics) {
  if (!Array.isArray(topics)) {
    throw new Error("topics.json must be an array");
  }

  for (let index = 0; index < topics.length; index += 1) {
    validateTopicItem(topics[index], index);
  }
}

function validateUsedTopicIds(usedTopicIds) {
  if (!Array.isArray(usedTopicIds)) {
    throw new Error("used-topics.json must be an array of topic id strings");
  }

  for (let index = 0; index < usedTopicIds.length; index += 1) {
    if (typeof usedTopicIds[index] !== "string" || usedTopicIds[index].trim() === "") {
      throw new Error(`used-topics.json[${index}] must be a non-empty string`);
    }
  }
}

function filterUnusedTopics(topics, usedTopicIds) {
  const usedIdSet = new Set(usedTopicIds.map((id) => id.trim()));
  return topics.filter((topicItem) => !usedIdSet.has(topicItem.id));
}

function pickTopicByPriority(topics) {
  if (topics.length === 0) {
    throw new Error("No unused topics available. Add new topics or review used-topics.json.");
  }

  const highestPriority = Math.max(...topics.map((topicItem) => topicItem.priority));
  const highestPriorityTopics = topics.filter(
    (topicItem) => topicItem.priority === highestPriority
  );
  const randomIndex = Math.floor(Math.random() * highestPriorityTopics.length);

  return highestPriorityTopics[randomIndex];
}

function writeTopicFile(outputPath, topicItem) {
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputJson = JSON.stringify(topicItem, null, 2);
  fs.writeFileSync(outputPath, `${outputJson}\n`, "utf8");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();

    const topicsPath = path.resolve(repoRoot, options.topicsPath);
    const usedPath = path.resolve(repoRoot, options.usedPath);
    const outputPath = path.resolve(repoRoot, options.outputPath);

    const topics = readJsonFile(topicsPath, "topics");
    const usedTopicIds = readJsonFile(usedPath, "used-topics");

    validateTopics(topics);
    validateUsedTopicIds(usedTopicIds);

    const unusedTopics = filterUnusedTopics(topics, usedTopicIds);
    const selectedTopic = pickTopicByPriority(unusedTopics);

    writeTopicFile(outputPath, selectedTopic);

    console.log(`Selected topic: ${selectedTopic.id}`);
    console.log(`Topic title: ${selectedTopic.topic}`);
    console.log(`Saved to: ${path.relative(repoRoot, outputPath)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
