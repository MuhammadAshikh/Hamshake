import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/^\/([A-Z]:)/, "$1");
const framesPath = `${rootPath}video-frames`;
const stillsPath = `${rootPath}video-stills`;
const outputPath = `${rootPath}artifacts/Domain-Gated-Messaging.mp4`;
const baseUrl = "http://127.0.0.1:5174/video.html";
const stillTimes = [1.4, 4.7, 7.5, 10.8, 14.2];
const isFullRender = process.argv.includes("--render");

async function waitForServer(url, server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      if (server.exitCode !== null) throw new Error("Vite exited before the render page became available.");
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runEncoder() {
  await mkdir(`${rootPath}artifacts`, { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const args = [
    "-y",
    "-framerate", "60",
    "-i", `${framesPath}/frame-%04d.jpg`,
    "-frames:v", "900",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-metadata", "title=Domain-Gated Messaging",
    outputPath,
  ];
  await new Promise((resolve, reject) => {
    const encoder = spawn(ffmpeg, args, { stdio: "inherit", windowsHide: true });
    encoder.once("error", reject);
    encoder.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`)));
  });
}

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
  cwd: rootPath,
  stdio: "ignore",
  windowsHide: true,
});
let browser;
try {
  await waitForServer(baseUrl, server);
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.error("Page error:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Browser error:", message.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.videoReady === true, { timeout: 30000 });

  const stillDirectory = `${stillsPath}`;
  await rm(stillDirectory, { recursive: true, force: true });
  await mkdir(stillDirectory, { recursive: true });
  for (let index = 0; index < stillTimes.length; index += 1) {
    const time = stillTimes[index];
    await page.evaluate((frameTime) => window.renderVideoFrame(frameTime), time);
    await page.locator("#video").screenshot({
      path: `${stillDirectory}/scene-${index + 1}-${time.toFixed(1)}s.png`,
      animations: "disabled",
    });
  }
  console.log(`Scene stills saved to ${stillDirectory}`);

  if (isFullRender) {
    await rm(framesPath, { recursive: true, force: true });
    await mkdir(framesPath, { recursive: true });
    for (let frame = 0; frame < 900; frame += 1) {
      await page.evaluate((frameTime) => window.renderVideoFrame(frameTime), frame / 60);
      await page.locator("#video").screenshot({
        path: `${framesPath}/frame-${String(frame).padStart(4, "0")}.jpg`,
        type: "jpeg",
        quality: 94,
        animations: "disabled",
      });
      if ((frame + 1) % 60 === 0) console.log(`Rendered ${frame + 1}/900 frames`);
    }
    await runEncoder();
    console.log(`MP4 written to ${outputPath}`);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
