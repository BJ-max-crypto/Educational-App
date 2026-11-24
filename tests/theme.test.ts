import assert from "node:assert/strict";
import test from "node:test";
import { isAuthPath, themeBootScript } from "../lib/theme.ts";

test("sign-in and sign-up are the auth paths", () => {
  assert.equal(isAuthPath("/sign-in"), true);
  assert.equal(isAuthPath("/sign-in/factor-one"), true);
  assert.equal(isAuthPath("/sign-up"), true);
  assert.equal(isAuthPath("/sign-up/verify"), true);
  assert.equal(isAuthPath("/dashboard"), false);
  assert.equal(isAuthPath("/signin"), false);
});

test("the boot script forces auth pages to light before paint", () => {
  assert.match(themeBootScript, /sign-in/);
  const themeFor = (pathname: string, stored: string | null) => {
    const attrs = new Map<string, string>();
    const localStorage = { getItem: () => stored };
    const document = {
      documentElement: { setAttribute: (name: string, value: string) => attrs.set(name, value) },
      querySelector: () => ({ setAttribute: () => undefined }),
    };
    const location = { pathname };
    const run = new Function("document", "location", "localStorage", themeBootScript);
    run(document, location, localStorage);
    return attrs.get("data-theme") ?? "";
  };
  assert.equal(themeFor("/sign-in", "dark"), "light");
  assert.equal(themeFor("/sign-up/verify", "dark"), "light");
  assert.equal(themeFor("/dashboard", "dark"), "dark");
  assert.equal(themeFor("/dashboard", "colorful"), "");
});
