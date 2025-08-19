"use strict";
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const exec = util.promisify(require("node:child_process").exec);

/**
 * to enable debug log dynamically
 * (1) enable folloing line
 *          const debug = require("debug");
 * (2) insert this line into the beginning of it()
 *         debug.enable("ssh*");
 * (3) insert this line into the end of it()
 *         debug.disable();
 */

process.on("unhandledRejection", console.dir);  
Error.traceLimit = 100000;

//setup test framework
const chai = require("chai");
const { expect } = require("chai");
chai.use(require("chai-fs"));
chai.use(require("chai-as-promised"));

//testee
const { checkRsyncVersion, send, recv } = require("../lib/rsyncExec.js");

//test helpers
const { sshExec, disconnect } = require("../lib/sshExec.js");
const hostInfo = require("./testUtil/hostInfo.js");
const {
  clearLocalTestFiles,
  clearRemoteTestFiles,
  createLocalFiles,
  localRoot,
  localEmptyDir,
  localFiles,
  createRemoteFiles,
  remoteRoot,
  remoteEmptyDir,
  remoteFiles
} = require("./testUtil/testFiles");

const formatLsOutput = (array)=>{
  const rt = [];
  for (const e of array) {
    rt.push(...e.split("\n"));
  }
  return rt.filter((e)=>{
    return e !== "";
  });
};

//actual test start from here
describe("test checkRsyncVersion", async ()=>{
  const { major, minor, patch } = await checkRsyncVersion(1);
  const versionString = `${major}.${minor}.${patch}`;
  console.log(`==== test with rsync version ${versionString} ====`);  
  const { stdout } = await exec("rsync --version |grep 'version'");
  expect(stdout).to.match(new RegExp(versionString));
});

