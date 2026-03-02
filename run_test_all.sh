#!/bin/bash
function cleanup(){
  docker compose down
}
trap cleanup EXIT
set -e -o pipefail

# Run local tests first (this sets up SSH agent on host)
./run_test_local.sh keep

# For Docker-based tests, we need to set up SSH agent inside containers
# Update the compose command to include SSH agent setup
echo "Running tests in Docker containers..."

# Test on latest ubuntu
echo "Testing on latest ubuntu..."
docker compose run --rm -e TEST_USE_SSH_AGENT=1 tester bash -c '
  # Generate SSH key inside container
  mkdir -p /root/.test-ssh-keys
  ssh-keygen -t rsa -b 2048 -f /root/.test-ssh-keys/id_rsa -N "" -C "test-key" >/dev/null 2>&1
  
  # Start ssh-agent
  eval "$(ssh-agent -s)"
  ssh-add /root/.test-ssh-keys/id_rsa
  
  # Install SSH key to both testbed containers
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed2 bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  
  # Set environment variables
  export TEST_KEYFILE=/root/.test-ssh-keys/id_rsa
  export TEST_HOST2=testbed2
  export TEST_USER2=testuser
  export TEST_PORT2=22
  
  # Run tests
  npm run mocha
'
echo "✓ test on latest ubuntu success"

# Test on bullseye
echo "Testing on bullseye..."
docker compose run --rm -e TEST_USE_SSH_AGENT=1 tester-bullseye bash -c '
  # Generate SSH key inside container
  mkdir -p /root/.test-ssh-keys
  ssh-keygen -t rsa -b 2048 -f /root/.test-ssh-keys/id_rsa -N "" -C "test-key" >/dev/null 2>&1
  
  # Start ssh-agent
  eval "$(ssh-agent -s)"
  ssh-add /root/.test-ssh-keys/id_rsa
  
  # Install SSH key to both testbed containers
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed2 bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  
  # Set environment variables
  export TEST_KEYFILE=/root/.test-ssh-keys/id_rsa
  export TEST_HOST2=testbed2
  export TEST_USER2=testuser
  export TEST_PORT2=22
  
  # Run tests
  npm run mocha
'
echo "✓ test on bullseye success"

# Test on buster
echo "Testing on buster..."
docker compose run --rm -e TEST_USE_SSH_AGENT=1 tester-buster bash -c '
  # Generate SSH key inside container
  mkdir -p /root/.test-ssh-keys
  ssh-keygen -t rsa -b 2048 -f /root/.test-ssh-keys/id_rsa -N "" -C "test-key" >/dev/null 2>&1
  
  # Start ssh-agent
  eval "$(ssh-agent -s)"
  ssh-add /root/.test-ssh-keys/id_rsa
  
  # Install SSH key to both testbed containers
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  cat /root/.test-ssh-keys/id_rsa.pub | docker exec -i testbed2 bash -c "mkdir -p /home/testuser/.ssh && cat > /home/testuser/.ssh/authorized_keys && chmod 700 /home/testuser/.ssh && chmod 600 /home/testuser/.ssh/authorized_keys && chown -R testuser:testuser /home/testuser/.ssh"
  
  # Set environment variables
  export TEST_KEYFILE=/root/.test-ssh-keys/id_rsa
  export TEST_HOST2=testbed2
  export TEST_USER2=testuser
  export TEST_PORT2=22
  
  # Run tests
  npm run mocha
'
echo "✓ test on buster success"

docker compose down
