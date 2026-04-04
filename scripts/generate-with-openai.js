#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const DEFAULT_TOPIC_PATH = path.join("drafts", "topic.json");
const DEFAULT_OUTPUT_PATH = path.join("drafts", "article.json");
const DEFAULT_SKILL_PATH = path.join(".claude", "skills", "generate-article", "SKILL.md");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const DEFAULT_TIMEOUT_MS = 420000;

function parseArgs(argv) {
  const options = {
    topicPath: DEFAULT_TOPIC_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    skillPath: DEFAULT_SKILL_PATH,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--topic") {
      options.topicPath = readOptionValue(argv, index, "--topic");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.outputPath = readOptionValue(argv, index, "--output");
      index += 1;
      continue;
    }

    if (arg === "--skill") {
      options.skillPath = readOptionValue(argv, index, "--skill");
      index += 1;
      continue;
    }

    if (arg === "--model") {
      options.model = readOptionValue(argv, index, "--model");
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const raw = readOptionValue(argv, index, "--timeout-ms");
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
      options.timeoutMs = parsed;
      index += 1;
      continue;
    }

    throw new Error(
      "Unknown argument: " +
        `${arg}\nUsage: node scripts/generate-with-openai.js ` +
        "[--topic drafts/topic.json] " +
        "[--output drafts/article.json] " +
        "[--skill .claude/skills/generate-article/SKILL.md] " +
        "[--model gpt-5] " +
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

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function readTextFile(filePath, label) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw new Error(`Failed to read ${label} (${filePath}): ${error.message}`);
  }
}

function toPromptPath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function buildPrompt(repoRoot, skillPath, topicPath, outputPath, skillText, topicText) {
  const skillDisplay = toPromptPath(repoRoot, path.resolve(repoRoot, skillPath));
  const topicDisplay = toPromptPath(repoRoot, path.resolve(repoRoot, topicPath));
  const outputDisplay = toPromptPath(repoRoot, path.resolve(repoRoot, outputPath));

  return (
    `Follow the skill instructions and generate article JSON.\n\n` +
    `## Skill (${skillDisplay})\n\n` +
    `${skillText.trim()}\n\n` +
    "---\n\n" +
    `## Input Topic (${topicDisplay})\n\n` +
    `${topicText.trim()}\n\n` +
    "---\n\n" +
    "## Output requirements\n\n" +
    "- Return exactly one valid JSON object via stdout only.\n" +
    "- Do not include markdown code fences.\n" +
    "- Do not include explanation or any extra text.\n" +
    "- Keep EN as source meaning and TL/VI as natural translations.\n" +
    `- The JSON must be ready to save as \`${outputDisplay}\`.\n` +
    "- Do not modify any files."
  );
}

