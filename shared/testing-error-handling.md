## Error Handling

| Scenario | Recovery |
|----------|----------|
| Service won't start (exit code != 0) | `docker logs <container> --tail 100`, check config in `.env`, check image exists |
| Migration fails | Read migration SQL, check postgres schema state, fix migration or seed data |
| gRPC connection refused | Verify the relevant service container is healthy, check port 50051 is exposed, check the gRPC address env var |
| Local AI/ML model pull fails | Check disk space (`df -h`), try a smaller model, verify network connectivity |
| AI model proxy can't reach model server | Verify both containers share the same Docker network, check the API base URL in the proxy config matches the model server container name |
| Redis AUTH failed | Compare `REDIS_PASSWORD` in `.env` with docker compose command |
| PostgreSQL permission denied | Check `postgres-init.sql` created read-only role, verify `POSTGRES_READONLY_PASSWORD` matches |
| UI returns 502/503 | Check gateway is healthy first, then check nginx config in UI container |
| Docker build fails | Check Dockerfile, ensure multi-stage build context has all required files |
| Playwright browser fails to launch | Verify Chromium installed: `npx playwright install --with-deps chromium`. Check `/tmp` has space (`df -h /tmp`). If sandbox errors occur, ensure running as non-root user `vscode`. |

Container names used in log/health commands are the service containers defined in `.claude/project-config/TEST-MATRIX.md`. Substitute `<SERVICE_CONTAINER>` with the actual container name for the service being diagnosed.
