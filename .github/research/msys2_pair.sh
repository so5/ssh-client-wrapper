#!/bin/bash
# Research script, run by MSYS2 bash (the harness needs coreutils; the checks with a PATH without MSYS2 are in the workflow).
export PATH=/usr/bin:$PATH
M=/c/msys64/usr/bin
WP=$(cygpath -u "$USERPROFILE")
WPW=$(cygpath -w "$WP")
U=$USERNAME
OPT="-o StrictHostKeyChecking=no -o BatchMode=yes -o LogLevel=ERROR"
SOA="-F $WP/.ssh/config -o UserKnownHostsFile=$WP/.ssh/known_hosts -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o LogLevel=ERROR"
SO="$SOA -i $WP/.ssh/id_rsa"
HOST=$U@localhost
sec() { echo; echo "########## $*"; }
run() { echo "\$ $*"; "$@"; echo "[exit $?]"; }
echo "PATH=$PATH"; echo "USERPROFILE=$USERPROFILE ; HOME=$HOME ; user=$U"

sec "A0 rsync.exe/ssh.exe started with a PATH without MSYS2 (is the runtime found next to the exe?)"
run $M/rsync.exe --version | head -1
run $M/ssh.exe -V
echo "dll dependencies:"; run $M/ldd $M/rsync.exe
run $M/ldd $M/ssh.exe
echo "sizes:"; ls -l $M/rsync.exe $M/ssh.exe $M/msys-2.0.dll | awk '{print $5, $9}'

sec "A1 minimal bundle: copy rsync.exe ssh.exe and their dlls to an empty dir and run from there"
B=$RUNNER_TEMP/bundle; B=$(cygpath -u "$B"); rm -rf "$B"; mkdir -p "$B"
for f in rsync.exe ssh.exe; do cp $M/$f "$B/"; done
for f in $($M/ldd $M/rsync.exe $M/ssh.exe | awk '/=>/ {print $3}' | grep -i msys64 | sort -u); do cp "$f" "$B/"; done
ls -l "$B" | awk '{print $5, $9}'
run "$B/rsync.exe" --version | head -1
run "$B/ssh.exe" -V
du -sk "$B"

mkdir -p "$WP/.ssh"; touch "$WP/.ssh/config"
sec "B1 HOME: default MSYS2 HOME behaviour"
run $M/bash.exe -c 'echo HOME=$HOME; ls -la ~ 2>&1 | head -5'
run $M/ssh.exe -G localhost | grep -iE "^(identityfile|userknownhostsfile|user) "
echo "-- ssh with default HOME (expected: no key found)"
run $M/ssh.exe $OPT $U@localhost 'echo remote-ok'

sec "B2 HOME=Windows profile (HOME given to the child process)"
export HOME=$WP   # NOTE: MSYS2 ssh takes the home from the passwd database, not from $HOME
run $M/ssh.exe -G localhost | grep -iE "^(identityfile|userknownhostsfile) "
rm -f "$WP/.ssh/known_hosts"
echo "-- known_hosts is written to the Windows profile; default key id_rsa is used"
run $M/ssh.exe $SO $U@localhost 'echo remote-ok; echo HOME_remote=$HOME'
ls -l "$WP/.ssh/" | awk '{print $5, $9}'
echo "-- Win32 OpenSSH reads the same known_hosts (BatchMode, strict)"
run /c/Windows/System32/OpenSSH/ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=yes $U@localhost 'echo win32-remote-ok'
echo "-- ssh_config in the Windows profile, with alias, ~/ and C:/ forms of IdentityFile"
cat > "$WP/.ssh/config" <<CFG
Host r4w-a
  HostName localhost
  User $U
  IdentityFile ~/.ssh/id_rsa
Host r4w-b
  HostName localhost
  User $U
  IdentityFile $WPW\\.ssh\\id_rsa
Host r4w-c
  HostName localhost
  User $U
  IdentityFile C:/Users/$U/.ssh/id_rsa
