process.on("unhandledRejection", console.dir);

//setup test framework
import { expect } from "chai";

//testee
import { resolveExecutable } from "../../lib/util.js";

describe("test for resolveExecutable", ()=>{
  const existing = new Set([
    String.raw`C:\Windows\System32\OpenSSH\ssh.exe`,
    String.raw`C:\tools\gokr-rsync.exe`,
    String.raw`C:\last\rsync.exe`,
    String.raw`C:\tools\rsync.cmd`
  ]);
  const win32 = {
    platform: "win32",
    env: { Path: String.raw`C:\Windows;C:\Windows\System32\OpenSSH;C:\tools;C:\last` },
    isFile: (p)=>{
      return existing.has(p);
    }
  };
  it("should return the command as it is on other platforms", ()=>{
    expect(resolveExecutable("ssh", { ...win32, platform: "linux" })).to.equal("ssh");
    expect(resolveExecutable("ssh", { ...win32, platform: "darwin" })).to.equal("ssh");
  });
  it("should add .exe and find the command in PATH on win32", ()=>{
    expect(resolveExecutable("ssh", win32)).to.equal(String.raw`C:\Windows\System32\OpenSSH\ssh.exe`);
    expect(resolveExecutable("gokr-rsync", win32)).to.equal(String.raw`C:\tools\gokr-rsync.exe`);
  });
  it("should find the command in the last directory of PATH", ()=>{
    expect(resolveExecutable("rsync", win32)).to.equal(String.raw`C:\last\rsync.exe`);
  });
  it("should not add .exe if the command has an extension", ()=>{
    expect(resolveExecutable("rsync.cmd", win32)).to.equal(String.raw`C:\tools\rsync.cmd`);
  });
  it("should accept PATH as the name of the variable", ()=>{
    expect(resolveExecutable("ssh", { ...win32, env: { PATH: win32.env.Path } })).to.equal(String.raw`C:\Windows\System32\OpenSSH\ssh.exe`);
  });
  it("should return the command as it is if it is not found", ()=>{
    expect(resolveExecutable("nosuchcmd", win32)).to.equal("nosuchcmd");
  });
  it("should return a path as it is", ()=>{
    expect(resolveExecutable(String.raw`C:\tools\gokr-rsync.exe`, win32)).to.equal(String.raw`C:\tools\gokr-rsync.exe`);
    expect(resolveExecutable("./ssh", win32)).to.equal("./ssh");
  });
});
