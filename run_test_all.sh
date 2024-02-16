#!/bin/bash
docker-compose up testbed -d
export TEST_HOST=localhost
export TEST_USER=testuser
export TEST_PW=passw0rd
export TEST_PORT=4000
ssh-keygen -R '[localhost]:4000'

npm run test
if [ $? -ne 0 ];then
  echo local test failed
  exit 1
fi

docker-compose run --build --rm tester
if [ $? -ne 0 ];then
  echo test on latest ubuntu failed
  exit 2
fi

docker-compose run --build --rm tester-bullseye
if [ $? -ne 0 ];then
  echo test on bullseye failed
  exit 3
fi

docker-compose run --build --rm tester-buster
if [ $? -ne 0 ];then
  echo test on buster failed
  exit 4
fi

docker-compose rm --stop --force testbed
