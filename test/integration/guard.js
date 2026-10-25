import { canConnect, disconnect } from "../../lib/sshExec.js";
import hostInfo, { hostInfo2Verify } from "../testUtil/hostInfo.js";

const readme = "See \"Running the tests\" in README.md. run_test_local.sh prepares everything with Docker.";
const unitHint = "To run only the tests which need no host, use \"npm run test:unit\" (the integration tests are NOT run then).";

//a host is checked only once per run even if several test files require it
const checked = new Map();

/**
 * log in to the host and fail with a message which tells what to check.
 * @param {string} role - role of the host in the tests
 * @param {object} info - hostInfo object of the host
 * @param {string[]} variables - environment variables which configure the host
 */
function checkHost(role, info, variables) {
  const key = `${info.user}@${info.host}:${info.port}`;
  if (!checked.has(key)) {
    const target = { ...info };
    checked.set(key, canConnect(target, 20).catch(async (e)=>{
      //a failed connection leaves its pty behind, which keeps mocha from exiting
      await disconnect(target).catch(()=>{});
      throw new Error([
        `Integration tests can not log in to the ${role} (${key}): ${e.message}`,
        `Check ${variables.join(", ")} and the password (TEST_PW) or the key (TEST_KEYFILE, ssh-agent) of the test host.`,
        readme
      ].join("\n"));
    }));
  }
  return checked.get(key);
}

/**
 * make the whole run fail at the beginning, with a clear message, if the test hosts are not available.
 * Without it, a wrong setting shows up as timeouts of hooks in the middle of the tests.
 * @param {object} [option] - options
 * @param {boolean} [option.secondHost] - the tests also need the second host (TEST_HOST2)
 */
export function requireTestHosts({ secondHost = false } = {}) {
  before("check test hosts", async function () {
    this.timeout(60000);
    const required = secondHost ? ["TEST_HOST", "TEST_HOST2"] : ["TEST_HOST"];
    const missing = required.filter((name)=>{
      return !process.env[name];
    });
    if (missing.length > 0) {
      throw new Error([
        `Integration tests need test hosts, but these environment variables are not set: ${missing.join(", ")}`,
        readme,
        unitHint
      ].join("\n"));
    }
    await checkHost("test host", hostInfo, ["TEST_HOST", "TEST_PORT", "TEST_USER"]);
    if (secondHost) {
      await checkHost("second test host", hostInfo2Verify, ["TEST_HOST2_VERIFY", "TEST_PORT2_VERIFY", "TEST_USER2"]);
    }
  });
}
