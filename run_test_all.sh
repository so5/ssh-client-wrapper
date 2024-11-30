#!/bin/bash
function cleanup(){
  docker compose down
}
trap cleanup EXIT
set -e -o pipefail

./run_test_local.sh keep

docker compose run --build --rm tester
echo test on latest ubuntu success

docker compose run --build --rm tester-bullseye
echo test on bullseye success

docker compose run --build --rm tester-buster
echo test on buster success
docker compose down
