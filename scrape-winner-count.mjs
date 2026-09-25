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

  await page.waitForTimeout(5000);

  const pageTitle = await page.title();
  const bodyText = await page.locator("body").innerText();

  if (
    pageTitle.toLowerCase().includes("access blocked") ||
    bodyText.toLowerCase().includes("access blocked")
  ) {
    throw new Error("Website returned the Access Blocked page.");
  }

  const text = bodyText
    .replace(/\s+/g, " ")
    .trim();

  const match =
    text.match(
      /Instant Winners[\s\S]*?Today(?:'|’)?s Count[\s\S]*?(\d+)/i
    ) ||
    text.match(
      /Today(?:'|’)?s Count[\s\S]*?(\d+)/i
    );

  if (!match) {
    throw new Error(
      "Could not find today's instant winner count."
    );
  }

  const todaysWinnerCount = Number(match[1]);

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
