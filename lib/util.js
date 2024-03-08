"use strict";
const { EOL } = require("os");
const fs = require("fs");
const debug = require("debug")("sshClientWrapper:debug:util");
const { setTimeout: setTimeoutPromise } = require("timers/promises");

const sshCmd = "ssh";
const rsyncCmd = "rsync";
const acceptableRsyncRetrunCodes = [10, 11, 12, 13, 14];

const rePwPrompt = /password:/;
const rePhPrompt = /Enter passphrase for key/;
const reNewHostPrompt = /Are you sure you want to continue connecting/;

const Ajv = require("ajv");

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  useDefaults: "empty",
  logger: {
    log: debug,
    warn: debug,
    error: debug
  }
});
require("ajv-keywords")(ajv, "transform");

// never validate password and passphrase value to avoid security insident
const hostInfoSchema = {
  type: "object",
  properties: {
    host: { type: "string", pattern: "\\S+", transform: ["trim"] },
    user: { type: "string", pattern: "\\S+", transform: ["trim"] },
    port: { type: "number", minimum: 0, maximum: 65535 },
    keyFile: { type: "string", pattern: "\\S+", transform: ["trim"] },
    noStrictHostkeyChecking: { type: "boolean" },
    ControlPersist: { type: "number", minimum: 0, default: 180 },
    ConnectTimeout: { type: "number", minimum: 0 },
    maxRetry: { type: "number", minimum: 0, default: 3 },
    retryDuration: { type: "number", minimum: 0, default: 1000 },
    sshOpt: { type: "array", minItems: 1, items: { type: "string", pattern: "\\S+", transform: ["trim"] } }
  },
  required: ["host"]
};

const stringOptions = [
  "user",
  "keyFile"
];
const numberOptions = [
  "ControlPersist",
  "ConnectTimeout",
  "maxRetry",
  "retryDuration"
];

const validate = ajv.compile(hostInfoSchema);

/**
 * bridge function to functions which need string
 * @param {Function} func - function
 * @param {data} data - binary data which can be converted to string
 */
const buff2String = (func, data) => {
  func(data.toString().replace(/\r\n/g, EOL));
};

/**
 * check if given hostInfo object is OK
 * @param { Object } hostInfo - host information object defined in index.js
 */
const sanityCheck = (hostInfo) => {
  debug("sanityCheck called", hostInfo);

  // keep password, passphrase, and masterPty before validate.
  // these properties can have a iellegal value as JSON data
  // so we keep them before ajv validation and put them back

  const { password, passphrase, masterPty } = hostInfo;
  validate(hostInfo);

  if (validate !== null && Array.isArray(validate.errors)) {
    for (const e of validate.errors) {
      debug("validation error:", e);
      const prop = e.instancePath.replace(/^\//, "");
      if (e.keyword === "required" && e.params.missingProperty === "host") {
        throw new Error("host is required");
      }
      if (prop === "host") {
        if (hostInfo.host === "") {
          throw new Error("empty host is not allowed");
        }
        const err = new Error("invalid host specified");
        err.hostInfo = hostInfo;
        err.validationError = e;
        throw err;
      }
      if (prop.startsWith("sshOpt")) {
        debug("remove empty member of sshOpt");
        hostInfo.sshOpt = hostInfo.sshOpt.filter((opt) => {
          return opt !== "";
        });
        continue;
      } else if (stringOptions.includes(prop) && hostInfo[prop] === "") {
        debug("remove empty string option", prop, hostInfo[prop]);
        delete hostInfo[prop];
        continue;
      } else if (numberOptions.includes(prop) && ["minimum", "maximum"].includes(e.keyword)) {
        debug("remove out of range number option", prop, hostInfo[prop]);
        delete hostInfo[prop];
        continue;
      } else {
        const err = new Error(`invalid ${prop} specified ${hostInfo[prop]}`);
        err.hostInfo = hostInfo;
        err.validationError = e;
        throw err;
      }
    }
  }
  if (["string", "function"].includes(typeof password)) {
    hostInfo.password = password;
  }
  if (["string", "function"].includes(typeof passphrase)) {
    hostInfo.passphrase = passphrase;
  }
  if (typeof masterPty !== "undefined") {
    hostInfo.masterPty = masterPty;
  }
  return hostInfo;
};

/**
 * return ssh option with some hard corded options
 * @param { Object} hostInfo - host information object defined in index.js
 * @param {boolean} withoutDestination - return except for hostname
 */
const getSshOption = (hostInfo, withoutDestination) => {
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
    args.push(...hostInfo.sshOpt.filter((e) => {
      return typeof e === "string";
    }));
  }
  return args;
};

const isArrayOfString = (target) => {
  if (!Array.isArray(target)) {
    return false;
  }
  return !target.some((e) => {
    // target has non string member
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
const sendPty = async (pty, message, logger, label) => {
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
const watchDogTimer = (timeout, label, cb) => {
  const ac = new AbortController();
  const signal = ac.signal;
  setTimeoutPromise(timeout * 1000, "neverUsedValue", { signal })
    .then(() => {
      debug(`can not finish ${label} within ${timeout} sec`);
      return typeof cb === "function" ? cb() : true;
    })
    .catch((err) => {
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
  acceptableRsyncRetrunCodes,
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
