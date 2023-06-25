"use strict";
const { setTimeout: setTimeoutPromise } = require("timers/promises");
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
async function canConnect(hostInfo, timeout = 5) {
  debug("check connectibity");
  const words = crypto.randomUUID();
  const args = getSshOption(hostInfo);
  if (Number.isInteger(timeout) && timeout > 0) {
    args.push(`-oConnectTimeout=${timeout}`);
  }
  args.push(`echo ${words}`);

  let output = "";
  const cb = (e)=>{
    output += e;
  };

  const ac = new AbortController();
  const signal = ac.signal;

  setTimeoutPromise(timeout * 1000, "foobar", { signal })
    .then(()=>{
      const err = new Error(`can not connect within ${timeout} sec`);
      err.host = hostInfo.host;
      err.user = hostInfo.user;
      err.port = hostInfo.port;
      throw err;
    })
    .catch((err)=>{
      if (err.name === "AbortError") {
        debug("timeout was aborted because connection check has done");
      }
    });

  const rt = await fork(hostInfo, sshCmd, args, null, cb);
  ac.abort();

  if (rt !== 0) {
    const err = new Error(`can not connect to ${hostInfo.host}. return code=${rt}`);
    err.rt = rt;
    err.host = hostInfo.host;
    err.user = hostInfo.user;
    err.port = hostInfo.port;
    return err;
  }
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
