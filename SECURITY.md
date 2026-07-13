# Security Policy

## Supported versions

Security fixes are provided for the latest published LingoFrame release. Users should update to the newest Chrome Web Store or GitHub release before reporting an issue that may already be fixed.

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub's private vulnerability reporting flow:

1. Open the repository's **Security** tab.
2. Choose **Advisories**.
3. Select **Report a vulnerability**.

Do not open a public issue for vulnerabilities involving API Key exposure, Region boundary escapes, permission escalation, script injection, remote code execution, or other behavior that could put users at risk.

Include the affected version, impact, reproduction steps, and any proposed mitigation. Remove real API Keys, private webpage content, and other secrets from every report and attachment.

We aim to acknowledge a complete report within seven days and provide a status update within fourteen days. Resolution time depends on severity and complexity. We will coordinate disclosure after a fix is available when the report describes a confirmed vulnerability.

## Scope

Security reports should concern LingoFrame's packaged extension code, Chrome permission use, trusted content/background boundary, local credential storage, Region scanning boundary, or provider request handling. Availability, retention, and model behavior of third-party translation providers are governed by those providers and should be reported to them directly.
