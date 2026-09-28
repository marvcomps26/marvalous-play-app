import { chromium } from "playwright";
import fs from "node:fs/promises";

const WEBSITE_URL = "https://marvalouscompetitions.co.uk/";

const browser = await chromium.launch({
  headless: true
});

try {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    viewport: {
      width: 1440,
      height: 1600
    }
  });

  await page.goto(WEBSITE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  // Give the live winner counter time to load/update.
  await page.waitForTimeout(10000);

  const pageTitle = await page.title();
  const bodyText = await page.locator("body").innerText();

  if (
    pageTitle.toLowerCase().includes("access blocked") ||
    bodyText.toLowerCase().includes("access blocked")
  ) {
    throw new Error("Website returned the Access Blocked page.");
  }

  const lines = bodyText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  console.log("Looking for Today's Count...");

  let todaysWinnerCount = null;

  for (let i = 0; i < lines.length; i++) {
    if (/Today(?:'|’)?s Count/i.test(lines[i])) {
      console.log("Found heading:", lines[i]);

      // The actual counter should appear immediately after the heading.
      for (
        let j = i + 1;
        j < Math.min(i + 6, lines.length);
        j++
      ) {
        console.log("Checking:", lines[j]);

        if (/^\d+$/.test(lines[j])) {
          todaysWinnerCount = Number(lines[j]);
          break;
        }
      }
    }

    if (todaysWinnerCount !== null) {
      break;
    }
  }

  if (todaysWinnerCount === null) {
    throw new Error(
      "Could not find today's instant winner count."
    );
  }

  const output = {
    updatedAt: new Date().toISOString(),
    todaysWinnerCount
  };

  await fs.writeFile(
    "winner-count.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Today's instant winner count: ${todaysWinnerCount}`
  );
} finally {
  await browser.close();
}
