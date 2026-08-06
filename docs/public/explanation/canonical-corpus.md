# Why maintain a canonical vacancy corpus?

A source listing is an advertisement observed on one platform. A canonical vacancy represents the underlying hiring opportunity.

```text
NAV occurrence ───────────┐
                          ├── Canonical vacancy
Recruiter occurrence ─────┘
```

Keeping both concepts solves two different problems:

- Source occurrences preserve where information came from and how each platform changed.
- Canonical vacancies prevent users from seeing the same opportunity repeatedly.

The corpus also creates an incremental change stream. A saved search records the last canonical sequence it evaluated, so later checks inspect only jobs created or changed after that point.

Deduplication is conservative. Exact application URLs and employer references are stronger evidence than title similarity. Ambiguous cases should remain separate or enter review rather than being merged aggressively.
