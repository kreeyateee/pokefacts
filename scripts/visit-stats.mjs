#!/usr/bin/env node
// Visitor numbers from Caddy's access log on the live server.
//   sudo node scripts/visit-stats.mjs /var/log/caddy/pokefacts-access*.log
// A visitor is one shortened IP and browser on one day, so the counts are close, not exact.
// Bots and scripts are left out.
import { readFileSync } from "node:fs";

const BOT = /bot|crawl|spider|slurp|curl|wget|python|go-http|httpclient|headless|preview|monitor|scan/i;
const PHONE = /iphone|android.*mobile|mobile safari|ipod/i;
const TABLET = /ipad|android(?!.*mobile)|tablet/i;

// Requests that stand for something a person did, by path.
const ACTIONS = [
  ["Tracks sent to Yoto", (r) => r.method === "POST" && r.path === "/api/yoto/track"],
  ["Playlists created", (r) => r.method === "POST" && r.path === "/api/yoto/job"],
  ["Voice samples (Hear)", (r) => r.method === "POST" && r.path === "/api/yoto/hear"],
  ["Pokédex entries opened", (r) => /^\/api\/catalogue\/\d+\/biology$/.test(r.path)],
  ["Adventures started", (r) => r.path === "/api/adventure/safari"],
  ["Songs looked up", (r) => r.path === "/api/music/youtube"],
  ["Yoto logins", (r) => r.path === "/callback"],
];

const days = new Map();
const day = (key) => {
  if (!days.has(key)) {
    days.set(key, { visitors: new Map(), pages: 0, actions: new Map(), bots: 0 });
  }
  return days.get(key);
};

for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const request = row.request ?? {};
    const agent = (request.headers?.["User-Agent"] ?? [""])[0] ?? "";
    const date = new Date((row.ts ?? 0) * 1000).toISOString().slice(0, 10);
    const stats = day(date);
    if (BOT.test(agent) || !agent) {
      stats.bots += 1;
      continue;
    }
    const path = (request.uri ?? "").split("?")[0];
    const html = String((row.resp_headers?.["Content-Type"] ?? [""])[0]).includes("text/html");
    if (request.method === "GET" && html && row.status === 200) {
      stats.pages += 1;
      const id = `${request.client_ip ?? request.remote_ip}|${agent}`;
      const device = PHONE.test(agent) ? "phone" : TABLET.test(agent) ? "tablet" : "computer";
      stats.visitors.set(id, device);
    }
    for (const [label, test] of ACTIONS) {
      if (test({ method: request.method, path }) && row.status < 400) {
        stats.actions.set(label, (stats.actions.get(label) ?? 0) + 1);
      }
    }
  }
}

if (days.size === 0) {
  console.log("No visits in the log yet.");
  process.exit(0);
}
for (const [date, stats] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
  const devices = { phone: 0, tablet: 0, computer: 0 };
  for (const device of stats.visitors.values()) devices[device] += 1;
  console.log(`\n${date}`);
  console.log(`  Visitors: ${stats.visitors.size} (phones ${devices.phone}, tablets ${devices.tablet}, computers ${devices.computer})`);
  console.log(`  Page loads: ${stats.pages}`);
  for (const [label] of ACTIONS) console.log(`  ${label}: ${stats.actions.get(label) ?? 0}`);
  console.log(`  Bot and script requests left out: ${stats.bots}`);
}
