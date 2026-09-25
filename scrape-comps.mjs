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

  await page.waitForSelector('a[href*="/competition/"]', {
    timeout: 30000
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

  const competitions = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll('a[href*="/competition/"]')
    );

    const results = new Map();

    for (const link of links) {
      const url = link.href;

      const text = (link.innerText || link.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      const soldMatch = text.match(
        /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/
      );

      // Ignore promotional links that do not contain ticket figures.
      if (!url || !soldMatch || !/%\s*Sold/i.test(text)) {
        continue;
      }

      const ticketsSold = Number(
        soldMatch[1].replace(/,/g, "")
      );

      const totalTickets = Number(
        soldMatch[2].replace(/,/g, "")
      );

      const percentMatch = text.match(
        /(\d+(?:\.\d+)?)%\s*Sold/i
      );

     const instantWinsMatch =
  text.match(/([\d,]+)\s*Instant Wins?/i) ||
  text.match(/Instant Wins?\s*([\d,]+)/i);

      const poundPriceMatch = text.match(
        /£\s*(\d+(?:\.\d+)?)\s*per ticket/i
      );

      const pennyPriceMatch = text.match(
        /(\d+(?:\.\d+)?)p\s*per ticket/i
      );

      let ticketPrice = null;

      if (/Free\s*per ticket/i.test(text)) {
        ticketPrice = 0;
      } else if (pennyPriceMatch) {
        ticketPrice = Number(pennyPriceMatch[1]) / 100;
      } else if (poundPriceMatch) {
        ticketPrice = Number(poundPriceMatch[1]);
      }

      const slug =
        url.split("/competition/")[1]
          ?.split(/[?#]/)[0] || "";

    let title = slug
  .replace(/-/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase());

title = title
  .replace(/\bPs(\d+)/gi, "£$1")
  .replace(/\bP(\d+)\b/gi, "$1p");

      const images = Array.from(link.querySelectorAll("img"));

      const image =
        images.find(img =>
          img.src.includes("static.rafflex.io")
        )?.src ||
        images[0]?.src ||
        "";

      results.set(url, {
        title,
        url,
        image,
        ticketsSold,
        totalTickets,
        percentSold: percentMatch
          ? Number(percentMatch[1])
          : Number(
              ((ticketsSold / totalTickets) * 100).toFixed(2)
            ),
        ticketPrice,
        instantWins: instantWinsMatch
          ? Number(instantWinsMatch[1].replace(/,/g, ""))
          : null
      });
    }

    return Array.from(results.values());
  });

  console.log(
    `Found ${competitions.length} live competition cards.`
  );

  if (!competitions.length) {
    throw new Error("No live competitions were found.");
  }

  const todaysWinnerCount = await page.evaluate(() => {
  const text = (document.body.innerText || "")
    .replace(/\s+/g, " ")
    .trim();

  const match =
  text.match(/Instant Winners[\s\S]*?Today(?:'|’)?s Count[\s\S]*?(\d+)/i) ||
  text.match(/Today(?:'|’)?s Count[\s\S]*?(\d+)/i);

  return match ? Number(match[1]) : null;
});

const drawDates = [];

for (const competition of competitions) {
  try {
    const detailPage = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    });

    await detailPage.goto(competition.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await detailPage.waitForTimeout(2000);

    const text = (await detailPage.locator("body").innerText())
      .replace(/\s+/g, " ")
      .trim();

    const match = text.match(
      /Draw\s+On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}):(\d{2})(am|pm)/i
    );

    if (match) {
      drawDates.push({
        month: match[1],
        day: Number(match[2]),
        hour: Number(match[3]),
        minute: Number(match[4]),
        ampm: match[5].toLowerCase()
      });
    }

    await detailPage.close();
  } catch (error) {
    console.log(
      `Could not read draw date for ${competition.title}`
    );
  }
}

const monthNumbers = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
};
  
process.env.TZ = "Europe/London";
const now = new Date();

const upcomingDrawDates = drawDates
  .map(draw => {
    let hour = draw.hour;

    if (draw.ampm === "pm" && hour !== 12) hour += 12;
    if (draw.ampm === "am" && hour === 12) hour = 0;

    let date = new Date(
      now.getFullYear(),
      monthNumbers[draw.month],
      draw.day,
      hour,
      draw.minute
    );

    if (date < now) {
      date = new Date(
        now.getFullYear() + 1,
        monthNumbers[draw.month],
        draw.day,
        hour,
        draw.minute
      );
    }

    return date;
  })
  .sort((a, b) => a - b);

const nextLiveAt =
  upcomingDrawDates.length
    ? upcomingDrawDates[0].toISOString()
    : null;

const output = {
  updatedAt: new Date().toISOString(),
  todaysWinnerCount,
  nextLiveAt,
  count: competitions.length,
  competitions
};

  await fs.writeFile(
    "live-comps.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(`Saved ${competitions.length} competitions.`);
} finally {
  await browser.close();
}
