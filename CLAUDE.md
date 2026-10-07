# Project notes for Claude

- **Design:** every module and page follows `docs/design-reference.md`. The
  Oil Lubrication module is the reference implementation: reuse its components
  (`ModalShell`, `FormSection`, `ContractorChips`, `DashCharts`, tiles) and
  its colour rules rather than inventing new patterns.
- The live app auto-deploys from `claude/cement-factory-reliability-app-nyl3f1`;
  don't push there unless asked. `main` is the backup. Work on the test copy
  (`claude/test-site`) first.
- The repo is public: never commit real company data.
