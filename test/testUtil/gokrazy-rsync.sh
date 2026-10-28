#!/bin/sh
# "rsync" command which runs gokrazy/rsync (gokr-rsync), the engine of rsync4win.
# Put it in PATH under the name "rsync" to run the tests with gokrazy/rsync instead of rsync.
# It only adds the version line which ssh-client-wrapper parses: gokr-rsync prints "gokrazy/rsync v0.3.10".
if [ "$1" = "--version" ]; then
  version=$(gokr-rsync --version 2>/dev/null | sed -n 's#^gokrazy/rsync v##p' | head -1)
  echo "rsync  version ${version:-0.0.0}  (gokrazy/rsync)"
  exit 0
fi
exec gokr-rsync "$@"
