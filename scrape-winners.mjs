import { chromium } from "playwright";
import fs from "node:fs/promises";

const URL = "https://marvalouscompetitions.co.uk/instant-winners";

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

  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  const winners = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    const images = Array.from(document.querySelectorAll("img"));

    for (const img of images) {
      let container = img.parentElement;

      // Walk upwards looking for the winner card.
      for (let i = 0; i < 6 && container; i++) {
        const text = (container.innerText || "")
          .replace(/\s+/g, " ")
          .trim();

        if (/\bwon\b/i.test(text) && text.length < 500) {
          const lines = (container.innerText || "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

          const winnerLine = lines.find(line =>
            /\bwon\b/i.test(line)
          );

          if (!winnerLine) break;

          const key = winnerLine + "|" + img.src;

          if (seen.has(key)) break;
          seen.add(key);

          results.push({
            winner: winnerLine,
            details: lines,
            image: img.src
          });

          break;
        }

        container = container.parentElement;
      }
    }

    return results.slice(0, 30);
  });

  const output = {
    updatedAt: new Date().toISOString(),
    count: winners.length,
    winners
  };

  await fs.writeFile(
    "instant-winners.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(`Saved ${winners.length} recent instant winners.`);
} finally {
  await browser.close();
}
