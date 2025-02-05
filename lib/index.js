"use strict";
const fs = require("fs");
const path = require("path");
const debug = require("debug")("sshClientWrapper:interface");
const debugVerbose = require("debug")("sshClientWrapper:verbose:interface");
const { sshExec, canConnect, disconnect, ls, expect } = require("./sshExec.js");
const { send, recv } = require("./rsyncExec.js");
const { isArrayOfString, sanityCheck } = require("./util.js");

/**
 * Integer means integer number but it is defined as Object for now
 * workaround for eslint-plugin-jsdoc's no-undefined-types rule bug.
 * @typedef {object} Integer
 * @property
 */

/**
 * host info object which contain all settings for 1 remote host
 * it will be (shallow) copied in constructor.
 * @param {object} hostInfo - option object
 * @param {string} hostInfo.host - destination
 * @param {string} hostInfo.user - login name
 * @param {number} hostInfo.port - port number
 * @param {string | Function} hostInfo.password - password or function which return password
 * @param {string | Function} hostInfo.passphrase - passphrase or function which return passphrase of private key
 * @param {string} hostInfo.keyFile - private key filename
 * @param {boolean} hostInfo.noStrictHostKeyChecking - bypass host key checking if true
 * @param {Integer} hostInfo.ControlPersist=180 - how long keep master connection after last client connection has been closed (sec).
 * @param {Integer} hostInfo.ConnectTimeout=60 - timeout used when connectiong to ths SSH server
 * @param {Integer} hostInfo.maxRetry=3 - max number of retry
 * @param {Integer} hostInfo.retryDuration=1000 - duration time (msec) between each retry
 * @param {string} hostInfo.rcfile - rcfile path which will be sourced before executing actual command
 * @param {string} hostInfo.prependCmd - command string which will be executed before executing actual command
 * @param {string[]} hostInfo.sshOpt - additional options for ssh
 */

const logAndReject = (message)=>{
  debug(message);
  return Promise.reject(new Error(message));
};

/**
 * Facade class.
 * @class
 */
class SshClientWrapper {
  constructor(hostInfo) {
    debug("constructor called for", hostInfo.host);
    debugVerbose("hostInfo=", hostInfo);
    this.hostInfo = { ...hostInfo };
    sanityCheck(this.hostInfo);
    this.hostInfo.masterPty = null;
    this.hostInfo.rsyncVersion = null;

    if (process.env.HOME) {
      try {
        fs.mkdirSync(path.resolve(process.env.HOME, ".ssh"));
      } catch (e) {
        if (e.code !== "EEXIST") {
          throw e;
        }
      }
    }
  }

  /**
   * Execute command on remote host.
   * @param {string} cmd - Cmdline which will be executed.
   * @param {Integer} timeout - timeout in secconds
   * @param { Function } outputCallback - call back routine for output
   * @param {string} rcfile - rcfile path which will be sourced before executing actual command
   * @param {string} prependCmd - command string which will be executed before executing actual command
   * @returns {Integer} - Return code of cmd.
   *
   * note rcfile and prependCmd override hostInfo.rcfile and hostInfo.prependCmd respectively
   */
  async exec(cmd, timeout = 0, outputCallback = null, rcfile = null, prependCmd = null) {
    debug("exec called", cmd);

    if (typeof cmd !== "string" || cmd === "") {
      return logAndReject("cmd must be string");
    }
    return sshExec(this.hostInfo, cmd, timeout, outputCallback, rcfile, prependCmd);
  }

  /**
   * execute ls command and return output
   * @param {string} target - file or directory path to watch
   * @param {string[]} lsOpt - optional arguments for ls
   * @param {Integer} timeout - timeout in secconds
   * @returns {string[]} - output from ls
   */
  async ls(target, lsOpt = [], timeout = 0) {
    debug("ls called", target, lsOpt);
    return ls(this.hostInfo, target, lsOpt, timeout);
  }

  /**
   * execute series of comands like expect(3)
   * @param {string} cmd - Cmdline which will be executed.
   * @param {Array} expects - array of expect and send string pairs
   * @param {Integer} timeout - timeout in secconds
   * @returns {Integer} - Return code of cmd.
   */
  async expect(cmd, expects, timeout = 180) {
    debug("expect called", expects);
    return expect(this.hostInfo, cmd, expects, timeout);
  }

  /**
   * Send file or directory and its child to server.
   * @param {string[]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {string[]} opt - option for rsync
   * @param {Integer} timeout - timeout in secconds
   * @returns {Promise} - Resolved with undefined when file transfer is done.
   */
  async send(src, dst, opt = [], timeout = 0) {
    debug("send called", src, dst, opt);

    if (!isArrayOfString(src)) {
      return logAndReject("src must be array of string");
    }
    if (!src.some((e)=>{
      return e !== "";
    })) {
      return logAndReject("src must contain non-empty string");
    }
    if (typeof dst !== "string") {
      return logAndReject("dst must be string");
    }
    if (dst === "") {
      return logAndReject("dst must be non-empty string");
    }
    if (typeof opt !== "undefined" && !isArrayOfString(opt)) {
      return logAndReject("opt must be array of string");
    }
    return send(this.hostInfo, src, dst, opt, timeout);
  }

  /**
   * Get file or directory and its child from server.
   * @param {string[]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {string[]} opt - option for rsync
   * @param {Integer} timeout - timeout in secconds
   * @returns {Promise} - Resolved with undefined when file transfer is done.
   */
  async recv(src, dst, opt = [], timeout = 0) {
    debug("recv called", src, dst, opt);

    if (!isArrayOfString(src)) {
      return logAndReject("src must be array of string");
    }
    if (!src.some((e)=>{
      return e !== "";
    })) {
      return logAndReject("src must contain non-empty string");
    }
    if (typeof dst !== "string") {
      return logAndReject("dst must be string");
    }
    if (dst === "") {
      return logAndReject("dst must be non-empty string");
    }
    if (typeof opt !== "undefined" && !isArrayOfString(opt)) {
      return logAndReject("opt must be array of string");
    }
    return recv(this.hostInfo, src, dst, opt, timeout);
  }

  /**
   * Check if you can connect to specified server.
   * @param {Integer} timeout - timeout in secconds
   * @returns {Promise} - Resolved with true on success, otherwise rejected with Error.
   */
  async canConnect(timeout = 60) {
    debug("canConnect called with timeout=", timeout);
    debugVerbose("hostInfo=", this.hostInfo);

    if (!Number.isInteger(timeout) || timeout <= 0) {
      return logAndReject("timeout must be positive integer");
    }
    return canConnect(this.hostInfo, timeout);
  }

  /**
   * Disconnect master session
   */
  async disconnect() {
    debug(`disconnect from ${this.hostInfo.host} called`);
    disconnect(this.hostInfo);
  }
}

module.exports = SshClientWrapper;
