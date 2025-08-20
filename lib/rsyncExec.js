import path from "path";
import fs from "fs/promises";
import Debug from "debug";
import { glob, hasMagic } from "glob";

import { connect, retryWrapper, sshExec } from "./sshExec.js";
import { fork } from "./fork.js";

import { sshCmd, rsyncCmd, acceptableRsyncRetrunCodes, getSshOption } from "./util.js";

const debug = Debug("sshClientWrapper:debug:rsyncExec");
const debugVerbose = Debug("sshClientWrapper:verbose:rsyncExec");

export async function checkRsyncVersion(timeout) {
  const rt = {};
  await fork(null, rsyncCmd, ["--version"], timeout, (output)=>{
    const result = /^rsync *version *(\d+)\.(\d+)\.(\d+).*$/m.exec(output);

    if (result) {
      rt.major = Number(result[1]);
      rt.minor = Number(result[2]);
      rt.patch = Number(result[3]);
    }
  });
  return rt;
}

/**
 * Send file or directory and its child to server.
 * @param {object} hostInfo - hostinfo object
 * @param {[string]} argSrc - File or directory name which to be send.
 * @param {string} dst - Destination path.
 * @param {[string]} rsyncOpt - optional arguments for rsync
 * @param {Integer} timeout - timeout in secconds
 *
 * this function execute rsync -avv --copy-unsafe-links  src rsync://[user@]host[:port]/dst
 */
export async function send(hostInfo, argSrc, dst, rsyncOpt, timeout) {
  await connect(hostInfo);
  const promises = await Promise.allSettled(argSrc.map((e)=>{
    return glob(e);
  }));
  const src = promises
    .map((e, i)=>{
      if (e.status !== "fulfilled") {
        return null;
      }
      if (argSrc[i].endsWith("/")) {
        return `${e.value}/`;
      }
      return e.value;
    })
    .filter((e)=>{
      return e !== null;
    })
    .flatMap((e)=>{
      return e;
    });

  if (src.length === 0) {
    debug("src file not found");
    return false;
  }

  const sshArgs = getSshOption(hostInfo, true);
  const rshOpt = ["-e", `${sshCmd} ${sshArgs.join(" ")}`];

  const args = ["-avv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, ...src, `${hostInfo.host}:${dst}`];
  let remoteDir;
  if (dst.endsWith("/")) {
    remoteDir = dst;
  } else {
    const { dir } = path.parse(dst);
    remoteDir = dir;
  }
  debug("remoteDir=", remoteDir);

  if (remoteDir !== "" && remoteDir !== "/") {
    debug(`mkdir ${remoteDir}`);
    sshExec(hostInfo, `mkdir -p ${remoteDir}`, debugVerbose);
  }
  debug(`send ${src} to ${hostInfo.host}:${dst}`);
  debugVerbose(`send: ${rsyncCmd} ${args.join(" ")}`);
  return retryWrapper(fork.bind(null, hostInfo, rsyncCmd, args, timeout, null, acceptableRsyncRetrunCodes), hostInfo);
}

/**
 * format src array to src string for recv
 * @param {object} hostInfo - hostinfo object
 * @returns {boolean} - rsync command version is higher than 3.2.4 or not
 */
async function isNewRsync(hostInfo) {
  if (!hostInfo.rsyncVersion
    || !Number.isInteger(hostInfo.rsyncVersion.major)
    || !Number.isInteger(hostInfo.rsyncVersion.minor)
    || !Number.isInteger(hostInfo.rsyncVersion.patch)) {
    hostInfo.rsyncVersion = await checkRsyncVersion(3);
  }
  return hostInfo.rsyncVersion.major >= 3 && hostInfo.rsyncVersion.minor >= 2 && hostInfo.rsyncVersion.patch >= 4;
}

/**
 * Send file or directory and its child to server.
 * @param {object} hostInfo - hostinfo object
 * @param {[string]} argSrc - File or directory name which to be send.
 * @param {string} dst - Destination path.
 * @param {[string]} rsyncOpt - optional arguments for rsync
 * @param {Integer} timeout - timeout in secconds
 *
 * this function execute rsync -av --copy-unsafe-links  rsync://[user@]host[:port]/src dst
 */
export async function recv(hostInfo, argSrc, dst, rsyncOpt, timeout) {
  await connect(hostInfo);
  const src = `${hostInfo.host}:${argSrc.join(" ")}`;
  const sshArgs = getSshOption(hostInfo, true);
  const rshOpt = ["-e", `${sshCmd} ${sshArgs.join(" ")}`];
  const args = ["-avv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, src, dst];
  if (await isNewRsync(hostInfo)) {
    args.unshift("--old-args");
  }

  //make destination directory
  const dstDir = argSrc.len > 1 || hasMagic(argSrc[0]) ? dst : path.dirname(dst);
  await fs.mkdir(dstDir, { recursive: true });

  debug(`recv ${src} to ${dst}`);
  debugVerbose(`recv: ${rsyncCmd} ${args.join(" ")}`);
  return retryWrapper(fork.bind(null, hostInfo, rsyncCmd, args, timeout, null, acceptableRsyncRetrunCodes), hostInfo);
}
