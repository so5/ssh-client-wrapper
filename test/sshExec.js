"use strict";
const path = require("path");

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
const { sshExec, canConnect, disconnect, ls } = require("../lib/sshExec.js");

//test helpers
const hostInfo = require("./util/hostInfo.js");
const { clearRemoteTestFiles, clearLocalTestFiles, createRemoteFiles, nonExisting, remoteRoot, remoteEmptyDir } = require("./util/testFiles.js");

describe("test for ssh execution", function() {
  this.timeout(20000);//eslint-disable-line no-invalid-this
  beforeEach(async ()=>{
    sshout.reset();
    await clearRemoteTestFiles(hostInfo);
  });
  after(async ()=>{
    if (!process.env.TEST_KEEP_FILES) {
      await clearRemoteTestFiles(hostInfo);
      await clearLocalTestFiles();
    }
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
      expect(await canConnect(hostInfo2, 2)).to.be.true;
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
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith(255);
    });
    it("should be rejected if port number is out of range(65536)", async ()=>{
      hostInfo2.port = 65536;
      return expect(canConnect(hostInfo2, 2)).to.be.rejectedWith(255);
    });
  });
  describe("#ls", ()=>{
    beforeEach(async ()=>{
      await createRemoteFiles(hostInfo);
    });
    it("should return array of file and directory names in the specified directory", async ()=>{
      expect(await ls(hostInfo, remoteRoot)).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);
    });
    it("should return array which has only specified file", async ()=>{
      expect(await ls(hostInfo, path.posix.join(remoteRoot, "foo"))).to.eql([path.posix.join(remoteRoot, "foo")]);
    });
    it("should return 'No such file or directory' if non-existing path is specified", async ()=>{
      expect(await ls(hostInfo, path.posix.join(remoteRoot, nonExisting))).to.match(/No such file or directory/);
    });
    it("should return only matched filenames, if glob is specified", async ()=>{
      expect(await ls(hostInfo, path.posix.join(remoteRoot, "b*"))).to.have.members(["bar", "baz"].map((e)=>{
        return path.posix.join(remoteRoot, e);
      }));
    });
    it("should return only matched filenames src contains multipl glob pattern", async ()=>{
      expect(await ls(hostInfo, path.posix.join(remoteRoot, "h*", "p[iu]yo"))).to.have.members(["piyo", "puyo"].map((e)=>{
        return path.posix.join(remoteRoot, "hoge", e);
      }));
    });
    it("should return only matched filenames, if specified glob contains /", async ()=>{
      expect(await ls(hostInfo, path.posix.join(remoteRoot, "hoge/*yo"))).to.have.members(["piyo", "puyo", "poyo"].map((e)=>{
        return path.posix.join(remoteRoot, "hoge", e);
      }));
    });
    it("should return empty array if specified target is empty directory", async ()=>{
      expect(await ls(hostInfo, remoteEmptyDir)).to.be.an("array").that.is.empty;
    });
  });
});
