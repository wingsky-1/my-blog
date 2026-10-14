import { existsSync, readFileSync } from "node:fs";

const required = [
  "dist/search/index.html",
  "dist/pagefind/pagefind.js",
  "dist/pagefind/pagefind-entry.json",
];

for (const file of required) {
  if (!existsSync(file)) {
    console.error(`Search smoke check failed: missing ${file}`);
    process.exitCode = 1;
  }
}

if (existsSync(required[0])) {
  const html = readFileSync(required[0], "utf8");
  if (!/lang="zh-CN"/i.test(html)) {
    console.error("Search page is not marked zh-CN.");
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  console.log("Chinese search page and Pagefind assets are present.");
}
