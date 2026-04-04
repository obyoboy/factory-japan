#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_LANGS = ["en", "tl", "vi"];
const DEFAULT_INPUT_PATH = path.join("drafts", "article.json");

const REQUIRED_ROOT_FIELDS = [
  { path: "slug", type: "string" },
  { path: "lastUpdated", type: "string" },
  { path: "readTimeMinutes", type: "number" },
  { path: "languages", type: "object" },
];

const REQUIRED_LANGUAGE_FIELDS = [
  { path: "title", type: "string" },
  { path: "metaDescription", type: "string" },
  { path: "badge", type: "string" },
  { path: "excerpt", type: "string" },
  { path: "image.url", type: "string" },
  { path: "image.alt", type: "string" },
  { path: "bodyHtml", type: "string" },
];

const SCRIPT_TAG_PATTERN = /<\s*script\b/i;
const JAVASCRIPT_PROTOCOL_PATTERN = /javascript\s*:/i;

function parseArgs(argv) {
  if (argv.length === 0) {
    return { inputPath: DEFAULT_INPUT_PATH };
  }

  if (argv.length === 2 && argv[0] === "--input") {
    return { inputPath: argv[1] };
  }

  if (argv.length === 1 && !argv[0].startsWith("-")) {
    return { inputPath: argv[0] };
  }

  throw new Error(
    "Usage: node scripts/validate-article.js [drafts/article.json] or --input drafts/article.json"
  );
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function resolvePathValue(obj, dottedPath) {
  return dottedPath.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return acc[key];
  }, obj);
}

function getValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function isBlankString(value) {
  return typeof value === "string" && value.trim() === "";
}

function isValidYyyyMmDdDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

function detectUnsafeBodyHtml(bodyHtml) {
  if (SCRIPT_TAG_PATTERN.test(bodyHtml)) {
    return "<script";
  }

  if (JAVASCRIPT_PROTOCOL_PATTERN.test(bodyHtml)) {
    return "javascript:";
  }

  return null;
}

function validateFieldValue(value, fieldLabel, expectedType, errors) {
  if (value === undefined || value === null) {
    errors.push(`Missing required field: ${fieldLabel}`);
    return;
  }

  if (expectedType === "string") {
    if (typeof value !== "string" || isBlankString(value)) {
      errors.push(`Field "${fieldLabel}" must be a non-empty string.`);
    }
    return;
  }

  if (expectedType === "number") {
    if (
      typeof value !== "number" ||
      Number.isNaN(value) ||
      !Number.isFinite(value)
    ) {
      errors.push(`Field "${fieldLabel}" must be a finite number.`);
    }
    return;
  }

  if (expectedType === "object") {
    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push(
        `Field "${fieldLabel}" must be an object. Current type: ${getValueType(value)}`
      );
    }
  }
}

function validateRoot(data, errors) {
  for (const field of REQUIRED_ROOT_FIELDS) {
    validateFieldValue(resolvePathValue(data, field.path), field.path, field.type, errors);
  }

  if (typeof data.slug === "string") {
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugPattern.test(data.slug)) {
      errors.push(
        'Field "slug" must be lower-case kebab-case (example: japan-factory-lunch-break-rules).'
      );
    }
  }

  if (typeof data.readTimeMinutes === "number") {
    if (!Number.isInteger(data.readTimeMinutes) || data.readTimeMinutes <= 0) {
      errors.push('Field "readTimeMinutes" must be a positive integer.');
    }
  }

  if (typeof data.lastUpdated === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.lastUpdated)) {
      errors.push('Field "lastUpdated" must match YYYY-MM-DD.');
    } else if (!isValidYyyyMmDdDate(data.lastUpdated)) {
      errors.push(
        'Field "lastUpdated" must be a real calendar date (example: 2026-04-04).'
      );
    }
  }
}

function validateLanguages(data, errors) {
  const languageMap = data.languages;
  if (!languageMap || typeof languageMap !== "object" || Array.isArray(languageMap)) {
    return;
  }

  const inputLanguages = Object.keys(languageMap);

  for (const lang of SUPPORTED_LANGS) {
    if (!Object.prototype.hasOwnProperty.call(languageMap, lang)) {
      errors.push(`Missing required language block: languages.${lang}`);
      continue;
    }

    const langBlock = languageMap[lang];
    if (typeof langBlock !== "object" || langBlock === null || Array.isArray(langBlock)) {
      errors.push(`languages.${lang} must be an object.`);
      continue;
    }

    for (const field of REQUIRED_LANGUAGE_FIELDS) {
      const fieldLabel = `languages.${lang}.${field.path}`;
      const value = resolvePathValue(langBlock, field.path);
      validateFieldValue(value, fieldLabel, field.type, errors);
    }

    if (typeof langBlock.bodyHtml === "string") {
      const unsafeToken = detectUnsafeBodyHtml(langBlock.bodyHtml);
      if (unsafeToken) {
        errors.push(
          `Field "languages.${lang}.bodyHtml" contains forbidden token: ${unsafeToken}`
        );
      }
    }
  }

  const unsupported = inputLanguages.filter((lang) => !SUPPORTED_LANGS.includes(lang));
  if (unsupported.length > 0) {
    errors.push(
      `Unsupported language blocks found: ${unsupported.join(
        ", "
      )}. Only en/tl/vi are allowed.`
    );
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateSlugUniqueness(slug, repoRoot, errors) {
  const articlePaths = SUPPORTED_LANGS.map((lang) =>
    path.join(repoRoot, lang, `${slug}.html`)
  );

  for (const filePath of articlePaths) {
    if (fs.existsSync(filePath)) {
      errors.push(
        `Slug "${slug}" already exists as article file: ${path.relative(repoRoot, filePath)}`
      );
    }
  }

  const hrefPattern = new RegExp(`["']${escapeRegExp(`${slug}.html`)}["']`);
  for (const lang of SUPPORTED_LANGS) {
    const indexPath = path.join(repoRoot, lang, "index.html");
    if (!fs.existsSync(indexPath)) {
      continue;
    }

    const indexHtml = fs.readFileSync(indexPath, "utf8");
    if (hrefPattern.test(indexHtml)) {
      errors.push(
        `Slug "${slug}" already referenced in index card list: ${path.relative(
          repoRoot,
          indexPath
        )}`
      );
    }
  }
}

function printErrors(errors) {
  console.error("Validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const inputPath = path.resolve(repoRoot, args.inputPath);

  let articleData;
  try {
    articleData = readJsonFile(inputPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`Input file not found: ${path.relative(repoRoot, inputPath)}`);
    } else if (error.name === "SyntaxError") {
      console.error(`Invalid JSON format: ${path.relative(repoRoot, inputPath)}`);
    } else {
      console.error(`Failed to read input file: ${error.message}`);
    }
    process.exit(1);
  }

  const errors = [];

  if (typeof articleData !== "object" || articleData === null || Array.isArray(articleData)) {
    errors.push("Top-level JSON must be an object.");
  } else {
    validateRoot(articleData, errors);
    validateLanguages(articleData, errors);

    if (typeof articleData.slug === "string" && articleData.slug.trim() !== "") {
      validateSlugUniqueness(articleData.slug.trim(), repoRoot, errors);
    }
  }

  if (errors.length > 0) {
    printErrors(errors);
    process.exit(1);
  }

  console.log(`Validation passed: ${path.relative(repoRoot, inputPath)}`);
}

main();
