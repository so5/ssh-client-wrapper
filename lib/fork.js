import Debug from "debug";
import { spawn } from "node-pty";

import { rePwPrompt, rePhPrompt, reNewHostPrompt, reRemoteHostIdentificationHasChanged, buff2String, sendPty, watchDogTimer } from "./util.js";

const debug = Debug("sshClientWrapper:debug:fork");
const debugVerbose = Debug("sshClientWrapper:verbose:fork");
const debugSendPty = Debug("sshClientWrapper:insecure:fork");

const nodePtyOpt = {
  shell: process.platform === "win32" ? process.env.ComSpec : process.env.SHELL,
  windowsHide: true
};

export function sshLoginCallback(output, ptyProcess, pw, ph, logger = debugSendPty) {
  return new Promise((resolve, reject)=>{
    if (reRemoteHostIdentificationHasChanged.test(output)) {
      debug("REMOTE HOST IDENTIFICATION HAS CHANGED");
      const rt = /known_hosts:(\d+)/.exec(output);
      const rt2 = /Host key for (.+) has changed and you have requested strict checking./.exec(output);
      const err = new Error("REMOTE HOST IDENTIFICATION HAS CHANGED");
      err.code = "HostKeyError";
      err.output = output;
      err.lineNumber = rt[1] || null;
      err.host = rt2[1] || null;
      reject(err);
    }
    if (reNewHostPrompt.test(output)) {
      debug("get warning about new host and send yes automatically");
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
          .then((v)=>{
            sendPty(ptyProcess, `${v}\n`, logger, 30);
          })
          .catch((e)=>{
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
          .then((v)=>{
            sendPty(ptyProcess, `${v}\n`, logger, 45);
          })
          .catch((e)=>{
            reject(e);
          });
      }
    }
  });
}

/**
 * create pty for master ssh session and store to hostInfo.masterPty
 */
export function createMasterPty(hostInfo) {
  debug("fork pty for master connection");

  if (hostInfo.masterPty) {
    debug(`kill existing master pty for ${hostInfo.host}`);
    hostInfo.masterPty.kill();
  }
  const ptyProcess = spawn(nodePtyOpt.shell, [], nodePtyOpt);
  hostInfo.masterPty = ptyProcess;
}

export async function fork(hostInfo, cmd, args, timeout, outputCallback, retryableExitCodes = [], expects = []) {
  return new Promise((resolve, reject)=>{
    debug(`cmd=${cmd}: args=${args}`);
    const ptyProcess = spawn(cmd, args, nodePtyOpt);
    let ac = null;
    if (timeout > 0) {
      ac = watchDogTimer(timeout, cmd, ()=>{
        ptyProcess.kill();
        const err = new Error(`watchdog timer expired ${timeout}`);
        err.code = "TIMEEXPIRE";
        reject(err);
      });
    }
    ptyProcess.onData(buff2String.bind(null, debugVerbose));

    if (hostInfo !== null) {
      ptyProcess.onData((data)=>{
        const output = data.toString();
        sshLoginCallback(output, ptyProcess, hostInfo.password, hostInfo.passphrase)
          .catch(reject);

        if (/kex_exchange_identification: Connection closed by remote host/.test(output)) {
          ptyProcess.kill();
          const err = new Error("kex_exchange_identification");
          err.retryable = true;
          reject(err);
        }

        if (Array.isArray(expects) && expects.length > 0) {
          const { reExpect, send, numKeep } = expects.shift();
          if (reExpect.test(output)) {
            sendPty(ptyProcess, `${send}\n`, debugSendPty, "userDefinedHandler").catch(reject);
            if (numKeep > 0) {
              expects.unshift({ reExpect, send, numKeep: numKeep - 1 });
            }
          } else {
            expects.unshift({ reExpect, send, numKeep });
          }
        }
      });
    }

    if (typeof outputCallback === "function") {
      ptyProcess.onData(buff2String.bind(null, outputCallback));
    }
    ptyProcess.onExit(({ exitCode, signal })=>{
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
