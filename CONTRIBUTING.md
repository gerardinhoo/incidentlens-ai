# Contributing

IncidentLens AI follows a focused, story-driven development workflow suitable for
solo maintainers and small teams.

## Workflow

1. Select a work item with clear acceptance criteria.
2. Create a focused branch.
3. Implement only the agreed scope.
4. Run formatting, linting, type checking, and tests.
5. Review the diff.
6. Open a pull request.
7. Merge only after the acceptance criteria are satisfied.
8. Update documentation when behavior or operations change.

## Branch Naming

Use:

```text
feature/<short-description>
fix/<short-description>
docs/<short-description>
chore/<short-description>
```

Optional ticket prefixes (e.g. `feature/scrum-55-…`) are fine when useful for
traceability; they are not required.

## Testing

Before opening a pull request, run:

```bash
npm run check
```

For coverage and suite details, see [docs/testing.md](docs/testing.md).
