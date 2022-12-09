"use strict";
const { EOL } = require("os");

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
 * return ssh option with some hard corded options
 * @param { Object} hostInfo - host information object defined in index.js
 * @param {boolean} withoutDestination - return except for hostname
 */
const getSshOption = (hostInfo, withoutDestination)=>{
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
  }
  if (typeof hostInfo.port === "string" || typeof hostInfo.port === "number") {
    args.push("-p");
    args.push(hostInfo.port);
  }
  if (typeof hostInfo.keyFile === "string") {
    args.push("-i");
    args.push(hostInfo.keyFile);
  }

  if (hostInfo.noStrictHostkeyChecking) {
    args.push("-oStrictHostKeyChecking=no");
  }
  const renewInterval = Number.isInteger(hostInfo.renewInterval) && hostInfo.renewInterval > 0 ? hostInfo.renewInterval : 180;
  args.push("-oControlMaster=auto");
  args.push("-oControlPath=~/.ssh/wheel-%r@%h:%p");
  args.push(`-oControlPersist=${renewInterval}`);
  return args;
};

/**
 * sleep given time
 * @param {number} time - duration in msec
 */
async function sleep(time) {
  return new Promise((resolve)=>{
    setTimeout(()=>{
      resolve();
    }, time);
  });
}


const isArrayOfString = (target)=>{
  if (!Array.isArray(target)) {
    return false;
  }
  return target.some((e)=>{
    return typeof e !== "string";
  });
};


module.exports = {
  sshCmd,
  rsyncCmd,
  rePwPrompt,
  rePhPrompt,
  reNewHostPrompt,
  buff2String,
  getSshOption,
  isArrayOfString
};
