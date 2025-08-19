"use strict";
const path = require("path");

process.on("unhandledRejection", console.dir);  
Error.traceLimit = 100000;

//setup test framework
const chai = require("chai");
const { expect } = require("chai");
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));

const sshout = sinon.stub();

//testee
const { sshExec, canConnect, disconnect } = require("../lib/sshExec.js");

//test helpers
const hostInfo = require("./testUtil/hostInfo.js");
const { clearRemoteTestFiles, clearLocalTestFiles, nonExisting } = require("./testUtil/testFiles.js");
const { send } = require("../lib/rsyncExec.js");

describe("test for ssh execution", function () {
  const rcfilePath = "/home/testuser/testrc";
  this.timeout(65000); 
  beforeEach(async ()=>{
    sshout.reset();
    await clearRemoteTestFiles(hostInfo);
  });
  before(async ()=>{
    await send(hostInfo, [path.resolve(__dirname, "./testUtil/testrc")], rcfilePath, [], 0);
  });
  after(async ()=>{
    if (!process.env.TEST_KEEP_FILES) {
      await clearRemoteTestFiles(hostInfo);
      await clearLocalTestFiles();
      await sshExec(hostInfo, `rm ${rcfilePath}`);
    }
    await disconnect(hostInfo);
  });
  describe("#exec", ()=>{
    const testText = "hoge";
    it("should execute single command with stdout", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText}`, 0, sshout);
      expect(rt).to.equal(0);
      expect(sshout).to.be.called;

      expect(sshout).to.be.calledWithMatch(/^hoge/);
    });
    it("should execute single command with stderr", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText} >&2`, 0, sshout);
      expect(rt).to.equal(0);
      expect(sshout).to.be.called;
      expect(sshout).to.be.calledWithMatch(/^hoge/);
    });
    it("should execute 2 command by prependCmd ", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText}`, 0, sshout, null, "echo foo");
      expect(rt).to.equal(0);
      expect(sshout).to.be.calledOnce;
      expect(sshout).to.be.calledWithMatch(/^foo\nhoge\n/);
    });
    it("should execute 2 command by hostInfo.prependCmd ", async ()=>{
      hostInfo.prependCmd = "echo foo";
      const rt = await sshExec(hostInfo, `echo ${testText}`, 0, sshout, null);
      expect(rt).to.equal(0);
      expect(sshout).to.be.calledOnce;
      expect(sshout).to.be.calledWithMatch(/^foo\nhoge\n/);
      delete hostInfo.prependCmd;
    });
    it("should execute 2 command by rcfile", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText}`, 0, sshout, rcfilePath);
      expect(rt).to.equal(0);
      expect(sshout).to.be.calledOnce;
      expect(sshout).to.be.calledWithMatch(/^this is test rcfile\nhoge\n/);
    });
    it("should execute 2 command by hostInfo.prependCmd ", async ()=>{
      hostInfo.rcfile = rcfilePath;
      const rt = await sshExec(hostInfo, `echo ${testText}`, 0, sshout, null);
      expect(rt).to.equal(0);
      expect(sshout).to.be.calledOnce;
      expect(sshout).to.be.calledWithMatch(/^this is test rcfile\nhoge\n/);
      delete hostInfo.rcfile;
    });
    //please note that exec() resolves with non-zero value
    //(126 permission deny or 127 file not found)
    //but does not reject in following 2 cases
    it("should not execute command which do not have exec permission", async ()=>{
      await sshExec(hostInfo, "echo echo hoge >hoge");
      await sshExec(hostInfo, "chmod ugo-x hoge");
      const rt = await sshExec(hostInfo, "./hoge");
      expect(rt).to.equal(126);
    });
    it("should resolve with 127 if command is not found", async ()=>{
      const rt = await sshExec(hostInfo, `./${nonExisting}`);
      expect(rt).to.equal(127);
    });
    it("should be rejected if timeout expired", async ()=>{
      return expect(sshExec(hostInfo, "sleep 60", 1)).to.be.rejectedWith("watchdog timer expired");
    });
  });
  describe("#canConnect", ()=>{
    let hostInfo2;
    beforeEach(async ()=>{
      await disconnect(hostInfo);
      hostInfo2 = { ...hostInfo };
      hostInfo2.masterPty = null;
    });
    afterEach(async ()=>{
      await disconnect(hostInfo2);
    });
    it("should be resolved with true", async ()=>{
      return expect(await canConnect(hostInfo2, 5)).to.be.true;
    });
    it("should be rejected if user does not exist", async ()=>{
      hostInfo2.user = "xxxx";
      return expect(canConnect(hostInfo2, 2)).to.be.rejected;
    });
    it("should be rejected if password is wrong", async ()=>{
      hostInfo2.password = "xxxx";
      return expect(canConnect(hostInfo2, 2)).to.be.rejected;
    });
    it("should be rejected if host does not exist", async ()=>{
      hostInfo2.host = "foo.bar.example.com";
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if host(ip address) does not exist", async ()=>{
      hostInfo2.host = "192.0.2.1";
      hostInfo2.ConnectTimeout = 8; //please note each test will be timed out in 20 seconds
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if port number is out of range(-1)", async ()=>{
      hostInfo2.port = -1;
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith("invalid port specified -1");
    });
    it("should be rejected if port number is out of range(65536)", async ()=>{
      hostInfo2.port = 65536;
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith("invalid port specified 65536");
    });
  });
});
