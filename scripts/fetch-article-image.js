#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const DEFAULT_INPUT_PATH = path.join("drafts", "article.json");
const DEFAULT_TOPIC_PATH = path.join("drafts", "topic.json");
const DEFAULT_OUTPUT_DIR = path.join("images", "articles");
const DEFAULT_REGISTRY_PATH = path.join("images", "image-registry.json");
const SUPPORTED_LANGS = ["en", "tl", "vi"];
const USER_AGENT = "factory-japan-image-fetcher/1.0";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "with",
  "work",
  "worker",
  "workers",
  "factory",
  "factories",
  "japan",
  "japanese",
]);

function parseArgs(argv) {
  const options = {
    inputPath: DEFAULT_INPUT_PATH,
    topicPath: DEFAULT_TOPIC_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    registryPath: DEFAULT_REGISTRY_PATH,
    queryOverride: "",
    perPage: 30,
    maxPages: 2,
    force: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      options.inputPath = readOptionValue(argv, index, "--input");
      index += 1;
      continue;
    }

    if (arg === "--topic") {
      options.topicPath = readOptionValue(argv, index, "--topic");
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = readOptionValue(argv, index, "--output-dir");
      index += 1;
      continue;
    }

    if (arg === "--registry") {
      options.registryPath = readOptionValue(argv, index, "--registry");
      index += 1;
      continue;
    }

    if (arg === "--query") {
      options.queryOverride = readOptionValue(argv, index, "--query");
      index += 1;
      continue;
    }

    if (arg === "--per-page") {
      const value = Number.parseInt(readOptionValue(argv, index, "--per-page"), 10);
      if (!Number.isFinite(value) || value <= 0 || value > 80) {
        throw new Error("--per-page must be an integer between 1 and 80.");
      }
      options.perPage = value;
      index += 1;
      continue;
    }

    if (arg === "--max-pages") {
      const value = Number.parseInt(readOptionValue(argv, index, "--max-pages"), 10);
      if (!Number.isFinite(value) || value <= 0 || value > 10) {
        throw new Error("--max-pages must be an integer between 1 and 10.");
      }
      options.maxPages = value;
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}\n` +
        "Usage: node scripts/fetch-article-image.js " +
        "[--input drafts/article.json] " +
        "[--topic drafts/topic.json] " +
        "[--output-dir images/articles] " +
        "[--registry images/image-registry.json] " +
        "[--query \"custom query\"] " +
        "[--per-page 30] [--max-pages 2] [--force] [--dry-run]"
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
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label}: ${error.message}`);
  }

  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function assertNonEmptyString(value, fieldLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldLabel} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeRegistry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 1, images: [] };
  }

  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  return {
    version: 1,
    images: images.filter((entry) => typeof entry === "object" && !Array.isArray(entry)),
  };
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    return { version: 1, images: [] };
  }
  const raw = readJsonFile(registryPath, "image registry");
  return normalizeRegistry(raw);
}

function saveRegistry(registryPath, registry) {
  writeJsonFile(registryPath, normalizeRegistry(registry));
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  return normalizeWhitespace(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
  )
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (normalized === "") {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildQueries(topicData, slug, overrideQuery) {
  if (typeof overrideQuery === "string" && overrideQuery.trim() !== "") {
    return [normalizeWhitespace(overrideQuery)];
  }

  const topic = normalizeWhitespace(topicData && topicData.topic);
  const category = normalizeWhitespace(topicData && topicData.category);
  const topicId = normalizeWhitespace((topicData && topicData.id) || slug).replace(/-/g, " ");
  const keywords = Array.isArray(topicData && topicData.keywords)
    ? topicData.keywords
        .filter((item) => typeof item === "string")
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean)
    : [];

  return uniqueNonEmpty([
    `${topic} ${keywords.join(" ")} japan factory worker`,
    `${topicId} japan factory worker`,
    `${category} japan factory production line`,
    "japan factory worker safety production line",
  ]);
}

function buildScoreTokens(queries, slug) {
  return tokenize(`${queries.join(" ")} ${String(slug || "").replace(/-/g, " ")}`);
}

function requestBuffer(urlText, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let urlObject;
    try {
      urlObject = new URL(urlText);
    } catch (error) {
      reject(new Error(`Invalid URL: ${urlText}`));
      return;
    }

    const request = https.request(
      {
        protocol: urlObject.protocol,
        hostname: urlObject.hostname,
        port: urlObject.port,
        path: `${urlObject.pathname}${urlObject.search}`,
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          ...headers,
        },
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          if (redirectCount >= 5) {
            reject(new Error(`Too many redirects for URL: ${urlText}`));
            return;
          }
          const redirected = new URL(location, urlText).toString();
          response.resume();
          requestBuffer(redirected, headers, redirectCount + 1).then(resolve, reject);
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          if (status < 200 || status >= 300) {
            const message = body.toString("utf8").slice(0, 1000).trim();
            reject(
              new Error(
                `HTTP ${status} for ${urlText}${message ? `\nResponse: ${message}` : ""}`
              )
            );
            return;
          }

          resolve({
            status,
            buffer: body,
            contentType: String(response.headers["content-type"] || ""),
            finalUrl: urlText,
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(new Error(`Request failed for ${urlText}: ${error.message}`));
    });
    request.end();
  });
}