describe("test rsync exec", function () {
  this.timeout(10000); 
  const rt = [];
  const output = (data)=>{
    rt.push(data);
  };
  let remoteHome;
  before(async ()=>{
    await sshExec(hostInfo, "pwd", 0, (data)=>{
      remoteHome = data.trim();
    });
  });
  beforeEach(async ()=>{
    await clearRemoteTestFiles(hostInfo);
    await createRemoteFiles(hostInfo);
    await clearLocalTestFiles();
    await createLocalFiles();
    rt.splice(0, rt.length);
  });
  after(async ()=>{
    if (!process.env.TEST_KEEP_FILES) {
      await clearRemoteTestFiles(hostInfo);
      await clearLocalTestFiles();
    }
    await disconnect(hostInfo);
  });
  describe("#send", async ()=>{
    describe("send single file", ()=>{
      it("should accept relative src file and relative dst dir name", async ()=>{
        await send(hostInfo, [localFiles[0]], remoteEmptyDir, [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept absolute src file and relative dst dir name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[3])], remoteEmptyDir, [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo"]);
      });
      it("should accept relative src file and absolute dst dir name", async ()=>{
        await send(hostInfo, [localFiles[0]], `${path.posix.join(remoteHome, remoteEmptyDir)}/`, [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept absolute src file and absolute dst dir name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteHome, remoteEmptyDir), [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept relative src file and relative dst file name", async ()=>{
        await send(hostInfo, [localFiles[0]], path.posix.join(remoteEmptyDir, "hoge"), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and relative dst file name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteEmptyDir, "hoge"), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept relative src file and absolute dst file name", async ()=>{
        await send(hostInfo, [localFiles[0]], path.posix.join(remoteHome, remoteEmptyDir, "hoge"), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and absolute dst file name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteHome, remoteEmptyDir, "hoge"), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });

      it("should overwrite existing file", async ()=>{
        const target = path.posix.join(remoteEmptyDir, "hoge");
        await send(hostInfo, [localFiles[0]], target, [], 0);
        await sshExec(hostInfo, `ls ${target}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
        rt.splice(0, rt.length);

        const time = new Date();
        time.setMinutes(time.getMinutes() + 3);
        await fs.utimes(localFiles[1], time, time);
        await send(hostInfo, [localFiles[1]], target, [], 0);
        await sshExec(hostInfo, `ls ${target}`, 0, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `cat ${target}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["ARssh_testLocalDir/bar"]);
      });
    });
    describe("send directory tree", ()=>{
      it("should accept relative src dirname and relative dst dirname", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and relative dst dirname", async ()=>{
        await send(hostInfo, [path.resolve(localRoot)], remoteEmptyDir, [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and absolute dst dirname", async ()=>{
        await send(hostInfo, [localRoot], path.posix.join(remoteHome, remoteEmptyDir), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and absolute dst dirname", async ()=>{
        await send(hostInfo, [path.resolve(localRoot)], path.posix.join(remoteHome, remoteEmptyDir), [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      //only option need special treatment in rsyncExec. it's hard to set in WHEEL
      it.skip("[not implemented] should send directory tree if only filter matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, [`--include=${localRoot}`, `--include=${localRoot}/ba*`, `--include=${localRoot}/hoge/*`, "--exclude=*"], [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["hoge", "bar", "baz"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should send directory tree if exclude filter not matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, ["--exclude=ba*", "--exclude=hoge*}"], [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "hoge", "huga"]);
      });
      it.skip("[not implemented] should send directory tree if only filter matched but exclude filter not matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, "*/{ba*,hoge/*}", "**/poyo", [], 0);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["hoge", "bar", "baz"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo"]);
      });
      it("shoud not send empty directory with -m option", async ()=>{
        await send(hostInfo, [localEmptyDir], remoteEmptyDir, ["-m"], [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(rt).to.have.lengthOf(0);
      });
      it("should send files which match glob pattern", async ()=>{
        await send(hostInfo, [path.join(localRoot, "b*")], remoteEmptyDir, [], 0);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, 0, output);
        expect(formatLsOutput(rt)).to.have.members(["bar", "baz"]);
      });
    });
    describe("error case", ()=>{
      it("should not send directory to existing file path", ()=>{
        return expect(send(hostInfo, [localRoot], path.posix.join(remoteRoot, "foo"), [], 0)).to.be.rejected;
      });
    });
  });
  describe("#recv", async ()=>{
    describe("recieve single file", ()=>{
      it("should accept relative src file and relative dst dir name", async ()=>{
        await recv(hostInfo, [remoteFiles[3]], localEmptyDir, [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept absolute src file and relative dst dir name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[3])], localEmptyDir, [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept relative src file and absolute dst dir name", async ()=>{
        await recv(hostInfo, [remoteFiles[3]], path.resolve(localEmptyDir), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept absolute src file and absolute dst dir name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[3])], path.resolve(localEmptyDir), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept relative src file and relative dst file name", async ()=>{
        await recv(hostInfo, [remoteFiles[0]], path.join(localEmptyDir, "hoge"), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and relative dst file name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[0])], path.join(localEmptyDir, "hoge"), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept relative src file and absolute dst file name", async ()=>{
        await recv(hostInfo, [remoteFiles[0]], path.resolve(localEmptyDir, "hoge"), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and absolute dst file name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[0])], path.resolve(localEmptyDir, "hoge"), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "b*")], path.resolve(localEmptyDir), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["bar", "baz"]);
      });
      it("should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "*/p[iu]yo")], path.resolve(localEmptyDir), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo", "puyo"]);
      });
      it.skip("[temporarily disabled number 23 was thrown] should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "hoge/p[iu]yo"), path.posix.join(remoteRoot, "foo")], path.resolve(localEmptyDir), [], 0);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo", "puyo", "foo"]);
      });
    });
    describe("recieve directory tree", ()=>{
      it("should get directory tree which match specified glob", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "?o*")], localEmptyDir, [], 0);

        let rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["foo", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and relative dst dirname", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and relative dst dirname", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteRoot)], localEmptyDir, [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and absolute dst dirname", async ()=>{
        await recv(hostInfo, [remoteRoot], path.resolve(localEmptyDir), [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and absolute dst dirname", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteRoot)], path.resolve(localEmptyDir), [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge", "huga"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it.skip("[not implemented] should recv files which matches only filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, "*/{ba*,hoge/*}", [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should not recv files which matches exclude filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, ["--exclude=*/ba*", "--exclude=hoge"], [], 0);

        const rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "huga"]);
      });
      it.skip("[not implemented] should recv files which matches only filter but should not recv which matches exclude filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, "*/{ba*,hoge/*}", "**/piyo", [], 0);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["puyo", "poyo"]);
      });
    });
    describe("degradation check", ()=>{
      it("should recieve multiple files from remote machine", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "foo"),
          path.posix.join(remoteRoot, "bar"), path.posix.join(remoteRoot, "baz")], localEmptyDir, [], 0);
        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["foo", "bar", "baz"]);
      });
    });
    describe("error case", ()=>{
      it("should not send directory to existing file path", ()=>{
        return expect(recv(hostInfo, [remoteRoot], localFiles[0], [], 0)).to.be.rejected;
      });
    });
  });
});
