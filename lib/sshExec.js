"use strict";
const { setTimeout: setTimeoutPromise } = require("timers/promises");
const crypto = require("crypto");
const promiseRetry = require("promise-retry");
const debug = require("debug")("sshClientWrapper:sshExec");
const debugVerbose = require("debug")("sshClientWrapper:sshExec_verbose");
const { sshCmd, getSshOption } = require("./util.js");
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
    throw e;
  }
}

/**
 * Check if you can connect to sepecified server
 * @param {Object} hostInfo - hostinfo object
 * @param {Integer} timeout - timeout in secconds
 */
async function canConnect(hostInfo, timeout = 60) {
  debug("check connectibity");
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

  if (await existsMaster(hostInfo)) {
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

    debugVerbose(`canConnect: ${sshCmd} ${args.join(" ")}`);
    const rt = await retryWrapper(fork.bind(null, hostInfo, sshCmd, args, cb), hostInfo);
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
    if (!re.test(output)) {
      throw new Error("can not get echo result correctly");
    }
    return true;
  }
  //do NOT catch following try
  //if connect throw error, canConnect must be throw error
  try {
    await connect(hostInfo);
  } finally {
    ac.abort();
  }
  return true;
}

/**
 * check if master session exists or not
 * @param {Object} hostInfo - hostinfo object
 * @returns {boolean} - true if master session exists
 */
async function existsMaster(hostInfo) {
  const args = getSshOption(hostInfo);
  args.push("-Ocheck");

  let output = "";
  const cb = (e)=>{
    output += e;
  };
  try {
    debug(`check master session: ${sshCmd} ${args.join(" ")}`);
    await fork(hostInfo, sshCmd, args, cb);
  } catch (err) {
    if (err.rt !== 255) {
      throw err;
    }
  }
  return !/Control socket connect.*: No such file or directory/.test(output);
}

/**
 * create master ssh connection
 * @param {Object} hostInfo - hostinfo object
 */
async function connect(hostInfo) {
  if (await existsMaster(hostInfo)) {
    debugVerbose("master connection exists");
    return;
  }

  debug(`create master ssh session to ${hostInfo.host}`);
  const pty = hostInfo.masterPty || getMasterPty(hostInfo);
  hostInfo.masterPty = pty;

  const words = crypto.randomUUID();
  const re = new RegExp(`^${words}`);

  const p = new Promise((resolve, reject)=>{
    pty.onData((data)=>{
      const output = data.toString();
      debugVerbose(output);

      if (re.test(output)) {
        debug("call exit on remotehost");
        pty.write("exit\n");
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
    pty.onExit((e)=>{
      debug("master pty exit", e);
      resolve(e);
    });
  });

  const args = getSshOption(hostInfo);
  args.push(`echo ${words}`);
  const cmd = `${sshCmd} ${args.join(" ")}\n`;
  debugVerbose(cmd);
  pty.write(cmd);
  await p;
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
  const minTimeout = hostInfo.retryMinTimeout * 1000 || 60000;
  const maxTimeout = hostInfo.retryMaxTimeout * 1000 || 300000;
  const retries = hostInfo.maxRetry || 3;
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