CFG
for h in r4w-a r4w-b r4w-c; do echo "== $h"; run $M/ssh.exe $SOA $h 'echo ok-via-alias'; done
echo "-- same aliases with Win32 OpenSSH for reference"
run /c/Windows/System32/OpenSSH/ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new r4w-a 'echo ok-via-alias'
echo "-- rsync with alias host and HOME=profile (the full pair, not in PATH)"
mkdir -p "$RUNNER_TEMP/h" ; echo hello > "$(cygpath -u "$RUNNER_TEMP")/h/f.txt"
run $M/rsync.exe -e "$M/ssh.exe $SO" "$(cygpath -u "$RUNNER_TEMP")/h/f.txt" $HOST:r4w-home-test/
run $M/ssh.exe $SO $HOST 'ls -l ~/r4w-home-test; pwd'
echo "-- -e with a path containing spaces (copy of the bundle to 'Program Files'-like dir)"
S="$(cygpath -u "$RUNNER_TEMP")/Prog Files/r4w"; mkdir -p "$S"; cp "$B"/* "$S/"
run "$S/rsync.exe" -e "\"$S/ssh.exe\" $SO" "$(cygpath -u "$RUNNER_TEMP")/h/f.txt" $HOST:r4w-home-test/spaces/
run $M/ssh.exe $SO $HOST 'ls -R ~/r4w-home-test'

sec "C0 how rsync.exe is told the ssh: RSYNC_RSH vs -e, and what the child sees as env"
run env | grep -iE "^(HOME|USERPROFILE|SSH_|MSYS|PATH)="
echo "-- spawned from Node (like scw): child_process with env HOME=USERPROFILE and a PATH without MSYS2"
cat > "$(cygpath -u "$RUNNER_TEMP")/spawn.js" <<JS
const { spawnSync } = require("child_process");
const env = { ...process.env, HOME: process.env.USERPROFILE, HOST: process.env.HOST, SO: process.env.SO };
const r = spawnSync("C:\\\\msys64\\\\usr\\\\bin\\\\rsync.exe", ["-e", "C:\\\\msys64\\\\usr\\\\bin\\\\ssh.exe -o BatchMode=yes", "--version"], { env, encoding: "utf8" });
console.log("status", r.status, (r.stdout||"").split("\n")[0], r.stderr);
const r2 = spawnSync("C:\\\\msys64\\\\usr\\\\bin\\\\rsync.exe", ["-e", "C:\\\\msys64\\\\usr\\\\bin\\\\ssh.exe " + process.env.SO, process.env.RUNNER_TEMP.replace(/\\\\/g,"/").replace(/^([A-Za-z]):/, (m,d)=>"/"+d.toLowerCase()) + "/h/f.txt", process.env.HOST + ":r4w-home-test/node/"], { env, encoding: "utf8" });
console.log("node-spawn rsync status", r2.status, r2.stdout, r2.stderr);
JS
export HOST SO
run node "$(cygpath -w "$RUNNER_TEMP")\\spawn.js"
run $M/ssh.exe $SO $HOST 'ls -R ~/r4w-home-test/node'

sec "D1 path forms accepted by MSYS2 rsync as a LOCAL path"
T=$(cygpath -u "$RUNNER_TEMP")/pf; rm -rf "$T"; mkdir -p "$T/src" "$T/日本語"; echo a > "$T/src/a.txt"; echo j > "$T/日本語/あ.txt"
TW=$(cygpath -w "$T"); TM=$(cygpath -m "$T")
case_() { echo "== $1"; shift; "$@"; echo "[exit $?]"; }
case_ "drive backslash   $TW\\src\\a.txt" $M/rsync.exe -e "$M/ssh.exe $SO" "$TW\\src\\a.txt" $HOST:r4w-home-test/pf1/
case_ "drive forward     $TM/src/a.txt" $M/rsync.exe -e "$M/ssh.exe $SO" "$TM/src/a.txt" $HOST:r4w-home-test/pf2/
case_ "./ prefix + drive ./$TW\\src\\a.txt" $M/rsync.exe -e "$M/ssh.exe $SO" "./$TW\\src\\a.txt" $HOST:r4w-home-test/pf3/
case_ "/cygdrive form" $M/rsync.exe -e "$M/ssh.exe $SO" "/cygdrive/c/${T#/c/}/src/a.txt" $HOST:r4w-home-test/pf4/
case_ "msys /c/ form" $M/rsync.exe -e "$M/ssh.exe $SO" "$T/src/a.txt" $HOST:r4w-home-test/pf5/
case_ "UNC-ish //localhost/c\$/..." $M/rsync.exe -e "$M/ssh.exe $SO" "//localhost/c\$/${T#/c/}/src/a.txt" $HOST:r4w-home-test/pf6/
case_ "pull to drive dir (backslash)" $M/rsync.exe -e "$M/ssh.exe $SO" $HOST:r4w-home-test/pf1/a.txt "$TW\\pulled\\"
case_ "pull to forward-slash dir" $M/rsync.exe -e "$M/ssh.exe $SO" $HOST:r4w-home-test/pf1/a.txt "$TM/pulled2/"
case_ "Japanese file name push" $M/rsync.exe -e "$M/ssh.exe $SO" -r "$T/日本語" $HOST:r4w-home-test/jp/
run $M/ssh.exe $SO $HOST 'ls -R ~/r4w-home-test | head -40'
ls -R "$T" | head -20

sec "D2 exit codes and progress output"
case_ "missing source (expect 23)" $M/rsync.exe -e "$M/ssh.exe $SO" "$T/none" $HOST:r4w-home-test/x/
case_ "unreachable host (expect 255 -> rsync 12)" $M/rsync.exe -e "$M/ssh.exe $SO -o ConnectTimeout=3" "$T/src/a.txt" nohost.invalid:x/

sec "E1 ssh-agent: Windows ssh-agent service and MSYS2 ssh"
powershell.exe -NoProfile -Command "Set-Service ssh-agent -StartupType Manual; Start-Service ssh-agent; Get-Service ssh-agent | Format-List Name,Status"
cat > "$(cygpath -u "$RUNNER_TEMP")/askpass.bat" <<'BAT'
@echo off
echo pass123
BAT
export SSH_ASKPASS="$(cygpath -w "$RUNNER_TEMP")\\askpass.bat" SSH_ASKPASS_REQUIRE=force DISPLAY=x
W32=/c/Windows/System32/OpenSSH
echo "-- add the passphrase key to the Windows agent with Win32 ssh-add"
run $W32/ssh-add.exe "$WPW\\.ssh\\id_pass"
run $W32/ssh-add.exe -l
unset SSH_ASKPASS SSH_ASKPASS_REQUIRE DISPLAY
echo "-- Win32 ssh uses the agent for the passphrase key (control)"
run $W32/ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o IdentityFile="$WPW\\.ssh\\id_pass" $U@localhost 'echo win32-agent-ok'
echo "-- MSYS2 ssh-add -l against the Windows agent, several SSH_AUTH_SOCK spellings"
for sock in '' '\\.\pipe\openssh-ssh-agent' '//./pipe/openssh-ssh-agent' '/proc/self/root/pipe/openssh-ssh-agent'; do
  echo "== SSH_AUTH_SOCK='$sock'"
  SSH_AUTH_SOCK="$sock" run $M/ssh-add.exe -l
  SSH_AUTH_SOCK="$sock" run $M/ssh.exe $SOA -o IdentitiesOnly=yes -o IdentityFile="$WP/.ssh/id_pass" $U@localhost 'echo msys-agent-ok'
done
echo "-- MSYS2 own ssh-agent (started by the app), key added with askpass"
eval "$($M/ssh-agent.exe -s)"; echo "agent sock: $SSH_AUTH_SOCK"
export SSH_ASKPASS="$(cygpath -w "$RUNNER_TEMP")\\askpass.bat" SSH_ASKPASS_REQUIRE=force DISPLAY=x
run $M/ssh-add.exe "$WP/.ssh/id_pass"
unset SSH_ASKPASS SSH_ASKPASS_REQUIRE DISPLAY
run $M/ssh-add.exe -l
run $M/ssh.exe $SOA -o IdentitiesOnly=yes -o IdentityFile="$WP/.ssh/id_pass" $U@localhost 'echo own-agent-ok'
run $M/rsync.exe -e "$M/ssh.exe $SOA -o IdentitiesOnly=yes -o IdentityFile=$WP/.ssh/id_pass" "$T/src/a.txt" $U@localhost:r4w-home-test/agent/
kill $SSH_AGENT_PID 2>/dev/null; unset SSH_AUTH_SOCK
echo "-- passphrase key WITHOUT any agent, BatchMode (expected: fails; SSH_ASKPASS is the app's way to ask)"
run $M/ssh.exe $SOA -o IdentitiesOnly=yes -o IdentityFile="$WP/.ssh/id_pass" $U@localhost 'echo noagent-ok'

sec "F1 test-environment artifacts: exec permission through the remote bash (DefaultShell)"
run $M/ssh.exe $SO $HOST 'cd ~/r4w-home-test && echo "echo hoge" > hoge && chmod ugo-x hoge && ls -l hoge && ./hoge; echo "rc=$?"; id; stat -c "%A %U" hoge'
run $M/ssh.exe $SO $HOST 'cd ~/r4w-home-test && echo "echo hoge" > hoge2 && chmod 000 hoge2 && ./hoge2; echo "rc=$?"; bash ./hoge2; echo "rc(bash file)=$?"'
echo "-- home of the remote and /home/testuser"
run $M/ssh.exe $SO $HOST 'echo $HOME; pwd; ls -ld /home/testuser'
echo "-- ControlMaster with MSYS2 ssh"
run $M/ssh.exe -o ControlMaster=auto -o ControlPath=/tmp/cm-%C -o ControlPersist=30 r4w-a 'echo via-master'
run $M/ssh.exe -O check -o ControlPath=/tmp/cm-%C r4w-a
run $M/ssh.exe -O exit -o ControlPath=/tmp/cm-%C r4w-a
sec "G1 nsswitch db_home: windows (home from the Windows profile for the MSYS2 programs)"
cat /c/msys64/etc/nsswitch.conf | grep -v '^#' | grep -v '^$'
echo "-- (a) bundle layout with its own /etc: root/usr/bin + root/etc/nsswitch.conf"
R=$(cygpath -u "$RUNNER_TEMP")/b2; rm -rf "$R"; mkdir -p "$R/usr/bin" "$R/etc"; cp "$B"/* "$R/usr/bin/"
printf 'passwd: files db\ngroup: files db\ndb_home: windows\ndb_shell: /usr/bin/bash\ndb_gecos: windows\n' > "$R/etc/nsswitch.conf"
run "$R/usr/bin/ssh.exe" -G localhost | grep -iE "^userknownhostsfile "
echo "-- (b) installed MSYS2: nsswitch db_home variants had NO effect in the previous run; try a directory junction /home/<user> -> profile"
rm -f /c/msys64/etc/nsswitch.conf.bak
powershell.exe -NoProfile -Command "New-Item -ItemType Junction -Path C:\\msys64\\home\\$U -Target C:\\Users\\$U | Out-Null; Get-Item C:\\msys64\\home\\$U | Format-List FullName,LinkType,Target"
ls -ld /home/$U/.ssh
$M/ssh.exe -G localhost | grep -iE "^userknownhostsfile "
echo "-- now without -F / -i / UserKnownHostsFile: alias r4w-a (IdentityFile ~/.ssh/id_rsa), default key, known_hosts"
rm -f "$WP/.ssh/known_hosts"
run $M/ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new r4w-a 'echo ok-via-alias-home; echo $HOME'
run $M/ssh.exe -o BatchMode=yes $U@localhost 'echo ok-default-key'
echo "-- Win32 OpenSSH shares that known_hosts (strict)"
run /c/Windows/System32/OpenSSH/ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=yes $U@localhost 'echo win32-shares-known-hosts'
echo "-- rsync + ssh with no extra options at all"
run $M/rsync.exe -e $M/ssh.exe "$T/src/a.txt" r4w-a:r4w-home-test/plain/
echo "-- passphrase key: agent via the Windows pipe still unusable; own agent unchanged"
echo "-- exec permission (F1) with the real alias"
run $M/ssh.exe r4w-a 'cd ~/r4w-home-test && echo "echo hoge" > hoge && chmod ugo-x hoge && ls -l hoge; ./hoge; echo "rc=$?"; id -un; stat -c "%A %U" hoge; echo HOME=$HOME'
run $M/ssh.exe r4w-a 'cd ~/r4w-home-test && echo "echo hoge" > hoge2 && chmod 000 hoge2 && ./hoge2; echo "rc=$?"'
echo "-- remote home and /home/testuser"
run $M/ssh.exe r4w-a 'echo $HOME; pwd; ls -ld /home/testuser'
echo "-- ControlMaster with MSYS2 ssh"
run $M/ssh.exe -o ControlMaster=auto -o ControlPath=/tmp/cm-%C -o ControlPersist=30 r4w-a 'echo via-master'
run $M/ssh.exe -O check -o ControlPath=/tmp/cm-%C r4w-a
run $M/ssh.exe -O exit -o ControlPath=/tmp/cm-%C r4w-a
echo "-- D1 again with the plain setup (path forms)"
for f in "$TW\\src\\a.txt" "$TM/src/a.txt" "./$TW\\src\\a.txt" "/cygdrive/c/${T#/c/}/src/a.txt" "$T/src/a.txt"; do echo "== $f"; $M/rsync.exe -e $M/ssh.exe "$f" r4w-a:r4w-home-test/pf/; echo "[exit $?]"; done
echo "== Japanese names"; $M/rsync.exe -e $M/ssh.exe -r "$T/日本語" r4w-a:r4w-home-test/jp/; echo "[exit $?]"
$M/ssh.exe r4w-a 'ls -R ~/r4w-home-test/jp ~/r4w-home-test/pf'
echo "== missing source (expect 23)"; $M/rsync.exe -e $M/ssh.exe r4w-a:r4w-home-test/none "$T/"; echo "[exit $?]"
echo "== pull to drive-letter dir"; $M/rsync.exe -e $M/ssh.exe r4w-a:r4w-home-test/plain/a.txt "$TW\\pulled\\"; echo "[exit $?]"
echo "== pull with ./ prefix"; mkdir -p "$T/pl"; (cd "$T" && $M/rsync.exe -e $M/ssh.exe r4w-a:r4w-home-test/plain/a.txt ./pl/); echo "[exit $?]"; ls -R "$T/pl"
sec "G2 (fstab /home mount and nsswitch db_home were tried and have no effect: see earlier runs; the junction stays for the integration tests)"
sec "H1 post-quantum warning: WarnWeakCrypto no (OpenSSH 10.1+) in the profile config"
printf 'Host *\n  WarnWeakCrypto no\n' >> "$WP/.ssh/config"
run $M/ssh.exe -F "$WP/.ssh/config" -i "$WP/.ssh/id_rsa" -o UserKnownHostsFile="$WP/.ssh/known_hosts" -o BatchMode=yes $U@localhost 'echo no-warning-expected'
sec "done"
# run 1794820530: with lib/winRsync.js merged
# run 1794821789: glob fix merged
# run 1794822199: CRLF test fix merged
