import fs from "fs-extra";
import path from "path";

import { sshExec } from "../../lib/sshExec.js";

/*
 * test directory tree
 * ${ROOT}
 * +-- huga/ (empty directory)
 * +-- foo
 * +-- bar
 * +-- baz
 * +-- hoge
 *     +-- piyo
 *     +-- puyo
 *     +-- poyo
 *
 * ${ROOT} is "ARssh_testLocalDir" on local side
 * it is ARssh_testLocalDir on remote side
 *
 */

const localRoot = "ARssh_testLocalDir";
const localEmptyDir = path.join(localRoot, "huga");
const localFiles = [
  path.join(localRoot, "foo"),
  path.join(localRoot, "bar"),
  path.join(localRoot, "baz"),
  path.join(localRoot, "hoge", "piyo"),
  path.join(localRoot, "hoge", "puyo"),
  path.join(localRoot, "hoge", "poyo")
];

const remoteRoot = "ARssh_testRemoteDir";
const remoteEmptyDir = `${remoteRoot}/huga`;
const remoteFiles = [
  `${remoteRoot}/foo`,
  `${remoteRoot}/bar`,
  `${remoteRoot}/baz`,
  `${remoteRoot}/hoge/piyo`,
  `${remoteRoot}/hoge/puyo`,
  `${remoteRoot}/hoge/poyo`
];
const nonExisting = "ARSSH_nonExisting";

/*
 * prepare local files which contain its filename
 */
/**
 *
 */
export async function createLocalFiles() {
  const localDir2 = path.join(localRoot, "hoge");
  const promises = [];
  await fs.mkdir(localRoot);
  await fs.mkdir(localDir2);
  promises.push(fs.mkdir(localEmptyDir));
  localFiles.forEach((localFile)=>{
    promises.push(fs.writeFile(localFile, `${localFile}\n`));
  });
  return Promise.all(promises);
}

/**
 *
 */
export async function clearLocalTestFiles() {
  return fs.remove(localRoot);
}

/**
 *
 * @param hostInfo
 */
export async function createRemoteFiles(hostInfo) {
  //create remote files
  await sshExec(hostInfo, `mkdir -p ${remoteRoot}/hoge`);
  await sshExec(hostInfo, `mkdir -p ${remoteEmptyDir}`);
  const script = remoteFiles.reduce((a, remoteFile)=>{
    return `${a}echo ${remoteFile} > ${remoteFile};`;
  }, "");
  return sshExec(hostInfo, `${script}`);
}

/**
 *
 * @param hostInfo
 */
export async function clearRemoteTestFiles(hostInfo) {
  return sshExec(hostInfo, `rm -fr ${remoteRoot}`);
}

export {
  localRoot,
  localEmptyDir,
  localFiles,
  nonExisting,
  remoteRoot,
  remoteEmptyDir,
  remoteFiles
};
