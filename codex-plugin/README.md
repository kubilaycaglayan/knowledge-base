# Recall Personal Knowledge Base
Marketplace plugin for ChatGPT and Codex. It explains Knowledge Base records and declares a connection to the existing remote MCP server. The server is hosted separately; the package contains no credentials.

Default MCP endpoint: https://knowledgebase.blaqc.space/mcp
Default MCP server name: knowledge-base
Default OpenAI OAuth client ID: knowledge-base-openai

Follow any different endpoint, server name, or token-variable name supplied by the user.

## OpenAI submission metadata

The package manifest includes five positive and three negative reviewer test cases, starter prompts, support/privacy/terms URLs, a non-commerce declaration, and release notes. These fields are imported from `plugin.json` when the ZIP is uploaded. The package declares exactly one MCP server, so plugin-level review cases apply. The test prompts assume a dedicated reviewer account with sample records; reviewer credentials and sign-in steps belong in the OpenAI dashboard's Review details, never in this package. Tell reviewers to use the OAuth-specific `/connect/openai/login` page to sign in, then approve the requested read scopes. Existing installations must reconnect after this OAuth version update. Add the demo recording URL and a working reviewer account with representative sample records in the dashboard's Review details before submission.

The package declares the remotely hosted Knowledge Base MCP server and includes policy pages. It does not contain reviewer credentials or a demo recording. MCP review requires an accessible walkthrough URL; add `review.demo_recording_url` to `plugin.json` after a recording is available, then rebuild the ZIP.

After changing the manifest, rebuild `recall-personal-knowledge-base-plugin.zip` from this directory so the uploaded archive carries the same metadata.

Policies: [Privacy](https://github.com/kubilaycaglayan/knowledge-base/blob/main/codex-plugin/privacy-policy.md) · [Terms](https://github.com/kubilaycaglayan/knowledge-base/blob/main/codex-plugin/terms-of-service.md)
