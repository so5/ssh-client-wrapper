"use strict";
process.on("unhandledRejection", console.dir);  

//setup test framework
const chai = require("chai");
const { expect } = require("chai");
chai.use(require("chai-as-promised"));

//testee
const { sanityCheck } = require("../lib/util.js");

describe("test for sanityCheck", ()=>{
  const host = "testHostName";
  const defaultValues = {
    ControlPersist: 180,
    maxRetry: 3,
    retryDuration: 1000
  };
  it("should throw error for empty host", ()=>{
    expect(sanityCheck.bind(null, { host: "   ", user: "   ", port: 22 })).to.throw(/empty host is not allowed/);
  });
  it("should throw error if host is not in argument object", ()=>{
    expect(sanityCheck.bind(null, { user: "   ", port: 22 })).to.throw(/host is required/);
  });
  it("should just remove empty string props", ()=>{
    expect(sanityCheck({
      host,
      user: "   ",
      port: 22
    })).to.deep.equal({
      host,
      ...defaultValues,
      port: 22
    });
  });
  it("should remove empty string member in sshOpt", ()=>{
    expect(sanityCheck({
      host,
      sshOpt: ["foo", "  ", "bar"],
      user: "user",
      port: 33
    })).to.deep.equal({
      host,
      ...defaultValues,
      sshOpt: ["foo", "bar"],
      user: "user",
      port: 33
    });
  });
  it("should just change type if string value specified for number", ()=>{
    expect(sanityCheck({
      host,
      port: "11",
      ControlPersist: "22",
      ConnectTimeout: "33",
      maxRetry: "44",
      retryDuration: "55"
    })).to.deep.equal({
      host,
      port: 11,
      ControlPersist: 22,
      ConnectTimeout: 33,
      maxRetry: 44,
      retryDuration: 55
    });
  });
  it("should remove out of range members", ()=>{
    expect(sanityCheck({
      host,
      ControlPersist: "-1",
      ConnectTimeout: "-1",
      maxRetry: "-1",
      retryDuration: "-1"
    })).to.deep.equal({
      host
    });
  });
  it("should just change type if string value specified for boolean member", ()=>{
    expect(sanityCheck({
      host,
      noStrictHostKeyChecking: "true"
    })).to.deep.equal({
      host,
      ...defaultValues,
      noStrictHostKeyChecking: true
    });
  });
  it("should just change type if number value specified for boolean member", ()=>{
    expect(sanityCheck({
      host,
      noStrictHostKeyChecking: 0
    })).to.deep.equal({
      host,
      ...defaultValues,
      noStrictHostKeyChecking: false
    });
  });
  it("shold keep addtional properties", ()=>{
    const testData = {
      host,
      hoge: 3,
      foo: ()=>{}
    };
    expect(sanityCheck(testData)).to.deep.equal(testData);
  });
});
