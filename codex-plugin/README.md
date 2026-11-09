# Recall Personal Knowledge Base
Marketplace skill for ChatGPT and Codex. It explains Knowledge Base records and how to query them through an existing MCP connection. It does not bundle a server or credentials.

Default MCP endpoint: https://knowledgebase.blaqc.space/mcp
Default Codex bearer-token environment variable: KNOWLEDGE_BASE_MCP_TOKEN
Default MCP server name: knowledge-base

Follow any different endpoint, server name, or token-variable name supplied by the user.

## OpenAI submission metadata

The package manifest includes five positive and three negative reviewer test cases, a support URL, a non-commerce declaration, and release notes. These fields are imported from `plugin.json` when the ZIP is uploaded. The test prompts assume a dedicated reviewer account with sample records; reviewer credentials and sign-in steps belong in the OpenAI dashboard's Review details, never in this package.

This package is a skills-only integration that uses the installer's existing MCP connection. It does not bundle an MCP server, reviewer account, or demo recording. Do not add a demo URL until an accessible walkthrough has actually been recorded. If submitting it as an MCP app, also provide working privacy-policy and terms URLs and a reviewer-accessible recording; the current product has no privacy or terms pages in this repository.

After changing the manifest, rebuild `knowledge-base-plugin.zip` from this directory so the uploaded archive carries the same metadata.

Policies: [Privacy](https://github.com/kubilaycaglayan/knowledge-base/blob/main/codex-plugin/privacy-policy.md) · [Terms](https://github.com/kubilaycaglayan/knowledge-base/blob/main/codex-plugin/terms-of-service.md)
