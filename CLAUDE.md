# CLAUDE.md — Work in Japan Factory Guide

## Project Overview

**Purpose:** Automatically generate and publish English articles for a how-to site targeting foreign workers in Japanese factories.

**Site Name:** Work in Japan Factory Guide
**Target Audience:** Foreigners working or seeking work in Japanese factories
**Language:** English (all articles and content)
**GitHub Repository:** https://github.com/obyoboy/factory-japan
**Deployment:** Vercel (auto-deploys on push to main branch)

---

## Agent Architecture

This project uses three agents working in sequence:

### 1. Research Agent
**Role:** Decide article topics and target keywords

Tasks:
- Identify gaps in existing content by reviewing current HTML files
- Choose a topic relevant to foreign factory workers in Japan
- Select a primary keyword (long-tail, low competition preferred)
- Output: `{ topic, primary_keyword, secondary_keywords[], slug, badge_category }`

Topic ideas to draw from:
- Overtime rules and how 残業 (zangyō) works
- How to read a Japanese payslip
- Useful Japanese phrases for the factory floor
- What happens if you quit mid-contract
- Differences between 派遣 (haken) and 直接雇用 (direct hire)
- How 5S (整理・整頓・清掃・清潔・躾) works in practice
- Medical checkups (健康診断) and what to expect
- How to use the company dormitory (寮)

### 2. Writer Agent
**Role:** Write the full article as an HTML file

Tasks:
- Write in English, 1200–2000 words
- Use the article format described below
- Save file as `{slug}.html` in the project root
- Add the new article link to `index.html` in the `#articles` section

### 3. Publisher Agent
**Role:** Push the new article to GitHub and trigger Vercel deployment

Tasks:
- `git add {slug}.html index.html`
- `git commit -m "Add article: {title}"`
- `git push origin main`
- Vercel auto-deploys on push — no manual step needed

---

## Article HTML Format

Every article must follow this exact structure. Use existing articles as reference.

### File naming
- Use lowercase, hyphen-separated slugs
- Example: `how-to-read-japanese-payslip.html`

### Full template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{150-160 char description}">
  <title>{Article Title} | Work in Japan Factory Guide</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

<!-- ===== HEADER ===== -->
<header>
  <div class="header-inner">
    <div class="site-logo"><a href="index.html" style="color:#fff;text-decoration:none;">Work in Japan <span>Factory</span> Guide</a></div>
    <nav>
      <ul>
        <li><a href="index.html">Home</a></li>
        <li><a href="index.html#topics">Topics</a></li>
        <li><a href="index.html#articles">Articles</a></li>
        <li><a href="index.html#about">About</a></li>
      </ul>
    </nav>
  </div>
</header>

<!-- ===== ARTICLE HEADER ===== -->
<div class="article-header">
  <div class="container">
    <span class="badge">{Category}</span>
    <h1>{Article Title}</h1>
    <p class="article-meta">Last updated: {Month Year} &nbsp;|&nbsp; {X} min read</p>
  </div>
</div>

<!-- ===== ARTICLE BODY ===== -->
<article class="article-body">

  <p>{Opening paragraph — hook the reader with a relatable situation}</p>

  <h2>1. {Section Title}</h2>
  <p>{Content}</p>

  <!-- Use tip-box for positive advice -->
  <div class="tip-box">
    <strong>Tip</strong>
    {Practical tip for the reader}
  </div>

  <!-- Use warning-box for things to avoid -->
  <div class="warning-box">
    <strong>Warning</strong>
    {Something that can get a worker in trouble}
  </div>

  <!-- Use key-table for comparisons or structured info -->
  <table class="key-table">
    <thead>
      <tr><th>Column A</th><th>Column B</th></tr>
    </thead>
    <tbody>
      <tr><td>...</td><td>...</td></tr>
    </tbody>
  </table>

  <!-- Repeat h2 sections as needed (aim for 5–8 sections) -->

  <h2>{Final Section}: Summary</h2>
  <p>{Closing paragraph — encourage the reader}</p>

</article>

<!-- ===== FOOTER ===== -->
<footer>
  <div class="container">
    <p>&copy; 2026 Work in Japan Factory Guide. For informational purposes only.</p>
  </div>
</footer>

</body>
</html>
```

### Badge categories (use one per article)
- `Culture`
- `Rules`
- `Safety`
- `Communication`
- `Pay & Benefits`
- `Daily Life`
- `Visa & Documents`
- `Useful Japanese`

---

## Writing Style Guidelines

- **Tone:** Direct, practical, empathetic — written for someone who is nervous about starting factory work in Japan
- **Reading level:** Clear English accessible to non-native speakers (avoid idioms and complex vocabulary)
- **Japanese terms:** Always include the Japanese text in parentheses on first use, e.g., "team leader (班長 / hanchō)"
- **Structure:** Use numbered H2 sections for easy scanning
- **Boxes:** Use `tip-box` for actionable advice, `warning-box` for mistakes that could get someone fired or in trouble
- **Tables:** Use `key-table` for any comparison or list of terms/situations
- No filler content — every sentence should be useful to the reader

---

## Project File Structure

```
factory-japan/
├── index.html                          # Homepage (update #articles section per new article)
├── style.css                           # Shared stylesheet — do not modify without reason
├── about-japanese-factory-culture.html
├── factory-safety-culture.html
├── japanese-factory-rules.html
├── working-with-japanese-colleagues.html
├── {new-articles}.html                 # Added by Writer Agent
└── CLAUDE.md
```

---

## Git Workflow

```bash
# After writing a new article:
git add {slug}.html index.html
git commit -m "Add article: {Article Title}"
git push origin main
# Vercel auto-deploys — no further action needed
```

Branch: `main`
Remote: `https://github.com/obyoboy/factory-japan.git`
