declare module "ssh-client-wrapper" {
  type HostInfo = {
    host: string;
    user: string;
    port?: number;
    password?: string | (() => string);
    passphrase?: string | (() => string);
    keyFile?: string;
    noStrictHostKeyChecking?: boolean;
    ControlPersist?: number;
    ConnectTimeout?: number;
    maxRetry?: number;
    retryDuration?: number;
    rcfile?: string;
    prependCmd?: string;
    sshOpt?: string[];
  };

  class SshClientWrapper {
    constructor(hostInfo: HostInfo);
    exec(
      cmd: string,
      timeout?: number,
      outputCallback?: (data: string) => void,
      rcfile?: string,
      prependCmd?: string
    ): Promise<number>;
    execAndGetOutput(
      cmd: string,
      timeout?: number,
      rcfile?: string,
      prependCmd?: string
    ): Promise<{ output: string[]; rt: number }>;
    ls(
      target: string,
      lsOpt?: string[],
      timeout?: number
    ): Promise<string[] | number>;
    expect(
      cmd: string,
      expects: [string, string][],
      timeout?: number
    ): Promise<number>;
    send(
      src: string[],
      dst: string,
      opt?: string[],
      timeout?: number
    ): Promise<void>;
    recv(
      src: string[],
      dst: string,
      opt?: string[],
      timeout?: number
    ): Promise<void>;
    canConnect(timeout?: number): Promise<boolean>;
    disconnect(): Promise<void>;
  }

  export default SshClientWrapper;
}
