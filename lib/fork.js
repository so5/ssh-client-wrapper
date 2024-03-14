"use strict";
const debug = require("debug")("sshClientWrapper:debug:fork");
const debugVerbose = require("debug")("sshClientWrapper:verbose:fork");
const debugSendPty = require("debug")("sshClientWrapperInsecure:fork_sendpty");
const { spawn } = require("node-pty");

const { rePwPrompt, rePhPrompt, reNewHostPrompt, buff2String, sendPty, watchDogTimer } = require("./util.js");

const nodePtyOpt = {
  shell: process.platform === "win32" ? process.env.ComSpec : process.env.SHELL,
  windowsHide: true
};

function sshLoginCallback (output, ptyProcess, pw, ph, logger = debugSendPty) {
  return new Promise((resolve, reject) => {
    if (reNewHostPrompt.test(output)) {
      sendPty(ptyProcess, "yes\n", logger, 17);
      resolve();
    }
    if (rePwPrompt.test(output)) {
      if (typeof pw === "string") {
        debug("use given password");
        sendPty(ptyProcess, `${pw}\n`, logger, 23);
        resolve();
      }
      if (typeof pw === "function") {
        debug("call password callback function");
        pw()
          .then((v) => {
            sendPty(ptyProcess, `${v}\n`, logger, 30);
          })
          .catch((e) => {
            reject(e);
          });
        resolve();
      }
    }
    if (rePhPrompt.test(output)) {
      if (typeof ph === "string") {
        debug("use given passphrase");
        sendPty(ptyProcess, `${ph}\n`, logger, 38);
        resolve();
      }
      if (typeof ph === "function") {
        debug("call passphrase callback function");
        ph()
          .then((v) => {
            sendPty(ptyProcess, `${v}\n`, logger, 45);
          })
          .catch((e) => {
            reject(e);
          });
      }
    }
  });
}

/**
 * create pty for master ssh session and store to hostInfo.masterPty
 */
function createMasterPty (hostInfo) {
  debug("fork pty for master connection");

  if (hostInfo.masterPty) {
    debug(`kill existing master pty for ${hostInfo.host}`);
    hostInfo.masterPty.kill();
  }
  const ptyProcess = spawn(nodePtyOpt.shell, [], nodePtyOpt);
  hostInfo.masterPty = ptyProcess;
}

async function fork (hostInfo, cmd, args, timeout, outputCallback, retryableExitCodes = []) {
  return new Promise((resolve, reject) => {
    debug(`cmd=${cmd}: args=${args}`);
    const ptyProcess = spawn(cmd, args, nodePtyOpt);
    let ac = null;
    if (timeout > 0) {
      ac = watchDogTimer(timeout, cmd, () => {
        ptyProcess.kill();
        const err = new Error(`watchdog timer expired ${timeout}`);
        err.code = "TIMEEXPIRE";
        reject(err);
      });
    }
    ptyProcess.onData(buff2String.bind(null, debugVerbose));

    if (hostInfo !== null) {
      ptyProcess.onData(async (data) => {
        const output = data.toString();
        sshLoginCallback(output, ptyProcess, hostInfo.password, hostInfo.passphrase)
          .catch(reject);

        if (/kex_exchange_identification: Connection closed by remote host/.test(output)) {
          ptyProcess.kill();
          const err = new Error("kex_exchange_identification");
          err.retryable = true;
          reject(err);
        }
      });
    }

    if (typeof outputCallback === "function") {
      ptyProcess.onData(buff2String.bind(null, outputCallback));
    }
    ptyProcess.onExit(({ exitCode, signal }) => {
      debug("onExit", exitCode, signal);

      if (ac !== null) {
        ac.abort();
      }

      if (signal > 0) {
        const err = new Error("signal caught");
        err.signal = signal;
        return reject(err);
      }
      if (exitCode === 0) {
        return resolve(exitCode);
      }
      const err = new Error("exit with non-zero");
      err.rt = exitCode;
      if (retryableExitCodes.includes(exitCode)) {
        err.retryable = true;
      }
      return reject(err);
    });
  });
}
module.exports = {
  fork,
  createMasterPty,
  sshLoginCallback
};
