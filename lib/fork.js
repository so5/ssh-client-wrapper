"use strict";
const debug = require("debug")("sshClientWrapper:fork");
const debugVerbose = require("debug")("sshClientWrapper:fork_verbose");
const debugSendPty = require("debug")("sshClientWrapper:fork_sendpty");
const { spawn } = require("node-pty");

const { rePwPrompt, rePhPrompt, reNewHostPrompt, buff2String } = require("./util.js");

const defaultOpt = {

  shell: process.platform === "win32" ? process.env.ComSpec : process.env.SHELL,
  windowsHide: true
};
async function fork(hostInfo, cmd, args, argOpt, outputCallback) {
  return new Promise((resolve, reject)=>{
    const opt = argOpt || defaultOpt;

    debug(`cmd=${cmd}: args=${args}`);
    const ptyProcess = spawn(cmd, args, opt);
    ptyProcess.onData(buff2String.bind(null, debugVerbose));

    ptyProcess.onData((data)=>{
      const output = data.toString();

      if (reNewHostPrompt.test(output)) {
        debugSendPty("yes");
        ptyProcess.write("yes\n");
      }
      if (rePwPrompt.test(output)) {
        if (typeof hostInfo.password === "string") {
          debugSendPty(hostInfo.password);
          ptyProcess.write(`${hostInfo.password}\n`);
        } else if (typeof hostInfo.password === "function") {
          hostInfo.password()
            .then((pw)=>{
              ptyProcess.write(`${pw}\n`);
            });
        }
      }
      if (rePhPrompt.test(output)) {
        if (typeof hostInfo.passphrase === "string") {
          debugSendPty(hostInfo.passphrase);
          ptyProcess.write(`${hostInfo.passphrase}\n`);
        } else if (typeof hostInfo.passphrase === "function") {
          hostInfo.passphrase()
            .then((pw)=>{
              ptyProcess.write(`${pw}\n`);
            });
        }
      }
    });

    if (typeof outputCallback === "function") {
      ptyProcess.onData(buff2String.bind(null, outputCallback));
    }
    ptyProcess.onExit(({ exitCode, signal })=>{
      debug("onExit", exitCode, signal);

      if (signal > 0) {
        return reject(signal);
      }
      if ([0, 126, 127].includes(exitCode)) {
        return resolve(exitCode);
      }
      return reject(exitCode);
    });
  });
}
module.exports = fork;
