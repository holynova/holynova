import fs from "fs/promises";
import { createWriteStream } from "fs";
import axios from "axios";
import path from "path";
import { finished } from "stream/promises";

const INPUT_FILE = "projects_automated.json";
const OUTPUT_FILE = "projects_automated.json";
const SCREENSHOT_DIR = "screenshots";

async function downloadImage(url, destPath) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000 // 30s timeout
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
    // Microlink API for screenshots
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(demoUrl)}&screenshot=true&embed=screenshot.url`;
    try {
        const localPath = path.join(SCREENSHOT_DIR, `${repoName}.png`);
        console.log(`📸 Capturing ${demoUrl}...`);
        const success = await downloadImage(apiUrl, localPath);
        return success ? `./${SCREENSHOT_DIR}/${repoName}.png` : null;
    } catch (error) {
        console.error(`Screenshot failed for ${repoName}: ${error.message}`);
        return null;
    }
}

async function main() {
    try {
        const data = await fs.readFile(INPUT_FILE, "utf8");
        const projects = JSON.parse(data);
        
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        
        let count = 0;
        for (const project of projects) {
            if (project.images.length === 0 && project.demoLink) {
                const screenshotPath = await getScreenshot(project.demoLink, project.repoName);
                if (screenshotPath) {
                    project.images.push(screenshotPath);
                    count++;
                }
            }
        }
        
        if (count > 0) {
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(projects, null, 2));
            console.log(`✅ Success! Updated ${count} projects with screenshots.`);
        } else {
            console.log("ℹ️ No projects needed screenshots.");
        }
        
    } catch (error) {
        console.error("❌ Backfill failed:", error);
    }
}

main();
