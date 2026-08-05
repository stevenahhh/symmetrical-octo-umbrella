const { chromium } = require("playwright");

const [htmlUrl, pdfPath] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(htmlUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      window.__chartsReady === true &&
      document.querySelector("#sun-altitude-chart")?.width > 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.sunAltitudeChart.resize();
  });
  await page.pdf({
    path: pdfPath,
    width: "15in",
    height: "10in",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  await browser.close();
})();
