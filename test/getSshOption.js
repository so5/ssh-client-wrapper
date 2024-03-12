"use strict";
process.on("unhandledRejection", console.dir); // eslint-disable-line no-console

// setup test framework
const chai = require("chai");
const { expect } = require("chai");
chai.use(require("chai-as-promised"));

// testee
const { getSshOption } = require("../lib/util.js");

describe("test for getSshOption", () => {
  const defaultValues = {
    host: "testHostName",
    ControlPersist: 180,
    maxRetry: 3,
    retryDuration: 1000
  };
  it("should return minimum ssh option array", () => {
    const sshOpts = getSshOption(defaultValues);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=~/.ssh/ssh-client-wrapper-%r@%h:%p");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
  it("should change ControlPath by ControlPersistDir", () => {
    const hostInfo = { ...defaultValues };
    hostInfo.ControlPersistDir = "/tmp";
    const sshOpts = getSshOption(hostInfo);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=/tmp/ssh-client-wrapper-%r@%h:%p");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
  it("should change ControlPath by Environment variable", () => {
    process.env.SSH_CONTROL_PERSIST_DIR = "/tmp";
    const sshOpts = getSshOption(defaultValues);
    expect(sshOpts).to.be.an("array");
    expect(sshOpts).to.have.lengthOf(4);
    expect(sshOpts[0]).to.equal(defaultValues.host);
    expect(sshOpts[1]).to.equal("-oControlMaster=auto");
    expect(sshOpts[2]).to.equal("-oControlPath=/tmp/ssh-client-wrapper-%r@%h:%p");
    expect(sshOpts[3]).to.equal("-oControlPersist=180");
  });
});
