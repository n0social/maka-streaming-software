# Privacy and diagnostics

Maka has **no in-app feedback form** and **no opt-in analytics UI** in the studio. Product updates and user communication are handled outside the app (for example via GitHub releases).

Local **engineering diagnostics** (`recordDiagnostic` in the main process) still run for crashes, relay errors, and support tooling. You can review or export them from existing diagnostics IPC in Settings when needed. Those logs stay on your machine unless you choose to share them.
