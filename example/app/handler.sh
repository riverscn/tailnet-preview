#!/bin/sh
# shellcheck disable=SC2154 # APP_ENV and APP_URL are set on the container by compose.yaml
# A deliberately tiny HTTP handler: busybox nc runs it once per connection, stdin/stdout are the socket.
# The database connection comes from the standard PG* environment variables.
read -r method path _
# Skip the request headers.
while read -r line; do
  [ "$(printf '%s' "$line" | tr -d '\r')" = "" ] && break
done
path=$(printf '%s' "$path" | tr -d '\r')

respond() {
  printf 'HTTP/1.0 %s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' \
    "$1" "$(printf '%s' "$2" | wc -c)" "$2"
}

case "$method $path" in
  'GET /health')
    if psql -Atqc 'SELECT 1' >/dev/null 2>&1; then respond '200 OK' 'ok'; else respond '503 Service Unavailable' 'database unavailable'; fi
    ;;
  'GET /notes')
    respond '200 OK' "$(psql -Atq -F ' ' -c 'SELECT env, body FROM notes ORDER BY id' 2>&1)"
    ;;
  'GET /')
    respond '200 OK' "tailnet-preview example
environment: $APP_ENV
url: $APP_URL

notes (environment that wrote it, text):
$(psql -Atq -F '  ' -c 'SELECT env, body FROM notes ORDER BY id' 2>&1)
"
    ;;
  *)
    respond '404 Not Found' 'not found'
    ;;
esac
