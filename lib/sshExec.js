"use strict";
const crypto = require("crypto");
const { setTimeout: setTimeoutPromise } = require("timers/promises");
const debug = require("debug")("sshClientWrapper:debug:sshExec");
const debugVerbose = require("debug")("sshClientWrapper:verbose:sshExec");
const debugSendMasterPty = require("debug")("sshClientWrapper:insecure:sshExec_masterPty");
const { sendPty, sshCmd, getSshOption, sanityCheck, watchDogTimer } = require("./util.js");
const { fork, createMasterPty, sshLoginCallback } = require("./fork.js");

/**
 * Execute command on remote host.
 * @param {Object} hostInfo - hostinfo object
 * @param {string} cmd - Cmdline which will be executed on remote host.
 * @param {number} timeout - timeout (in sec.)
 * @param {Function} outputCallback - Callback routine for stdout and stderr.
 */
async function sshExec (hostInfo, cmd, timeout, outputCallback) {
  debug("sshExec called");
  await connect(hostInfo);
  debug("exec", cmd, "on remote server");
  const args = getSshOption(hostInfo, false);
  args.push(cmd);
  debugVerbose(`exec: ${sshCmd} ${args.join(" ")}`);

  try {
    const rt = await retryWrapper(fork.bind(null, hostInfo, sshCmd, args, timeout, outputCallback), hostInfo);
    return rt;
  } catch (e) {
    if (typeof e.rt === "undefined") {
      throw e;
    }
    if (e.rt === 126) {
      debug(`${cmd} got Permission deny error but ignored`);
      return e.rt;
    }
    if (e.rt === 127) {
      debug(`${cmd} not found but ignored`);
      return e.rt;
    }
    return e.rt;
  }
}

/**
 * Check if you can connect to sepecified server
 * @param {Object} hostInfo - hostinfo object
 * @param {Integer} timeout - timeout in secconds
 */
async function canConnect (hostInfo, timeout = 60) {
  debug("canConnect called");
  sanityCheck(hostInfo);

  await connect(hostInfo, timeout);
  await disconnect(hostInfo);
  // if connection fail, Error is throwed.
  // so, if we reach here, connection must be succeeded
  return true;
}

/**
 * check if master session exists or not
 * @param {Object} hostInfo - hostinfo object
 * @returns {boolean} - true if master session exists
 */
async function existsMaster (hostInfo, argTimeout) {
  debugVerbose("existsMaster called");
  const args = getSshOption(hostInfo);
  args.push("-Ocheck");

  let output = "";
  const cb = (e) => {
    output += e;
  };

  const timeout = argTimeout || hostInfo.ConnectTimeout || 60;
  debug(`check master session: ${sshCmd} ${args.join(" ")}`);

  try {
    await fork(hostInfo, sshCmd, args, timeout, cb);
  } catch (err) {
    if (err.code === "TIMEEXPIRE") {
      return false;
    }
    if (err.rt !== 255) {
      debug("check master session failed", err);
      throw err;
    }
  }

  return !/Control socket connect.*: No such file or directory/.test(output);
}

/**
 * create master ssh connection
 * @param {Object} hostInfo - hostinfo object
 */
