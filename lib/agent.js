import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import Debug from "debug";
import { spawn } from "node-pty-prebuilt-multiarch";
import { rePhPrompt } from "./util.js";

const debug = Debug("sshClientWrapper:debug:agent");
const debugVerbose = Debug("sshClientWrapper:verbose:agent");

const DEFAULT_TTL = 3600;
const ADDKEY_TIMEOUT_SEC = 60;
const CHILD_TIMEOUT_MS = 15000;
const LOCK_TIMEOUT_MS = 15000;
const LOCK_STALE_MS = 60000;
const MAX_BAD_PASSPHRASE = 3;
const MAX_SOCKET_PATH = 103;

//sentinel candidate meaning "run ssh-add with the inherited environment and let
//OpenSSH use its default agent (e.g. the Windows OpenSSH Authentication Agent pipe)"
const AGENT_DEFAULT = "__scw_default_agent__";

//injection seam for tests
const _internal = {
  spawn,
  execFileP: promisify(execFile)
};

let sharedSock = null;
let sharedInFlight = null;

/**
 * promisified sleep
 * @param {number} ms - milliseconds to wait
 * @returns {Promise<void>} - resolves after ms
 */
function sleep(ms) {
  return setTimeoutPromise(ms);
}

/**
 * check if path points to a regular file
 * @param {string} p - path to check
 * @returns {boolean} - true if p is an existing regular file
 */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * check if path points to an existing directory
 * @param {string} p - path to check
 * @returns {boolean} - true if p is an existing directory
 */
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * build an env object pointing ssh-add/ssh-agent at a specific socket
 * @param {string} sock - agent socket path, or AGENT_DEFAULT to inherit unchanged
 * @returns {object} - environment object for the child process
 */
function sockEnv(sock) {
  if (sock === AGENT_DEFAULT) {
    return { ...process.env };
  }
  return { ...process.env, SSH_AUTH_SOCK: sock };
}

/**
 * whether this platform can spawn and manage a shared ssh-agent
 * @returns {boolean} - true on POSIX platforms with a uid
 */
function canSpawnSharedAgent() {
  return process.platform !== "win32" && typeof process.getuid === "function";
}

/**
 * decide whether key-based auth for this host should go through an ssh-agent
 * @param {object} hostInfo - hostinfo object
 * @returns {boolean} - true to use the agent path, false for the legacy pty path
 */
function shouldUseAgent(hostInfo) {
  if (hostInfo.useAgent === false) {
    return false;
  }
  if (typeof hostInfo.identityAgent === "string" && hostInfo.identityAgent !== "") {
    return true;
  }
  if (hostInfo.useAgent === true) {
    return true;
  }
  return typeof hostInfo.keyFile === "string" && isFile(hostInfo.keyFile);
}

/**
 * resolve a mode-0700, uid-owned directory to hold the shared agent socket
 * @returns {string} - directory path
 */
function resolveWellKnownDir() {
  const uid = process.getuid();
  const candidates = [];

  if (process.env.SSH_CLIENT_WRAPPER_AGENT_DIR) {
    candidates.push(process.env.SSH_CLIENT_WRAPPER_AGENT_DIR);
  }
  if (process.env.XDG_RUNTIME_DIR) {
    candidates.push(path.join(process.env.XDG_RUNTIME_DIR, "ssh-client-wrapper"));
  }
  if (dirExists(`/run/user/${uid}`)) {
    candidates.push(`/run/user/${uid}/ssh-client-wrapper`);
  }
  candidates.push(path.join(os.tmpdir(), `scw-${uid}`), `/tmp/scw-${uid}`);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.chmodSync(dir, 0o700);
      const st = fs.statSync(dir);
      const shortEnough = path.join(dir, "agent.sock").length <= MAX_SOCKET_PATH;
      if (st.uid === uid && (st.mode & 0o077) === 0 && shortEnough) {
        return dir;
      }
    } catch (e) {
      debugVerbose(`candidate agent dir ${dir} rejected: ${e.message}`);
    }
  }
  const err = new Error("no usable directory for the shared ssh-agent socket");
  err.code = "NO_AGENT_DIR";
  throw err;
}

