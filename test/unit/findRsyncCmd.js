process.on("unhandledRejection", console.dir);

//setup test framework
import { expect } from "chai";

//testee
import { commandExists, findRsyncCmd } from "../../lib/util.js";

describe("test for commandExists and findRsyncCmd", ()=>{
  const posix = (files)=>{
    return {
      platform: "linux",
      env: { PATH: "/usr/local/bin:/usr/bin" },
      isExecutable: (p)=>{
        return files.includes(p);
      }
    };
  };
  const win32 = (files)=>{
    return {
      platform: "win32",
      env: { Path: String.raw`C:\Windows;C:\tools` },
      isFile: (p)=>{
        return files.includes(p);
      }
    };
  };
  describe("#commandExists", ()=>{
    it("should find a command in PATH on posix", ()=>{
      expect(commandExists("rsync", posix(["/usr/bin/rsync"]))).to.be.true;
      expect(commandExists("rsync", posix(["/usr/local/bin/rsync"]))).to.be.true;
    });
    it("should not find a command which is not in PATH on posix", ()=>{
      expect(commandExists("rsync", posix(["/opt/rsync"]))).to.be.false;
    });
    it("should find an exe file in PATH on win32", ()=>{
      expect(commandExists("rsync", win32([String.raw`C:\tools\rsync.exe`]))).to.be.true;
    });
    it("should not take rsync.cmd for rsync on win32, because it can not be spawned in a pty", ()=>{
      expect(commandExists("rsync", win32([String.raw`C:\tools\rsync.cmd`]))).to.be.false;
    });
  });
  describe("#findRsyncCmd", ()=>{
    it("should prefer rsync", ()=>{
      expect(findRsyncCmd(posix(["/usr/bin/rsync", "/usr/bin/gokr-rsync"]))).to.equal("rsync");
    });
    it("should use gokr-rsync if rsync is not found", ()=>{
      expect(findRsyncCmd(posix(["/usr/bin/gokr-rsync"]))).to.equal("gokr-rsync");
      expect(findRsyncCmd(win32([String.raw`C:\tools\gokr-rsync.exe`]))).to.equal("gokr-rsync");
    });
    it("should use gokr-rsync on win32 if only rsync.cmd is found", ()=>{
      expect(findRsyncCmd(win32([String.raw`C:\tools\rsync.cmd`, String.raw`C:\tools\gokr-rsync.exe`]))).to.equal("gokr-rsync");
    });
    it("should return rsync if none is found", ()=>{
      expect(findRsyncCmd(posix([]))).to.equal("rsync");
    });
  });
});
