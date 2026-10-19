# Stand-in for tailscale/tailscale in the integration tests: answers the CLI calls the engine makes and
# otherwise just keeps running. It cannot serve anything; the engine reaches services from inside it.
FROM alpine:3.20
COPY tailscale /usr/local/bin/tailscale
RUN chmod +x /usr/local/bin/tailscale
CMD ["sh", "-c", "trap 'exit 0' TERM; while :; do sleep 1; done"]
