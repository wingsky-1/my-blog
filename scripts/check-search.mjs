import { existsSync, readFileSync } from "node:fs";

const required = [
  "dist/search/index.html",
  "dist/pagefind/pagefind.js",
  "dist/pagefind/pagefind-entry.json",
];

for (const file of required) {
  if (!existsSync(file)) {
    process.stderr.write(`Search smoke check failed: missing ${file}\n`);
    process.exitCode = 1;
  }
}

if (existsSync(required[0])) {
  const html = readFileSync(required[0], "utf8");
  if (!/lang="zh-CN"/i.test(html)) {
    process.stderr.write("Search page is not marked zh-CN.\n");
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  process.stdout.write("Chinese search page and Pagefind assets are present.\n");
}