async function requestJson(urlText, headers = {}) {
  const result = await requestBuffer(urlText, headers);
  try {
    return JSON.parse(result.buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON response from ${urlText}: ${error.message}`);
  }
}

function inferImageExtension(contentType, urlText) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) {
    return ".jpg";
  }
  if (normalized.includes("image/png")) {
    return ".png";
  }
  if (normalized.includes("image/webp")) {
    return ".webp";
  }

  try {
    const ext = path.extname(new URL(urlText).pathname).toLowerCase();
    if (ext === ".jpeg") {
      return ".jpg";
    }
    if (ext === ".jpg" || ext === ".png" || ext === ".webp") {
      return ext;
    }
  } catch (error) {
    // Ignore URL parse issues and use default extension below.
  }
  return ".jpg";
}

function scorePhoto(photo, tokens) {
  const width = Number(photo.width) || 0;
  const height = Number(photo.height) || 1;
  const ratio = width / height;
  const alt = String(photo.alt || "").toLowerCase();

  let score = 0;
  if (width >= 1600) {
    score += 18;
  } else if (width >= 1200) {
    score += 12;
  }
  if (ratio >= 1.2) {
    score += 12;
  }
  score += Math.max(0, 10 - Math.abs(ratio - 1.77) * 8);

  for (const token of tokens) {
    if (alt.includes(token)) {
      score += 7;
    }
  }

  if (photo.src && photo.src.large2x) {
    score += 3;
  }
  return score;
}

function pickDownloadUrl(photo) {
  if (!photo || typeof photo !== "object") {
    return "";
  }
  const source = photo.src || {};
  return (
    source.large2x ||
    source.large ||
    source.landscape ||
    source.original ||
    source.medium ||
    ""
  );
}

function readApiKey() {
  const apiKey = process.env.PEXELS_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(
      "PEXELS_API_KEY is not set. Set your API key first.\n" +
        "PowerShell: $env:PEXELS_API_KEY='YOUR_KEY'"
    );
  }
  return apiKey.trim();
}

function ensureArticleShape(articleData) {
  if (!articleData || typeof articleData !== "object" || Array.isArray(articleData)) {
    throw new Error("Input article JSON must be an object.");
  }
  const slug = assertNonEmptyString(articleData.slug, "article.slug");
  if (!articleData.languages || typeof articleData.languages !== "object") {
    throw new Error("article.languages must be an object.");
  }
  for (const lang of SUPPORTED_LANGS) {
    const block = articleData.languages[lang];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error(`Missing language block: article.languages.${lang}`);
    }
    if (!block.image || typeof block.image !== "object" || Array.isArray(block.image)) {
      block.image = {};
    }
  }
  return slug;
}

function collectUsedSets(registry) {
  const used = {
    photoIds: new Set(),
    photoUrls: new Set(),
    hashes: new Set(),
  };

  for (const image of registry.images) {
    if (Number.isInteger(image.photoId) || Number.isFinite(image.photoId)) {
      used.photoIds.add(Number(image.photoId));
    }
    if (typeof image.photoPageUrl === "string" && image.photoPageUrl.trim() !== "") {
      used.photoUrls.add(image.photoPageUrl.trim());
    }
    if (typeof image.sha256 === "string" && image.sha256.trim() !== "") {
      used.hashes.add(image.sha256.trim());
    }
  }

  return used;
}

function findReusableImageFile(registry, slug, outputDirPath) {
  const bySlug = registry.images.find(
    (entry) =>
      entry &&
      entry.slug === slug &&
      typeof entry.file === "string" &&
      entry.file.trim() !== "" &&
      fs.existsSync(path.resolve(process.cwd(), entry.file))
  );

  if (bySlug && typeof bySlug.file === "string") {
    return path.basename(bySlug.file);
  }

  if (!fs.existsSync(outputDirPath)) {
    return "";
  }

  const prefix = `${slug}.`;
  const matches = fs
    .readdirSync(outputDirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(prefix));

  if (matches.length === 0) {
    return "";
  }

  matches.sort();
  return matches[0];
}

function updateArticleImageUrls(articleData, imageUrl, fallbackAlt) {
  let changed = false;
  for (const lang of SUPPORTED_LANGS) {
    const image = articleData.languages[lang].image;
    if (image.url !== imageUrl) {
      image.url = imageUrl;
      changed = true;
    }
    if (typeof image.alt !== "string" || image.alt.trim() === "") {
      image.alt = fallbackAlt;
      changed = true;
    }
  }
  return changed;
}

function cleanupOtherSlugFiles(outputDirPath, slug, keepFileName) {
  if (!fs.existsSync(outputDirPath)) {
    return;
  }
  const prefix = `${slug}.`;
  for (const entry of fs.readdirSync(outputDirPath, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.startsWith(prefix)) {
      continue;
    }
    if (entry.name === keepFileName) {
      continue;
    }
    fs.unlinkSync(path.join(outputDirPath, entry.name));
  }
}

async function fetchPhotoCandidates(apiKey, query, page, perPage) {
  const endpoint =
    "https://api.pexels.com/v1/search?" +
    `query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape`;
  const response = await requestJson(endpoint, { Authorization: apiKey });
  return Array.isArray(response.photos) ? response.photos : [];
}

function buildFallbackAlt(photoAlt, slug) {
  const normalized = normalizeWhitespace(photoAlt);
  if (normalized !== "") {
    return normalized;
  }
  return `Factory work scene in Japan (${slug})`;
}

async function selectUniquePhoto(apiKey, queries, tokens, used, options) {
  const allCandidates = [];

  for (const query of queries) {
    for (let page = 1; page <= options.maxPages; page += 1) {
      const photos = await fetchPhotoCandidates(apiKey, query, page, options.perPage);
      for (const photo of photos) {
        if (!photo || typeof photo !== "object") {
          continue;
        }
        allCandidates.push({ photo, query });
      }
      if (photos.length < options.perPage) {
        break;
      }
    }
  }

  if (allCandidates.length === 0) {
    throw new Error("No images were returned by Pexels for the search query.");
  }

  const byPhotoId = new Map();
  for (const candidate of allCandidates) {
    const photoId = Number(candidate.photo.id);
    if (!Number.isFinite(photoId)) {
      continue;
    }
    if (!byPhotoId.has(photoId)) {
      byPhotoId.set(photoId, candidate);
    }
  }

  const filtered = [];
  for (const candidate of byPhotoId.values()) {
    const photo = candidate.photo;
    const photoId = Number(photo.id);
    const photoPageUrl = typeof photo.url === "string" ? photo.url.trim() : "";
    const width = Number(photo.width) || 0;
    const height = Number(photo.height) || 0;
    const downloadUrl = pickDownloadUrl(photo);

    if (!Number.isFinite(photoId)) {
      continue;
    }
    if (used.photoIds.has(photoId)) {
      continue;
    }
    if (photoPageUrl !== "" && used.photoUrls.has(photoPageUrl)) {
      continue;
    }
    if (downloadUrl === "") {
      continue;
    }
    if (width < height) {
      continue;
    }
    filtered.push(candidate);
  }

  if (filtered.length === 0) {
    throw new Error("All fetched images were duplicates of previously used photos.");
  }

  filtered.sort((left, right) => {
    return scorePhoto(right.photo, tokens) - scorePhoto(left.photo, tokens);
  });

  for (const candidate of filtered) {
    const downloadUrl = pickDownloadUrl(candidate.photo);
    if (downloadUrl === "") {
      continue;
    }

    const download = await requestBuffer(downloadUrl);
    const sha256 = crypto.createHash("sha256").update(download.buffer).digest("hex");
    if (used.hashes.has(sha256)) {
      continue;
    }

    return {
      candidate,
      download,
      sha256,
    };
  }

  throw new Error("All candidate images matched previously used image content hashes.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const inputPath = path.resolve(repoRoot, options.inputPath);
  const topicPath = path.resolve(repoRoot, options.topicPath);
  const outputDirPath = path.resolve(repoRoot, options.outputDir);
  const registryPath = path.resolve(repoRoot, options.registryPath);

  const articleData = readJsonFile(inputPath, "article input");
  const slug = ensureArticleShape(articleData);
  const registry = loadRegistry(registryPath);

  fs.mkdirSync(outputDirPath, { recursive: true });

  if (!options.force) {
    const reusableFileName = findReusableImageFile(registry, slug, outputDirPath);
    if (reusableFileName !== "") {
      const imageUrl = `../images/articles/${reusableFileName}`;
      const changed = updateArticleImageUrls(
        articleData,
        imageUrl,
        buildFallbackAlt("", slug)
      );
      if (changed && !options.dryRun) {
        writeJsonFile(inputPath, articleData);
      }
      console.log(`Reused existing image: images/articles/${reusableFileName}`);
      if (changed) {
        console.log(`Updated image URLs in: ${path.relative(repoRoot, inputPath)}`);
      }
      return;
    }
  }

  const apiKey = readApiKey();
  const topicData =
    typeof options.queryOverride === "string" && options.queryOverride.trim() !== ""
      ? {}
      : readJsonFile(topicPath, "topic input");

  const queries = buildQueries(topicData, slug, options.queryOverride);
  if (queries.length === 0) {
    throw new Error("Could not build a search query for Pexels.");
  }

  const tokens = buildScoreTokens(queries, slug);
  const used = collectUsedSets(registry);
  const selected = await selectUniquePhoto(apiKey, queries, tokens, used, options);

  const photo = selected.candidate.photo;
  const queryUsed = selected.candidate.query;
  const extension = inferImageExtension(selected.download.contentType, selected.download.finalUrl);
  const fileName = `${slug}${extension}`;
  const localPath = path.join(outputDirPath, fileName);
  const relativeFile = path.posix.join("images", "articles", fileName);
  const imageUrl = `../images/articles/${fileName}`;
  const fallbackAlt = buildFallbackAlt(photo.alt, slug);

  console.log(
    `Selected Pexels photo id=${photo.id} (${photo.width}x${photo.height}) using query: "${queryUsed}"`
  );

  if (!options.dryRun) {
    fs.writeFileSync(localPath, selected.download.buffer);
    cleanupOtherSlugFiles(outputDirPath, slug, fileName);
  }

  const changed = updateArticleImageUrls(articleData, imageUrl, fallbackAlt);
  if (changed && !options.dryRun) {
    writeJsonFile(inputPath, articleData);
  }

  if (!options.dryRun) {
    registry.images = registry.images.filter((entry) => entry.slug !== slug);
    registry.images.push({
      slug,
      provider: "pexels",
      photoId: Number(photo.id),
      photoPageUrl: typeof photo.url === "string" ? photo.url : "",
      photographer: typeof photo.photographer === "string" ? photo.photographer : "",
      photographerUrl:
        typeof photo.photographer_url === "string" ? photo.photographer_url : "",
      query: queryUsed,
      file: relativeFile,
      sha256: selected.sha256,
      width: Number(photo.width) || 0,
      height: Number(photo.height) || 0,
      downloadedAt: new Date().toISOString(),
    });

    registry.images.sort((left, right) => String(left.slug).localeCompare(String(right.slug)));
    saveRegistry(registryPath, registry);
  }

  console.log(`Saved image: ${path.relative(repoRoot, localPath)}`);
  if (changed) {
    console.log(`Updated image URLs in: ${path.relative(repoRoot, inputPath)}`);
  }
  console.log(`Updated registry: ${path.relative(repoRoot, registryPath)}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
