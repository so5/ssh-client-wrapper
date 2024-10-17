#!/bin/bash

function cleanup(){
  docker compose rm --stop --force testbed
}

trap cleanup EXIT
set -e -o pipefail

docker compose up testbed -d
export TEST_HOST=localhost
export TEST_USER=testuser
export TEST_PW=passw0rd
export TEST_PORT=4100
ssh-keygen -R '[localhost]:4100'

npm run test
echo local test success

docker compose run --build --rm tester
echo test on latest ubuntu success

docker compose run --build --rm tester-bullseye
echo test on bullseye success

docker compose run --build --rm tester-buster
echo test on buster success
