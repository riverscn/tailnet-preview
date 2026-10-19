# Stand-in for tailscale/tailscale in the integration tests: answers the CLI calls the engine makes and
# otherwise just keeps running. It cannot serve anything; the engine reaches services from inside it.
FROM alpine:3.20
COPY tailscale /usr/local/bin/tailscale
RUN chmod +x /usr/local/bin/tailscale
# As the shared ingress (kernel mode, NET_ADMIN) it also takes the tailnet address the engine reads with
# `tailscale ip -4`, so Traefik and CoreDNS can bind to it.
CMD ["sh", "-c", "ip addr add 100.64.0.1/32 dev lo 2>/dev/null; trap 'exit 0' TERM; while :; do sleep 1; done"]
