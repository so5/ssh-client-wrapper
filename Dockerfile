# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 node:20-bookworm-slim

WORKDIR /work/ssh-client-wrapper
RUN apt-get update && apt -y install ssh rsync bzip2 python3 g++ build-essential
COPY ./ ./
RUN npm install
