"use strict";
const debug = require("debug")("sshClientWrapper:fork");
const debugVerbose = require("debug")("sshClientWrapper:fork_verbose");
const debugSendPty = require("debug")("sshClientWrapper:fork_sendpty");
const { spawn } = require("node-pty");

const { rePwPrompt, rePhPrompt, reNewHostPrompt, buff2String } = require("./util.js");

const nodePtyOpt = {
  shell: process.platform === "win32" ? process.env.ComSpec : process.env.SHELL,
  windowsHide: true
};

function sshLoginCallback(output, ptyProcess, pw, ph) {
  if (reNewHostPrompt.test(output)) {
    debugSendPty("yes");
    ptyProcess.write("yes\n");
    return;
  }
  if (rePwPrompt.test(output)) {
    if (typeof pw === "string") {
      debug("use given password");
      debugSendPty(pw);
      ptyProcess.write(`${pw}\n`);
      return;
    }
    if (typeof pw === "function") {
      debug("call password callback function");
      pw()
        .then((v)=>{
          ptyProcess.write(`${v}\n`);
        });
      return;
    }
  }
  if (rePhPrompt.test(output)) {
    if (typeof ph === "string") {
      debug("use given passphrase");
      debugSendPty(ph);
      ptyProcess.write(`${ph}\n`);
      return;
    }
    if (typeof ph === "function") {
      debug("call passphrase callback function");
      ph()
        .then((v)=>{
          ptyProcess.write(`${v}\n`);
        });
    }
  }
}

function getMasterPty(hostInfo) {
  debug("fork pty for master connection");
  const ptyProcess = spawn(nodePtyOpt.shell, [], nodePtyOpt);
  ptyProcess.onData(buff2String.bind(null, debugVerbose));
  ptyProcess.onData((data)=>{
    const output = data.toString();
    sshLoginCallback(output, ptyProcess, hostInfo.password, hostInfo.passphrase);
  });
  return ptyProcess;
}

async function fork(hostInfo, cmd, args, outputCallback) {
  let ptyProcess = null;
  const p = new Promise((resolve, reject)=>{
    debug(`cmd=${cmd}: args=${args}`);
    ptyProcess = spawn(cmd, args, nodePtyOpt);
    ptyProcess.onData(buff2String.bind(null, debugVerbose));
    ptyProcess.onData((data)=>{
      const output = data.toString();
      sshLoginCallback(output, ptyProcess, hostInfo.password, hostInfo.passphrase);

      if (/kex_exchange_identification: Connection closed by remote host/.test(output)) {
        ptyProcess.kill();
        const err = new Error("kex_exchange_identification");
        err.retryable = true;
        reject(err);
      }
    });

    if (typeof outputCallback === "function") {
      ptyProcess.onData(buff2String.bind(null, outputCallback));
    }
    ptyProcess.onExit(({ exitCode, signal })=>{
      debug("onExit", exitCode, signal);

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
      return reject(err);
    });
  });
  p.pty = ptyProcess;
  return p;
}
module.exports = {
  fork,
  getMasterPty
};
