import { Octokit } from "@octokit/rest";
import { lexer } from "marked";
import fs from "fs/promises";
import axios from "axios";

const USERNAME = "holynova";
const OUTPUT_FILE = "projects_automated.json";
const TOKEN = process.env.GITHUB_TOKEN || "";

const octokit = new Octokit({
  auth: TOKEN,
});

async function getReadme(owner, repo, defaultBranch = "main") {
  // Use raw.githubusercontent.com to avoid API rate limits for non-authenticated requests
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/README.md`;
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    // If main fails, try master
    if (defaultBranch === "main") {
        try {
            const { data } = await axios.get(`https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`);
            return data;
        } catch (e) {}
    }
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
    // Extract first paragraph for description
    if (token.type === "paragraph" && !desc) {
      desc = token.text;
    }
    
    const findImages = (t) => {
      if (t.type === "image") {
        let src = t.href;
        if (!src.startsWith("http")) {
          // Clean up relative path
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
    // Fetch all public repos
    const { data: repos } = await octokit.repos.listForUser({
      username: USERNAME,
      type: "public",
      sort: "updated",
      per_page: 100, // Adjust if user has > 100 repos
    });

    const filteredRepos = repos.filter(repo => !repo.fork);
    console.log(`📦 Identified ${filteredRepos.length} public non-forked repositories.`);

    const projects = [];

    for (const repo of filteredRepos) {
      process.stdout.write(`🔍 Processing ${repo.name}... `);
      
      const markdown = await getReadme(USERNAME, repo.name, repo.default_branch);
      const { desc, images } = extractProjectInfo(markdown, USERNAME, repo.name, repo.default_branch);

      const tags = new Set();
      if (repo.language) tags.add(repo.language.toLowerCase());
      if (repo.topics) {
        repo.topics.forEach(topic => tags.add(topic));
      }

      let demoLink = repo.homepage || "";
      if (!demoLink && repo.has_pages) {
        demoLink = `https://${USERNAME}.github.io/${repo.name}/`;
      }

      projects.push({
        title: repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        desc: (desc || "").split("\n")[0].slice(0, 200), // Safety truncation
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
