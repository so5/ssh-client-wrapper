"use strict";
const { setTimeout: setTimeoutPromise } = require("timers/promises");
const crypto = require("crypto");
const promiseRetry = require("promise-retry");
const debug = require("debug")("sshClientWrapper:sshExec");
const debugVerbose = require("debug")("sshClientWrapper:sshExec_verbose");
const { sshCmd, getSshOption, sanityCheck } = require("./util.js");
const { fork, getMasterPty } = require("./fork.js");

/**
 * Execute command on remote host.
 * @param {Object} hostInfo - hostinfo object
 * @param {string} cmd - Cmdline which will be executed on remote host.
 * @param {Function} outputCallback - Callback routine for stdout and stderr.
 */
async function sshExec(hostInfo, cmd, outputCallback) {
  await connect(hostInfo);
  debug("exec", cmd, "on remote server");
  const args = getSshOption(hostInfo, false);
  args.push(cmd);
  debugVerbose(`exec: ${sshCmd} ${args.join(" ")}`);

  try {
    const rt = await retryWrapper(fork.bind(null, hostInfo, sshCmd, args, outputCallback), hostInfo);
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
async function canConnect(hostInfo, timeout = 60) {
  debug("sanity check");
  sanityCheck(hostInfo);

  debug("check connectibity");

  try {
    await connect(hostInfo, timeout);
  } finally {
    await disconnect(hostInfo);
  }
  return true;
}

/**
 * check if master session exists or not
 * @param {Object} hostInfo - hostinfo object
 * @returns {boolean} - true if master session exists
 */
async function existsMaster(hostInfo) {
  const ac = new AbortController();
  const signal = ac.signal;

  const args = getSshOption(hostInfo);
  args.push("-Ocheck");

  let output = "";
  const cb = (e)=>{
    output += e;
  };

  let rt = true; //if timeout occurred during ssh -Ocheck, it will turn to false
  let p;
  const timeout = hostInfo.ConnectTimeout || 60;
  setTimeoutPromise(timeout * 1000, "neverUsedValue", { signal })
    .then(()=>{
      debug(`can not finish master session check within ${timeout} sec`);

      if (p.pty) {
        p.pty.kill();
      }
      rt = false;
    })
    .catch((err)=>{
      if (err.name === "AbortError") {
        debug("timeout was aborted because master session check has done");
      } else {
        throw err;
      }
    });

  try {
    debug(`check master session: ${sshCmd} ${args.join(" ")}`);
    p = fork(hostInfo, sshCmd, args, cb);
    await p;
    ac.abort();
  } catch (err) {
    if (err.rt !== 255) {
      debug("check master session failed", err);
      throw err;
    }
  }

  return rt && !/Control socket connect.*: No such file or directory/.test(output);
}

/**
 * create master ssh connection
 * @param {Object} hostInfo - hostinfo object
 */
async function connect(hostInfo, timeout = 60) {
  if (await existsMaster(hostInfo)) {
    debugVerbose("master connection exists");
    return;
  }
  debug(`create master ssh session to ${hostInfo.host}`);

  if (!hostInfo.masterPty) {
    debug(`create master pty for ${hostInfo.host}`);
    hostInfo.masterPty = getMasterPty(hostInfo);
  } else {
    debug(`master pty for ${hostInfo.host} exists`);
  }

  const ac = new AbortController();
  const signal = ac.signal;
  setTimeoutPromise(timeout * 1000, "neverUsedValue", { signal })
    .then(()=>{
      debug(`can not connect within ${timeout} sec`);
      hostInfo.masterPty.write("\n");
      hostInfo.masterPty.write("exit\n");

      const err = new Error(`can not connect within ${timeout} sec`);
      err.host = hostInfo.host;
      err.user = hostInfo.user;
      err.port = hostInfo.port;
      throw err;
    })
    .catch((err)=>{
      if (err.name === "AbortError") {
        debug("timeout was aborted because connection check has done");
      } else {
        throw err;
      }
    });

  const words = crypto.randomUUID();
  const re = new RegExp(`^${words}`);
  const p = new Promise((resolve, reject)=>{
    let done = false;
    hostInfo.masterPty.onData((data)=>{
      if (done) {
        //safeguard
        return;
      }
      const output = data.toString();
      debugVerbose(output);

      if (re.test(output)) {
        debug("test done. call exit on remotehost");
        hostInfo.masterPty.write("exit\n");
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
    hostInfo.masterPty.onExit((e)=>{
      debug("master pty exit", e);
      resolve(e);
    });
  });

  const args = getSshOption(hostInfo);
  args.push(`echo ${words}`);
  const cmd = `${sshCmd} ${args.join(" ")}\n`;
  debugVerbose(cmd);
  hostInfo.masterPty.write(cmd);
  await p;
  ac.abort();
  debug(`connected to ${hostInfo.host}`);
}

/**
 * remove master session
 * @param {Object} hostInfo - hostinfo object
 */
async function disconnect(hostInfo) {
  if (await existsMaster(hostInfo)) {
    const args = getSshOption(hostInfo);
    args.push("-Oexit");

    let output = "";
    const cb = (e)=>{
      output += e;
    };
    try {
      debug(`disconnect: ${sshCmd} ${args.join(" ")}`);
      await fork(hostInfo, sshCmd, args, cb);
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
    hostInfo.masterPty.write("exit \n");
    hostInfo.masterPty = null;
  }
}

/**
 * execute ls command and return output
 * @param {Object} hostInfo - hostinfo object
 * @param {string} target - file or directory path to watch
 * @param {string[]} lsOpt - optional arguments for ls
 * @returns {string[]} - output from ls
 */
async function ls(hostInfo, target, lsOpt = []) {
  const outputArray = [];
  try {
    await sshExec(hostInfo, `ls ${lsOpt.join(" ")} ${target}`, (data)=>{
      outputArray.push(data);
    });
  } catch (e) {
    //non-zero retrun should be allowed
    if (typeof e.rt === "undefined" || e.rt < 0) {
      throw e;
    }
  }
  return outputArray.length === 0 ? []
    : outputArray
      .join("\n")
      .replace(/\n+/g, "\n")
      .replace(/\n$/, "")
      .split("\n");
}

/**
 * retry fork() if it throw retryable error
 * @param {Function}  func - function to be wrapped
 */
async function retryWrapper(func, hostInfo) {
  const minTimeout = hostInfo.retryMinTimeout * 1000 || 1000;
  const maxTimeout = hostInfo.retryMaxTimeout * 1000 || 5000;
  const retries = hostInfo.maxRetry || 1;
  return promiseRetry({ retries, minTimeout, maxTimeout }, (retry, number)=>{
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
  connect,
  disconnect,
  ls,
  retryWrapper
};
