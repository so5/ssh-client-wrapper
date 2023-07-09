"use strict";
const debugLib = require("debug");
const debug = debugLib("sshClientWrapper:interface");
const { sshExec, canConnect, disconnect, ls } = require("./sshExec.js");
const { send, recv } = require("./rsyncExec.js");
const { isArrayOfString } = require("./util.js");

/**
 * Integer means integer number but it is defined as Object for now
 * workaround for eslint-plugin-jsdoc's no-undefined-types rule bug.
 * @typedef {Object} Integer
 */

/**
 * host info object which contain all settings for 1 remote host
 * it will be (shallow) copied in constructor.
 * @param {Object} hostInfo - option object
 * @param {string} hostInfo.host - destination
 * @param {string} hostInfo.user - login name
 * @param {number} hostInfo.port - port number
 * @param {string | Function} hostInfo.password - password or function which return password
 * @param {string | Function} hostInfo.passphrase - passphrase or function which return passphrase of private key
 * @param {string} hostInfo.keyFile - private key filename
 * @param {boolean} hostInfo.noStrictHostkeyChecking - bypass host key checking if true
 * @param {Integer} hostInfo.ControlPersist=180 - how long keep master connection after last client connection has been closed (sec).
 * @param {Integer} hostInfo.ConnectTimeout=60 - timeout used when connectiong to ths SSH server
 * @param {Integer} hostInfo.maxRetry=3 - max number of retry
 * @param {Integer} hostInfo.retryMinTimeout=60 - minimum duration before first retry
 * @param {Integer} hostInfo.retryMaxTimeout=300 - maximum duration between each retry
 * @param {string[]} hostInfo.sshOpt - additional options for ssh
 */

/**
 * Facade class.
 * @constructor
 */
class SshClientWrapper {
  constructor(hostInfo) {
    if (typeof hostInfo.host !== "string") {
      return new Error("hostname must be specified!");
    }
    this.hostInfo = { ...hostInfo };
    this.hostInfo.masterPty = null;
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
   * execute ls command and return output
   * @param {string} target - file or directory path to watch
   * @param {string[]} lsOpt - optional arguments for ls
   * @returns {string[]} - output from ls
   */
  async ls(target, lsOpt = []) {
    return ls(this.hostInfo, lsOpt);
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
   * @param {string[]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {string[]} opt - option for rsync
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
   * @param {string[]} src - File or directory name which to be recieve.
   * @param {string} dst - Destination path.
   * @param {string[]} opt - option for rsync
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
  canConnect(timeout = 60) {
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
