//implementations which are not rsync itself but speak its protocol. they report themselves in the parentheses of the version line.
//example: "rsync  version 0.3.10  (gokrazy/rsync)"
const knownImplementations = ["gokrazy", "rsync4win"];

/**
 * parse the output of "rsync --version".
 * @param {string} output - output of rsync --version
 * @returns {object} - {major, minor, patch, implementation}. empty object if the version line is not found.
 * implementation is set only for the known implementations which are not rsync itself.
 */
export function parseRsyncVersion(output) {
  const result = /^rsync *version *(\d+)\.(\d+)\.(\d+)(.*)$/m.exec(output);
  if (!result) {
    return {};
  }
  const version = {
    major: Number(result[1]),
    minor: Number(result[2]),
    patch: Number(result[3])
  };
  const implementation = knownImplementations.find((e)=>{
    return result[4].toLowerCase().includes(e);
  });
  if (implementation) {
    version.implementation = implementation;
  }
  return version;
}

/**
 * check if the rsync takes only the first one of the remote sources when it receives several of them.
 * gokrazy/rsync (the engine of rsync4win) does so, so scw runs rsync once per remote source.
 * @param {object} version - rsync version object
 * @returns {boolean} - true if the rsync has to be run once per remote source
 */
export function needsOneRunPerSource(version) {
  return Boolean(version) && knownImplementations.includes(version.implementation);
}
