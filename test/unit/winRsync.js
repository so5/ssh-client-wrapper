//setup test framework
import { expect } from "chai";

//testee
import { detectLocalRsync, toRsyncPath, makeRshCommand } from "../../lib/winRsync.js";

describe("test winRsync", ()=>{
  const files = (list)=>{
    const set = new Set(list);
    return (p)=>{
      return set.has(p);
    };
  };
  describe("#detectLocalRsync", ()=>{
    it("should return null on other platforms", ()=>{
      expect(detectLocalRsync({ platform: "linux", rsyncPath: "/usr/bin/rsync" })).to.be.null;
      expect(detectLocalRsync({ platform: "darwin", rsyncPath: "/usr/bin/rsync" })).to.be.null;
    });
    it("should detect MSYS2 rsync and the ssh next to it", ()=>{
      const isFile = files([String.raw`C:\msys64\usr\bin\msys-2.0.dll`, String.raw`C:\msys64\usr\bin\ssh.exe`]);

      expect(detectLocalRsync({ platform: "win32", rsyncPath: String.raw`C:\msys64\usr\bin\rsync.exe`, isFile }))
        .to.deep.equal({ style: "msys", ssh: String.raw`C:\msys64\usr\bin\ssh.exe` });
    });
    it("should detect Cygwin rsync", ()=>{
      const isFile = files([String.raw`C:\cygwin64\bin\cygwin1.dll`]);

      expect(detectLocalRsync({ platform: "win32", rsyncPath: String.raw`C:\cygwin64\bin\rsync.exe`, isFile }))
        .to.deep.equal({ style: "cygwin", ssh: null });
    });
    it("should return null for a rsync without MSYS2/Cygwin runtime", ()=>{
      const isFile = files([String.raw`C:\tools\ssh.exe`]);

      expect(detectLocalRsync({ platform: "win32", rsyncPath: String.raw`C:\tools\rsync.exe`, isFile })).to.be.null;
    });
    it("should return null if rsync is not found", ()=>{
      expect(detectLocalRsync({ platform: "win32", isFile: ()=>{return false;} })).to.be.null;
    });
  });
  describe("#toRsyncPath", ()=>{
    it("should not touch the path if the rsync takes Windows paths", ()=>{
      expect(toRsyncPath(String.raw`D:\a\b`, null)).to.equal(String.raw`D:\a\b`);
      expect(toRsyncPath("/home/a", null)).to.equal("/home/a");
    });
    it("should convert for MSYS2 and Cygwin", ()=>{
      expect(toRsyncPath(String.raw`D:\a\b`, { style: "msys" })).to.equal("/d/a/b");
      expect(toRsyncPath(String.raw`D:\a\b` + "\\", { style: "msys" })).to.equal("/d/a/b/");
      expect(toRsyncPath(String.raw`D:\a`, { style: "cygwin" })).to.equal("/cygdrive/d/a");
    });
  });
  describe("#makeRshCommand", ()=>{
    it("should join the command and the options as before without MSYS2/Cygwin", ()=>{
      expect(makeRshCommand("ssh", ["-l", "user", "-p", 22], null)).to.equal("ssh -l user -p 22");
    });
    it("should use the ssh next to rsync.exe", ()=>{
      const local = { style: "msys", ssh: String.raw`C:\msys64\usr\bin\ssh.exe` };

      expect(makeRshCommand("ssh", ["-l", "user"], local)).to.equal("/c/msys64/usr/bin/ssh.exe -l user");
    });
    it("should quote a path which has a space", ()=>{
      const local = { style: "msys", ssh: String.raw`C:\Program Files\r4w\ssh.exe` };

      expect(makeRshCommand("ssh", [], local)).to.equal("\"/c/Program Files/r4w/ssh.exe\" ");
    });
    it("should convert the key file and the control path", ()=>{
      const local = { style: "msys", ssh: null };
      const rt = makeRshCommand("ssh", ["-i", String.raw`C:\Users\a b\.ssh\id_rsa`, "-oControlPath=C:\\tmp/scw-%C", "-oControlPersist=60", 22], local);

      expect(rt).to.equal("ssh -i \"/c/Users/a b/.ssh/id_rsa\" -oControlPath=/c/tmp/scw-%C -oControlPersist=60 22");
    });
  });
});