async function connect (hostInfo, timeout = 60) {
  debug("connect called");

  if (await existsMaster(hostInfo, timeout)) {
    debugVerbose("master connection exists");
    return;
  }

  debug(`create master pty for ${hostInfo.host}`);
  createMasterPty(hostInfo, debugSendMasterPty);

  debug(`create master ssh session to ${hostInfo.host}`);
  const words = crypto.randomUUID();
  const re = new RegExp(`^${words}`);

  let ac = null;
  const p = new Promise((resolve, reject) => {
    ac = watchDogTimer(timeout, "make connection", () => {
      sendPty(hostInfo.masterPty, "\n", debugSendMasterPty, 137);
      sendPty(hostInfo.masterPty, "exit\n", debugSendMasterPty, 138);

      const err = new Error(`can not connect within ${timeout} sec`);
      err.host = hostInfo.host;
      err.user = hostInfo.user;
      err.port = hostInfo.port;
      reject(err);
    });

    let done = false;
    hostInfo.masterPty.onData((data) => {
      if (done) {
        // safeguard
        return;
      }
      const output = data.toString();
      debugVerbose(output);

      if (re.test(output)) {
        debug("test done. call exit on remotehost");
        done = true;
        resolve();
      } else if (/Permission denied \(/.test(output)) {
        reject(new Error("Permission denied"));
      } else if (/Could not resolve hostname/.test(output)) {
        reject(new Error("Could not resolve hostname"));
      } else if (/Bad port/.test(output)) {
        reject(new Error("Bad port"));
      } else if (/Operation|Connection timed out/.test(output)) {
        reject(new Error("Operation timed out"));
      }
    });
    hostInfo.masterPty.onData((data) => {
      const output = data.toString();
      sshLoginCallback(output, hostInfo.masterPty, hostInfo.password, hostInfo.passphrase, debugSendMasterPty)
        .catch(reject);
    });
    hostInfo.masterPty.onExit((e) => {
      debug("master pty exit", e);
      resolve(e);
    });
  });

  const args = getSshOption(hostInfo);
  args.push(`echo ${words}`);
  const cmd = `${sshCmd} ${args.join(" ")}\n`;
  sendPty(hostInfo.masterPty, cmd, debugSendMasterPty, 190);

  try {
    await p;
    debug(`connected to ${hostInfo.host}`);
  } finally {
    if (ac !== null) {
      ac.abort();
    }
  }
}

/**
 * remove master session
 * @param {Object} hostInfo - hostinfo object
 */
async function disconnect (hostInfo) {
  debug("disconnect called");

  if (await existsMaster(hostInfo)) {
    const args = getSshOption(hostInfo);
    args.push("-Oexit");

    let output = "";
    const cb = (e) => {
      output += e;
    };
    try {
      debug(`disconnect: ${sshCmd} ${args.join(" ")}`);
      await fork(hostInfo, sshCmd, args, 0, cb);
    } catch (err) {
      if (err.rt === 255) {
        return;
      }
      if (/Control socket connect.*: No such file or directory/.test(output)) {
        return;
      }
      throw err;
    }
    debug(`disconnected from ${hostInfo.host}`);
  } else {
    debug(`disconnect: master session to ${hostInfo.host} does not exist`);
  }

  if (hostInfo.masterPty) {
    debug("exit masterPty");
    sendPty(hostInfo.masterPty, "exit \n", debugSendMasterPty, 228);
    hostInfo.masterPty = null;
  }
}

/**
 * execute ls command and return output
 * @param {Object} hostInfo - hostinfo object
 * @param {string} target - file or directory path to watch
 * @param {string[]} lsOpt - optional arguments for ls
 * @param {number} timeout - timeout (in sec.)
 * @returns {string[]} - output from ls
 */
async function ls (hostInfo, target, lsOpt, timeout) {
  debug("ls called");
  const outputArray = [];
  try {
    await sshExec(hostInfo, `ls ${lsOpt.join(" ")} ${target}`, timeout, (data) => {
      outputArray.push(data);
    });
  } catch (e) {
    // non-zero retrun should be allowed
    if (typeof e.rt === "undefined" || e.rt < 0) {
      throw e;
    }
  }
  return outputArray.length === 0
    ? []
    : outputArray
      .join("\n")
      .replace(/\n+/g, "\n")
      .replace(/\n$/, "")
      .split("\n");
}

/**
 * retry fork() if it throw retryable error
 * @param {Function} func - function to be wrapped
 * @param {Object} hostInfo - hostinfo object
 * @param {Integer} argMaxRetry - max retry number
 */
async function retryWrapper (func, hostInfo, argMaxRetry, argDuration) {
  const maxRetry = argMaxRetry || hostInfo.maxRetry || 1;
  const duration = argDuration || hostInfo.retryDuration || 1000;
  if (maxRetry === 1) {
    return func();
  }
  let retryCount = 0;
  while (true) {
    let rt;
    try {
      rt = await func();
      return rt;
    } catch (e) {
      if (!e.retryable) {
        throw e;
      }
      if (retryCount > maxRetry) {
        debug(`max retry count exceeded: ${retryCount}`);
        throw e;
      }
      retryCount++;
      debug(`retryable error occurred ${e.message}`);
      debug(`retrying: ${retryCount} times`);
      await setTimeoutPromise(duration, true);
    }
  }
}

module.exports = {
  sshExec,
  canConnect,
  connect,
  disconnect,
  ls,
  retryWrapper
};
