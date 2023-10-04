"use strict";
process.on("unhandledRejection", console.dir); //eslint-disable-line no-console
Error.traceLimit = 100000;

//setup test framework
const chai = require("chai");
const { expect } = require("chai");
const sinon = require("sinon");
chai.use(require("sinon-chai"));
chai.use(require("chai-as-promised"));

const rewire = require("rewire");

//testee
const SshClientWrapper = rewire("../lib/index.js");

const sshExec = sinon.stub();
const canConnect = sinon.stub();
const disconnect = sinon.stub();
const ls = sinon.stub();
const send = sinon.stub();
const recv = sinon.stub();

//eslint-disable-next-line no-underscore-dangle
SshClientWrapper.__set__({
  sshExec, canConnect, disconnect, ls, send, recv
});


describe("test for interface", ()=>{
  describe("test for constructor", ()=>{
    it("should throw error when instanciate with non-empty string host", ()=>{
      expect(()=>{
        //eslint-disable-next-line no-new
        new SshClientWrapper({});
      }).to.throw("host must be non-empty string");
      expect(()=>{
        //eslint-disable-next-line no-new
        new SshClientWrapper({ host: 1 });
      }).to.throw("host must be non-empty string");
      expect(()=>{
        //eslint-disable-next-line no-new
        new SshClientWrapper({ host: "" });
      }).to.throw("host must be non-empty string");
    });
    it("should successfully instanciate only with host prop", ()=>{
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("exec");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("ls");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("watch");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("send");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("recv");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("canConnect");
      expect(new SshClientWrapper({ host: "hoge" })).to.have.property("disconnect");
    });
  });
  describe("test for public method", ()=>{
    let ssh;
    const hostInfoOrg = { host: "hoge" };
    const hostInfo = { ...hostInfoOrg, masterPty: null, rsyncVersion: null };
    beforeEach(()=>{
      ssh = new SshClientWrapper(hostInfoOrg);
      sshExec.reset();
      canConnect.reset();
      disconnect.reset();
      ls.reset();
      send.reset();
      recv.reset();
    });
    describe("test for exec", ()=>{
      it("should call sshExec with cmd", ()=>{
        ssh.exec("ls");
        expect(sshExec).to.be.calledWith(hostInfo, "ls", 0, null);
      });
      it("should call sshExec with cmd and timeout", ()=>{
        ssh.exec("ls", 10);
        expect(sshExec).to.be.calledWith(hostInfo, "ls", 10, null);
      });
      it("should call sshExec with cmd, timeout and call back function", ()=>{
        const cb = ()=>{};
        ssh.exec("ls", 10, cb);
        expect(sshExec).to.be.calledWith(hostInfo, "ls", 10, cb);
      });
      it("should reject if cmd is not string (number)", ()=>{
        return expect(ssh.exec(0)).to.be.rejectedWith("cmd must be string");
      });
      it("should reject if cmd is not string (null)", ()=>{
        return expect(ssh.exec(null)).to.be.rejectedWith("cmd must be string");
      });
      it("should reject if cmd is empty string", ()=>{
        return expect(ssh.exec("")).to.be.rejectedWith("cmd must be string");
      });
    });
    describe("test for ls", ()=>{
      it("should call ls without timeout", ()=>{
        ssh.ls("hoge");
        expect(ls).to.be.calledWith(hostInfo, "hoge", [], 0);
      });
      it("should call ls with option", ()=>{
        ssh.ls("hoge", ["-l", "-r", "-t"]);
        expect(ls).to.be.calledWith(hostInfo, "hoge", ["-l", "-r", "-t"], 0);
      });
      it("should call ls with option and timeout", ()=>{
        ssh.ls("hoge", ["-l", "-r", "-t"], 10);
        expect(ls).to.be.calledWith(hostInfo, "hoge", ["-l", "-r", "-t"], 10);
      });
    });
    describe("test for send", ()=>{
      it("should call send with src and dst", ()=>{
        ssh.send(["src"], "dst");
        expect(send).to.be.calledWith(hostInfo, ["src"], "dst", [], 0);
      });
      it("should call send with src, dst, and opt", ()=>{
        ssh.send(["src"], "dst", ["--dry-run", "--delete"]);
        expect(send).to.be.calledWith(hostInfo, ["src"], "dst", ["--dry-run", "--delete"], 0);
      });
      it("should call send with src, dst, opt, and timeout", ()=>{
        ssh.send(["src"], "dst", ["--dry-run", "--delete"], 10);
        expect(send).to.be.calledWith(hostInfo, ["src"], "dst", ["--dry-run", "--delete"], 10);
      });
      it("should be rejected if src is not array of string", ()=>{
        return expect(ssh.send(1)).to.be.rejectedWith("src must be array of string");
      });
      it("should be rejected if src has only empty string element", ()=>{
        return expect(ssh.send(["", ""])).to.be.rejectedWith("src must contain non-empty string");
      });
      it("should be rejected if src has only empty string element", ()=>{
        return expect(ssh.send([""])).to.be.rejectedWith("src must contain non-empty string");
      });
      it("should be called if src includes empty string ", ()=>{
        ssh.send(["src", ""], "dst");
        expect(send).to.be.calledWith(hostInfo, ["src", ""], "dst", [], 0);
      });
      it("should be rejected if dst is not string", ()=>{
        return expect(ssh.send(["src"], 0)).to.be.rejectedWith("dst must be string");
      });
      it("should be rejected if dst is empty string", ()=>{
        return expect(ssh.send(["src"], "")).to.be.rejectedWith("dst must be non-empty string");
      });
      it("should be rejected if opt is not array of string", ()=>{
        return expect(ssh.send(["src"], "dst", [null])).to.be.rejectedWith("opt must be array of string");
      });
    });
    describe("test for recv", ()=>{
      it("should call recv with src and dst", ()=>{
        ssh.recv(["src"], "dst");
        expect(recv).to.be.calledWith(hostInfo, ["src"], "dst", [], 0);
      });
      it("should call recv with src, dst, and opt", ()=>{
        ssh.recv(["src"], "dst", ["--dry-run", "--delete"]);
        expect(recv).to.be.calledWith(hostInfo, ["src"], "dst", ["--dry-run", "--delete"], 0);
      });
      it("should call recv with src, dst, opt, and timeout", ()=>{
        ssh.recv(["src"], "dst", ["--dry-run", "--delete"], 10);
        expect(recv).to.be.calledWith(hostInfo, ["src"], "dst", ["--dry-run", "--delete"], 10);
      });
      it("should be rejected if src is not array of string", ()=>{
        return expect(ssh.recv(1)).to.be.rejectedWith("src must be array of string");
      });
      it("should be rejected if src has only empty string element", ()=>{
        return expect(ssh.recv(["", ""])).to.be.rejectedWith("src must contain non-empty string");
      });
      it("should be rejected if src has only empty string element", ()=>{
        return expect(ssh.recv([""])).to.be.rejectedWith("src must contain non-empty string");
      });
      it("should be called if src includes empty string ", ()=>{
        ssh.recv(["src", ""], "dst");
        expect(recv).to.be.calledWith(hostInfo, ["src", ""], "dst", [], 0);
      });
      it("should be rejected if dst is not string", ()=>{
        return expect(ssh.recv(["src"], 0)).to.be.rejectedWith("dst must be string");
      });
      it("should be rejected if dst is empty string", ()=>{
        return expect(ssh.recv(["src"], "")).to.be.rejectedWith("dst must be non-empty string");
      });
      it("should be rejected if opt is not array of string", ()=>{
        return expect(ssh.recv(["src"], "dst", [null])).to.be.rejectedWith("opt must be array of string");
      });
    });
  });
});
