import path from "node:path";

/**
 * Conversion between Windows paths and the path form of MSYS2/Cygwin programs (rsync.exe, ssh.exe of MSYS2).
 * MSYS2 rsync takes "D:\dir" for a remote host named "D", so local paths must be given as "/d/dir".
 *
 * These are pure string functions: they do not depend on process.platform, the file system or the working directory,
 * so that they can be used for the local side (client) and for a remote side which is Windows (server) alike.
 * Only local paths must be converted. Never pass a remote spec ("host:path") to them.
 */

const win32 = path.win32;
const DRIVE_ROOT = /^([A-Za-z]):[\\/]$/;
const DRIVE_ONLY = /^[A-Za-z]:$/;
const CYGDRIVE_PREFIX = /^\/cygdrive(?=\/|$)/;
const MSYS_DRIVE = /^\/([A-Za-z])(?=\/|$)/;

const DEFAULT_STYLE = "msys";
const STYLES = ["msys", "cygwin"];

const assertString = (p)=>{
  if (typeof p !== "string") {
    throw new TypeError(`path must be a string: ${typeof p}`);
  }
};
const assertStyle = (style)=>{
  if (!STYLES.includes(style)) {
    throw new RangeError(`style must be one of ${STYLES.join(", ")}: ${style}`);
  }
};
const slash = (p)=>{return p.replace(/\\/g, "/");};
const backslash = (p)=>{return p.replace(/\//g, "\\");};

//"\\?\D:\x" -> "D:\x", "\\?\UNC\host\share\x" -> "\\host\share\x"
const stripLongPathPrefix = (p)=>{
  if (/^\\\\[?.]\\UNC\\/i.test(p)) {
    return `\\\\${p.slice(8)}`;
  }
  if (/^\\\\[?.]\\[A-Za-z]:/.test(p)) {
    return p.slice(4);
  }
  return p;
};

/**
 * check if the path is an absolute Windows path with a drive letter ("D:\x", "D:/x", "D:") or an UNC path ("\\host\share")
 * @param {string} p - path
 * @returns {boolean} - true if the path is a Windows path which needs conversion for MSYS2 programs
 */
export function isWindowsPath(p) {
  assertString(p);
  const root = win32.parse(stripLongPathPrefix(p)).root;
  return DRIVE_ONLY.test(root) || DRIVE_ROOT.test(root) || /^\\\\[^\\]+\\[^\\]+\\?$/.test(root);
}

/**
 * convert a Windows path to the path form of MSYS2 (or Cygwin) programs
 * - "D:\a\b" and "D:/a/b" -> "/d/a/b" (cygwin style: "/cygdrive/d/a/b")
 * - "\\host\share\a" -> "//host/share/a"
 * - "a\b\" -> "a/b/" (relative paths just get slashes; a trailing slash is kept because rsync gives it a meaning)
 * - "/d/a" and "/usr/bin" are returned as they are (so that the function is idempotent)
 * @param {string} p - local path
 * @param {object} [options] - options
 * @param {string} [options.style] - "msys" (default) or "cygwin"
 * @returns {string} - converted path
 * @throws {RangeError} - if the path is relative to the current directory of a drive ("D:a")
 */
export function toMsysPath(p, options = {}) {
  assertString(p);
  const { style = DEFAULT_STYLE } = options;
  assertStyle(style);
  const src = stripLongPathPrefix(p);
  const { root } = win32.parse(src);
  const rest = src.slice(root.length);
  if (DRIVE_ONLY.test(root)) {
    throw new RangeError(`can not convert a drive relative path: ${p}`);
  }
  const m = DRIVE_ROOT.exec(root);
  if (m) {
    const drive = m[1].toLowerCase();
    const prefix = style === "cygwin" ? `/cygdrive/${drive}` : `/${drive}`;
    return rest === "" ? `${prefix}/` : `${prefix}/${slash(rest)}`;
  }
  return slash(src);
}

/**
 * convert a path of MSYS2 (or Cygwin) programs to a Windows path
 * - "/d/a/b" and "/cygdrive/d/a/b" -> "D:\a\b"
 * - "//host/share/a" -> "\\host\share\a"
 * - "a/b" -> "a\b"
 * - other absolute paths ("/usr/bin") live in the MSYS2 root: they are converted if options.root is given, otherwise an error is thrown
 * - "/c" cannot be told from a directory named "c" in the MSYS2 root: it is always taken as the drive C
 * @param {string} p - path of MSYS2 programs
 * @param {object} [options] - options
 * @param {string} [options.root] - Windows path of the MSYS2 root ("C:\msys64"), used for absolute paths without a drive
 * @returns {string} - Windows path
 * @throws {RangeError} - if the path is in the MSYS2 root and options.root is not given
 */
export function fromMsysPath(p, options = {}) {
  assertString(p);
  const { root } = options;
  if (root !== undefined) {
    assertString(root);
  }
  if (p.startsWith("//") && !p.startsWith("///")) {
    return backslash(p);
  }
  if (!p.startsWith("/")) {
    return backslash(p);
  }
  const cyg = CYGDRIVE_PREFIX.exec(p);
  const body = cyg ? p.slice(cyg[0].length) : p;
  const m = MSYS_DRIVE.exec(body);
  if (m) {
    const rest = body.slice(m[0].length);
    return `${m[1].toUpperCase()}:\\${backslash(rest.replace(/^\//, ""))}`;
  }
  if (cyg) {
    throw new RangeError(`not a drive path: ${p}`);
  }
  if (root === undefined) {
    throw new RangeError(`the path is in the MSYS2 root, options.root is needed: ${p}`);
  }
  return win32.join(root, backslash(p));
}
