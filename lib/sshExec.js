"use strict";
const { setTimeout: setTimeoutPromise } = require("timers/promises");
const crypto = require("crypto");
const promiseRetry = require("promise-retry");
const debug = require("debug")("sshClientWrapper:sshExec");
const debugVerbose = require("debug")("sshClientWrapper:sshExec_verbose");
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
  debugVerbose(`exec: ${sshCmd} ${args.join(" ")}`);

  return retryWrapper(fork.bind(null, hostInfo, sshCmd, args, opt, outputCallback), hostInfo);
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
    args.push(`-oConnectTimeout=${timeout}`);
  }
  args.push(`echo ${words}`);

  let output = "";
  const cb = (e)=>{
    output += e;
  };

  const ac = new AbortController();
  const signal = ac.signal;

  setTimeoutPromise(timeout * 1000, "neverUsedValue", { signal })
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

  debugVerbose(`canConnect: ${sshCmd} ${args.join(" ")}`);
  const rt = await retryWrapper(fork.bind(null, hostInfo, sshCmd, args, null, cb), hostInfo);
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
    debug(`disconnect: ${sshCmd} ${args.join(" ")}`);
    await fork(hostInfo, sshCmd, args, null, cb);
  } catch (err) {
    if (err !== 255 || !/Control socket connect.*: No such file or directory/.test(output)) {
      throw err;
    }
  }
  debug(`disconnected from ${hostInfo.host}`);
}

/**
 * retry fork() if it throw retryable error
 * @param {Function}  func - function to be wrapped
 */
async function retryWrapper(func, hostInfo) {
  return promiseRetry({ retries: 3, minTimeout: 5000, maxTimeout: 5000 }, (retry, number)=>{
    return func()
      .catch((e)=>{
        if (e.retryable) {
          debug(`retrying: ${number} times`);
          disconnect(hostInfo).then(retry);
        }
        throw e;
      });
  });
}


module.exports = {
  sshExec,
  canConnect,
  disconnect,
  retryWrapper
};
