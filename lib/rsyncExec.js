import path from "path";
import fs from "fs/promises";
import Debug from "debug";
import { glob, hasMagic } from "glob";

import { connect, retryWrapper, sshExec } from "./sshExec.js";
import { fork } from "./fork.js";

import { sshCmd, rsyncCmd, getSshOption, resolveRetryableExitCodes } from "./util.js";
import { expandRemotePath, formatRemoteArg, hasLiteralRemoteArgs, shellQuote } from "./remotePath.js";

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
 * @param {number[]} retryableExitCodes - rsync exit codes to treat as retryable for this call (overrides hostInfo-level setting)
 * @param {boolean} replaceRetryableExitCodes - if true, retryableExitCodes replaces the default instead of merging with it
 *
 * this function execute rsync -avv --copy-unsafe-links  src rsync://[user@]host[:port]/dst
 */
export async function send(hostInfo, argSrc, dst, rsyncOpt, timeout, retryableExitCodes, replaceRetryableExitCodes) {
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

  //the remote path is interpreted by the remote shell (~, $VAR, {a,b}, quotes and escapes)
  const remoteDsts = await expandRemotePath(hostInfo, dst);
  if (remoteDsts.length !== 1) {
    throw new Error(`dst must be expanded to exactly one path: ${dst}`);
  }
  const [remoteDst] = remoteDsts;
  const literal = await hasLiteralRemoteArgsOfLocalRsync(hostInfo);

  const args = ["-avv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, ...src, `${hostInfo.host}:${formatRemoteArg(remoteDst, literal)}`];
  let remoteDir;
  if (remoteDst.endsWith("/")) {
    remoteDir = remoteDst;
  } else {
    const { dir } = path.parse(remoteDst);
    remoteDir = dir;
  }
  debug("remoteDir=", remoteDir);

  if (remoteDir !== "" && remoteDir !== "/") {
    debug(`mkdir ${remoteDir}`);
    await sshExec(hostInfo, `mkdir -p ${shellQuote(remoteDir)}`, 0, debugVerbose);
  }
  debug(`send ${src} to ${hostInfo.host}:${remoteDst}`);
  debugVerbose(`send: ${rsyncCmd} ${args.join(" ")}`);
  const exitCodes = resolveRetryableExitCodes(hostInfo, retryableExitCodes, replaceRetryableExitCodes);
  return retryWrapper(fork.bind(null, hostInfo, rsyncCmd, args, timeout, null, exitCodes), hostInfo);
}

/**
 * check if the local rsync takes remote path literally (rsync 3.2.4 or later) or lets the remote shell evaluate it
 * @param {object} hostInfo - hostinfo object
 * @returns {boolean} - true if the local rsync takes remote path literally
 */
async function hasLiteralRemoteArgsOfLocalRsync(hostInfo) {
  if (!hostInfo.rsyncVersion
    || !Number.isInteger(hostInfo.rsyncVersion.major)
    || !Number.isInteger(hostInfo.rsyncVersion.minor)
    || !Number.isInteger(hostInfo.rsyncVersion.patch)) {
    hostInfo.rsyncVersion = await checkRsyncVersion(3);
  }
  return hasLiteralRemoteArgs(hostInfo.rsyncVersion);
}

/**
 * Send file or directory and its child to server.
 * @param {object} hostInfo - hostinfo object
 * @param {[string]} argSrc - File or directory name which to be send.
 * @param {string} dst - Destination path.
 * @param {[string]} rsyncOpt - optional arguments for rsync
 * @param {Integer} timeout - timeout in secconds
 * @param {number[]} retryableExitCodes - rsync exit codes to treat as retryable for this call (overrides hostInfo-level setting)
 * @param {boolean} replaceRetryableExitCodes - if true, retryableExitCodes replaces the default instead of merging with it
 *
 * this function execute rsync -av --copy-unsafe-links  rsync://[user@]host[:port]/src dst
 */
export async function recv(hostInfo, argSrc, dst, rsyncOpt, timeout, retryableExitCodes, replaceRetryableExitCodes) {
  await connect(hostInfo);
  //pass each source as its own "host:path" argument. Joining them into one
  //space separated argument relies on the remote shell to split it, which
  //rsync >= 3.2.4 (protected args) no longer does.
  //the remote path is interpreted by the remote shell (~, $VAR, {a,b}, quotes and escapes).
  //it is expanded here, so that the result does not depend on how the local rsync handles it.
  const literal = await hasLiteralRemoteArgsOfLocalRsync(hostInfo);
  const remoteSrcs = [];
  for (const e of argSrc) {
    remoteSrcs.push(...await expandRemotePath(hostInfo, e));
  }
  const src = remoteSrcs.map((e)=>{
    return `${hostInfo.host}:${formatRemoteArg(e, literal)}`;
  });
  const sshArgs = getSshOption(hostInfo, true);
  const rshOpt = ["-e", `${sshCmd} ${sshArgs.join(" ")}`];
  const args = ["-avv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, ...src, dst];

  //make destination directory
  const dstDir = argSrc.len > 1 || hasMagic(argSrc[0]) ? dst : path.dirname(dst);
  await fs.mkdir(dstDir, { recursive: true });

  debug(`recv ${src.join(" ")} to ${dst}`);
  debugVerbose(`recv: ${rsyncCmd} ${args.join(" ")}`);
  const exitCodes = resolveRetryableExitCodes(hostInfo, retryableExitCodes, replaceRetryableExitCodes);
  return retryWrapper(fork.bind(null, hostInfo, rsyncCmd, args, timeout, null, exitCodes), hostInfo);
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
