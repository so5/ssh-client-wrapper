import crypto from "crypto";
import Debug from "debug";

import { sshExec } from "./sshExec.js";

const debug = Debug("sshClientWrapper:debug:remotePath");

//characters which need no shell expansion. wildcards are left to the remote side.
const notSimpleChar = /[^\w@%+=:,./*?[\]-]/;
const notSimpleCharGlobal = new RegExp(notSimpleChar.source, "g");

/**
 * check if the remote rsync arguments are taken literally by rsync.
 * rsync 3.2.4 or later does not pass remote path to the remote shell by default.
 * older rsync, openrsync (reports 2.6.9) and rsync4win (reports 0.x) let the remote shell evaluate it.
 * @param {object} version - rsync version object ({major, minor, patch})
 * @returns {boolean} - true if the remote path is taken literally
 */
export function hasLiteralRemoteArgs(version) {
  if (!version
    || !Number.isInteger(version.major)
    || !Number.isInteger(version.minor)
    || !Number.isInteger(version.patch)) {
    return false;
  }
  const { major, minor, patch } = version;
  if (major !== 3) {
    return major > 3;
  }
  if (minor !== 2) {
    return minor > 2;
  }
  return patch >= 4;
}

/**
 * check if the remote path contains something which must be evaluated by the remote shell
 * @param {string} pathSpec - remote path given by the caller
 * @returns {boolean} - true if the remote path need to be expanded
 */
export function needsExpansion(pathSpec) {
  return notSimpleChar.test(pathSpec);
}

/**
 * escape all characters except wildcards with backslash, so that the remote shell passes it as is.
 * @param {string} word - remote path
 * @returns {string} - escaped remote path
 */
export function escapeRemoteArg(word) {
  return word.replace(notSimpleCharGlobal, "\\$&");
}

/**
 * quote a string with single quote for the remote shell. wildcards are NOT expanded.
 * @param {string} word - string
 * @returns {string} - quoted string
 */
export function shellQuote(word) {
  return `'${word.replace(/'/g, "'\\''")}'`;
}

/**
 * convert an expanded remote path to the form the local rsync expects.
 * @param {string} word - expanded remote path
 * @param {boolean} literal - true if the local rsync takes remote path literally
 * @returns {string} - remote path for rsync command line
 */
export function formatRemoteArg(word, literal) {
  return literal ? word : escapeRemoteArg(word);
}

/**
 * make command line which print expanded remote path.
 * filename expansion (wildcards) is disabled. it is left to the remote rsync.
 * @param {string} pathSpec - remote path given by the caller
 * @param {string} token - random string to find the result in output
 * @returns {string} - command line for remote shell
 */
export function buildExpandCommand(pathSpec, token) {
  return `set -f; echo ${token}B; for f in ${pathSpec}; do printf '%s\\n' "$f"; done; echo ${token}E`;
}

/**
 * pick up expanded words from the output of command which is made by buildExpandCommand
 * @param {string} output - whole output
 * @param {string} token - random string which was given to buildExpandCommand
 * @returns {string[] | null} - expanded words, or null if the output can not be parsed
 */
export function parseExpandOutput(output, token) {
  const lines = output.split(/\r?\n/);
  const begin = lines.indexOf(`${token}B`);
  const end = lines.lastIndexOf(`${token}E`);
  if (begin < 0 || end < begin) {
    return null;
  }
  return lines.slice(begin + 1, end);
}

/**
 * let the remote shell expand the remote path (tilde, variables, braces, quotes, and backslash escapes).
 * if the remote shell can not do it, the path is returned as is.
 * @param {object} hostInfo - hostinfo object
 * @param {string} pathSpec - remote path given by the caller
 * @param {number} timeout - timeout in seconds
 * @returns {Promise<string[]>} - expanded paths
 */
export async function expandRemotePath(hostInfo, pathSpec, timeout = 0) {
  if (!needsExpansion(pathSpec)) {
    return [pathSpec];
  }
  const token = `SCW${crypto.randomBytes(8).toString("hex")}`;
  const chunks = [];
  const rt = await sshExec(hostInfo, buildExpandCommand(pathSpec, token), timeout, (data)=>{
    chunks.push(data);
  });
  const words = parseExpandOutput(chunks.join(""), token);
  if (rt !== 0 || words === null || words.length === 0) {
    debug(`can not expand remote path on ${hostInfo.host}, use it as is: ${pathSpec}`);
    return [pathSpec];
  }
  debug(`remote path ${pathSpec} is expanded to`, words);
  return words;
}
