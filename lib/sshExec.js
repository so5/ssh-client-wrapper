"use strict";
const crypto = require("crypto");
const { setTimeout: setTimeoutPromise } = require("timers/promises");
const debug = require("debug")("sshClientWrapper:debug:sshExec");
const debugVerbose = require("debug")("sshClientWrapper:verbose:sshExec");
const debugSendMasterPty = require("debug")("sshClientWrapper:insecure:sshExec:masterPty");
const { sendPty, sshCmd, getSshOption, sanityCheck, watchDogTimer } = require("./util.js");
const { fork, createMasterPty, sshLoginCallback } = require("./fork.js");

/**
 * @typedef Integer {number} - integer number
 */

/**
 * Execute command on remote host.
 * @param {object} hostInfo - hostinfo object
 * @param {string} cmd - Cmdline which will be executed on remote host.
 * @param {number} timeout - timeout (in sec.)
 * @param {Function} outputCallback - Callback routine for stdout and stderr.
 * @param {string} rcfile - rcfile path which will be sourced before executing actual command
 * @param {string} prependCmd - command string which will be executed before executing actual command
 * @returns {Integer} - return value of cmd
 */
async function sshExec(hostInfo, cmd, timeout, outputCallback, rcfile, prependCmd) {
  debug("sshExec called");
  await connect(hostInfo);
  debug("exec", cmd, "on remote server");
  const args = getSshOption(hostInfo, false);
  if (rcfile) {
    args.push(`. ${rcfile};`);
  } else if (hostInfo.rcfile) {
    args.push(`. ${hostInfo.rcfile};`);
  }
  if (prependCmd) {
    args.push(`${prependCmd};`);
  } else if (hostInfo.prependCmd) {
    args.push(`${hostInfo.prependCmd};`);
  }

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
    }
    if (e.rt === 127) {
      debug(`${cmd} not found but ignored`);
    }
    return e.rt;
  }
}

async function expect(hostInfo, cmd, expects, timeout) {
  debug("expect called");
  await connect(hostInfo);
  debugVerbose("exec", cmd, "on remote server with", expects);
  const args = getSshOption(hostInfo, false);
  const compiledExpects = expects.map((e)=>{
    return {
      reExpect: new RegExp(e.expect),
      send: e.send,
      keep: e.keep
    };
  });
  const reExpect = hostInfo.prompt ? new RegExp(hostInfo.prompt) : /[$#>] /;
  compiledExpects.unshift({ reExpect, send: cmd });
  compiledExpects.push({ reExpect, send: "exit" });

  try {
    const rt = await fork(hostInfo, sshCmd, args, timeout, null, [], compiledExpects);
    return rt;
  } catch (e) {
    if (typeof e.rt === "undefined") {
      throw e;
    }
    if (e.rt === 126) {
      debug(`${cmd} got Permission deny error but ignored`);
    }
    if (e.rt === 127) {
      debug(`${cmd} not found but ignored`);
    }
    return e.rt;
  }
}

/**
 * Check if you can connect to sepecified server
 * @param {object} hostInfo - hostinfo object
 * @param {Integer} timeout - timeout in secconds
 */
async function canConnect(hostInfo, timeout) {
  debug("canConnect called");
  sanityCheck(hostInfo);

  await connect(hostInfo, timeout);
  await disconnect(hostInfo);
  //if connection fail, Error is throwed.
  //so, if we reach here, connection must be succeeded
  return true;
}

/**
 * check if master session exists or not
 * @param {object} hostInfo - hostinfo object
 * @returns {boolean} - true if master session exists
 */
async function existsMaster(hostInfo, argTimeout) {
  debugVerbose("existsMaster called");
  const args = getSshOption(hostInfo);
  args.push("-Ocheck");

  let output = "";
  const cb = (e)=>{
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
 * @param {object} hostInfo - hostinfo object
 */
async function connect(hostInfo, timeout = 60) {
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
  let output = null;
  const p = new Promise((resolve, reject)=>{
    ac = watchDogTimer(timeout, "make connection", ()=>{
      sendPty(hostInfo.masterPty, "\n", debugSendMasterPty, 137);
      sendPty(hostInfo.masterPty, "exit\n", debugSendMasterPty, 138);

      const err = new Error(`can not connect within ${timeout} sec`);
      err.host = hostInfo.host;
      err.user = hostInfo.user;
      err.port = hostInfo.port;
      err.output = output;
      reject(err);
    });

    let done = false;
    hostInfo.masterPty.onData((data)=>{
      if (done) {
        //safeguard
        return;
      }
      output = data.toString();
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
      } else if (/muxserver_listen: link mux listener .* Bad file descriptor/.test(output)) {
        reject(new Error("Control socket creation failed"));
      }
    });
    hostInfo.masterPty.onData((data)=>{
      const output = data.toString();
      sshLoginCallback(output, hostInfo.masterPty, hostInfo.password, hostInfo.passphrase, debugSendMasterPty)
        .catch(reject);
    });
    hostInfo.masterPty.onExit((e)=>{
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
 * @param {object} hostInfo - hostinfo object
 */
async function disconnect(hostInfo) {
  debug("disconnect called");

  if (await existsMaster(hostInfo)) {
    const args = getSshOption(hostInfo);
    args.push("-Oexit");

    let output = "";
    const cb = (e)=>{
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
 * retry fork() if it throw retryable error
 * @param {Function} func - function to be wrapped
 * @param {object} hostInfo - hostinfo object
 * @param {Integer} argMaxRetry - max retry number
 * @param {Integer} argDuration - time to wait before retring
 * @returns {Integer} - return value of func
 */
async function retryWrapper(func, hostInfo, argMaxRetry, argDuration) {
  const maxRetry = argMaxRetry || hostInfo.maxRetry || 3;
  const duration = argDuration || hostInfo.retryDuration || 1000;
  if (maxRetry === 1) {
    return func();
  }
  let retryCount = 0;
  for (;;) {
    let rt;
    try {
      rt = await func();
      return rt;
    } catch (e) {
      if (!e.retryable) {
        debug("unretryable error occurred!");
        throw e;
      }
      if (retryCount > maxRetry) {
        debug(`max retry count exceeded: ${retryCount}`);
        e.retryCount = retryCount;
        e.maxRetryCount = maxRetry;
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
  expect,
  retryWrapper
};
