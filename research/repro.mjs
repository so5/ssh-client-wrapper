//standalone reproduction without scw: spawn ssh.exe N times and count the runs which do not finish
import { spawn as ptySpawn } from "node-pty";
import { spawn as cpSpawn, execFileSync } from "child_process";

const mode = process.env.REPRO_MODE || "pty";
const count = Number(process.env.REPRO_COUNT || 150);
const limit = Number(process.env.REPRO_LIMIT || 15000);
const sshArgs = ["localhost", "-l", "testuser", "-p", "10022", "-i", `${process.env.USERPROFILE}\\.ssh\\id_rsa`, "-oStrictHostKeyChecking=no", "-oUserKnownHostsFile=NUL", "-oNumberOfPasswordPrompts=1", "echo", "hello"];
const ssh = "C:\\Windows\\System32\\OpenSSH\\ssh.exe";

function runPty() {
  return new Promise((resolve)=>{
    const p = ptySpawn(ssh, sshArgs, { windowsHide: true });
    let out = "";
    const t = setTimeout(()=>{
      let info = "";
      try {
        info = execFileSync("powershell", ["-NoProfile", "-Command", `Get-Process -Id ${p.pid} | Select-Object Id,@{n='Thr';e={$_.Threads.Count}},CPU | ConvertTo-Json -Compress`]).toString().trim();
      } catch (e) {
        info = `pid ${p.pid} not found`;
      }
      resolve({ hung: true, info, out });
      try { p.kill(); } catch {}
    }, limit);
    p.onData((d)=>{ out += d; });
    p.onExit(({ exitCode })=>{ clearTimeout(t); resolve({ hung: false, exitCode, out }); });
  });
}
function runSpawn() {
  return new Promise((resolve)=>{
    const p = cpSpawn(ssh, sshArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(()=>{ resolve({ hung: true, info: `pid ${p.pid}`, out }); p.kill(); }, limit);
    p.stdout.on("data", (d)=>{ out += d; });
    p.on("exit", (exitCode)=>{ clearTimeout(t); resolve({ hung: false, exitCode, out }); });
  });
}
function runAdd() {
  return new Promise((resolve)=>{
    const p = ptySpawn("C:\\Windows\\System32\\OpenSSH\\ssh-add.exe", ["-l"], { windowsHide: true });
    p.onExit(()=>{ try { p.kill(); } catch {} resolve(); });
  });
}
let hung = 0;
let bad = 0;
const t0 = Date.now();
for (let i = 0; i < count; i++) {
  if (mode === "pty-sshadd") {
    await runAdd();
  }
  const s = Date.now();
  const r = mode === "spawn" ? await runSpawn() : await runPty();
  const ok = !r.hung && r.exitCode === 0 && /hello/.test(r.out);
  if (r.hung) {
    hung++;
  } else if (!ok) {
    bad++;
  }
  if (!ok) {
    console.log(`#${i} ${r.hung ? "HUNG " + r.info : "exit=" + r.exitCode}`);
  }
}
console.log(`mode=${mode} count=${count} hung=${hung} bad=${bad} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);
