import fs from "fs";
import path from "path";
import Debug from "debug";

import { resolveExecutable, rsyncCmd } from "./util.js";
import { toMsysPath } from "./pathConvert.js";

const debug = Debug("sshClientWrapper:debug:winRsync");

//runtime of the rsync builds which take "/d/dir" (MSYS2) or "/cygdrive/d/dir" (Cygwin), but not "D:\dir" ("D" is taken as a host name)
const RUNTIMES = [
  { dll: "msys-2.0.dll", style: "msys" },
  { dll: "cygwin1.dll", style: "cygwin" }
];
const defaultIsFile = (p)=>{
  return fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true;
};

/**
 * look at the directory of the local rsync and tell how it wants paths and which ssh it must be paired with.
 * rsync.exe of MSYS2 or Cygwin needs its ssh.exe of the same distribution (it does not work with the OpenSSH of Windows or Git for Windows),
 * and takes local paths in the MSYS2/Cygwin form.
 * @param {object} [opt] - options (platform, rsyncPath and isFile are injectable for tests)
 * @param {string} [opt.platform] - platform name
 * @param {string} [opt.rsyncPath] - path of rsync executable. default is the one found in PATH
 * @param {Function} [opt.isFile] - function which checks if given path is a file
 * @returns {object|null} - { style: "msys"|"cygwin", ssh: path of ssh.exe next to rsync.exe or null }, null if the local rsync takes Windows paths or the platform is not win32
 */
export const detectLocalRsync = ({ platform = process.platform, rsyncPath, isFile = defaultIsFile } = {})=>{
  if (platform !== "win32") {
    return null;
  }
  const exe = rsyncPath ?? resolveExecutable(rsyncCmd, { platform, isFile });
  if (!/[\\/]/.test(exe)) {
    debug("rsync not found in PATH");
    return null;
  }
  const dir = path.win32.dirname(exe);
  for (const { dll, style } of RUNTIMES) {
    if (isFile(path.win32.join(dir, dll))) {
      const ssh = path.win32.join(dir, "ssh.exe");
      debug(`${exe} is a ${style} build`);
      return { style, ssh: isFile(ssh) ? ssh : null };
    }
  }
  return null;
};

let cached;

/**
 * detectLocalRsync() of the rsync in PATH, remembered for the life of the process
 * @returns {object|null} - see detectLocalRsync
 */
export const getLocalRsync = ()=>{
  if (cached === undefined) {
    cached = detectLocalRsync();
  }
  return cached;
};
export const resetLocalRsync = ()=>{
  cached = undefined;
};

/**
 * convert a local path to the form the local rsync takes
 * @param {string} p - local path
 * @param {object|null} local - return value of detectLocalRsync
 * @returns {string} - path to be put into arguments of rsync
 */
export const toRsyncPath = (p, local)=>{
  if (!local) {
    return p;
  }
  return toMsysPath(p, { style: local.style });
};

const quoteIfNeeded = (s)=>{
  return /\s/.test(s) ? `"${s}"` : s;
};

/**
 * make the value of "rsync -e" : the ssh command line (ssh executable and options)
 * for MSYS2/Cygwin rsync, the ssh.exe next to rsync.exe is used and file paths in the options are converted.
 * @param {string} sshExe - name of ssh command
 * @param {string[]} sshArgs - ssh options
 * @param {object|null} local - return value of detectLocalRsync
 * @returns {string} - value for "-e"
 */
export const makeRshCommand = (sshExe, sshArgs, local)=>{
  if (!local) {
    return `${sshExe} ${sshArgs.join(" ")}`;
  }
  const converted = sshArgs.map((e, i, a)=>{
    if (typeof e !== "string") {
      return e;
    }
    if (a[i - 1] === "-i") {
      return quoteIfNeeded(toRsyncPath(e, local));
    }
    const m = /^(-oControlPath=)(.*)$/.exec(e);
    if (m) {
      return `${m[1]}${quoteIfNeeded(toRsyncPath(m[2], local))}`;
    }
    return e;
  });
  const exe = local.ssh ? quoteIfNeeded(toRsyncPath(local.ssh, local)) : sshExe;
  return `${exe} ${converted.join(" ")}`;
};
