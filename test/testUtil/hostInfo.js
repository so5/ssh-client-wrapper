export default {
  host: process.env.TEST_HOST || "localhost",
  user: process.env.TEST_USER || null,
  port: process.env.TEST_PORT || 22,
  password: process.env.TEST_PW,
  passphrase: process.env.TEST_PH,
  keyFile: process.env.TEST_KEYFILE || process.env.TEST_PRIVATE_KEY,
  noStrictHostkeyChecking: true
};

//hostInfo2 for remoteToRemoteCopy - uses internal Docker network hostname
export const hostInfo2 = {
  host: process.env.TEST_HOST2 || process.env.TEST_HOST || "localhost",
  user: process.env.TEST_USER2 || process.env.TEST_USER || null,
  port: process.env.TEST_PORT2 || 22,
  password: process.env.TEST_PW,
  passphrase: process.env.TEST_PH,
  keyFile: process.env.TEST_KEYFILE || process.env.TEST_PRIVATE_KEY,
  noStrictHostkeyChecking: true
};

//hostInfo2Verify for test verification - uses external hostname/port
export const hostInfo2Verify = {
  host: process.env.TEST_HOST2_VERIFY || process.env.TEST_HOST2 || "localhost",
  user: process.env.TEST_USER2 || process.env.TEST_USER || null,
  port: process.env.TEST_PORT2_VERIFY || process.env.TEST_PORT2 || 22,
  password: process.env.TEST_PW,
  passphrase: process.env.TEST_PH,
  keyFile: process.env.TEST_KEYFILE || process.env.TEST_PRIVATE_KEY,
  noStrictHostkeyChecking: true
};
