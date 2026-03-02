# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 node:20-bookworm-slim

WORKDIR /work/ssh-client-wrapper
RUN apt-get update && apt -y install ssh rsync bzip2 python3 g++ build-essential
# Enable SSH agent forwarding in SSH client configuration
RUN mkdir -p /root/.ssh && \
    echo "Host *" > /root/.ssh/config && \
    echo "  ForwardAgent yes" >> /root/.ssh/config && \
    echo "  StrictHostKeyChecking no" >> /root/.ssh/config && \
    chmod 600 /root/.ssh/config
COPY ./ ./
RUN npm install
