import fs from "fs";
import os from "os";
import path from "path";

process.on("unhandledRejection", console.dir);

//setup test framework
import * as chai from "chai";
import { expect } from "chai";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import chaiAsPromised from "chai-as-promised";
chai.use(sinonChai);
chai.use(chaiAsPromised);

//testee
import {
  shouldUseAgent,
  canSpawnSharedAgent,
  probeAgent,
  addKey,
  socketIsTrusted,
  resolveWellKnownDir,
  ensureAgentForHost,
  _internal
} from "../lib/agent.js";

const origSpawn = _internal.spawn;
const origExecFileP = _internal.execFileP;

/**
 * build a controllable fake pty
 * @returns {object} - fake pty with emitData/emitExit drivers
 */
function makeFakePty() {
  const dataCbs = [];
  const exitCbs = [];
  return {
    onData: (cb)=>{
      dataCbs.push(cb);
    },
    onExit: (cb)=>{
      exitCbs.push(cb);
    },
    write: sinon.spy(),
    kill: sinon.spy(),
    emitData: (s)=>{
      for (const cb of dataCbs) {
        cb(Buffer.from(s));
      }
    },
    emitExit: (exitCode)=>{
      for (const cb of exitCbs) {
        cb({ exitCode });
      }
    }
  };
}

