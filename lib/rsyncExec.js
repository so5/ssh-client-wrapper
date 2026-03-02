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

/**
 * Copy files directly between remote hosts using rsync over SSH with agent forwarding.
 * This function executes rsync on the source remote host to transfer files directly
 * to the destination remote host, avoiding the need to download and upload through localhost.
 * @param {object} srcHostInfo - source host information object
 * @param {string[]} argSrc - File or directory paths on the source remote host
 * @param {object} dstHostInfo - destination host information object (needs host and user properties)
 * @param {string} dst - Destination path on the destination remote host
 * @param {string[]} rsyncOpt - optional arguments for rsync
 * @param {Integer} timeout - timeout in seconds
 * @returns {Promise} - Resolved when transfer is complete
 *
 * Authentication from source to destination uses SSH agent forwarding,
 * so dstHostInfo does not need keyFile or password.
 */
export async function remoteToRemoteCopy(srcHostInfo, argSrc, dstHostInfo, dst, rsyncOpt, timeout) {
  await connect(srcHostInfo);
  
  //Construct destination specification for rsync: user@host:path
  let dstSpec = dstHostInfo.host;
  if (dstHostInfo.user) {
    dstSpec = `${dstHostInfo.user}@${dstHostInfo.host}`;
  }
  dstSpec = `${dstSpec}:${dst}`;
  
  //Build SSH options for the nested SSH connection (from src to dst)
  const nestedSshArgs = ["-A"]; //Enable agent forwarding
  
  if (dstHostInfo.port) {
    nestedSshArgs.push("-p", dstHostInfo.port.toString());
  }
  if (dstHostInfo.noStrictHostKeyChecking) {
    nestedSshArgs.push("-oStrictHostKeyChecking=no");
  }
  
  //Build rsync command to be executed on the source host
  const rshOpt = `-e '${sshCmd} ${nestedSshArgs.join(" ")}'`;
  const rsyncOptStr = rsyncOpt.length > 0 ? rsyncOpt.join(" ") : "";
  const srcPaths = argSrc.join(" ");
  
  //Create destination directory on the destination host
  let remoteMkdirCmd = "";
  if (dst.endsWith("/")) {
    remoteMkdirCmd = `mkdir -p ${dst}`;
  } else {
    const { dir } = path.parse(dst);
    if (dir !== "" && dir !== "/") {
      remoteMkdirCmd = `mkdir -p ${dir}`;
    }
  }
  
  if (remoteMkdirCmd) {
    //Execute mkdir on destination host via source host with agent forwarding
    const dstUser = dstHostInfo.user ? `${dstHostInfo.user}@` : "";
    const mkdirSshCmd = `${sshCmd} -A ${nestedSshArgs.filter(arg=>{return arg !== "-A";}).join(" ")} ${dstUser}${dstHostInfo.host} '${remoteMkdirCmd}'`;
    debug(`creating remote directory: ${mkdirSshCmd}`);
    await sshExec(srcHostInfo, mkdirSshCmd, timeout, debugVerbose);
  }
  
  //Execute rsync on source host
  const rsyncRemoteCmd = `rsync -avv --copy-unsafe-links ${rshOpt} ${rsyncOptStr} ${srcPaths} ${dstSpec}`;
  debug(`remote to remote copy: ${rsyncRemoteCmd}`);
  debugVerbose(`executing on ${srcHostInfo.host}: ${rsyncRemoteCmd}`);
  
  return sshExec(srcHostInfo, rsyncRemoteCmd, timeout, debugVerbose);
}
