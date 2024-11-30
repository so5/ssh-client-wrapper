#!/bin/bash
docker compose up testbed -d
export TEST_HOST=localhost
export TEST_USER=testuser
export TEST_PW=passw0rd
export TEST_PORT=4100
ssh-keygen -R '[localhost]:4100'

npm run test
echo local test success
if [ x${1} != xkeep ];then
  docker compose down
fi