describe("test for agent", ()=>{
  let tmpDir;
  beforeEach(()=>{
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scw-agent-test-"));
  });
  afterEach(()=>{
    _internal.spawn = origSpawn;
    _internal.execFileP = origExecFileP;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("#shouldUseAgent", ()=>{
    it("should be false when useAgent is explicitly false", ()=>{
      expect(shouldUseAgent({ host: "h", useAgent: false, identityAgent: "/s" })).to.be.false;
    });
    it("should be true when identityAgent is set", ()=>{
      expect(shouldUseAgent({ host: "h", identityAgent: "/s" })).to.be.true;
    });
    it("should be true when useAgent is explicitly true even without a keyFile", ()=>{
      expect(shouldUseAgent({ host: "h", useAgent: true })).to.be.true;
    });
    it("should be false with only a non-existent keyFile", ()=>{
      expect(shouldUseAgent({ host: "h", keyFile: path.join(tmpDir, "nope") })).to.be.false;
    });
    it("should be true with an existing keyFile", ()=>{
      const kf = path.join(tmpDir, "id");
      fs.writeFileSync(kf, "x");
      expect(shouldUseAgent({ host: "h", keyFile: kf })).to.be.true;
    });
  });

  describe("#canSpawnSharedAgent", ()=>{
    it("should be true on this POSIX test platform", ()=>{
      expect(canSpawnSharedAgent()).to.equal(process.platform !== "win32");
    });
  });

  describe("#probeAgent", ()=>{
    it("should return 0 when ssh-add -l succeeds", async ()=>{
      _internal.execFileP = sinon.stub().resolves({ stdout: "256 SHA256:x key (ED25519)\n" });
      expect(await probeAgent("/s")).to.equal(0);
    });
    it("should return 1 when the agent is reachable but empty", async ()=>{
      const err = new Error("The agent has no identities.");
      err.code = 1;
      _internal.execFileP = sinon.stub().rejects(err);
      expect(await probeAgent("/s")).to.equal(1);
    });
    it("should return 2 when the agent is unreachable", async ()=>{
      const err = new Error("Could not open a connection to your authentication agent.");
      err.code = 2;
      _internal.execFileP = sinon.stub().rejects(err);
      expect(await probeAgent("/s")).to.equal(2);
    });
  });

  describe("#addKey", ()=>{
    it("should resolve on 'Identity added' and not touch the passphrase callback", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const ph = sinon.stub();
      const p = addKey("/tmp/a.sock", "/k", ph, 111);
      pty.emitData("Identity added: /k (/k)\r\n");
      await p;
      expect(ph).to.not.be.called;
      expect(_internal.spawn).to.be.calledWithMatch("ssh-add", ["-t", "111", "/k"]);
    });
    it("should call the passphrase callback once for an encrypted key", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const ph = sinon.stub().resolves("secret");
      const p = addKey("/tmp/a.sock", "/k", ph, 111);
      pty.emitData("Enter passphrase for key '/k': ");
      await new Promise((resolve)=>{
        return setImmediate(resolve);
      });
      pty.emitData("Identity added: /k\r\n");
      await p;
      expect(ph).to.be.calledOnce;
      expect(pty.write).to.be.calledWith("secret\n");
    });
    it("should reject with BAD_PASSPHRASE after repeated bad passphrases", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const ph = sinon.stub().resolves("wrong");
      const p = addKey("/tmp/a.sock", "/k", ph, 111);
      pty.emitData("Bad passphrase, try again for '/k': ");
      pty.emitData("Bad passphrase, try again for '/k': ");
      pty.emitData("Bad passphrase, try again for '/k': ");
      await expect(p).to.be.rejectedWith(/bad passphrase/i);
      const e = await p.catch((err)=>{
        return err;
      });
      expect(e.code).to.equal("BAD_PASSPHRASE");
    });
    it("should reject with NO_AGENT when ssh-add cannot reach an agent", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const p = addKey("/tmp/a.sock", "/k", undefined, 111);
      pty.emitData("Could not open a connection to your authentication agent.\r\n");
      const e = await p.catch((err)=>{
        return err;
      });
      expect(e.code).to.equal("NO_AGENT");
    });
    it("should reject with NO_PASSPHRASE when the key is encrypted and no secret is available", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const p = addKey("/tmp/a.sock", "/k", undefined, 111);
      pty.emitData("Enter passphrase for key '/k': ");
      const e = await p.catch((err)=>{
        return err;
      });
      expect(e.code).to.equal("NO_PASSPHRASE");
    });
    it("should reject with ADDKEY_FAILED on a non-zero exit with no recognised message", async ()=>{
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const p = addKey("/tmp/a.sock", "/k", undefined, 111);
      pty.emitExit(2);
      const e = await p.catch((err)=>{
        return err;
      });
      expect(e.code).to.equal("ADDKEY_FAILED");
    });
  });

  describe("#socketIsTrusted", ()=>{
    it("should be true for a uid-owned mode-0600 file", ()=>{
      const f = path.join(tmpDir, "s");
      fs.writeFileSync(f, "", { mode: 0o600 });
      fs.chmodSync(f, 0o600);
      expect(socketIsTrusted(f)).to.be.true;
    });
    it("should be false for a world-accessible file", ()=>{
      const f = path.join(tmpDir, "s2");
      fs.writeFileSync(f, "");
      fs.chmodSync(f, 0o666);
      expect(socketIsTrusted(f)).to.be.false;
    });
    it("should be false for a missing path", ()=>{
      expect(socketIsTrusted(path.join(tmpDir, "missing"))).to.be.false;
    });
  });

  describe("#resolveWellKnownDir", ()=>{
    it("should honour SSH_CLIENT_WRAPPER_AGENT_DIR", ()=>{
      const orig = process.env.SSH_CLIENT_WRAPPER_AGENT_DIR;
      process.env.SSH_CLIENT_WRAPPER_AGENT_DIR = path.join(tmpDir, "agentdir");

      try {
        const dir = resolveWellKnownDir();
        expect(dir).to.equal(path.join(tmpDir, "agentdir"));
        expect(fs.statSync(dir).isDirectory()).to.be.true;
      } finally {
        if (orig === undefined) {
          delete process.env.SSH_CLIENT_WRAPPER_AGENT_DIR;
        } else {
          process.env.SSH_CLIENT_WRAPPER_AGENT_DIR = orig;
        }
      }
    });
  });

  describe("#ensureAgentForHost", ()=>{
    it("should do nothing when the host should not use an agent", async ()=>{
      const hostInfo = { host: "h", keyFile: path.join(tmpDir, "nope") };
      await ensureAgentForHost(hostInfo);
      expect(hostInfo).to.not.have.property("managedAgentSock");
      expect(hostInfo).to.not.have.property("_agentEnsuredAt");
    });
    it("should adopt a populated identityAgent for a keyFile-less host", async ()=>{
      _internal.execFileP = sinon.stub().resolves({ stdout: "256 SHA256:x k (ED25519)\n" });
      const hostInfo = { host: "h", identityAgent: "/run/agent.sock" };
      await ensureAgentForHost(hostInfo);
      expect(hostInfo.managedAgentSock).to.equal("/run/agent.sock");
    });
    it("should stay on the legacy path when identityAgent has no identities (keyFile-less)", async ()=>{
      const err = new Error("empty");
      err.code = 1;
      _internal.execFileP = sinon.stub().rejects(err);
      const hostInfo = { host: "h", identityAgent: "/run/agent.sock" };
      await ensureAgentForHost(hostInfo);
      expect(hostInfo).to.not.have.property("managedAgentSock");
    });
    it("should load a keyFile into a reachable identityAgent", async ()=>{
      const kf = path.join(tmpDir, "id");
      fs.writeFileSync(kf, "x");
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const hostInfo = { host: "h", keyFile: kf, identityAgent: "/run/agent.sock", agentKeyTTL: 42 };
      const p = ensureAgentForHost(hostInfo);
      await new Promise((resolve)=>{
        return setImmediate(resolve);
      });
      pty.emitData("Identity added: " + kf + "\r\n");
      await p;
      expect(hostInfo.managedAgentSock).to.equal("/run/agent.sock");
      expect(hostInfo._agentEnsuredAt).to.be.a("number");
      expect(_internal.spawn).to.be.calledWithMatch("ssh-add", ["-t", "42", kf]);
    });
    it("should propagate BAD_PASSPHRASE instead of falling back", async ()=>{
      const kf = path.join(tmpDir, "id2");
      fs.writeFileSync(kf, "x");
      const pty = makeFakePty();
      _internal.spawn = sinon.stub().returns(pty);
      const hostInfo = { host: "h", keyFile: kf, identityAgent: "/run/agent.sock", passphrase: ()=>{
        return Promise.resolve("wrong");
      } };
      const p = ensureAgentForHost(hostInfo);
      await new Promise((resolve)=>{
        return setImmediate(resolve);
      });
      pty.emitData("Bad passphrase, try again");
      pty.emitData("Bad passphrase, try again");
      pty.emitData("Bad passphrase, try again");
      await expect(p).to.be.rejectedWith(/bad passphrase/i);
    });
  });
});
