#!/usr/bin/env node
// Visitor numbers from Caddy's access log on the live server, day by day (UK time).
//   sudo node scripts/visit-stats.mjs            reads every kept log, rolled .gz parts included
//   sudo node scripts/visit-stats.mjs FILE...    reads just those files (.log or .log.gz)
// A visitor is one shortened IP and browser on one day, so the counts are close, not exact.
// Bots and scripts are left out.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const LOG_DIR = "/var/log/caddy";
const LOG_NAME = /^pokefacts-access.*\.log(\.gz)?$/;

const BOT = /bot|crawl|spider|slurp|curl|wget|python|go-http|httpclient|headless|preview|monitor|scan/i;
const PHONE = /iphone|android.*mobile|mobile safari|ipod/i;
const TABLET = /ipad|android(?!.*mobile)|tablet/i;

// Requests that stand for something a person did, by path.
const ACTIONS = [
  ["Tracks sent to Yoto", (r) => r.method === "POST" && r.path === "/api/yoto/track"],
  ["Playlists created", (r) => r.method === "POST" && r.path === "/api/yoto/job"],
  ["Voice samples (Hear)", (r) => r.method === "POST" && r.path === "/api/yoto/hear"],
  ["Pokédex entries opened", (r) => /^\/api\/catalogue\/\d+\/biology$/.test(r.path)],
  ["Songs looked up", (r) => r.path === "/api/music/youtube"],
  ["Yoto logins", (r) => r.path === "/callback"],
];

const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** Where a page load came from: the referring site, or "direct" (typed, bookmarked, or an app that hides it). */
function sourceOf(referer) {
  if (!referer) return "direct or app";
  try {
    const host = new URL(referer).hostname.replace(/^(www|m|l|lm)\./, "");
    if (host === "pokefacts.online" || host === "pokefacts.duckdns.org") return "";
    if (host.includes("reddit")) return "reddit";
    if (host.includes("facebook") || host.includes("instagram")) return host.includes("instagram") ? "instagram" : "facebook";
    return host;
  } catch {
    return "direct or app";
  }
}

const days = new Map();
const day = (key) => {
  if (!days.has(key)) {
    days.set(key, { visitors: new Map(), pages: 0, actions: new Map(), adventures: new Map(), sources: new Map(), bots: 0 });
  }
  return days.get(key);
};
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(LOG_DIR).filter((name) => LOG_NAME.test(name)).map((name) => path.join(LOG_DIR, name));

for (const file of files) {
  const raw = readFileSync(file);
  const text = file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const request = row.request ?? {};
    const agent = (request.headers?.["User-Agent"] ?? [""])[0] ?? "";
    const stats = day(ukDay.format(new Date((row.ts ?? 0) * 1000)));
    if (BOT.test(agent) || !agent) {
      stats.bots += 1;
      continue;
    }
    const pathname = (request.uri ?? "").split("?")[0];
    const html = String((row.resp_headers?.["Content-Type"] ?? [""])[0]).includes("text/html");
    if (request.method === "GET" && html && row.status === 200) {
      stats.pages += 1;
      const id = `${request.client_ip ?? request.remote_ip}|${agent}`;
      const device = PHONE.test(agent) ? "phone" : TABLET.test(agent) ? "tablet" : "computer";
      if (!stats.visitors.has(id)) {
        // A visitor's source is where their first page load that day came from.
        const source = sourceOf((request.headers?.Referer ?? [""])[0]);
        if (source) bump(stats.sources, source);
      }
      stats.visitors.set(id, device);
    }
    if (row.status < 400) {
      for (const [label, test] of ACTIONS) if (test({ method: request.method, path: pathname })) bump(stats.actions, label);
      const adventure = /^\/api\/adventure\/([a-z]+)$/.exec(pathname);
      if (adventure && request.method === "GET") bump(stats.adventures, adventure[1]);
    }
  }
}

if (days.size === 0) {
  console.log("No visits in the log yet.");
  process.exit(0);
}
const listed = (map) =>
  [...map].sort(([, a], [, b]) => b - a).map(([key, count]) => `${key} ${count}`).join(", ") || "none";
for (const [date, stats] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
  const devices = { phone: 0, tablet: 0, computer: 0 };
  for (const device of stats.visitors.values()) devices[device] += 1;
  const adventures = [...stats.adventures.values()].reduce((sum, count) => sum + count, 0);
  console.log(`\n${date}`);
  console.log(`  Visitors: ${stats.visitors.size} (phones ${devices.phone}, tablets ${devices.tablet}, computers ${devices.computer})`);
  console.log(`  Came from: ${listed(stats.sources)}`);
  console.log(`  Page loads: ${stats.pages}`);
  for (const [label] of ACTIONS) console.log(`  ${label}: ${stats.actions.get(label) ?? 0}`);
  console.log(`  Adventures opened: ${adventures} (${listed(stats.adventures)})`);
  console.log(`  Bot and script requests left out: ${stats.bots}`);
}
console.log(`\nRead ${files.length} log file${files.length === 1 ? "" : "s"}. Days are UK time; the first and last may be partial.`);
