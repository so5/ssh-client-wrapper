process.on("unhandledRejection", console.dir);

//setup test framework
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

//testee
import { getSshOption } from "../../lib/util.js";

describe("test for getSshOption", ()=>{
  const defaultValues = {
    host: "testHostName",
    ControlPersist: 180,
    useControlMaster: true,
    maxRetry: 3,
    retryDuration: 1000
  };
  it("should return minimum ssh option array", ()=>{
    const sshOpts = getSshOption(defaultValues);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=~/.ssh/scw-%C");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
  it("should change ControlPath by ControlPersistDir", ()=>{
    const hostInfo = { ...defaultValues };
    hostInfo.ControlPersistDir = "/tmp";
    const sshOpts = getSshOption(hostInfo);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=/tmp/scw-%C");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
  it("should fall back to ~/.ssh if ControlPersistDir does not exist", ()=>{
    const hostInfo = { ...defaultValues };
    hostInfo.ControlPersistDir = "/nonexistent/scw-test-dir";
    const sshOpts = getSshOption(hostInfo);
    expect(sshOpts[2]).to.equal("-oControlPath=~/.ssh/scw-%C");
  });
  it("should change ControlPath by Environment variable", ()=>{
    process.env.SSH_CONTROL_PERSIST_DIR = "/tmp";
    const sshOpts = getSshOption(defaultValues);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=/tmp/scw-%C");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
  it("should emit -oIdentityAgent for a wrapper-managed agent socket", ()=>{
    const hostInfo = { ...defaultValues, managedAgentSock: "/run/scw/agent.sock" };
    expect(getSshOption(hostInfo)).to.include("-oIdentityAgent=/run/scw/agent.sock");
  });
  it("should emit -oIdentityAgent for a caller-supplied identityAgent", ()=>{
    const hostInfo = { ...defaultValues, identityAgent: "/run/user/1000/keyring/ssh" };
    expect(getSshOption(hostInfo)).to.include("-oIdentityAgent=/run/user/1000/keyring/ssh");
  });
  it("should prefer managedAgentSock over identityAgent", ()=>{
    const hostInfo = { ...defaultValues, managedAgentSock: "/run/managed.sock", identityAgent: "/run/external.sock" };
    const sshOpts = getSshOption(hostInfo);
    expect(sshOpts).to.include("-oIdentityAgent=/run/managed.sock");
    expect(sshOpts).to.not.include("-oIdentityAgent=/run/external.sock");
  });
  it("should not emit -oIdentityAgent when no agent is in play", ()=>{
    expect(getSshOption(defaultValues).join(" ")).to.not.match(/IdentityAgent/);
  });
  describe("useControlMaster", ()=>{
    //the default depends on the platform, so these tests must not set it
    const withoutSetting = { ...defaultValues };
    delete withoutSetting.useControlMaster;
    const setPlatform = (value)=>{
      const desc = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value });
      return ()=>{
        Object.defineProperty(process, "platform", desc);
      };
    };
    it("should not emit any Control option if it is false", ()=>{
      const sshOpts = getSshOption({ ...withoutSetting, useControlMaster: false });
      expect(sshOpts).to.deep.equal([withoutSetting.host]);
    });
    it("should emit Control options if it is true even on win32", ()=>{
      const restore = setPlatform("win32");
      try {
        const sshOpts = getSshOption({ ...withoutSetting, useControlMaster: true });
        expect(sshOpts).to.include("-oControlMaster=auto");
      } finally {
        restore();
      }
    });
    it("should be off by default on win32", ()=>{
      const restore = setPlatform("win32");
      try {
        expect(getSshOption(withoutSetting).join(" ")).to.not.match(/Control/);
      } finally {
        restore();
      }
    });
    it("should be on by default on linux and darwin", ()=>{
      for (const platform of ["linux", "darwin"]) {
        const restore = setPlatform(platform);
        try {
          expect(getSshOption(withoutSetting)).to.include("-oControlMaster=auto");
        } finally {
          restore();
        }
      }
    });
  });
  describe("-oNumberOfPasswordPrompts", ()=>{
    it("should ask only once if password is a string", ()=>{
      const hostInfo = { ...defaultValues, password: "secret" };
      expect(getSshOption(hostInfo)).to.include("-oNumberOfPasswordPrompts=1");
    });
    it("should ask only once if passphrase is a string", ()=>{
      const hostInfo = { ...defaultValues, passphrase: "secret" };
      expect(getSshOption(hostInfo)).to.include("-oNumberOfPasswordPrompts=1");
    });
    it("should ask only once if both are strings", ()=>{
      const hostInfo = { ...defaultValues, password: "secret", passphrase: "secret2" };
      expect(getSshOption(hostInfo)).to.include("-oNumberOfPasswordPrompts=1");
    });
    it("should keep the default if password is a function, because it can answer differently each time", ()=>{
      const hostInfo = { ...defaultValues, password: async ()=>{ return "secret"; } };
      expect(getSshOption(hostInfo).join(" ")).to.not.match(/NumberOfPasswordPrompts/);
    });
    it("should keep the default if passphrase is a function", ()=>{
      const hostInfo = { ...defaultValues, password: "secret", passphrase: async ()=>{ return "secret2"; } };
      expect(getSshOption(hostInfo).join(" ")).to.not.match(/NumberOfPasswordPrompts/);
    });
    it("should not emit it if there is no secret", ()=>{
      expect(getSshOption(defaultValues).join(" ")).to.not.match(/NumberOfPasswordPrompts/);
    });
  });
});
