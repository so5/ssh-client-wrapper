"use strict";
process.on("unhandledRejection", console.dir); // eslint-disable-line no-console

// setup test framework
const chai = require("chai");
const { expect } = require("chai");
chai.use(require("chai-as-promised"));

// testee
const { sanityCheck } = require("../lib/util.js");

describe("test for sanityCheck", () => {
  const host = "testHostName";
  it("should throw error for empty host", () => {
    expect(sanityCheck.bind(null, { host: "   ", user: "   ", port: 22 })).to.throw(/empty host is not allowed/);
  });
  it("should throw error if host is not in argument object", () => {
    expect(sanityCheck.bind(null, { user: "   ", port: 22 })).to.throw(/host is required/);
  });
  it("should just remove empty string props", () => {
    expect(sanityCheck({ host, user: "   ", port: 22 })).to.deep.equal({ host, port: 22 });
  });
  it("should remove empty string member in sshOpt", () => {
    expect(sanityCheck({ host, sshOpt: ["foo", "  ", "bar"], user: "user", port: 33 })).to.deep.equal({ host, sshOpt: ["foo", "bar"], user: "user", port: 33 });
  });
  it("should just chage type if string value specified for number", () => {
    expect(sanityCheck({
      host,
      port: "11",
      ControlPersist: "22",
      ConnectTimeout: "33",
      maxRetry: "44",
      retryMinTimeout: "55",
      retryMaxTimeout: "66"
    })).to.deep.equal({
      host,
      port: 11,
      ControlPersist: 22,
      ConnectTimeout: 33,
      maxRetry: 44,
      retryMinTimeout: 55,
      retryMaxTimeout: 66
    });
  });
  it("should remove out of range members", () => {
    expect(sanityCheck({
      host,
      ControlPersist: "-1",
      ConnectTimeout: "-1",
      maxRetry: "-1",
      retryMinTimeout: "-1",
      retryMaxTimeout: "-1"
    })).to.deep.equal({
      host
    });
  });
  it("should just chage type if string value specified for boolean member", () => {
    expect(sanityCheck({
      host,
      noStrictHostkeyChecking: "true"
    })).to.deep.equal({
      host,
      noStrictHostkeyChecking: true
    });
  });
  it("should just chage type if number value specified for boolean member", () => {
    expect(sanityCheck({
      host,
      noStrictHostkeyChecking: 0
    })).to.deep.equal({
      host,
      noStrictHostkeyChecking: false
    });
  });
});
