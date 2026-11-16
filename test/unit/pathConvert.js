//setup test framework
import { expect } from "chai";

//testee
import { isWindowsPath, toMsysPath, fromMsysPath } from "../../lib/pathConvert.js";

describe("test pathConvert", ()=>{
  describe("#isWindowsPath", ()=>{
    it("should be true for drive paths and UNC paths", ()=>{
      for (const p of ["D:\\a\\b", "d:/a/b", "C:", "C:\\", "\\\\host\\share\\x", "\\\\?\\D:\\x", "\\\\?\\UNC\\host\\share\\x"]) {
        expect(isWindowsPath(p), p).to.be.true;
      }
    });
    it("should be false for the other paths", ()=>{
      for (const p of ["/d/a", "a/b", "a\\b", "host:path", "", "./D:x"]) {
        expect(isWindowsPath(p), p).to.be.false;
      }
    });
    it("should throw for non string", ()=>{
      expect(()=>{return isWindowsPath(null);}).to.throw(TypeError);
    });
  });
  describe("#toMsysPath", ()=>{
    it("should convert a drive path", ()=>{
      expect(toMsysPath("D:\\a\\b.txt")).to.equal("/d/a/b.txt");
      expect(toMsysPath("D:/a/b.txt")).to.equal("/d/a/b.txt");
      expect(toMsysPath("C:\\Users\\日本語\\あ.txt")).to.equal("/c/Users/日本語/あ.txt");
      expect(toMsysPath("d:\\a/b\\c")).to.equal("/d/a/b/c");
    });
    it("should convert a drive root", ()=>{
      expect(toMsysPath("D:\\")).to.equal("/d/");
      expect(toMsysPath("D:/")).to.equal("/d/");
    });
    it("should keep the trailing slash", ()=>{
      expect(toMsysPath("D:\\a\\b\\")).to.equal("/d/a/b/");
      expect(toMsysPath("a\\b\\")).to.equal("a/b/");
    });
    it("should keep spaces and special characters", ()=>{
      expect(toMsysPath("C:\\Program Files\\r4w\\rsync.exe")).to.equal("/c/Program Files/r4w/rsync.exe");
      expect(toMsysPath("D:\\a b\\c$d")).to.equal("/d/a b/c$d");
    });
    it("should not touch dots", ()=>{
      expect(toMsysPath("D:\\a\\..\\b\\.\\c")).to.equal("/d/a/../b/./c");
    });
    it("should convert an UNC path", ()=>{
      expect(toMsysPath("\\\\host\\share\\a\\b")).to.equal("//host/share/a/b");
      expect(toMsysPath("\\\\host\\share")).to.equal("//host/share");
    });
    it("should convert a long path prefix", ()=>{
      expect(toMsysPath("\\\\?\\D:\\a\\b")).to.equal("/d/a/b");
      expect(toMsysPath("\\\\?\\UNC\\host\\share\\a")).to.equal("//host/share/a");
    });
    it("should convert a relative path", ()=>{
      expect(toMsysPath("a\\b")).to.equal("a/b");
      expect(toMsysPath(".\\a")).to.equal("./a");
      expect(toMsysPath("..\\a")).to.equal("../a");
      expect(toMsysPath("a")).to.equal("a");
      expect(toMsysPath("")).to.equal("");
    });
    it("should convert a path which starts with a backslash", ()=>{
      expect(toMsysPath("\\a\\b")).to.equal("/a/b");
    });
    it("should be idempotent", ()=>{
      for (const p of ["/d/a/b", "/usr/bin", "//host/share/a", "a/b", "/cygdrive/d/a"]) {
        expect(toMsysPath(p), p).to.equal(p);
      }
    });
    it("should support the cygwin style", ()=>{
      expect(toMsysPath("D:\\a\\b", { style: "cygwin" })).to.equal("/cygdrive/d/a/b");
      expect(toMsysPath("D:\\", { style: "cygwin" })).to.equal("/cygdrive/d/");
      expect(toMsysPath("\\\\host\\share\\a", { style: "cygwin" })).to.equal("//host/share/a");
    });
    it("should reject a drive relative path", ()=>{
      expect(()=>{return toMsysPath("D:a\\b");}).to.throw(RangeError);
      expect(()=>{return toMsysPath("D:");}).to.throw(RangeError);
    });
    it("should reject an unknown style and non string", ()=>{
      expect(()=>{return toMsysPath("D:\\a", { style: "x" });}).to.throw(RangeError);
      expect(()=>{return toMsysPath(undefined);}).to.throw(TypeError);
    });
  });
  describe("#fromMsysPath", ()=>{
    it("should convert a drive path", ()=>{
      expect(fromMsysPath("/d/a/b.txt")).to.equal("D:\\a\\b.txt");
      expect(fromMsysPath("/cygdrive/d/a/b")).to.equal("D:\\a\\b");
      expect(fromMsysPath("/c/Program Files/x")).to.equal("C:\\Program Files\\x");
      expect(fromMsysPath("/c/日本語/あ.txt")).to.equal("C:\\日本語\\あ.txt");
    });
    it("should convert a drive root", ()=>{
      expect(fromMsysPath("/d")).to.equal("D:\\");
      expect(fromMsysPath("/d/")).to.equal("D:\\");
      expect(fromMsysPath("/cygdrive/d")).to.equal("D:\\");
    });
    it("should keep the trailing slash", ()=>{
      expect(fromMsysPath("/d/a/b/")).to.equal("D:\\a\\b\\");
      expect(fromMsysPath("a/b/")).to.equal("a\\b\\");
    });
    it("should convert an UNC path", ()=>{
      expect(fromMsysPath("//host/share/a")).to.equal("\\\\host\\share\\a");
    });
    it("should convert a relative path", ()=>{
      expect(fromMsysPath("a/b")).to.equal("a\\b");
      expect(fromMsysPath("./a")).to.equal(".\\a");
    });
    it("should not take a longer name as a drive", ()=>{
      expect(()=>{return fromMsysPath("/dev/null");}).to.throw(RangeError);
      expect(fromMsysPath("/usr/bin/ssh.exe", { root: "C:\\msys64" })).to.equal("C:\\msys64\\usr\\bin\\ssh.exe");
    });
    it("should throw for a path in the MSYS2 root without options.root", ()=>{
      expect(()=>{return fromMsysPath("/usr/bin");}).to.throw(RangeError);
    });
    it("should throw for /cygdrive without a drive", ()=>{
      expect(()=>{return fromMsysPath("/cygdrive/foo/a");}).to.throw(RangeError);
    });
    it("should round trip", ()=>{
      for (const p of ["D:\\a\\b", "C:\\", "\\\\host\\share\\x", "a\\b\\"]) {
        expect(fromMsysPath(toMsysPath(p)), p).to.equal(p);
      }
      for (const style of ["msys", "cygwin"]) {
        expect(fromMsysPath(toMsysPath("E:\\x y\\z", { style }))).to.equal("E:\\x y\\z");
      }
    });
  });
});
