#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_LANGS = ["en", "tl", "vi"];
const DEFAULT_INPUT_PATH = path.join("drafts", "article.json");
const START_MARKER = "<!-- ARTICLE_CARDS_START -->";
const END_MARKER = "<!-- ARTICLE_CARDS_END -->";
const CARD_TEMPLATE_PATH_BY_LANG = {
  en: path.join("templates", "article-card.en.html"),
  tl: path.join("templates", "article-card.tl.html"),
  vi: path.join("templates", "article-card.vi.html"),
};
const REQUIRED_CARD_PLACEHOLDERS = [
  "title",
  "excerpt",
  "badge",
  "imageUrl",
  "imageAlt",
  "slug",
  "lastUpdated",
  "readTimeMinutes",
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
    "Usage: node scripts/update-index-cards.js [drafts/article.json] or --input drafts/article.json"
  );
}

function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Input file not found: ${filePath}`);
    }
    throw new Error(`Failed to read input JSON: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeNewlines(text, newline) {
  return text.replace(/\r?\n/g, newline);
}

function stripOuterBlankLines(text, newline) {
  const lines = normalizeNewlines(text, newline).split(newline);
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.join(newline);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertNonEmptyString(value, fieldLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or invalid required field: ${fieldLabel}`);
  }
}

function assertLanguageFields(langData, lang) {
  if (!langData || typeof langData !== "object" || Array.isArray(langData)) {
    throw new Error(`Missing language block in input JSON: languages.${lang}`);
  }
  assertNonEmptyString(langData.title, `languages.${lang}.title`);
  assertNonEmptyString(langData.excerpt, `languages.${lang}.excerpt`);
  assertNonEmptyString(langData.badge, `languages.${lang}.badge`);
  if (!langData.image || typeof langData.image !== "object" || Array.isArray(langData.image)) {
    throw new Error(`Missing or invalid required field: languages.${lang}.image`);
  }
  assertNonEmptyString(langData.image.url, `languages.${lang}.image.url`);
  assertNonEmptyString(langData.image.alt, `languages.${lang}.image.alt`);
}

function ensureTemplateHasPlaceholders(templateText, templatePath) {
  const missing = REQUIRED_CARD_PLACEHOLDERS.filter(
    (name) => !templateText.includes(`{{${name}}}`)
  );
  if (missing.length > 0) {
    throw new Error(
      `Card template is missing placeholders (${missing.join(", ")}): ${templatePath}`
    );
  }
}

function renderTemplate(templateText, values, templatePath) {
  const placeholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  const rendered = templateText.replace(placeholderPattern, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Unknown placeholder "${key}" in template: ${templatePath}`);
    }
    return String(values[key]);
  });

  const unresolved = rendered.match(/{{\s*[a-zA-Z0-9_]+\s*}}/g);
  if (unresolved && unresolved.length > 0) {
    throw new Error(
      `Template rendering left unresolved placeholders in ${templatePath}: ${unresolved.join(", ")}`
    );
  }

  return rendered;
}

