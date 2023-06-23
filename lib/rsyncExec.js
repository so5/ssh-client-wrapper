"use strict";
const path = require("path");
const debug = require("debug")("sshClientWrapper:rsyncExec");
const debugVerbose = require("debug")("sshClientWrapper:rsyncExec_verbose");
const { glob } = require("glob");

const { sshExec } = require("./sshExec.js");
const fork = require("./fork.js");

const { sshCmd, rsyncCmd, getSshOption } = require("./util.js");

/**
 * Send file or directory and its child to server.
 * @param {Object} hostInfo - hostinfo object
 * @param {[string]} argSrc - File or directory name which to be send.
 * @param {string} dst - Destination path.
 * @param {[string]} rsyncOpt - optional arguments for rsync
 *
 * this function execute rsync -avvm --copy-unsafe-links  src rsync://[user@]host[:port]/dst
 */
async function send(hostInfo, argSrc, dst, rsyncOpt = []) {
  const promises = await Promise.allSettled(argSrc.map((e)=>{
    return glob(e);
  }));
  const src = promises.flatMap((e)=>{
    if (e.status !== "fulfilled") {
      return [];
    }
    return e.value;
  });

  const sshArgs = getSshOption(hostInfo, true);
  const rshOpt = ["-e", `${sshCmd} ${sshArgs.join(" ")}`];

  const args = ["-amvv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, ...src, `${hostInfo.host}:${dst}`];
  const { dir: remoteDir } = path.parse(dst);
  debug("remoteDir=", remoteDir);

  if (remoteDir !== "" && remoteDir !== "/") {
    debug(`mkdir ${remoteDir}`);
    sshExec(hostInfo, `mkdir -p ${remoteDir}`, debugVerbose);
  }
  debug(`send ${src} to ${hostInfo.host}:${dst}`);
  debugVerbose(`rsyncCmd=${rsyncCmd}: args=${args}`);
  return fork(hostInfo, rsyncCmd, args);
}

/**
 * Send file or directory and its child to server.
 * @param {Object} hostInfo - hostinfo object
 * @param {[string]} argSrc - File or directory name which to be send.
 * @param {string} dst - Destination path.
 * @param {[string]} rsyncOpt - optional arguments for rsync
 *
 * this function execute rsync -av --copy-unsafe-links  rsync://[user@]host[:port]/src dst
 */
async function recv(hostInfo, argSrc, dst, rsyncOpt = []) {
  const src = `${hostInfo.host}:${argSrc.join(" ")}`;
  const sshArgs = getSshOption(hostInfo, true);
  const rshOpt = ["-e", `${sshCmd} ${sshArgs.join(" ")}`];

  const args = ["-amvv", "--copy-unsafe-links", ...rshOpt, ...rsyncOpt, src, dst];

  debug(`recv ${src} to ${dst}`);
  debugVerbose(`rsyncCmd=${rsyncCmd}: args=${args}`);
  return fork(hostInfo, rsyncCmd, args);
}
module.exports = {
  send,
  recv
};
