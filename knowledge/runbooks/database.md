# Database incident runbook

Use for connection saturation, slow queries, read/write failures, and database unavailability.

- Collect diagnostics and recent logs
- Check connection pool saturation and active sessions
- Check recent deployment/change history
- Identify long-running queries and lock contention
- Fail over only with explicit human approval
- Escalate to database owner for suspected data-loss conditions
