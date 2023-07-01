"use strict";

process.on("unhandledRejection", console.dir); //eslint-disable-line no-console
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
let hostInfo = require("./util/hostInfo.js");
const { nonExisting } = require("./util/testFiles.js");


describe("test for ssh execution", function() {
  this.timeout(10000);//eslint-disable-line no-invalid-this
  beforeEach(()=>{
    sshout.reset();
  });
  after(async ()=>{
    await disconnect(hostInfo);
  });
  describe("#exec", ()=>{
    const testText = "hoge";
    it("should execute single command with stdout", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText}`, sshout);
      expect(rt).to.equal(0);
      expect(sshout).to.be.called;

      expect(sshout).to.be.calledWithMatch(/^hoge/);
    });
    it("should execute single command with stderr", async ()=>{
      const rt = await sshExec(hostInfo, `echo ${testText} >&2`, sshout);
      expect(rt).to.equal(0);
      expect(sshout).to.be.called;
      expect(sshout).to.be.calledWithMatch(/^hoge/);
    });
    //please note that exec() resolves with non-zero value
    //(126 permisssion deny or 127 file not found)
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
  });
  describe("#canConnect", ()=>{
    let hostInfoBak;
    beforeEach(async ()=>{
      await disconnect(hostInfo);
      hostInfo.masterPty = null;
      hostInfoBak = { ...hostInfo };
    });
    afterEach(()=>{
      const masterPty = hostInfo.masterPty;
      hostInfo = { ...hostInfoBak };
      hostInfo.masterPty = masterPty;
    });
    it("should be resolved with true", async ()=>{
      expect(await canConnect(hostInfo, 2)).to.be.true;
    });
    it("should be rejected if user does not exist", async ()=>{
      hostInfo.user = "xxxx";
      return expect(canConnect(hostInfo, 2)).to.be.rejected;
    });
    it("should be rejected if password is wrong", async ()=>{
      hostInfo.password = "xxxx";
      return expect(canConnect(hostInfo, 2)).to.be.rejected;
    });
    it("should be rejected if host does not exist", async ()=>{
      hostInfo.host = "foo.bar.example.com";
      return expect(canConnect(hostInfo, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if host(ip address) does not exist", async ()=>{
      hostInfo.host = "192.0.2.1";
      hostInfo.ConnectTimeout = 8; //please note test will be timed out in 10 seconds
      return expect(canConnect(hostInfo, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if port number is out of range(-1)", async ()=>{
      hostInfo.port = -1;
      return expect(canConnect(hostInfo, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if port number is out of range(65536)", async ()=>{
      hostInfo.port = 65536;
      return expect(canConnect(hostInfo, 2)).to.be.rejectedWith(255);
    });
  });
});
