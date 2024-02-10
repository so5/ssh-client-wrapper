#!/bin/bash
docker-compose up testbed -d
export TEST_HOST=localhost
export TEST_USER=testuser
export TEST_PW=passw0rd
export TEST_PORT=4000
npm run test
docker-compose run --build --rm tester &&
docker-compose run --build --rm tester-bullseye &&
docker-compose run --build --rm tester-buster &&
docker-compose rm --stop --force testbed
