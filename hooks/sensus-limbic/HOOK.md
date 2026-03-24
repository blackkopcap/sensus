---
name: sensus-limbic
description: Automatically analyze incoming messages through the Sensus limbic system
events: [message:incoming]
metadata:
  openclaw:
    requires:
      bins: [node, ollama]
---

# Sensus Limbic Hook

This hook automatically processes incoming messages through the Sensus limbic system for emotional analysis and human profiling.

## Features

- Analyzes message sentiment and emotional content
- Updates agent hormonal state based on interaction patterns
- Builds per-user behavioral profiles
- Non-blocking fire-and-forget execution

## Requirements

- Node.js runtime
- Ollama local LLM server (for analysis)
- Sensus limbic system installed

## Usage

The hook automatically triggers on `message:incoming` events and:

1. Extracts message text and user ID
2. Calls `node limbic.js analyze` with appropriate user parameter
3. Logs errors but doesn't interrupt main message flow

## Configuration

No manual configuration required. The hook respects existing Sensus configuration in the workspace.