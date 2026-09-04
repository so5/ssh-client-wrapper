declare module "ssh-client-wrapper" {
  type HostInfo = {
    host: string;
    user: string;
    port?: number;
    password?: string | (() => string | Promise<string>);
    passphrase?: string | (() => string | Promise<string>);
    keyFile?: string;
    noStrictHostKeyChecking?: boolean;
    ControlPersist?: number;
    ConnectTimeout?: number;
    ControlPersistDir?: string;
    maxRetry?: number;
    retryDuration?: number;
    retryableExitCodes?: number[];
    replaceRetryableExitCodes?: boolean;
    rcfile?: string;
    prependCmd?: string;
    sshOpt?: string[];
    useAgent?: boolean;
    identityAgent?: string;
    agentKeyTTL?: number;
    reauthRequired?: () => void;
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
      timeout?: number,
      retryableExitCodes?: number[],
      replaceRetryableExitCodes?: boolean
    ): Promise<void>;
    recv(
      src: string[],
      dst: string,
      opt?: string[],
      timeout?: number,
      retryableExitCodes?: number[],
      replaceRetryableExitCodes?: boolean
    ): Promise<void>;
    canConnect(timeout?: number): Promise<boolean>;
    remoteToRemoteCopy(
      src: string[],
      dstHostInfo: HostInfo,
      dst: string,
      opt?: string[],
      timeout?: number
    ): Promise<void>;
    disconnect(): Promise<void>;
    dispose(): Promise<void>;
  }

  export default SshClientWrapper;
}
