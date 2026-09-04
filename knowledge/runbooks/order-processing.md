# Order processing / queue backlog runbook

Use for failed orders, asynchronous processing delays, queue backlog, and worker failures.

- Collect diagnostics and recent logs
- Inspect queue depth and oldest-message age
- Check recent deployment/change history
- Clear stale queue only when duplicate-processing protection is enabled
- Scale worker capacity when backlog is increasing
- Reprocess failed orders after validating idempotency
