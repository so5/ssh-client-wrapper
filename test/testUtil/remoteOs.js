import path from "path";

import { sshExec } from "../../lib/sshExec.js";

const cache = new Map();

/**
 * tell which path flavor the shell of the remote host uses
 * - "posix": a POSIX shell (Linux, macOS, and also MSYS2/Cygwin bash on Windows, which shows paths as /c/dir)
 * - "win32": cmd.exe or PowerShell on Windows (paths as C:\dir)
 * @param {object} hostInfo - host information object
 * @returns {Promise<string>} - "posix" or "win32"
 */
export async function detectRemoteOs(hostInfo) {
  const key = `${hostInfo.user}@${hostInfo.host}:${hostInfo.port}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  let out = "";
  const rc = await sshExec(hostInfo, "uname -s", 0, (data)=>{
    out += data;
  });
  let os = "posix";
  if (rc !== 0 || out.trim() === "") {
    //no uname: look for cmd.exe
    let ver = "";
    const rc2 = await sshExec(hostInfo, "ver", 0, (data)=>{
      ver += data;
    });
    if (rc2 === 0 && /windows/i.test(ver)) {
      os = "win32";
    }
  }
  cache.set(key, os);
  return os;
}

/**
 * get the path module which matches the remote host
 * @param {string} os - return value of detectRemoteOs
 * @returns {object} - path.posix or path.win32
 */
export function remotePath(os) {
  return os === "win32" ? path.win32 : path.posix;
}
