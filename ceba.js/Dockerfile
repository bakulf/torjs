FROM trzeci/emscripten:sdk-tag-1.38.32-64bit@sha256:f352ee6980d98338453f3c6cf6beb79142fcb77e73198b7de170edc88f25d36b

RUN apt-get update && \
    apt-get install -y \
      autoconf \
      libtool \
    && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /var/cache/apt/*.bin

RUN mkdir /torjs
COPY build.sh /torjs
COPY clean.sh /torjs
COPY external /torjs/external
COPY patches /torjs/patches
COPY library_sockfs.js /torjs
COPY library_syscall.js /torjs
WORKDIR /torjs

RUN ./build.sh
