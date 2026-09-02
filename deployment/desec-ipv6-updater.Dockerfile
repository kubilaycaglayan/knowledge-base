FROM alpine:3.22

RUN apk add --no-cache curl jq
COPY desec-ipv6-update.sh /usr/local/bin/desec-ipv6-update
COPY desec-ipv6-updater-entrypoint.sh /usr/local/bin/desec-ipv6-updater-entrypoint
RUN chmod 0755 /usr/local/bin/desec-ipv6-update /usr/local/bin/desec-ipv6-updater-entrypoint

USER 65532:65532
ENTRYPOINT ["/usr/local/bin/desec-ipv6-updater-entrypoint"]
