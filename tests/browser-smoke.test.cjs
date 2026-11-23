const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let server;
let baseUrl;

test("home screen loads on a mobile viewport without JavaScript errors", async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, "index.html")) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(data);
    });
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "No Login Split" }).waitFor();
    await page.getByLabel("Trip name").waitFor();
    await page.getByRole("button", { name: "Create Trip" }).waitFor();

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      title: document.title
    }));
    assert.equal(layout.title, "No Login Split");
    assert.ok(layout.documentWidth <= layout.viewportWidth, "Home screen should not overflow horizontally on mobile");
    assert.deepEqual(pageErrors, [], "Page should not throw uncaught JavaScript errors");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
