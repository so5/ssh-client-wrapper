#!/bin/bash
set -e

echo "=== Starting SSH Client Wrapper Tests with Dual Hosts ==="

# Start both testbed containers
echo "Starting testbed containers..."
docker compose up testbed testbed2 -d

# Wait for containers to be ready
sleep 5

# Set test environment variables
export TEST_HOST=localhost
export TEST_USER=testuser
export TEST_PW=passw0rd
export TEST_PORT=4100
# For remoteToRemoteCopy tests:
# - From host machine (for verification): use localhost:4101
# - From inside testbed container (for rsync): use testbed2:22
# The dstHostInfo in tests will use testbed2:22 for the actual copy
# but we also need localhost:4101 for verification
export TEST_HOST2=testbed2  # Internal Docker hostname for SSH from testbed
export TEST_HOST2_VERIFY=localhost  # External hostname for verification from test
export TEST_USER2=testuser
export TEST_PORT2=22  # Internal Docker port
export TEST_PORT2_VERIFY=4101  # External port for verification

# Remove old host keys
ssh-keygen -R '[localhost]:4100' 2>/dev/null || true
ssh-keygen -R '[localhost]:4101' 2>/dev/null || true

# Create test SSH key directory
TEST_KEY_DIR="./.test-ssh-keys"
TEST_KEY_FILE="$TEST_KEY_DIR/id_rsa"
mkdir -p "$TEST_KEY_DIR"

# Always generate fresh SSH key for testing
echo "Generating test SSH key..."
rm -f "$TEST_KEY_FILE" "$TEST_KEY_FILE.pub"
ssh-keygen -t rsa -b 2048 -f "$TEST_KEY_FILE" -N "" -C "test-key-for-ssh-client-wrapper" >/dev/null 2>&1

# Start ssh-agent and add key
echo "Starting ssh-agent..."
eval "$(ssh-agent -s)"
ssh-add "$TEST_KEY_FILE"

# Install SSH key to both testbed containers using docker exec
echo "Setting up SSH key authentication on testbed containers..."
PUB_KEY=$(cat "$TEST_KEY_FILE.pub")

# Install to testbed (port 4100)
docker exec testbed bash -c "mkdir -p /home/$TEST_USER/.ssh && echo '$PUB_KEY' > /home/$TEST_USER/.ssh/authorized_keys && chmod 700 /home/$TEST_USER/.ssh && chmod 600 /home/$TEST_USER/.ssh/authorized_keys && chown -R $TEST_USER:$TEST_USER /home/$TEST_USER/.ssh"

# Install to testbed2 (port 4101)
docker exec testbed2 bash -c "mkdir -p /home/$TEST_USER/.ssh && echo '$PUB_KEY' > /home/$TEST_USER/.ssh/authorized_keys && chmod 700 /home/$TEST_USER/.ssh && chmod 600 /home/$TEST_USER/.ssh/authorized_keys && chown -R $TEST_USER:$TEST_USER /home/$TEST_USER/.ssh"

# Verify SSH key authentication works
echo "Verifying SSH key authentication..."
if ! ssh -o StrictHostKeyChecking=no -o BatchMode=yes -p 4100 ${TEST_USER}@localhost "echo 'testbed1 connection OK'"; then
  echo "ERROR: SSH key auth to testbed1 failed"
  docker compose down
  exit 1
fi

if ! ssh -o StrictHostKeyChecking=no -o BatchMode=yes -p 4101 ${TEST_USER}@localhost "echo 'testbed2 connection OK'"; then
  echo "ERROR: SSH key auth to testbed2 failed"
  docker compose down
  exit 1
fi

echo "✓ SSH authentication verified on both hosts"

# Enable SSH key for tests
export TEST_KEYFILE="$TEST_KEY_FILE"

echo "Running tests..."
# Run tests
npm run test
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
  echo "✓ All tests passed!"
else
  echo "✗ Tests failed with exit code: $TEST_RESULT"
fi

# Cleanup
if [ x${1} != xkeep ]; then
  echo "Cleaning up..."
  # Kill ssh-agent
  if [ -n "$SSH_AGENT_PID" ]; then
    kill $SSH_AGENT_PID 2>/dev/null || true
  fi
  
  docker compose down
  
  # Clean up test SSH keys
  rm -f "$TEST_KEY_FILE" "$TEST_KEY_FILE.pub"
fi

exit $TEST_RESULT