function buildArticleJsonSchema() {
  return {
    type: "object",
    required: ["slug", "lastUpdated", "readTimeMinutes", "languages"],
    additionalProperties: true,
    properties: {
      slug: { type: "string", minLength: 1 },
      lastUpdated: { type: "string", minLength: 1 },
      readTimeMinutes: { type: "number" },
      languages: {
        type: "object",
        required: ["en", "tl", "vi"],
        additionalProperties: true,
        properties: {
          en: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                additionalProperties: true,
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
          tl: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                additionalProperties: true,
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
          vi: {
            type: "object",
            required: [
              "title",
              "metaDescription",
              "badge",
              "excerpt",
              "image",
              "bodyHtml",
            ],
            additionalProperties: true,
            properties: {
              title: { type: "string", minLength: 1 },
              metaDescription: { type: "string", minLength: 1 },
              badge: { type: "string", minLength: 1 },
              excerpt: { type: "string", minLength: 1 },
              image: {
                type: "object",
                required: ["url", "alt"],
                additionalProperties: true,
                properties: {
                  url: { type: "string", minLength: 1 },
                  alt: { type: "string", minLength: 1 },
                },
              },
              bodyHtml: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  };
}

function requestJson(urlText, method, headers, bodyText, timeoutMs) {
  return new Promise((resolve, reject) => {
    const urlObject = new URL(urlText);
    const request = https.request(
      {
        protocol: urlObject.protocol,
        hostname: urlObject.hostname,
        port: urlObject.port,
        path: `${urlObject.pathname}${urlObject.search}`,
        method,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 0;
          const rawBody = Buffer.concat(chunks).toString("utf8");
          let parsedBody = null;

          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : null;
          } catch (error) {
            // Keep parsedBody as null and report raw text below.
          }

          if (status < 200 || status >= 300) {
            const apiMessage =
              parsedBody &&
              parsedBody.error &&
              typeof parsedBody.error.message === "string"
                ? parsedBody.error.message.trim()
                : rawBody.trim();
            const error = new Error(
              `OpenAI API request failed with HTTP ${status}${
                apiMessage ? `: ${apiMessage}` : ""
              }`
            );
            error.httpStatus = status;
            error.apiMessage = apiMessage;
            reject(error);
            return;
          }

          if (!parsedBody || typeof parsedBody !== "object") {
            reject(new Error("OpenAI API returned a non-JSON response."));
            return;
          }

          resolve(parsedBody);
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`OpenAI request timed out after ${timeoutMs} ms.`));
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (bodyText) {
      request.write(bodyText);
    }
    request.end();
  });
}

function stripMarkdownCodeFence(text) {
  const trimmed = String(text || "").trim();
  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function extractFirstJsonObject(text) {
  const source = String(text || "");
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJsonObjectFromText(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").trim();
  if (normalized === "") {
    throw new Error("GPT returned empty output.");
  }

  const candidates = [];
  candidates.push(normalized);

  const unfenced = stripMarkdownCodeFence(normalized);
  if (unfenced && unfenced !== normalized) {
    candidates.push(unfenced);
  }

  const extractedNormalized = extractFirstJsonObject(normalized);
  if (extractedNormalized && !candidates.includes(extractedNormalized)) {
    candidates.push(extractedNormalized);
  }

  const extractedUnfenced = extractFirstJsonObject(unfenced);
  if (extractedUnfenced && !candidates.includes(extractedUnfenced)) {
    candidates.push(extractedUnfenced);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try next candidate.
    }
  }

  throw new Error("GPT output was not valid JSON.");
}

function isArticleLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (typeof value.slug !== "string" || value.slug.trim() === "") {
    return false;
  }
  if (!value.languages || typeof value.languages !== "object") {
    return false;
  }
  for (const lang of ["en", "tl", "vi"]) {
    if (!value.languages[lang] || typeof value.languages[lang] !== "object") {
      return false;
    }
  }
  return true;
}

function findArticleLikeObjectDeep(node, maxDepth = 8, currentDepth = 0) {
  if (currentDepth > maxDepth) {
    return null;
  }

  if (isArticleLikeObject(node)) {
    return node;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findArticleLikeObjectDeep(item, maxDepth, currentDepth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  for (const key of Object.keys(node)) {
    const found = findArticleLikeObjectDeep(node[key], maxDepth, currentDepth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractOpenAiText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim() !== "") {
    return responseJson.output_text;
  }

  const parts = [];
  if (Array.isArray(responseJson.output)) {
    for (const message of responseJson.output) {
      if (!message || typeof message !== "object") {
        continue;
      }
      if (!Array.isArray(message.content)) {
        continue;
      }
      for (const content of message.content) {
        if (!content || typeof content !== "object") {
          continue;
        }
        if (typeof content.text === "string" && content.text.trim() !== "") {
          parts.push(content.text);
          continue;
        }
        if (
          typeof content.output_text === "string" &&
          content.output_text.trim() !== ""
        ) {
          parts.push(content.output_text);
        }
      }
    }
  }

  return parts.join("\n").trim();
}

function normalizeOpenAiArticleResponse(responseJson) {
  const directObject = findArticleLikeObjectDeep(responseJson);
  if (directObject) {
    return directObject;
  }

  const text = extractOpenAiText(responseJson);
  if (!text) {
    throw new Error("OpenAI response did not contain model text output.");
  }

  const parsed = parseJsonObjectFromText(text);
  const articleObject = findArticleLikeObjectDeep(parsed);
  if (articleObject) {
    return articleObject;
  }
  throw new Error("OpenAI returned JSON but not article structure (slug/languages.en|tl|vi).");
}

function buildResponsesPayload(model, prompt, useSchema) {
  const payload = {
    model,
    input: prompt,
  };

  if (useSchema) {
    payload.text = {
      format: {
        type: "json_schema",
        name: "article_json",
        schema: buildArticleJsonSchema(),
        strict: true,
      },
    };
  }

  return payload;
}

function saveArticleJson(articlePath, articleData) {
  const outputDir = path.dirname(articlePath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(articlePath, `${JSON.stringify(articleData, null, 2)}\n`, "utf8");
}

function shouldRetryWithoutSchema(error) {
  if (!error) {
    return false;
  }
  if (error.httpStatus !== 400) {
    return false;
  }
  const text = String(error.apiMessage || error.message || "");
  return /json_schema|text\.format|unsupported|unknown|invalid/i.test(text);
}

async function generateWithOpenAi(apiKey, model, prompt, timeoutMs) {
  const endpoint = "https://api.openai.com/v1/responses";
  const baseHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const schemaPayload = buildResponsesPayload(model, prompt, true);
  try {
    const schemaResponse = await requestJson(
      endpoint,
      "POST",
      baseHeaders,
      JSON.stringify(schemaPayload),
      timeoutMs
    );
    return normalizeOpenAiArticleResponse(schemaResponse);
  } catch (error) {
    if (!shouldRetryWithoutSchema(error)) {
      throw error;
    }

    const plainPayload = buildResponsesPayload(model, prompt, false);
    const plainResponse = await requestJson(
      endpoint,
      "POST",
      baseHeaders,
      JSON.stringify(plainPayload),
      timeoutMs
    );
    return normalizeOpenAiArticleResponse(plainResponse);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const topicPath = path.resolve(repoRoot, options.topicPath);
  const outputPath = path.resolve(repoRoot, options.outputPath);
  const skillPath = path.resolve(repoRoot, options.skillPath);

  assertFileExists(topicPath, "topic input");
  assertFileExists(skillPath, "article skill file");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "OPENAI_API_KEY is not set. Set it before GPT fallback generation."
    );
  }

  const skillText = readTextFile(skillPath, "article skill file");
  const topicText = readTextFile(topicPath, "topic input");
  const prompt = buildPrompt(
    repoRoot,
    options.skillPath,
    options.topicPath,
    options.outputPath,
    skillText,
    topicText
  );

  console.log(
    `Calling OpenAI model "${options.model}" (timeout ${Math.round(
      options.timeoutMs / 1000
    )}s)...`
  );

  const articleData = await generateWithOpenAi(
    apiKey.trim(),
    options.model,
    prompt,
    options.timeoutMs
  );

  saveArticleJson(outputPath, articleData);
  console.log(`Saved article JSON: ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
