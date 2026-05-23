import { Octokit } from "@octokit/rest";
import { lexer } from "marked";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import axios from "axios";
import path from "path";
import { finished } from "stream/promises";

const USERNAME = "holynova";
const OUTPUT_FILE = "projects_automated.json";
const SCREENSHOT_DIR = "screenshots";
const TOKEN = process.env.GITHUB_TOKEN || "";

const octokit = new Octokit({
  auth: TOKEN,
});

async function getReadme(owner, repo, defaultBranch = "main") {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/README.md`;
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    if (defaultBranch === "main") {
        try {
            const { data } = await axios.get(`https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`);
            return data;
        } catch (e) {}
    }
    return null;
  }
}

async function downloadImage(url, destPath) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = createWriteStream(destPath);
        response.data.pipe(writer);
        await finished(writer);
        return true;
    } catch (error) {
        console.error(`Failed to download image from ${url}: ${error.message}`);
        return false;
    }
}

async function getScreenshot(demoUrl, repoName) {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(demoUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
    try {
        // Microlink with embed=screenshot.url returns the image directly or a redirect to the image
        const localPath = path.join(SCREENSHOT_DIR, `${repoName}.png`);
        const success = await downloadImage(apiUrl, localPath);
        return success ? `./${SCREENSHOT_DIR}/${repoName}.png` : null;
    } catch (error) {
        console.error(`Screenshot failed for ${repoName}: ${error.message}`);
        return null;
    }
}

function extractProjectInfo(markdown, owner, repo, defaultBranch = "main") {
  if (!markdown || typeof markdown !== 'string') return { desc: "", images: [] };

  const tokens = lexer(markdown);
  let desc = "";
  let images = [];

  let foundH1 = false;
  for (const token of tokens) {
    if (token.type === "heading" && token.depth === 1 && !foundH1) {
      foundH1 = true;
      continue;
    }
    if (token.type === "paragraph" && !desc) {
      desc = token.text;
    }
    
    const findImages = (t) => {
      if (t.type === "image") {
        let src = t.href;
        if (!src.startsWith("http")) {
          const cleanPath = src.replace(/^(\.\/|\/)/, "");
          src = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${cleanPath}`;
        }
        images.push(src);
      }
      if (t.tokens) {
        t.tokens.forEach(findImages);
      }
    };
    findImages(token);
  }

  return { desc, images };
}

async function main() {
  console.log(`🚀 Starting scraper for user: ${USERNAME}...`);
  
  try {
    const { data: repos } = await octokit.repos.listForUser({
      username: USERNAME,
      type: "public",
      sort: "updated",
      per_page: 100,
    });

    const filteredRepos = repos.filter(repo => !repo.fork);
    console.log(`📦 Identified ${filteredRepos.length} public non-forked repositories.`);

    // Ensure screenshots directory exists
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

    const projects = [];

    for (const repo of filteredRepos) {
      process.stdout.write(`🔍 Processing ${repo.name}... `);
      
      const markdown = await getReadme(USERNAME, repo.name, repo.default_branch);
      const { desc, images: extractedImages } = extractProjectInfo(markdown, USERNAME, repo.name, repo.default_branch);

      const tags = new Set();
      if (repo.language) tags.add(repo.language.toLowerCase());
      if (repo.topics) {
        repo.topics.forEach(topic => tags.add(topic));
      }

      let demoLink = repo.homepage || "";
      if (!demoLink && repo.has_pages) {
        demoLink = `https://${USERNAME}.github.io/${repo.name}/`;
      }

      let images = [...extractedImages];
      
      // If no images found in README, try to take a screenshot of the demo link
      if (images.length === 0 && demoLink) {
        process.stdout.write(`📸 Capturing screenshot... `);
        const screenshotPath = await getScreenshot(demoLink, repo.name);
        if (screenshotPath) {
          images.push(screenshotPath);
        }
      }

      projects.push({
        title: repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        desc: (desc || "").split("\n")[0].slice(0, 200),
        repoName: repo.name,
        demoLink,
        repoLink: repo.html_url,
        images: images.slice(0, 2),
        tags: Array.from(tags),
      });
      process.stdout.write(`Done\n`);
    }

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(projects, null, 2));
    console.log(`\n✅ Success! Data written to ${OUTPUT_FILE}`);
    console.log(`💡 Total projects captured: ${projects.length}`);

  } catch (error) {
    if (error.status === 403) {
        console.error("\n❌ GitHub API Rate Limit exceeded. Please provide GITHUB_TOKEN.");
    } else {
        console.error("\n❌ Scraper failed:", error.message);
    }
  }
}

main();
