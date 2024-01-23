"use strict";
module.exports = {
  host: process.env.TEST_HOST || "localhost",
  user: process.env.TEST_USER || null,
  port: process.env.TEST_PORT || null,
  password: process.env.TEST_PW,
  passphrase: process.env.TEST_PH,
  keyFile: process.env.TEST_PRIVATE_KEY,
  noStrictHostkeyChecking: true
};
