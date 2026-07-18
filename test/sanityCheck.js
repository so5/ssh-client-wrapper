process.on("unhandledRejection", console.dir);

//setup test framework
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

//testee
import { sanityCheck } from "../lib/util.js";

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
  it("should accept retryableExitCodes as array of integer", ()=>{
    expect(sanityCheck({
      host,
      retryableExitCodes: [23, 24]
    })).to.deep.equal({
      host,
      ...defaultValues,
      retryableExitCodes: [23, 24]
    });
  });
  it("should accept empty array for retryableExitCodes", ()=>{
    expect(sanityCheck({
      host,
      retryableExitCodes: []
    })).to.deep.equal({
      host,
      ...defaultValues,
      retryableExitCodes: []
    });
  });
  it("should coerce string members of retryableExitCodes to integer", ()=>{
    expect(sanityCheck({
      host,
      retryableExitCodes: ["23", "24"]
    })).to.deep.equal({
      host,
      ...defaultValues,
      retryableExitCodes: [23, 24]
    });
  });
  it("should throw error if retryableExitCodes has non-integer member", ()=>{
    expect(sanityCheck.bind(null, { host, retryableExitCodes: ["abc"] })).to.throw(/invalid retryableExitCodes/);
  });
  it("should throw error if retryableExitCodes is not an array", ()=>{
    expect(sanityCheck.bind(null, { host, retryableExitCodes: "notarray" })).to.throw(/invalid retryableExitCodes/);
  });
  it("should just change type if string value specified for replaceRetryableExitCodes", ()=>{
    expect(sanityCheck({
      host,
      replaceRetryableExitCodes: "true"
    })).to.deep.equal({
      host,
      ...defaultValues,
      replaceRetryableExitCodes: true
    });
  });
  it("should throw error if replaceRetryableExitCodes is not boolean-coercible", ()=>{
    expect(sanityCheck.bind(null, { host, replaceRetryableExitCodes: "notabool" })).to.throw(/invalid replaceRetryableExitCodes/);
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
