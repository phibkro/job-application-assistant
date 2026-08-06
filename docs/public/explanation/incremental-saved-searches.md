# Why saved searches use corpus-sequence cursors

The service collects and canonicalizes vacancies once. A saved search therefore does not need to revisit every source platform or rescan the complete corpus on every request.

Every meaningful canonical change receives a monotonically increasing sequence. A saved search remembers the highest sequence it has evaluated:

```text
previous cursor
→ jobs changed after cursor
→ evaluate structured predicate
→ update match state
→ advance cursor
```

The first evaluation processes the existing corpus. An immediate second evaluation processes zero jobs. A later edit, closure, or newly collected vacancy causes only the affected canonical job to be evaluated.

Evaluations are bounded to 100 changed jobs. If the corpus advanced farther, the response sets `has_more=true`; the caller repeats the same operation until caught up. This gives the system backpressure without requiring a queue in the prototype.
