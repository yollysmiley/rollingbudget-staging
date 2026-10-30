# Release 2 follow-up: summary refresh

Scope: staging Release 2 via PR #4.

The income input updates state and recalculates totals, but the typing render previously returned before refreshing the yearly summary and month-history balances. Opening Summary did not rebuild these displays. The desktop browser regression observed January income remaining at $0.00 after entering $3,000.00.

The Release 2 integration now refreshes renderSummary(activeYear) and updates existing month-balance text nodes in the typing path. It does not rebuild form inputs, recreate month chips, invoke scrollIntoView, change financial formulas, change save/auth behavior, or weaken the existing summary assertion. This applies to all amount changes using the typing render, including income and regular expenses.

Acceptance: the existing desktop test must show January income $3,000.00 and February rollover $3,000.00 for the empty-guest fixture after adding January income. All eight desktop browser cases and existing regressions must pass. CI results remain unverified until the new commit runs. Mobile coverage remains deferred pending the planned revamp.
