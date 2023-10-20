"use strict";
const { EOL } = require("os");
const fs = require("fs");
const debug = require("debug")("sshClientWrapper:debug:util");
const { setTimeout: setTimeoutPromise } = require("timers/promises");

const sshCmd = "ssh";
const rsyncCmd = "rsync";

const rePwPrompt = /password:/;
const rePhPrompt = /Enter passphrase for key/;
const reNewHostPrompt = /Are you sure you want to continue connecting/;


/**
 * bridge function to functions which need string
 * @param {Function} func - function
 * @param {data} data - binary data which can be converted to string
 */
const buff2String = (func, data)=>{
  func(data.toString().replace(/\r\n/g, EOL));
};

/**
 * check if given hostInfo object is OK
 * @param { Object} hostInfo - host information object defined in index.js
 */
const sanityCheck = (hostInfo)=>{
  debug("sanityCheck called");

  if (typeof hostInfo.host !== "string" || hostInfo.host === "") {
    throw new Error("host must be non-empty string");
  }
  if (Object.prototype.hasOwnProperty.call(hostInfo, "port") && (typeof hostInfo.port === "string" || Number.isInteger(hostInfo.port))) {
    const port = Number(hostInfo.port);
    if (port < 0 || port > 65535) {
      throw new Error("port number must be in the range of 0 to 65535");
    }
  }
};

/**
 * return ssh option with some hard corded options
 * @param { Object} hostInfo - host information object defined in index.js
 * @param {boolean} withoutDestination - return except for hostname
 */
const getSshOption = (hostInfo, withoutDestination)=>{
  debug("getSshOption called");
  const args = [];

  if (!withoutDestination) {
    args.push(hostInfo.host);
  }
  if (typeof hostInfo.sshopt === "string") {
    args.push(hostInfo.sshopt);
  }
  if (typeof hostInfo.user === "string") {
    args.push("-l");
    args.push(hostInfo.user);
  } else if (typeof hostInfo.username === "string") {
    args.push("-l");
    args.push(hostInfo.username);
  } else if (typeof hostInfo.loginname === "string") {
    args.push("-l");
    args.push(hostInfo.loginname);
  }
  if (typeof hostInfo.port === "string" || Number.isInteger(hostInfo.port)) {
    args.push("-p");
    args.push(hostInfo.port);
  }
  if (typeof hostInfo.keyFile === "string") {
    try {
      const stats = fs.statSync(hostInfo.keyFile);
      if (stats.isFile()) {
        args.push("-i");
        args.push(hostInfo.keyFile);
      } else {
        debug(`specified keyFile(${hostInfo.keyFile}) is not file. so it is ignored`);
      }
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
      debug(`specified keyFile(${hostInfo.keyFile}) not found and ignored`);
    }
  }

  if (hostInfo.noStrictHostkeyChecking) {
    args.push("-oStrictHostKeyChecking=no");
  }
  const ControlPersist = Number.isInteger(hostInfo.ControlPersist) && hostInfo.ControlPersist >= 0 ? hostInfo.ControlPersist : "180";
  args.push("-oControlMaster=auto");
  args.push("-oControlPath=~/.ssh/ssh-client-wrapper-%r@%h:%p");
  args.push(`-oControlPersist=${ControlPersist}`);

  if (Number.isInteger(hostInfo.ConnectTimeout) && hostInfo.ConnectTimeout > 0) {
    args.push(`-oConnectTimeout=${hostInfo.ConnectTimeout}`);
  }
  if (Array.isArray(hostInfo.sshOpt)) {
    args.push(...hostInfo.sshOpt.filter((e)=>{
      return typeof e === "string";
    }));
  }
  return args;
};

const isArrayOfString = (target)=>{
  if (!Array.isArray(target)) {
    return false;
  }
  return !target.some((e)=>{
    //target has non string member
    return typeof e !== "string";
  });
};

/**
 * log and send message to pty
 * @param {Object} pty - pty object which message will be send to
 * @param {string} message - message
 * @param {Function} logger - logging function
 * @param {string} label - where this function is called
 */
const sendPty = async (pty, message, logger, label)=>{
  logger(`${label}: ${message}`);
  pty.write(message);
};

/**
 * set watch dog timer
 * @param {number} timeout - timeout (in sec.)
 * @param {string} label - used in both timeout and aborted message
 * @param {Function} cb - call back function which will be called after timeout
 * @returns {AbortController} - ac to stop watch dog timer
 */
const watchDogTimer = (timeout, label, cb)=>{
  const ac = new AbortController();
  const signal = ac.signal;
  setTimeoutPromise(timeout * 1000, "neverUsedValue", { signal })
    .then(()=>{
      debug(`can not finish ${label} within ${timeout} sec`);
      return typeof cb === "function" ? cb() : true;
    })
    .catch((err)=>{
      if (err.name === "AbortError") {
        debug(`timeout was aborted because ${label} has finished or canceled`);
      } else {
        throw err;
      }
    });
  return ac;
};

module.exports = {
  sshCmd,
  rsyncCmd,
  rePwPrompt,
  rePhPrompt,
  reNewHostPrompt,
  buff2String,
  getSshOption,
  sanityCheck,
  isArrayOfString,
  sendPty,
  watchDogTimer
};
