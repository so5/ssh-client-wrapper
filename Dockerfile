# syntax=docker/dockerfile:1
#build WHEEL client code
FROM --platform=linux/amd64 node:hydrogen-bookworm-slim
#FROM --platform=linux/amd64 node:hydrogen-bullseye-slim
#FROM --platform=linux/amd64 node:hydrogen-buster-slim

WORKDIR /work
RUN apt-get update && apt -y install ssh rsync bzip2 python3 g++ build-essential
COPY ./ ssh-client-wrapper
RUN cd  ssh-client-wrapper && npm install
