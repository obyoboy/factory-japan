#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SUPPORTED_LANGS = ["en", "tl", "vi"];
const DEFAULT_INPUT_PATH = path.join("drafts", "article.json");
const TEMPLATE_PATH_BY_LANG = {
  en: path.join("templates", "article-page.en.html"),
  tl: path.join("templates", "article-page.tl.html"),
  vi: path.join("templates", "article-page.vi.html"),
};

const REQUIRED_TEMPLATE_PLACEHOLDERS = [
  "title",
  "metaDescription",
  "badge",
  "excerpt",
  "imageUrl",
  "imageAlt",
  "lastUpdated",
  "readTimeMinutes",
  "bodyHtml",
];

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
    "Usage: node scripts/generate-article.js [drafts/article.json] or --input drafts/article.json"
  );
}

function runValidation(repoRoot, inputPath) {
  const validateScriptPath = path.join(repoRoot, "scripts", "validate-article.js");
  if (!fs.existsSync(validateScriptPath)) {
    throw new Error("Required script not found: scripts/validate-article.js");
  }

  const result = spawnSync(process.execPath, [validateScriptPath, "--input", inputPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`Failed to run validate-article.js: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const error = new Error("Validation failed. Generation aborted.");
    error.exitCode = typeof result.status === "number" ? result.status : 1;
    throw error;
  }
}

function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Input file not found: ${filePath}`);
    }
    throw new Error(`Failed to read input file: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Input JSON is invalid: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureTemplateHasPlaceholders(templateText, templatePath) {
  const missing = REQUIRED_TEMPLATE_PLACEHOLDERS.filter(
    (name) => !templateText.includes(`{{${name}}}`)
  );

  if (missing.length > 0) {
    throw new Error(
      `Template is missing placeholders (${missing.join(", ")}): ${templatePath}`
    );
  }
}

function loadTemplate(repoRoot, lang) {
  const templateRelativePath = TEMPLATE_PATH_BY_LANG[lang];
  const templatePath = path.join(repoRoot, templateRelativePath);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templateRelativePath}`);
  }

  const templateText = fs.readFileSync(templatePath, "utf8");
  ensureTemplateHasPlaceholders(templateText, templateRelativePath);
  return templateText;
}

function renderTemplate(templateText, values, templateName) {
  const placeholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  const rendered = templateText.replace(placeholderPattern, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Unknown placeholder "${key}" in template: ${templateName}`);
    }
    return String(values[key]);
  });

  const unresolved = rendered.match(/{{\s*[a-zA-Z0-9_]+\s*}}/g);
  if (unresolved && unresolved.length > 0) {
    throw new Error(
      `Template rendering left unresolved placeholders in ${templateName}: ${unresolved.join(", ")}`
    );
  }

  return rendered;
}

function buildTemplateValues(articleData, langData) {
  return {
    title: escapeHtml(langData.title),
    metaDescription: escapeHtml(langData.metaDescription),
    badge: escapeHtml(langData.badge),
    excerpt: escapeHtml(langData.excerpt),
    imageUrl: escapeHtml(langData.image.url),
    imageAlt: escapeHtml(langData.image.alt),
    lastUpdated: escapeHtml(articleData.lastUpdated),
    readTimeMinutes: String(articleData.readTimeMinutes),
    bodyHtml: String(langData.bodyHtml),
  };
}

function assertOutputDirectories(repoRoot) {
  for (const lang of SUPPORTED_LANGS) {
    const dirPath = path.join(repoRoot, lang);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      throw new Error(`Output directory missing: ${lang}/`);
    }
  }
}

function buildOutputPathMap(repoRoot, slug) {
  const outputPathByLang = {};
  for (const lang of SUPPORTED_LANGS) {
    outputPathByLang[lang] = path.join(repoRoot, lang, `${slug}.html`);
  }
  return outputPathByLang;
}

function assertOutputsDoNotExist(outputPathByLang, repoRoot) {
  const existing = [];
  for (const lang of SUPPORTED_LANGS) {
    const filePath = outputPathByLang[lang];
    if (fs.existsSync(filePath)) {
      existing.push(path.relative(repoRoot, filePath));
    }
  }

  if (existing.length > 0) {
    throw new Error(
      `Output file already exists. Generation aborted:\n- ${existing.join("\n- ")}`
    );
  }
}

function generateArticles(repoRoot, articleData) {
  if (!articleData || typeof articleData !== "object" || Array.isArray(articleData)) {
    throw new Error("Input JSON root must be an object.");
  }

  const slug = articleData.slug;
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error('Input JSON must include a non-empty "slug".');
  }

  assertOutputDirectories(repoRoot);
  const outputPathByLang = buildOutputPathMap(repoRoot, slug);
  assertOutputsDoNotExist(outputPathByLang, repoRoot);

  const renderedByLang = {};
  for (const lang of SUPPORTED_LANGS) {
    const langData = articleData.languages && articleData.languages[lang];
    if (!langData || typeof langData !== "object") {
      throw new Error(`Missing language block in JSON: languages.${lang}`);
    }

    const templateText = loadTemplate(repoRoot, lang);
    const values = buildTemplateValues(articleData, langData);
    renderedByLang[lang] = renderTemplate(
      templateText,
      values,
      TEMPLATE_PATH_BY_LANG[lang]
    );
  }

  for (const lang of SUPPORTED_LANGS) {
    fs.writeFileSync(outputPathByLang[lang], renderedByLang[lang], "utf8");
  }

  return outputPathByLang;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const inputPath = path.resolve(repoRoot, args.inputPath);

    runValidation(repoRoot, inputPath);

    const articleData = readJson(inputPath);
    const outputPathByLang = generateArticles(repoRoot, articleData);

    console.log("Generated article files:");
    for (const lang of SUPPORTED_LANGS) {
      console.log(`- ${path.relative(repoRoot, outputPathByLang[lang])}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode || 1);
  }
}

main();
