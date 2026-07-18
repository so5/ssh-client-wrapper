#!/usr/bin/env node

/**
 * Classify the semver bump size of a dependency-update PR from its package.json diff.
 * Usage: node classify-package-bump.js <base-package.json> <head-package.json> [pr-title]
 * Prints "bump=<major|minor|patch|unknown>" to stdout.
 *
 * Used for two cases:
 * - Snyk PRs: Snyk has no official metadata API (unlike dependabot/fetch-metadata),
 *   and its PR title format is an org-configurable template, so title-parsing alone
 *   is unreliable.
 * - Dependabot PRs where dependabot/fetch-metadata's update-type output comes back
 *   null despite the PR being a real version bump (observed on grouped PRs bundling
 *   multiple packages) - used as a fallback there, not the primary source.
 *
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
  const changes = [];
  for (const section of sections) {
    const baseDeps = basePkg[section] || {};
    const headDeps = headPkg[section] || {};
    for (const name of Object.keys(headDeps)) {
      if (baseDeps[name] && baseDeps[name] !== headDeps[name]) {
        changes.push({
          name,
          from: baseDeps[name],
          to: headDeps[name],
          bump: classifyBump(baseDeps[name], headDeps[name])
        });
      }
    }
  }
  return changes;
}

function formatChanges(changes) {
  return changes.map((c)=>{
    return `${c.name}: ${c.from} -> ${c.to}`;
  }).join(", ");
}

function classifyFromTitle(title) {
  const m = /([\w@/.-]+)\s+from\s+([0-9][\w.-]*)\s+to\s+([0-9][\w.-]*)/i.exec(title || "");
  if (!m) {
    return null;
  }
  const [, name, from, to] = m;
  return { name, from, to, bump: classifyBump(from, to) };
}

function main() {
  const [, , basePath, headPath, prTitle] = process.argv;
  const basePkg = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const headPkg = JSON.parse(fs.readFileSync(headPath, "utf8"));

  const changes = diffDependencyVersions(basePkg, headPkg);
  let bump = changes.length > 0 ? worstBump(changes.map((c)=>{
    return c.bump;
  })) : "unknown";
  let details = formatChanges(changes);

  if (bump === "unknown") {
    const fromTitle = classifyFromTitle(prTitle);
    if (fromTitle) {
      bump = fromTitle.bump;
      details = `${fromTitle.name}: ${fromTitle.from} -> ${fromTitle.to}`;
    }
  }

  console.log(`bump=${bump}`);
  console.log(`details=${details}`);
}

main();
