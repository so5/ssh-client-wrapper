//setup test framework
import { expect } from "chai";

//testee
import {
  hasLiteralRemoteArgs,
  needsExpansion,
  escapeRemoteArg,
  shellQuote,
  formatRemoteArg,
  buildExpandCommand,
  parseExpandOutput
} from "../../lib/remotePath.js";

describe("test remotePath", ()=>{
  describe("#hasLiteralRemoteArgs", ()=>{
    const v = (major, minor, patch)=>{
      return { major, minor, patch };
    };
    it("should be false for rsync older than 3.2.4", ()=>{
      expect(hasLiteralRemoteArgs(v(2, 6, 9))).to.be.false;
      expect(hasLiteralRemoteArgs(v(3, 0, 9))).to.be.false;
      expect(hasLiteralRemoteArgs(v(3, 1, 3))).to.be.false;
      expect(hasLiteralRemoteArgs(v(3, 2, 3))).to.be.false;
    });
    it("should be true for rsync 3.2.4 or later", ()=>{
      expect(hasLiteralRemoteArgs(v(3, 2, 4))).to.be.true;
      expect(hasLiteralRemoteArgs(v(3, 2, 7))).to.be.true;
    });
    it("should compare each digit as a part of version", ()=>{
      //these were wrongly judged as old because the patch level is less than 4
      expect(hasLiteralRemoteArgs(v(3, 3, 0))).to.be.true;
      expect(hasLiteralRemoteArgs(v(3, 4, 1))).to.be.true;
      expect(hasLiteralRemoteArgs(v(3, 5, 0))).to.be.true;
      expect(hasLiteralRemoteArgs(v(4, 0, 0))).to.be.true;
    });
    it("should be false if version is unknown", ()=>{
      expect(hasLiteralRemoteArgs(undefined)).to.be.false;
      expect(hasLiteralRemoteArgs(null)).to.be.false;
      expect(hasLiteralRemoteArgs({})).to.be.false;
      expect(hasLiteralRemoteArgs(v(3, 2, "4"))).to.be.false;
    });
    it("should treat rsync4win (0.x) as a rsync which lets the remote shell evaluate the path", ()=>{
      expect(hasLiteralRemoteArgs(v(0, 1, 0))).to.be.false;
    });
  });
  describe("#needsExpansion", ()=>{
    it("should be false for plain paths and wildcards", ()=>{
      expect(needsExpansion("foo")).to.be.false;
      expect(needsExpansion("dir/foo.txt")).to.be.false;
      expect(needsExpansion("/abs/path-1/a_b@c%d+e=f:g,h")).to.be.false;
      expect(needsExpansion("dir/b*")).to.be.false;
      expect(needsExpansion("dir/?o[ab]")).to.be.false;
    });
    it("should be true for paths which the remote shell has to evaluate", ()=>{
      expect(needsExpansion("~/foo")).to.be.true;
      expect(needsExpansion("$HOME/foo")).to.be.true;
      expect(needsExpansion("dir/{foo,bar}")).to.be.true;
      expect(needsExpansion("dir/a\\ b")).to.be.true;
      expect(needsExpansion("'dir/a b'")).to.be.true;
      expect(needsExpansion("\"dir/a b\"")).to.be.true;
      expect(needsExpansion("dir/a b")).to.be.true;
      expect(needsExpansion("$(pwd)/foo")).to.be.true;
    });
  });
  describe("#escapeRemoteArg", ()=>{
    it("should not touch plain paths and wildcards", ()=>{
      expect(escapeRemoteArg("dir/foo.txt")).to.equal("dir/foo.txt");
      expect(escapeRemoteArg("dir/b*")).to.equal("dir/b*");
      expect(escapeRemoteArg("dir/?o[ab]")).to.equal("dir/?o[ab]");
    });
    it("should escape characters which the remote shell interprets", ()=>{
      expect(escapeRemoteArg("dir/a b")).to.equal("dir/a\\ b");
      expect(escapeRemoteArg("$HOME/foo")).to.equal("\\$HOME/foo");
      expect(escapeRemoteArg("a{b,c}")).to.equal("a\\{b,c\\}");
      expect(escapeRemoteArg("it's")).to.equal("it\\'s");
      expect(escapeRemoteArg("a;b")).to.equal("a\\;b");
    });
  });
  describe("#shellQuote", ()=>{
    it("should quote with single quote", ()=>{
      expect(shellQuote("dir/a b")).to.equal("'dir/a b'");
      expect(shellQuote("$HOME/*")).to.equal("'$HOME/*'");
    });
    it("should escape single quote", ()=>{
      expect(shellQuote("it's")).to.equal("'it'\\''s'");
    });
  });
  describe("#formatRemoteArg", ()=>{
    it("should not touch the path if rsync takes it literally", ()=>{
      expect(formatRemoteArg("dir/a b", true)).to.equal("dir/a b");
    });
    it("should escape the path if the remote shell evaluates it", ()=>{
      expect(formatRemoteArg("dir/a b", false)).to.equal("dir/a\\ b");
    });
  });
  describe("#buildExpandCommand and #parseExpandOutput", ()=>{
    const token = "SCWabc";
    it("should make a command which prints the markers and expanded words", ()=>{
      const cmd = buildExpandCommand("$HOME/{a,b}", token);
      expect(cmd).to.equal("set -f; echo SCWabcB; for f in $HOME/{a,b}; do printf '%s\\n' \"$f\"; done; echo SCWabcE");
    });
    it("should pick up words between the markers", ()=>{
      const output = "welcome message\nSCWabcB\n/home/u/a\n/home/u/b\nSCWabcE\n";
      expect(parseExpandOutput(output, token)).to.deep.equal(["/home/u/a", "/home/u/b"]);
    });
    it("should accept CRLF", ()=>{
      const output = "SCWabcB\r\n/home/u/a b\r\nSCWabcE\r\n";
      expect(parseExpandOutput(output, token)).to.deep.equal(["/home/u/a b"]);
    });
    it("should return null if markers are missing", ()=>{
      expect(parseExpandOutput("syntax error\n", token)).to.be.null;
      expect(parseExpandOutput("SCWabcB\n/home/u/a\n", token)).to.be.null;
    });
  });
});
