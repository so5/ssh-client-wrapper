[![npm version](https://badge.fury.io/js/ssh-client-wrapper.svg)](https://badge.fury.io/js/ssh-client-wrapper)
[![Known Vulnerabilities](https://snyk.io/test/github/so5/ssh-client-wrapper/badge.svg)](https://snyk.io/test/github/so5/ssh-client-wrapper)
[![Coverage Status](https://coveralls.io/repos/github/so5/ssh-client-wrapper/badge.svg?branch=main)](https://coveralls.io/github/so5/ssh-client-wrapper?branch=main)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=so5_ssh-client-wrapper&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=so5_ssh-client-wrapper)
# ssh-client-wrapper
open ssh client wrapper library for nodejs

## Installation
```bash
npm install ssh-client-wrapper
```

## Usage
Here is a simple example of how to use `ssh-client-wrapper` to execute a command on a remote server.

```javascript
import SshClientWrapper from 'ssh-client-wrapper';

const hostInfo = {
  host: 'remote.server.com',
  port: 22,
  user: 'username',
  password: 'password'
};

const ssh = new SshClientWrapper(hostInfo);

async function run() {
  try {
    await ssh.canConnect();
    console.log('Connection successful!');

    const { output, rt } = await ssh.execAndGetOutput('ls -l /home');
    if (rt === 0) {
      console.log('Directory listing:');
      output.forEach(line => console.log(line));
    } else {
      console.error('Error executing command');
    }
  } catch (err) {
    console.error('Connection or command failed:', err);
  } finally {
    ssh.disconnect();
  }
}

run();
```

## API Guide

### `new SshClientWrapper(hostInfo)`
Creates a new SSH client instance.

*   `hostInfo` (Object): Connection details for the remote host.
    *   `host` (string): The hostname or IP address of the server.
    *   `user` (string): The username for authentication.
    *   `port` (number, optional): The port number. Defaults to 22.
    *   `password` (string | Function, optional): The password for authentication, or a function that returns the password.
    *   `keyFile` (string, optional): The path to the private key file for key-based authentication.
    *   `passphrase` (string | Function, optional): The passphrase for the private key, or a function that returns it.
    *   `noStrictHostKeyChecking` (boolean, optional): If `true`, bypasses strict host key checking.
    *   `maxRetry` (number, optional): Max number of retries for a retryable error. Defaults to `3`.
    *   `retryDuration` (number, optional): Time (msec) to wait between each retry. Defaults to `1000`.
    *   `retryableExitCodes` (number[], optional): Additional rsync exit codes to treat as retryable for `.send()`/`.recv()`. See [Retry behavior for `.send()` / `.recv()`](#retry-behavior-for-send--recv) below.
    *   `replaceRetryableExitCodes` (boolean, optional): If `true`, `retryableExitCodes` replaces the built-in retryable exit code list instead of adding to it.
    *   And more... see `lib/index.js` for all available options.

### `.exec(cmd, [timeout], [outputCallback], [rcfile], [prependCmd])`
Executes a command on the remote host.

*   Returns: `Promise<number>` - The return code of the command.

### `.execAndGetOutput(cmd, [timeout], [rcfile], [prependCmd])`
Executes a command and returns its standard output.

*   Returns: `Promise<{output: string[], rt: number}>` - An object containing the output as an array of strings and the return code.

### `.ls(target, [lsOpt], [timeout])`
Executes the `ls` command on the remote host.

*   Returns: `Promise<string[]>` - The output of the `ls` command as an array of strings.

### `.expect(cmd, expects, [timeout])`
Executes a command and interacts with it, similar to the `expect` tool.

*   Returns: `Promise<number>` - The return code of the command.

### `.send(src, dst, [opt], [timeout], [retryableExitCodes], [replaceRetryableExitCodes])`
Uploads files or directories to the remote host using `rsync`.

*   `src` (string[]): An array of local paths to send.
*   `dst` (string): The remote destination path.
*   `retryableExitCodes` (number[], optional): Per-call override of retryable rsync exit codes for this call only (takes precedence over `hostInfo.retryableExitCodes`). See [Retry behavior for `.send()` / `.recv()`](#retry-behavior-for-send--recv).
*   `replaceRetryableExitCodes` (boolean, optional): If `true`, `retryableExitCodes` replaces the built-in default instead of adding to it. Defaults to `false`.
*   Returns: `Promise<void>`

### `.recv(src, dst, [opt], [timeout], [retryableExitCodes], [replaceRetryableExitCodes])`
Downloads files or directories from the remote host using `rsync`.

*   `src` (string[]): An array of remote paths to receive.
*   `dst` (string): The local destination path.
*   `retryableExitCodes` (number[], optional): Per-call override of retryable rsync exit codes for this call only (takes precedence over `hostInfo.retryableExitCodes`). See [Retry behavior for `.send()` / `.recv()`](#retry-behavior-for-send--recv).
*   `replaceRetryableExitCodes` (boolean, optional): If `true`, `retryableExitCodes` replaces the built-in default instead of adding to it. Defaults to `false`.
*   Returns: `Promise<void>`

### Retry behavior for `.send()` / `.recv()`

`.send()` and `.recv()` automatically retry (up to `hostInfo.maxRetry` times, default `3`, waiting `hostInfo.retryDuration` msec between attempts, default `1000`) when:

*   the underlying `rsync` process exits with one of the built-in retryable exit codes: `10, 11, 12, 13, 14` (I/O and protocol errors that are commonly transient), or
*   the SSH connection fails with a transient `kex_exchange_identification` error.

If your environment sees other rsync exit codes that should also be retried (for example on a shared HPC filesystem where a "partial transfer" exit code can occur while output files are still being flushed), you can add to or replace the retryable list without changing the library's default, at two levels:

*   **Per instance**, via `hostInfo.retryableExitCodes` / `hostInfo.replaceRetryableExitCodes` — applies to every `.send()`/`.recv()` call made through that `SshClientWrapper`.
*   **Per call**, via the trailing `retryableExitCodes` / `replaceRetryableExitCodes` arguments on `.send()`/`.recv()` — applies only to that call, and fully overrides the instance-level setting if provided.

By default (`replaceRetryableExitCodes: false`), `retryableExitCodes` is **added** to the built-in list — the common case, since it doesn't require knowing or repeating the built-in codes. Set `replaceRetryableExitCodes: true` to use `retryableExitCodes` verbatim instead (pass `[]` to disable exit-code-based retry entirely).

```javascript
// add exit codes 23 and 24 to the built-in retryable list, for every send/recv on this instance
const ssh = new SshClientWrapper({
  host: 'remote.server.com',
  user: 'username',
  password: 'password',
  retryableExitCodes: [23, 24]
});

// or, just for a single call:
await ssh.recv(['/remote/output/*'], './local-output', [], 0, [23, 24]);

// full replace: only retry on 23 for this call
await ssh.recv(['/remote/output/*'], './local-output', [], 0, [23], true);

// disable exit-code-based retry entirely for this call
await ssh.recv(['/remote/output/*'], './local-output', [], 0, [], true);
```

### `.remoteToRemoteCopy(src, dstHostInfo, dst, [opt], [timeout])`
Copies files or directories directly from this remote host to another remote host using `rsync` with SSH agent forwarding.

*   `src` (string[]): An array of file or directory paths on this (source) remote host.
*   `dstHostInfo` (Object): Destination host information (requires `host` property; optionally `user`, `port`, `noStrictHostKeyChecking`).
*   `dst` (string): Destination path on the destination remote host.
*   `opt` (string[], optional): Additional options for rsync (e.g., `["--exclude=*.log"]`).
*   `timeout` (number, optional): Timeout in seconds.
*   Returns: `Promise<void>`

**Note:** This method requires SSH agent forwarding to be enabled. Your SSH key must be loaded in the SSH agent on localhost, and the connection to the source host must forward the agent. No password or keyFile is needed for the source → destination connection as it uses the forwarded SSH agent.

**Example:**
```javascript
const srcHost = new SshClientWrapper({
  host: 'source.server.com',
  user: 'user1',
  keyFile: '/path/to/key'
});

const dstHostInfo = {
  host: 'destination.server.com',
  user: 'user2'
};

// Copy files directly from source to destination
await srcHost.remoteToRemoteCopy(
  ['/remote/path/file.txt', '/remote/path/dir/'],
  dstHostInfo,
  '/destination/path/',
  ['--exclude=*.tmp']
);
```

### `.canConnect([timeout])`
Checks if a connection to the remote host can be established.

*   Returns: `Promise<boolean>` - Resolves with `true` on success.

### `.disconnect()`
Closes the master SSH connection to the remote host.
