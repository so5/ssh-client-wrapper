"use strict";
const fs = require("fs-extra");
const path = require("path");

process.on("unhandledRejection", console.dir); //eslint-disable-line no-console
Error.traceLimit = 100000;

//setup test framework
const chai = require("chai");
const { expect } = require("chai");
chai.use(require("chai-fs"));
chai.use(require("chai-as-promised"));

//testee
const { send, recv } = require("../lib/rsyncExec.js");

//test helpers
const { sshExec, disconnect } = require("../lib/sshExec.js");
const hostInfo = require("./util/hostInfo.js");
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
} = require("./util/testFiles");

const formatLsOutput = (array)=>{
  return array.join(" ")
    .replace(/\n/g, " ")
    .trim()
    .split(/\s+/);
};


//actual test start from here
describe("test rsync exec", function() {
  this.timeout(10000);//eslint-disable-line no-invalid-this
  const rt = [];
  const output = (data)=>{
    rt.push(data);
  };
  let remoteHome;
  before(async ()=>{
    await sshExec(hostInfo, "pwd", (data)=>{
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
    after(async ()=>{
      await disconnect(hostInfo);
    });
  });
  describe("#send", async ()=>{
    describe("send single file", ()=>{
      it("should accept relative src file and relative dst dir name", async ()=>{
        await send(hostInfo, [localFiles[0]], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept absolute src file and relative dst dir name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[3])], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo"]);
      });
      it("should accept relative src file and absolute dst dir name", async ()=>{
        await send(hostInfo, [localFiles[0]], `${path.posix.join(remoteHome, remoteEmptyDir)}/`);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept absolute src file and absolute dst dir name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteHome, remoteEmptyDir));

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo"]);
      });
      it("should accept relative src file and relative dst file name", async ()=>{
        await send(hostInfo, [localFiles[0]], path.posix.join(remoteEmptyDir, "hoge"));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and relative dst file name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteEmptyDir, "hoge"));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept relative src file and absolute dst file name", async ()=>{
        await send(hostInfo, [localFiles[0]], path.posix.join(remoteHome, remoteEmptyDir, "hoge"));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and absolute dst file name", async ()=>{
        await send(hostInfo, [path.resolve(localFiles[0])], path.posix.join(remoteHome, remoteEmptyDir, "hoge"));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, "hoge")}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
      });

      it("should overwrite existing file", async ()=>{
        const target = path.posix.join(remoteEmptyDir, "hoge");
        await send(hostInfo, [localFiles[0]], target);
        await sshExec(hostInfo, `ls ${target}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);
        rt.splice(0, rt.length);

        const time = new Date();
        time.setMinutes(time.getMinutes() + 3);
        await fs.utimes(localFiles[1], time, time);
        await send(hostInfo, [localFiles[1]], target);
        await sshExec(hostInfo, `ls ${target}`, output);
        expect(formatLsOutput(rt.map((e)=>{
          return path.posix.basename(e);
        }))).to.have.members(["hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `cat ${target}`, output);
        expect(formatLsOutput(rt)).to.have.members(["ARssh_testLocalDir/bar"]);
      });
    });
    describe("send directory tree", ()=>{
      it("should accept relative src dirname and relative dst dirname", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and relative dst dirname", async ()=>{
        await send(hostInfo, [path.resolve(localRoot)], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and absolute dst dirname", async ()=>{
        await send(hostInfo, [localRoot], path.posix.join(remoteHome, remoteEmptyDir));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and absolute dst dirname", async ()=>{
        await send(hostInfo, [path.resolve(localRoot)], path.posix.join(remoteHome, remoteEmptyDir));

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "bar", "baz", "hoge"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      //only option need special treatment in rsyncExec. it's hard to set in WHEEL
      it.skip("[not implemented] should send directory tree if only filter matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, [`--include=${localRoot}`, `--include=${localRoot}/ba*`, `--include=${localRoot}/hoge/*`, "--exclude=*"]);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["hoge", "bar", "baz"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should send directory tree if exclude filter not matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, ["--exclude=ba*", "--exclude=hoge*}"]);

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["foo", "hoge"]);
      });
      it.skip("[not implemented] should send directory tree if only filter matched but exclude filter not matched", async ()=>{
        await send(hostInfo, [localRoot], remoteEmptyDir, "*/{ba*,hoge/*}", "**/poyo");

        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot)}`, output);
        expect(formatLsOutput(rt)).to.have.members(["hoge", "bar", "baz"]);

        rt.splice(0, rt.length);
        await sshExec(hostInfo, `ls ${path.posix.join(remoteEmptyDir, localRoot, "hoge")}`, output);
        expect(formatLsOutput(rt)).to.have.members(["piyo", "puyo"]);
      });
      it("shoud not send empty directory", async ()=>{
        await send(hostInfo, [localEmptyDir], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(rt).to.have.lengthOf(0);
      });
      it("should send files which match glob pattern", async ()=>{
        await send(hostInfo, [path.join(localRoot, "b*")], remoteEmptyDir);

        await sshExec(hostInfo, `ls ${remoteEmptyDir}`, output);
        expect(formatLsOutput(rt)).to.have.members(["bar", "baz"]);
      });
    });
    describe("error case", ()=>{
      it("should not send directory to existing file path", ()=>{
        return expect(send(hostInfo, [localRoot], path.posix.join(remoteRoot, "foo"))).to.be.rejected;
      });
    });
  });
  describe("#recv", async ()=>{
    describe("recieve single file", ()=>{
      it("should accept relative src file and relative dst dir name", async ()=>{
        await recv(hostInfo, [remoteFiles[3]], localEmptyDir);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept absolute src file and relative dst dir name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[3])], localEmptyDir);

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept relative src file and absolute dst dir name", async ()=>{
        await recv(hostInfo, [remoteFiles[3]], path.resolve(localEmptyDir));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept absolute src file and absolute dst dir name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[3])], path.resolve(localEmptyDir));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo"]);
      });
      it("should accept relative src file and relative dst file name", async ()=>{
        await recv(hostInfo, [remoteFiles[0]], path.join(localEmptyDir, "hoge"));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and relative dst file name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[0])], path.join(localEmptyDir, "hoge"));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept relative src file and absolute dst file name", async ()=>{
        await recv(hostInfo, [remoteFiles[0]], path.resolve(localEmptyDir, "hoge"));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept absolute src file and absolute dst file name", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteFiles[0])], path.resolve(localEmptyDir, "hoge"));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["hoge"]);
      });
      it("should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "b*")], path.resolve(localEmptyDir));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["bar", "baz"]);
      });
      it("should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "*/p[iu]yo")], path.resolve(localEmptyDir));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo", "puyo"]);
      });
      it.skip("[temporarily disabled number 23 was thrown] should accept glob pattern as src", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "hoge/p[iu]yo"), path.posix.join(remoteRoot, "foo")], path.resolve(localEmptyDir));

        const rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["piyo", "puyo", "foo"]);
      });
    });
    describe("recieve directory tree", ()=>{
      it("should get directory tree which match specified glob", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteRoot, "?o*")], localEmptyDir);

        let rt2 = await fs.readdir(localEmptyDir);
        expect(rt2).to.have.members(["foo", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and relative dst dirname", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and relative dst dirname", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteRoot)], localEmptyDir);

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept relative src dirname and absolute dst dirname", async ()=>{
        await recv(hostInfo, [remoteRoot], path.resolve(localEmptyDir));

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should accept absolute src dirname and absolute dst dirname", async ()=>{
        await recv(hostInfo, [path.posix.join(remoteHome, remoteRoot)], path.resolve(localEmptyDir));

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo", "bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it.skip("[not implemented] should recv files which matches only filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, "*/{ba*,hoge/*}");

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["piyo", "puyo", "poyo"]);
      });
      it("should not recv files which matches exclude filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, ["--exclude=*/ba*", "--exclude=hoge"]);

        const rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["foo"]);
      });
      it.skip("[not implemented] should recv files which matches only filter but should not recv which matches exclude filter", async ()=>{
        await recv(hostInfo, [remoteRoot], localEmptyDir, "*/{ba*,hoge/*}", "**/piyo");

        let rt2 = await fs.readdir(path.posix.join(localEmptyDir, remoteRoot));
        expect(rt2).to.have.members(["bar", "baz", "hoge"]);
        rt2 = await fs.readdir(path.join(localEmptyDir, remoteRoot, "hoge"));
        expect(rt2).to.have.members(["puyo", "poyo"]);
      });
    });
    describe("error case", ()=>{
      it("should not send directory to existing file path", ()=>{
        return expect(recv(hostInfo, [remoteRoot], localFiles[0])).to.be.rejected;
      });
    });
  });
});
