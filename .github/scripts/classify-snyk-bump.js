#!/usr/bin/env node

/**
 * Classify the semver bump size of a Snyk dependency-update PR.
 * Usage: node classify-snyk-bump.js <base-package.json> <head-package.json> [pr-title]
 * Prints "bump=<major|minor|patch|unknown>" to stdout.
 *
 * Snyk has no official metadata API (unlike dependabot/fetch-metadata), and its PR
 * title format is an org-configurable template, so title-parsing alone is unreliable.
 * Primary method: diff dependency version fields between base and head package.json.
 * Fallback: parse "from X to Y" out of the PR title (covers lockfile-only transitive
 * bumps not reflected in package.json). "Snyk Fix" PRs carry no version info at all
 * and correctly fall through to "unknown", which callers treat as major (safe default).
 */

import fs from "fs";

function parseSemver(v) {
  const cleaned = String(v).replace(/^[\^~>=<]+/, "");
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function classifyBump(oldVersion, newVersion) {
  const a = parseSemver(oldVersion);
  const b = parseSemver(newVersion);
  if (!a || !b) {
    return "unknown";
  }
  if (b[0] !== a[0]) {
    return "major";
  }
  if (b[1] !== a[1]) {
    return "minor";
  }
  if (b[2] !== a[2]) {
    return "patch";
  }
  return "unknown";
}

function worstBump(bumps) {
  const order = ["unknown", "patch", "minor", "major"];
  return bumps.reduce((worst, b) => {
    return order.indexOf(b) > order.indexOf(worst) ? b : worst;
  }, "unknown");
}

function diffDependencyVersions(basePkg, headPkg) {
  const sections = ["dependencies", "devDependencies"];
  const bumps = [];
  for (const section of sections) {
    const baseDeps = basePkg[section] || {};
    const headDeps = headPkg[section] || {};
    for (const name of Object.keys(headDeps)) {
      if (baseDeps[name] && baseDeps[name] !== headDeps[name]) {
        bumps.push(classifyBump(baseDeps[name], headDeps[name]));
      }
    }
  }
  return bumps;
}

function classifyFromTitle(title) {
  const m = /from\s+([0-9][A-Za-z0-9.-]*)\s+to\s+([0-9][A-Za-z0-9.-]*)/i.exec(title || "");
  if (!m) {
    return "unknown";
  }
  return classifyBump(m[1], m[2]);
}

function main() {
  const [, , basePath, headPath, prTitle] = process.argv;
  const basePkg = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const headPkg = JSON.parse(fs.readFileSync(headPath, "utf8"));

  const bumps = diffDependencyVersions(basePkg, headPkg);
  let bump = bumps.length > 0 ? worstBump(bumps) : "unknown";

  if (bump === "unknown") {
    bump = classifyFromTitle(prTitle);
  }

  console.log(`bump=${bump}`);
}

main();