/**
 * check that a pre-existing socket file is owned by us and not group/world accessible
 * @param {string} sockPath - socket path to check
 * @returns {boolean} - true if the socket is safe to reuse
 */
function socketIsTrusted(sockPath) {
  try {
    const st = fs.statSync(sockPath);
    return st.uid === process.getuid() && (st.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

/**
 * take a cross-process advisory lock on the agent directory
 * @param {string} dir - directory to lock
 * @returns {Promise<void>} - resolves once the lock is held
 */
async function acquireLock(dir) {
  const lock = path.join(dir, "agent.lock");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    try {
      fs.mkdirSync(lock);
      return;
    } catch (e) {
      if (e.code !== "EEXIST") {
        throw e;
      }
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) {
          fs.rmdirSync(lock);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        const err = new Error("timeout acquiring ssh-agent lock");
        err.code = "LOCK_TIMEOUT";
        throw err;
      }
      await sleep(100);
    }
  }
}

/**
 * release the advisory lock on the agent directory
 * @param {string} dir - directory to unlock
 * @returns {void}
 */
function releaseLock(dir) {
  try {
    fs.rmdirSync(path.join(dir, "agent.lock"));
  } catch {
    //nothing to release
  }
}

/**
 * probe an agent socket with `ssh-add -l`
 * @param {string} sock - agent socket path (or AGENT_DEFAULT)
 * @returns {Promise<number>} - 0 has identities, 1 reachable but empty, 2 unreachable
 */
async function probeAgent(sock) {
  try {
    await _internal.execFileP("ssh-add", ["-l"], { env: sockEnv(sock), timeout: CHILD_TIMEOUT_MS });
    return 0;
  } catch (e) {
    return e?.code === 1 ? 1 : 2;
  }
}

/**
 * resolve a passphrase value from a hostInfo passphrase callback/string
 * @param {string | Function | undefined} ph - passphrase or callback
 * @returns {Promise<string | null>} - the passphrase, or null when unavailable
 */
async function resolvePassphrase(ph) {
  if (typeof ph === "string") {
    return ph;
  }
  if (typeof ph === "function") {
    const v = await ph();
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * add a key to an agent via `ssh-add`, answering the passphrase prompt from a pty
 * @param {string} sock - agent socket path (or AGENT_DEFAULT)
 * @param {string} keyFile - private key path
 * @param {string | Function | undefined} phCallback - passphrase or callback
 * @param {number} ttl - ssh-add -t lifetime in seconds
 * @returns {Promise<void>} - resolves on success, rejects with err.code on failure
 */
function addKey(sock, keyFile, phCallback, ttl) {
  return new Promise((resolve, reject)=>{
    const pty = _internal.spawn("ssh-add", ["-t", String(ttl), keyFile], {
      windowsHide: true,
      env: sockEnv(sock)
    });
    let settled = false;
    let badTries = 0;
    let timer = null;

    const finish = (fn, arg)=>{
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      try {
        pty.kill();
      } catch {
        //already gone
      }
      fn(arg);
    };
    const fail = (code, message)=>{
      const err = new Error(message);
      err.code = code;
      finish(reject, err);
    };

    timer = setTimeout(()=>{
      fail("ADDKEY_TIMEOUT", `ssh-add did not finish within ${ADDKEY_TIMEOUT_SEC} sec`);
    }, ADDKEY_TIMEOUT_SEC * 1000);

    pty.onData((data)=>{
      const output = data.toString();
      debugVerbose(output);

      if (/Could not open a connection to your authentication agent|Error connecting to agent/.test(output)) {
        fail("NO_AGENT", "no ssh-agent is reachable");
        return;
      }
      if (rePhPrompt.test(output)) {
        resolvePassphrase(phCallback)
          .then((v)=>{
            if (v === null) {
              fail("NO_PASSPHRASE", "key is encrypted but no passphrase is available");
              return;
            }
            pty.write(`${v}\n`);
          })
          .catch((e)=>{
            finish(reject, e);
          });
        return;
      }
      if (/Bad passphrase|incorrect passphrase/i.test(output)) {
        badTries += 1;
        if (badTries >= MAX_BAD_PASSPHRASE || typeof phCallback !== "function") {
          fail("BAD_PASSPHRASE", "bad passphrase for private key");
        }
        return;
      }
      if (/Identity added/.test(output)) {
        finish(resolve);
      }
    });

    pty.onExit(({ exitCode })=>{
      if (settled) {
        return;
      }
      if (exitCode === 0) {
        finish(resolve);
        return;
      }
      fail("ADDKEY_FAILED", `ssh-add exited with ${exitCode}`);
    });
  });
}

/**
 * remove a key from an agent (best effort)
 * @param {string} sock - agent socket path (or AGENT_DEFAULT)
 * @param {string} keyFile - private key path
 * @returns {Promise<void>} - always resolves
 */
async function removeKey(sock, keyFile) {
  try {
    await _internal.execFileP("ssh-add", ["-d", keyFile], { env: sockEnv(sock), timeout: CHILD_TIMEOUT_MS });
  } catch {
    //best effort only
  }
}

/**
 * spawn (or find) the per-user shared ssh-agent and return its socket path
 * @returns {Promise<string>} - socket path of a live shared agent
 */
async function spawnSharedAgent() {
  const dir = resolveWellKnownDir();
  const sock = path.join(dir, "agent.sock");

  await acquireLock(dir);

  try {
    if (fs.existsSync(sock)) {
      if (!socketIsTrusted(sock)) {
        const err = new Error(`refusing to use untrusted agent socket ${sock}`);
        err.code = "UNTRUSTED_SOCKET";
        throw err;
      }
      if (await probeAgent(sock) !== 2) {
        return sock;
      }
      try {
        fs.unlinkSync(sock);
      } catch {
        //someone else may have cleaned it up
      }
    }
    debug(`spawning shared ssh-agent at ${sock}`);
    await _internal.execFileP("ssh-agent", ["-a", sock], { timeout: CHILD_TIMEOUT_MS });
    return sock;
  } finally {
    releaseLock(dir);
  }
}

/**
 * get the shared agent socket, deduplicating concurrent callers in this process
 * @returns {Promise<string>} - socket path of a live shared agent
 */
async function getSharedAgent() {
  if (sharedSock && socketIsTrusted(sharedSock) && await probeAgent(sharedSock) !== 2) {
    return sharedSock;
  }
  if (!sharedInFlight) {
    sharedInFlight = spawnSharedAgent()
      .then((s)=>{
        sharedSock = s;
        return s;
      })
      .finally(()=>{
        sharedInFlight = null;
      });
  }
  return sharedInFlight;
}

/**
 * mark hostInfo as agent-ready
 * @param {object} hostInfo - hostinfo object
 * @param {string} sock - resolved agent socket (or AGENT_DEFAULT)
 * @returns {void}
 */
function setReady(hostInfo, sock) {
  hostInfo.managedAgentSock = sock === AGENT_DEFAULT ? undefined : sock;
  hostInfo._agentEnsuredAt = Date.now();
}

/**
 * ensure the private key is loaded into some reachable agent (two-step algorithm)
 * @param {object} hostInfo - hostinfo object
 * @param {string | null} candidate - preferred socket, AGENT_DEFAULT, or null
 * @param {number} ttl - ssh-add -t lifetime in seconds
 * @returns {Promise<void>} - resolves once loaded (or rejects to trigger legacy fallback)
 */
async function ensureKeyLoaded(hostInfo, candidate, ttl) {
  if (candidate !== null) {
    try {
      await addKey(candidate, hostInfo.keyFile, hostInfo.passphrase, ttl);
      setReady(hostInfo, candidate);
      return;
    } catch (e) {
      if (e.code !== "NO_AGENT") {
        throw e;
      }
      debug("no agent at the candidate socket; will spawn a shared one");
    }
  }
  if (!canSpawnSharedAgent()) {
    const err = new Error("no reachable ssh-agent and this platform cannot spawn one");
    err.code = "NO_AGENT";
    throw err;
  }
  const sock = await getSharedAgent();
  await addKey(sock, hostInfo.keyFile, hostInfo.passphrase, ttl);
  setReady(hostInfo, sock);
}

/**
 * for a keyFile-less host, use an already-populated agent if one is reachable
 * @param {object} hostInfo - hostinfo object
 * @param {string | null} candidate - preferred socket, AGENT_DEFAULT, or null
 * @returns {Promise<void>} - resolves; leaves hostInfo on the legacy path if unusable
 */
async function ensurePreloadedAgent(hostInfo, candidate) {
  if (candidate === null || candidate === AGENT_DEFAULT) {
    return;
  }
  if (await probeAgent(candidate) === 0) {
    setReady(hostInfo, candidate);
  }
}

/**
 * effective ssh-add -t lifetime for a host
 * @param {object} hostInfo - hostinfo object
 * @returns {number} - lifetime in seconds
 */
function effectiveTtl(hostInfo) {
  return Number.isFinite(hostInfo.agentKeyTTL) && hostInfo.agentKeyTTL > 0
    ? Math.floor(hostInfo.agentKeyTTL)
    : DEFAULT_TTL;
}

/**
 * pick the agent socket to try for a host
 * @param {object} hostInfo - hostinfo object
 * @returns {string | null | undefined} - socket path, AGENT_DEFAULT, null to spawn a shared agent, or undefined to give up
 */
function resolveAgentCandidate(hostInfo) {
  if (typeof hostInfo.identityAgent === "string" && hostInfo.identityAgent !== "") {
    return hostInfo.identityAgent;
  }
  if (typeof process.env.SSH_AUTH_SOCK === "string" && process.env.SSH_AUTH_SOCK !== "") {
    return process.env.SSH_AUTH_SOCK;
  }
  if (canSpawnSharedAgent()) {
    return null;
  }
  return process.platform === "win32" ? AGENT_DEFAULT : undefined;
}

/**
 * make sure this host can authenticate through an ssh-agent, if it should
 * @param {object} hostInfo - hostinfo object (mutated: managedAgentSock, _agentEnsuredAt)
 * @returns {Promise<void>} - resolves; on any recoverable problem hostInfo is left on the legacy path
 */
async function ensureAgentForHost(hostInfo) {
  if (!shouldUseAgent(hostInfo)) {
    return;
  }
  const ttl = effectiveTtl(hostInfo);

  if (typeof hostInfo._agentEnsuredAt === "number" && Date.now() - hostInfo._agentEnsuredAt < ttl * 500) {
    return;
  }
  const candidate = resolveAgentCandidate(hostInfo);

  if (candidate === undefined) {
    return;
  }
  const hasKey = typeof hostInfo.keyFile === "string" && isFile(hostInfo.keyFile);

  try {
    await (hasKey ? ensureKeyLoaded(hostInfo, candidate, ttl) : ensurePreloadedAgent(hostInfo, candidate));
  } catch (e) {
    if (e.code === "BAD_PASSPHRASE") {
      throw e;
    }
    debug(`agent setup did not complete (${e.code || e.message}); using legacy pty auth`);
    delete hostInfo.managedAgentSock;
    delete hostInfo._agentEnsuredAt;
  }
}

export {
  shouldUseAgent,
  canSpawnSharedAgent,
  ensureAgentForHost,
  removeKey,
  probeAgent,
  addKey,
  resolveWellKnownDir,
  socketIsTrusted,
  _internal
};