function readCardTemplate(repoRoot, lang) {
  const templateRelativePath = CARD_TEMPLATE_PATH_BY_LANG[lang];
  const templatePath = path.join(repoRoot, templateRelativePath);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templateRelativePath}`);
  }

  const templateText = fs.readFileSync(templatePath, "utf8");
  ensureTemplateHasPlaceholders(templateText, templateRelativePath);
  return { templateText, templateRelativePath };
}

function buildCardValues(articleData, langData) {
  return {
    title: escapeHtml(langData.title),
    excerpt: escapeHtml(langData.excerpt),
    badge: escapeHtml(langData.badge),
    imageUrl: escapeHtml(langData.image.url),
    imageAlt: escapeHtml(langData.image.alt),
    slug: escapeHtml(articleData.slug),
    lastUpdated: escapeHtml(articleData.lastUpdated),
    readTimeMinutes: String(articleData.readTimeMinutes),
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureSlugDoesNotExist(indexHtml, slug, indexPath) {
  const slugHrefPattern = new RegExp(`href\\s*=\\s*["'][^"']*${escapeRegExp(slug)}\\.html["']`, "i");
  if (slugHrefPattern.test(indexHtml)) {
    throw new Error(`Duplicate slug link found in ${indexPath}: ${slug}.html`);
  }
}

function findMarkerRange(indexHtml, indexPath) {
  const startIndex = indexHtml.indexOf(START_MARKER);
  const endIndex = indexHtml.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `Card markers not found in ${indexPath}. Required markers: ${START_MARKER} / ${END_MARKER}`
    );
  }

  if (endIndex <= startIndex) {
    throw new Error(`Marker order is invalid in ${indexPath}.`);
  }

  const startCount = indexHtml.split(START_MARKER).length - 1;
  const endCount = indexHtml.split(END_MARKER).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(
      `Markers must appear exactly once in ${indexPath}. Found START=${startCount}, END=${endCount}.`
    );
  }

  return {
    startMarkerIndex: startIndex,
    startContentIndex: startIndex + START_MARKER.length,
    endMarkerIndex: endIndex,
  };
}

function prependCardBetweenMarkers(indexHtml, renderedCard, indexPath) {
  const newline = detectNewline(indexHtml);
  const markerRange = findMarkerRange(indexHtml, indexPath);
  const before = indexHtml.slice(0, markerRange.startContentIndex);
  const existing = indexHtml.slice(markerRange.startContentIndex, markerRange.endMarkerIndex);
  const after = indexHtml.slice(markerRange.endMarkerIndex);

  const normalizedCard = stripOuterBlankLines(renderedCard, newline);
  const normalizedExisting = stripOuterBlankLines(existing, newline);

  const betweenLines = [""];
  betweenLines.push(normalizedCard);
  if (normalizedExisting !== "") {
    betweenLines.push("");
    betweenLines.push(normalizedExisting);
  }
  betweenLines.push("");

  return before + betweenLines.join(newline) + after;
}

function updateIndexHtmlForLanguage(repoRoot, articleData, lang) {
  const indexRelativePath = path.join(lang, "index.html");
  const indexPath = path.join(repoRoot, indexRelativePath);
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Index file not found: ${indexRelativePath}`);
  }

  const indexHtml = fs.readFileSync(indexPath, "utf8");
  ensureSlugDoesNotExist(indexHtml, articleData.slug, indexRelativePath);

  const markerRange = findMarkerRange(indexHtml, indexRelativePath);
  if (markerRange.endMarkerIndex <= markerRange.startContentIndex) {
    throw new Error(`Marker section is malformed in ${indexRelativePath}.`);
  }

  const langData = articleData.languages && articleData.languages[lang];
  assertLanguageFields(langData, lang);

  const { templateText, templateRelativePath } = readCardTemplate(repoRoot, lang);
  const cardValues = buildCardValues(articleData, langData);
  const renderedCard = renderTemplate(templateText, cardValues, templateRelativePath);
  const updatedHtml = prependCardBetweenMarkers(indexHtml, renderedCard, indexRelativePath);

  return { indexRelativePath, updatedHtml };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const inputPath = path.resolve(repoRoot, args.inputPath);
    const articleData = readJson(inputPath);

    if (!articleData || typeof articleData !== "object" || Array.isArray(articleData)) {
      throw new Error("Input JSON root must be an object.");
    }
    assertNonEmptyString(articleData.slug, "slug");
    assertNonEmptyString(articleData.lastUpdated, "lastUpdated");
    if (
      typeof articleData.readTimeMinutes !== "number" ||
      Number.isNaN(articleData.readTimeMinutes) ||
      !Number.isFinite(articleData.readTimeMinutes)
    ) {
      throw new Error('Missing or invalid required field: "readTimeMinutes"');
    }

    const updates = SUPPORTED_LANGS.map((lang) =>
      updateIndexHtmlForLanguage(repoRoot, articleData, lang)
    );

    for (const update of updates) {
      const absolutePath = path.join(repoRoot, update.indexRelativePath);
      fs.writeFileSync(absolutePath, update.updatedHtml, "utf8");
    }

    console.log("Updated index files:");
    for (const update of updates) {
      console.log(`- ${update.indexRelativePath}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
