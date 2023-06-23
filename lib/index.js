"use strict";
const debugLib = require("debug");
const debug = debugLib("sshClientWrapper:interface");
const { sshExec, canConnect, disconnect } = require("./sshExec.js");
const { send, recv } = require("./rsyncExec.js");
const { isArrayOfString } = require("./util.js");

/**
 * Integer means integer number but it is defined as Object for now
 * workaround for eslint-plugin-jsdoc's no-undefined-types rule bug.
 * @typedef {Object} Integer
 */

/**
 * Facade class.
 * @constructor
 * @param {Object} hostInfo - option object
 * @param {string} hostInfo.host - destination
 * @param {string} hostInfo.user - login name
 * @param {number} hostInfo.port - port number
 * @param {string | Function} hostInfo.password - password
 * @param {string | Function} hostInfo.passphrase - passphrase
 * @param {string} hostInfo.keyFile - private key filename
 * @param {boolean} hostInfo.noStrictHostkeyChecking - bypass host key checking if true
 * @param {Integer} hostInfo.renewInterval=0 - Connection renewal interval (sec).
 */
class SshClientWrapper {
  constructor(hostInfo) {
    if (typeof hostInfo.host !== "string") {
      return new Error("hostname must be specified!");
    }
    this.hostInfo = hostInfo;
  }

  /**
   * Execute command on remote host.
   * @param {string} cmd - Cmdline which will be executed.
   * @param { Function } outputCallback - call back routine for output
   * @returns {Integer} - Return code of cmd.
   *
   * If stdout and stderr is array, last 5 line of stdout and stderr is stored in them.
   */
  async exec(cmd, outputCallback) {
    debug("exec called", cmd);

    if (typeof cmd !== "string") {
      return Promise.reject(new Error("cmd must be string"));
    }
    return sshExec(this.hostInfo, cmd, outputCallback);
  }

  /**
   * Execute command repeatedly until specified keyword is found in stdout and/or stderr.
   * @param {string} cmd - Cmdline which will be executed.
   * @param {RegExp} regexp - End condition.
   * @param {number} retryDelay - Duration between each try (in sec).
   * @param {number} maxRetry - Max retry count.
   * @returns {Integer} - Return code of cmd.
   *
   * If stdout and stderr is array, last 10 line of stdout and stderr is stored in them.
   */
  async watch(cmd, regexp, retryDelay = 3, maxRetry = null) {
    debug("watch called", cmd, regexp, retryDelay, maxRetry);

    if (typeof cmd !== "string") {
      return Promise.reject(new Error("cmd must be string"));
    }
    if (!(regexp instanceof RegExp)) {
      const err = new Error("illegal regexp specified");
      err.regexp = regexp;
      err.cmd = cmd;
      err.retryDelay = retryDelay;
      err.maxRetry = maxRetry;
      return Promise.reject(err);
    }
    //TODO promise retry
  }

  /**
   * Send file or directory and its child to server.
   * @param {[string]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {[string]} opt - option for rsync
   * @returns {Promise} - Resolved with undefined when file transfer is done.
   */
  async send(src, dst, opt) {
    debug("send called", src, dst, opt);

    if (!isArrayOfString(src)) {
      const err = "src must be array of string";
      debug(err);
      return new Error(err);
    }
    if (typeof dst !== "string") {
      const err = "dst must be string";
      debug(err);
      return new Error(err);
    }
    if (typeof opt !== "undefined" && !isArrayOfString(opt)) {
      const err = "opt must be array of string";
      debug(err);
      return new Error(err);
    }
    return send(this.hostInfo, src, dst, opt);
  }

  /**
   * Get file or directory and its child from server.
   * @param {[string]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {[string]} opt - option for rsync
   * @returns {Promise} - Resolved with undefined when file transfer is done.
   */
  async recv(src, dst, opt) {
    debug("recv called", src, dst, opt);

    if (!isArrayOfString(src)) {
      const err = "src must be array of string";
      debug(err);
      return new Error(err);
    }
    if (typeof dst !== "string") {
      const err = "dst must be string";
      debug(err);
      return new Error(err);
    }
    if (typeof opt !== "undefined" && !isArrayOfString(opt)) {
      const err = "opt must be array of string";
      debug(err);
      return new Error(err);
    }
    return recv(this.hostInfo, src, dst, opt);
  }

  /**
   * Check if you can connect to specified server.
   * @param {Integer} timeout - timeout in secconds
   * @returns {Promise} - Resolved with true on success, otherwise rejected with Error.
   */
  canConnect(timeout) {
    debug("canConnect called timeout=", timeout);

    if (!Number.isInteger(timeout) || timeout <= 0) {
      return new Error("timeout must be positive integer");
    }
    return canConnect(this.hostInfo, timeout);
  }

  /**
   * Disconnect master session
   */
  disconnect() {
    debug("disconnect called");
    disconnect(this.hostInfo);
  }
}

module.exports = SshClientWrapper;
