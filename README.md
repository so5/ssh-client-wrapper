[![npm version](https://badge.fury.io/js/ssh-client-wrapper.svg)](https://badge.fury.io/js/ssh-client-wrapper)
[![Known Vulnerabilities](https://snyk.io/test/github/so5/ssh-client-wrapper/badge.svg)](https://snyk.io/test/github/so5/ssh-client-wrapper)
[![Test Coverage](https://api.codeclimate.com/v1/badges/3f9cba3c4f04d90561e3/test_coverage)](https://codeclimate.com/github/so5/ssh-client-wrapper/test_coverage)
[![Maintainability](https://api.codeclimate.com/v1/badges/8f3c0ea00e755ae31081/maintainability)](https://codeclimate.com/github/so5/ssh-client-wrapper/maintainability)
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

### `.send(src, dst, [opt], [timeout])`
Uploads files or directories to the remote host using `rsync`.

*   `src` (string[]): An array of local paths to send.
*   `dst` (string): The remote destination path.
*   Returns: `Promise<void>`

### `.recv(src, dst, [opt], [timeout])`
Downloads files or directories from the remote host using `rsync`.

*   `src` (string[]): An array of remote paths to receive.
*   `dst` (string): The local destination path.
*   Returns: `Promise<void>`

### `.canConnect([timeout])`
Checks if a connection to the remote host can be established.

*   Returns: `Promise<boolean>` - Resolves with `true` on success.

### `.disconnect()`
Closes the master SSH connection to the remote host.
