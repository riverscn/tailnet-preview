# The example application: a shell HTTP handler on top of the PostgreSQL client tools. It needs nothing
# beyond the postgres image the preview host pulls anyway. Build context: the repository root.
FROM postgres:17-alpine
COPY example/app/ /app/
RUN chmod +x /app/handler.sh
USER postgres
EXPOSE 8080
ENTRYPOINT []
CMD ["nc", "-lk", "-p", "8080", "-e", "/app/handler.sh"]
