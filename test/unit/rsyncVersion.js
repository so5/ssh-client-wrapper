import { expect } from "chai";

import { parseRsyncVersion, needsOneRunPerSource } from "../../lib/rsyncVersion.js";

describe("test rsyncVersion", ()=>{
  describe("#parseRsyncVersion", ()=>{
    it("should parse the version line of rsync", ()=>{
      const output = "rsync  version 3.4.1  protocol version 32\nCopyright (C) 1996-2025 by Andrew Tridgell, Wayne Davison, and others.\n";
      expect(parseRsyncVersion(output)).to.deep.equal({ major: 3, minor: 4, patch: 1 });
    });
    it("should parse the version line of openrsync", ()=>{
      expect(parseRsyncVersion("openrsync: protocol version 29\nrsync version 2.6.9 compatible\n")).to.deep.equal({ major: 2, minor: 6, patch: 9 });
    });
    it("should report gokrazy/rsync and rsync4win as the implementation", ()=>{
      expect(parseRsyncVersion("rsync  version 0.3.10  (gokrazy/rsync)\n")).to.deep.equal({ major: 0, minor: 3, patch: 10, implementation: "gokrazy" });
      expect(parseRsyncVersion("rsync  version 0.1.0  (rsync4win)\n")).to.deep.equal({ major: 0, minor: 1, patch: 0, implementation: "rsync4win" });
    });
    it("should return an empty object if there is no version line", ()=>{
      expect(parseRsyncVersion("gokrazy/rsync v0.3.10")).to.deep.equal({});
      expect(parseRsyncVersion("")).to.deep.equal({});
    });
  });
  describe("#needsOneRunPerSource", ()=>{
    it("should be true for gokrazy/rsync and rsync4win", ()=>{
      expect(needsOneRunPerSource({ major: 0, minor: 3, patch: 10, implementation: "gokrazy" })).to.be.true;
      expect(needsOneRunPerSource({ major: 0, minor: 1, patch: 0, implementation: "rsync4win" })).to.be.true;
    });
    it("should be false for rsync and openrsync", ()=>{
      expect(needsOneRunPerSource({ major: 3, minor: 4, patch: 1 })).to.be.false;
      expect(needsOneRunPerSource({ major: 2, minor: 6, patch: 9 })).to.be.false;
    });
    it("should be false if the version is unknown", ()=>{
      expect(needsOneRunPerSource(undefined)).to.be.false;
      expect(needsOneRunPerSource(null)).to.be.false;
      expect(needsOneRunPerSource({})).to.be.false;
    });
  });
});
