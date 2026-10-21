import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeYoutubeCookies, encodeYoutubeCookies, netscapeYoutubeCookies, uploadedAudioError } from "./client-youtube";

const NETSCAPE = [
  "# Netscape HTTP Cookie File",
  ".youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tabc",
  ".google.com\tTRUE\t/\tTRUE\t0\tSID\tdef",
  ".youtube.com\tTRUE\t/\tTRUE\t0\tVISITOR_INFO1_LIVE\tghi",
].join("\n");

describe("youtube sign-in cookies", () => {
  it("keeps a signed-in cookies file and drops the comment lines", () => {
    const cookies = netscapeYoutubeCookies(NETSCAPE);
    assert.match(cookies ?? "", /^\.youtube\.com\tTRUE\t\/\tTRUE\t0\tSAPISID\tabc\n/);
    assert.match(cookies ?? "", /\.google\.com\tTRUE\t\/\tTRUE\t0\tSID\tdef\n/);
    assert.equal(cookies?.includes("VISITOR_INFO1_LIVE"), true);
    assert.equal(cookies?.includes("# Netscape"), false);
  });

  it("turns a cookie header into a youtube cookies file", () => {
    const cookies = netscapeYoutubeCookies("SAPISID=abc; LOGIN_INFO=signed-in; PREF=skip");
    assert.equal(cookies, ".youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tabc\n.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tsigned-in\n");
  });

  it("refuses a file that has no youtube sign-in cookie", () => {
    assert.equal(netscapeYoutubeCookies("hello"), null);
    assert.equal(netscapeYoutubeCookies(".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tyes\n"), null);
    assert.equal(netscapeYoutubeCookies(""), null);
  });

  it("round-trips the cookies through the request header", () => {
    const cookies = netscapeYoutubeCookies("SID=abc") ?? "";
    assert.equal(decodeYoutubeCookies(encodeYoutubeCookies(cookies)), cookies);
    assert.equal(decodeYoutubeCookies("not base64"), null);
  });

  it("rejects an empty upload and a video id that is not 11 characters", () => {
    assert.equal(uploadedAudioError(0, "jNQXAC9IVRw"), "That audio file was empty.");
    assert.equal(uploadedAudioError(32, "short"), "That YouTube video id does not look right.");
    assert.equal(uploadedAudioError(32, "jNQXAC9IVRw"), null);
  });
});
