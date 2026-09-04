# API latency / timeout runbook

Use for API timeouts, latency spikes, exhausted workers, and dependency degradation.

- Collect diagnostics and recent logs
- Check API p95 latency, error rate, CPU and memory saturation
- Check recent deployment/change history
- Scale worker pool if saturation is confirmed
- Retry failed job only when idempotency is confirmed
- Escalate to dependency owner if upstream health is degraded
