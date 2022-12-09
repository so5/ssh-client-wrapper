"use strict";
const crypto = require("crypto");
const debug = require("debug")("sshClientWrapper:sshExec");
const { sshCmd, getSshOption } = require("./util.js");
const fork = require("./fork.js");

/**
 * Execute command on remote host.
 * @param {Object} hostInfo - hostinfo object
 * @param {string} cmd - Cmdline which will be executed on remote host.
 * @param {Function} outputCallback - Callback routine for stdout and stderr.
 */
async function sshExec(hostInfo, cmd, outputCallback, opt = null) {
  debug("exec", cmd, "on remote server");
  const args = getSshOption(hostInfo);
  args.push(cmd);

  return fork(hostInfo, sshCmd, args, opt, outputCallback);
}

/**
 * Check if you can connect to sepecified server
 * @param {Object} hostInfo - hostinfo object
 * @param {Integer} timeout - timeout in secconds
 */
async function canConnect(hostInfo, timeout) {
  debug("check connectibity");
  const words = crypto.randomUUID();
  const args = getSshOption(hostInfo);
  if (Number.isInteger(timeout) && timeout > 0) {
    args.push(`-OConnectTimeout=${timeout}`);
  }
  args.push(`echo ${words}`);

  let output = "";
  const cb = (e)=>{
    output += e;
  };
  await fork(hostInfo, sshCmd, args, null, cb);
  const re = new RegExp(words);
  return re.test(output);
}

/**
 * remove master session
 * @param {Object} hostInfo - hostinfo object
 */
async function disconnect(hostInfo) {
  const args = getSshOption(hostInfo);
  args.push("-Oexit");

  let output = "";
  const cb = (e)=>{
    output += e;
  };
  try {
    await fork(hostInfo, sshCmd, args, null, cb);
  } catch (err) {
    if (err !== 255 || !/Control socket connect.*: No such file or directory/.test(output)) {
      throw err;
    }
  }
}

module.exports = {
  sshExec,
  canConnect,
  disconnect
};
