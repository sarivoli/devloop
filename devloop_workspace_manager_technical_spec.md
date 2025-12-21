<!-- @type=presentation -->
<!-- @theme=neonnights -->
<!-- @logo=https://github.com/sarivoli/common/blob/8c31a8aeb9a5cba214fa94c8fdaec86e5eb2636f/arivoli-in-logo.png?raw=true -->
<!-- @slide -->
# DevLoop
<!-- @tagline border=true -->
Unified Code Development Workflow & Workspace Orchestration
<!-- @endtagline -->
<!-- @grid -->
<!-- @card text-align=center-->
![DevLoop Logo](resources/devloop_logo.svg width=200 height=200 align=left wrap=left)

==DevLoop== is an enterprise-grade Visual Studio Code extension designed to streamline development workflows for complex microservices architectures. By unifying Jira integration, multi-repository management, automated linting, and configuration discovery into a single command center, this extension eliminates context switching and enforces coding standards across distributed microservices architectures.
<!-- @endcard -->

<!-- @card -->
**Key Value Propositions:**
- **Productivity Gain**: Reduces context switching between VS Code, Jira, Jenkins, and Chrome
- **Code Quality**: Automated enforcement of DevLoop coding standards with Python 3 modernization support
- **Multi-Repo Orchestration**: Intelligent workspace management for microservices environments
- **Unified Dashboard**: Real-time visibility into linting issues, repository status, and merge requests
<!-- @endcard -->
<!-- @endgrid -->
<!-- @endslide -->
---
<!-- @slide -->


## 1. Project Overview

### 1.1 Project Metadata

| Attribute | Value |
|-----------|-------|
| **Project Name** | DevLoop |
| **Platform** | Visual Studio Code Extension |
| **Target Application** | DevLoop Enterprise Web Application |
| **Primary Users** | Enterprise software developers working with DevLoop microservices |

### 1.2 Technology Stack

- **Core Language**: TypeScript
- **Extension Framework**: VS Code Extension API
- **UI Components**: VS Code Webview UI Toolkit
- **Runtime**: Node.js (Child Process for CLI tool orchestration)
- **Analysis Tools**: Python (AST/Regex-based code analysis)
- **Data Format**: Standardized DevLoop-JSON schema

### 1.3 Architectural Principles

#### 1.3.1 Agnostic Engine Philosophy
The extension employs a **Discovery Engine** architecture that avoids hardcoded logic:
- **Pattern-Driven Discovery**: Uses configurable regex patterns instead of fixed rules
- **Linter Orchestrator**: Language-agnostic interface for any CLI-based linting tool
- **Pluggable Architecture**: New languages and tools can be added via configuration

#### 1.3.2 Unified Data Schema
All analysis tools output to a standardized **DevLoop-JSON** format enabling:
- Consistent rendering across the dashboard
- Cross-tool aggregation and reporting
- Extensibility without UI changes

**Standard DevLoop-JSON Schema:**

```JSON
{
  "tool": "string",
  "severity": "Error|Warning|Info",
  "file": "string",
  "line": "number",
  "message": "string",
  "canFix": "boolean"
}
some text here

```

<!-- @endslide -->

---
<!-- @slide -->

## 2. Core Features & Workflows

### 2.1 Workspace Snapshot & Task Management

#### 2.1.1 The "Start DevLoop Task" Workflow

**Objective**: Establish a consistent, trackable workspace state when beginning development on a Jira ticket.

**Step-by-Step Process:**

1. **Task Initiation**
   - Developer clicks **"Start Ticket"** in DevLoop Sidebar
   - Extension prompts for Jira Ticket ID (e.g., `JIRA-123`)

2. **Ticket Validation**
   - Extension fetches ticket details via Jira REST API:
     - Issue type
     - Description
     - Current status
     - Assigned user
   - Displays confirmation dialog with ticket information
   - Awaits user confirmation to proceed

3. **Repository Selection Interface**
   - Extension displays all detected repositories in workspace
   - **UI Component**: Tree view with tri-state checkboxes
   - **Per-Repository Display**:
     - Repository name
     - Current branch indicator
     - Status icon (clean/dirty)
   - Developer selects repositories for active development
   - Extension prompts: *"Base branch for new feature branches?"* (Default: `main`)

4. **Automated Branch Creation**
   - Extension executes `git checkout -b feature/JIRA-123` **only** in checked repositories
   - Unchecked repositories remain on current branch (reference mode)
   - Creates `.devloop-internal/ticket-123-manifest.json` with workspace state

5. **Jira Ticket Updates**
   - Posts comment: `"Development work started by [Username] at [Timestamp]"`
   - Updates ticket status to **"Dev Assigned"**
   - Records repository selection in ticket metadata
6. **Marking Task as Complete**   
    - Developer clicks **"Complete Ticket"** in DevLoop Sidebar
    - Displays confirmation dialog with ticket information which was already documented in the current task
    - Awaits user confirmation to proceed
    - Posts comment: `"Development work completed by [Username] at [Timestamp]"`
    - Updates ticket status to **"Dev Completed"**
    - Records repository selection in ticket metadata
    - Marks all repositories as inactive
6. **Automatic Time Tracking**
   - Extension starts timer when task begins
   - Tracks active coding time (excludes idle periods > 5 minutes)
   - Stores time data in manifest file
<!-- @endslide -->

<!-- @slide -->
**Time Tracking Implementation:**
```typescript
interface TimeTracking {
  ticketId: string;
  sessions: Array<{
    startTime: string; // ISO 8601
    endTime?: string;
    duration: number; // minutes
    activities: Array<{
      type: 'coding' | 'debugging' | 'reviewing' | 'idle';
      startTime: string;
      duration: number;
    }>;
  }>;
  totalTime: number; // minutes
  billableTime: number; // excludes idle
}
```

**Time Tracking Features:**

1. **Active Session Monitoring:**
   - Detects keyboard/mouse activity
   - Pauses timer after 5 minutes of inactivity
   - Resumes automatically when activity detected

2. **Session Management:**
```
   Status Bar: ⏱ JIRA-123 | 2h 15m | [⏸ Pause] [⏹ Stop]
```

3. **Manual Time Entry:**
   - Command: "DevLoop: Log Time Manually"
   - Prompt: Enter hours and minutes
   - Reason: For meetings, research, etc.

4. **Jira Time Sync:**
   - On ticket completion: Prompt to sync time
   - Uses Jira worklog API: `POST /rest/api/2/issue/{ticketId}/worklog`
```json
   {
     "timeSpentSeconds": 7200,
     "comment": "Development work - Auto-logged by DevLoop Extension",
     "started": "2025-01-15T09:00:00.000+0000"
   }
```

5. **Time Breakdown Widget (Dashboard):**
```
   ┌─ Time Tracking ────────────────┐
   │ Today: 4h 35m                  │
   │ This Week: 28h 15m             │
   │                                │
   │ Current Session (JIRA-123):    │
   │ ⏱ 2h 15m | [Pause] [Stop]     │
   │                                │
   │ Breakdown:                     │
   │ ▓▓▓▓▓▓░░░░ Coding (65%)       │
   │ ▓▓░░░░░░░░ Debugging (20%)    │
   │ ▓░░░░░░░░░ Reviewing (15%)    │
   └────────────────────────────────┘
```
<!-- @endslide -->

<!-- @slide -->
**Storage in Manifest:**
```json
{
  "ticketId": "JIRA-123",
  "timeTracking": {
    "sessions": [...],
    "totalTime": 135,
    "lastSynced": "2025-01-15T17:00:00Z",
    "syncedToJira": true
  }
}
```

**Manifest File Structure:**
```json
{
  "ticketId": "JIRA-123",
  "startedAt": "2025-01-15T10:30:00Z",
  "startedBy": "developer@company.com",
  "repos": {
    "devloop-backend-api": {
      "mode": "active",
      "branch": "feature/JIRA-123",
      "baseBranch": "main",
      "createdAt": "2025-01-15T10:30:15Z"
    },
    "devloop-auth-service": {
      "mode": "active",
      "branch": "feature/JIRA-123",
      "baseBranch": "main",
      "createdAt": "2025-01-15T10:30:16Z"
    },
    "devloop-common-utils": {
      "mode": "reference",
      "branch": "rel_v1.0",
      "type": "tag",
      "pinned": true
    }
  }
}
```
<!-- @endslide -->

<!-- @slide -->
#### 2.1.2 Dynamic Repository Promotion

**Use Case**: Developer realizes mid-task that an additional repository requires changes.

**Workflow:**

1. **Trigger Detection**
   - Developer opens a file in a repository currently in reference/inactive mode
   - Extension detects active ticket context (`JIRA-123`)

2. **UI Prompt**
   - Status bar item appears: `[+ Add devloop-frontend to JIRA-123]`
   - Alternatively: Inline notification in editor

3. **Promotion Action**
   - Developer clicks promotion button
   - Extension performs:
     ```bash
     cd devloop-frontend
     git checkout -b feature/JIRA-123
     ```
   - Updates `ticket-123-manifest.json` to mark repository as "active"
   - Initiates linting and configuration discovery for the repository

4. **Dashboard Integration**
   - Newly promoted repository immediately appears in unified linting report
   - Repository card updates from 🟡 Reference to 🟢 Active

#### 2.1.3 Repository State Model

**State Definitions:**

| State | Icon | Description | Git Behavior |
|-------|------|-------------|--------------|
| **Active** | 🟢 | Repository is part of current development task | On feature branch, eligible for commits/PRs |
| **Reference** | 🟡 | Repository provides context but is not modified | Pinned to stable branch/tag, read-only |
| **Inactive** | 🔴 | Repository not relevant to current task | Not monitored by extension |
| **Desynchronized** | 🟠 | Repository state diverges from manifest | Manual branch change detected, requires attention |

**Real-Time State Table (Dashboard View):**

| Repository | Current Role | Source Branch | Active Branch | Status |
|------------|--------------|---------------|---------------|--------|
| Backend-API | 🟢 Active | main | feature/JIRA-123 | ✓ Clean |
| Auth-Service | 🟡 Reference | rel_v1.0 | rel_v1.0 (Pinned) | ✓ Clean |
| Common-Utils | 🔴 Inactive | main | main | - |
| Frontend | 🟠 Desynced | Expected: feature/JIRA-123 | Actual: develop | ⚠ Action Required |

<!-- @endslide -->
---
<!-- @slide -->
### 2.2 Jira Integration Suite

#### 2.2.1 Contextual Code Commenting

**Feature**: Send code snippets directly to Jira tickets from the editor.

**Implementation:**

1. **User Interaction**
   - Developer selects code in editor
   - Right-clicks → **"DevLoop: Send selection to Jira"**

2. **Processing Pipeline**
   - Extract selected text/code
   - Auto-detect ticket ID from active manifest, or prompt if ambiguous
   - Format code with markdown code blocks:
     ```markdown
     Code from `src/auth/login.py` (Line 45-52): 
     ```
     ```python
     # selected code here
     
     ```

3. **API Integration**
   - POST to Jira REST API: `/rest/api/2/issue/{ticketId}/comment`
   - Use stored Karmic Token from secure credential store
   - Include metadata: file path, line numbers, branch name

<!-- @endslide -->

<!-- @slide -->
#### 2.2.2 Automated Status Updates

**Trigger Points:**
- Commit pushed to feature branch → Comment: *"Commits pushed to feature/JIRA-123"*
- Jenkins job triggered → Comment: *"Impact Analysis job #4521 started"*
- Pull request created → Comment: *"PR opened: [Link]"*

**Configuration:**
```json
{
  "jira.autoComments": {
    "onCommit": true,
    "onJenkinsJob": true,
    "onPullRequest": true,
    "includeCommitMessages": true
  }
}
```

---

### 2.3 Unified Linter Orchestrator

#### 2.3.1 Multi-Language Support

**Supported Tools by File Type:**

| Language | Tools | Purpose |
|----------|-------|---------|
| **Python** | pep8, pyflakes, futurize | Style, errors, Py2→Py3 migration |
| **JavaScript** | eslint | Code quality and standards |
| **HTML** | htmlhint | Markup validation |
| **CSS** | stylelint | Style consistency |

#### 2.3.2 Linter Execution Pipeline

```typescript
interface LinterConfig {
  filePattern: string;  // "**/*.py"
  executable: string;   // "pep8"
  args: string[];       // ["--max-line-length=120"]
  outputParser: string; // "regex" | "json"
  parserConfig: object;
}
```

**Execution Flow:**

1. **File Discovery**: Use `.devloopignore` and `.gitignore` to filter workspace
2. **Tool Invocation**: Spawn child process per linter
3. **Output Parsing**: Transform CLI output to DevLoop-JSON schema
4. **Aggregation**: Merge results into `.devloop-internal/lint-results.json`
5. **Dashboard Update**: Trigger UI refresh via file watcher

#### 2.3.3 DevLoop-Specific Rules

**Custom Validation Checks:**

- **Forbidden Modules**: Detect imports from deprecated DevLoop libraries
  ```python
  # BAD: import devloop.legacy.auth
  # GOOD: import devloop.core.auth_v2
  ```

- **Mandatory Headers**: Ensure all DevLoop modules include:
  ```python
  # -*- coding: utf-8 -*-
  """
  Module: <name>
  Owner: <team>
  """
  ```

- **Naming Conventions**: 
  - Classes: `DevLoopBaseController`, `DevLoopServiceHandler`
  - Methods: `process_devloop_request()`, `validate_devloop_config()`

<!-- @endslide -->

<!-- @slide -->
#### 2.3.4 Auto-Fix Capabilities

**Python 3 Migration (Futurize Integration):**

```python
# Detection: print statement (Python 2)
print "Hello World"

# Quick Fix Action → futurize --stage1
print("Hello World")
```

**Quick Fix UI:**
- Inline CodeLens: `[⚡ Auto-fix with futurize]`
- Bulk action: `[Fix All Python 3 Issues (24)]` in dashboard

### 2.3.5 DevLoop Naming Convention Enforcement

**Automated Style Guide Compliance:**

**Configuration Schema:**
```json
{
  "devloop.namingConventions": {
    "enabled": true,
    "severity": "warning" | "error",
    "rules": {
      "python": {
        "variables": {
          "pattern": "^[a-z_][a-z0-9_]*$",
          "style": "snake_case",
          "examples": ["user_name", "total_count"]
        },
        "functions": {
          "pattern": "^[a-z_][a-z0-9_]*$",
          "style": "snake_case",
          "prefix": ["get_", "set_", "process_", "validate_"],
          "examples": ["get_user_data", "process_payment"]
        },
        "classes": {
          "pattern": "^DevLoop[A-Z][a-zA-Z0-9]*$",
          "style": "PascalCase",
          "prefix": "DevLoop",
          "examples": ["DevLoopUserController", "DevLoopBaseService"]
        },
        "constants": {
          "pattern": "^[A-Z][A-Z0-9_]*$",
          "style": "UPPER_SNAKE_CASE",
          "examples": ["MAX_RETRIES", "DEFAULT_TIMEOUT"]
        }
      },
      "javascript": {
        "variables": {
          "pattern": "^[a-z][a-zA-Z0-9]*$",
          "style": "camelCase",
          "examples": ["userName", "totalCount"]
        },
        "functions": {
          "pattern": "^[a-z][a-zA-Z0-9]*$",
          "style": "camelCase",
          "examples": ["getUserData", "processPayment"]
        },
        "classes": {
          "pattern": "^[A-Z][a-zA-Z0-9]*$",
          "style": "PascalCase",
          "examples": ["UserController", "PaymentService"]
        },
        "constants": {
          "pattern": "^[A-Z][A-Z0-9_]*$",
          "style": "UPPER_SNAKE_CASE",
          "examples": ["MAX_RETRIES", "API_ENDPOINT"]
        }
      }
    },
    "fileNaming": {
      "python": {
        "modules": {
          "pattern": "^[a-z_][a-z0-9_]*\\.py$",
          "style": "snake_case",
          "examples": ["user_controller.py", "payment_service.py"]
        },
        "tests": {
          "pattern": "^test_[a-z_][a-z0-9_]*\\.py$",
          "prefix": "test_",
          "examples": ["test_user_controller.py"]
        }
      },
      "javascript": {
        "modules": {
          "pattern": "^[a-z][a-zA-Z0-9]*\\.js$",
          "style": "camelCase",
          "examples": ["userController.js", "paymentService.js"]
        },
        "components": {
          "pattern": "^[A-Z][a-zA-Z0-9]*\\.jsx$",
          "style": "PascalCase",
          "examples": ["UserProfile.jsx", "PaymentForm.jsx"]
        }
      }
    }
  }
}
```

<!-- @endslide -->

<!-- @slide -->
**Implementation - Custom Linter Rule:**
```typescript
class NamingConventionLinter {
  async analyzeFile(filePath: string): Promise<NamingViolation[]> {
    const content = await readFile(filePath);
    const language = detectLanguage(filePath);
    const rules = getNamingRules(language);
    const violations: NamingViolation[] = [];
    
    // Parse AST (Abstract Syntax Tree)
    const ast = parseAST(content, language);
    
    // Check variables
    ast.variables.forEach(variable => {
      if (!rules.variables.pattern.test(variable.name)) {
        violations.push({
          type: 'variable',
          name: variable.name,
          line: variable.line,
          expected: rules.variables.style,
          suggestion: toSnakeCase(variable.name)
        });
      }
    });
    
    // Check functions
    ast.functions.forEach(func => {
      if (!rules.functions.pattern.test(func.name)) {
        violations.push({
          type: 'function',
          name: func.name,
          line: func.line,
          expected: rules.functions.style,
          suggestion: toSnakeCase(func.name)
        });
      }
    });
    
    // Check classes
    ast.classes.forEach(cls => {
      if (!rules.classes.pattern.test(cls.name)) {
        violations.push({
          type: 'class',
          name: cls.name,
          line: cls.line,
          expected: rules.classes.style,
          suggestion: 'DevLoop' + toPascalCase(cls.name)
        });
      }
    });
    
    return violations;
  }
}
```

<!-- @endslide -->

<!-- @slide -->
**Diagnostic Display:**
```python
# Example Python file with violations

class userController:  # ⚠ DevLoop-NC-001: Class should be PascalCase with 'DevLoop' prefix
                       # 💡 Suggestion: DevLoopUserController
    
    def GetUserData(self):  # ⚠ DevLoop-NC-002: Function should be snake_case
                            # 💡 Suggestion: get_user_data
        
        UserName = "John"  # ⚠ DevLoop-NC-003: Variable should be snake_case
                          # 💡 Suggestion: user_name
        
        max_retries = 3  # ⚠ DevLoop-NC-004: Constant should be UPPER_SNAKE_CASE
                        # 💡 Suggestion: MAX_RETRIES
```

<!-- @endslide -->

<!-- @slide -->
**Dashboard Integration:**
```
┌─ Naming Convention Issues (12) ────┐
│                                    │
│ 🔴 Critical (3):                   │
│   • Class names missing DevLoop prefix│
│                                    │
│ 🟡 Warnings (9):                   │
│   • Function naming style          │
│   • Variable naming style          │
│                                    │
│ [ Fix All ] [ Show Guidelines ]   │
└────────────────────────────────────┘
```

**Quick Fix Actions:**

1. **Individual Fix:**
```
   userController
   ^^^^^^^^^^^^^^
   Quick Fix Available:
   1. Rename to 'DevLoopUserController' (Preferred)
   2. Rename to 'JivaUserController'
   3. Ignore for this line
   4. Show naming guidelines
```

2. **Bulk Rename:**
   - Detects all references across workspace
   - Shows preview of changes
   - Applies refactoring safely

<!-- @endslide -->

<!-- @slide -->
**Naming Guidelines Reference:**

Command: "DevLoop: Show Naming Convention Guidelines"

Opens webview with comprehensive guide:
```markdown
# DevLoop Naming Convention Guidelines

## Python

### Variables
- **Style**: snake_case
- **Pattern**: `^[a-z_][a-z0-9_]*$`
- **Examples**: 
  ✓ user_name
  ✓ total_count
  ✗ userName (use user_name)
  ✗ TotalCount (use total_count)

### Classes
- **Style**: PascalCase with 'DevLoop' prefix
- **Pattern**: `^DevLoop[A-Z][a-zA-Z0-9]*$`
- **Examples**:
  ✓ DevLoopUserController
  ✓ DevLoopPaymentService
  ✗ UserController (missing DevLoop prefix)
  ✗ DevLoop_UserController (no underscores)

[More examples and rationale...]
```

<!-- @endslide -->

<!-- @slide -->
**Integration with Linting Dashboard:**

Naming convention violations appear alongside other linting issues:
```
[ Python | JavaScript | HTML/CSS | Naming ]  ← New tab

Naming Convention Issues (12):

user_service.py:
  Line 15: class userService → DevLoopUserService
  Line 23: def GetUser() → get_user()
  Line 45: UserName → user_name

payment_controller.py:
  Line 8: class PaymentController → DevLoopPaymentController
  Line 30: def ProcessPayment() → process_payment()
```

**Auto-Fix for File Names:**
```
⚠ File name violation detected:
  Current: UserController.py
  Expected: user_controller.py (snake_case for Python modules)
  
  [Rename File] [Add to Exceptions] [Learn More]
```

<!-- @endslide -->
---
<!-- @slide -->


### 2.4 Configuration Discovery Engine

#### 2.4.1 Pattern-Based Extraction

**Configurable Regex Patterns:**

```json
{
  "devloop.configPatterns": [
    {
      "name": "DevLoop Config Getter",
      "pattern": "self\\.getConfiguration\\(['\"](.+?)['\"]\\)",
      "language": "python"
    },
    {
      "name": "Environment Variable",
      "pattern": "get_env_var\\(['\"](.+?)['\"]\\)",
      "language": "python"
    },
    {
      "name": "JavaScript Config",
      "pattern": "config\\.get\\(['\"](.+?)['\"]\\)",
      "language": "javascript"
    }
  ]
}
```

#### 2.4.2 Configuration Catalog

**Output Schema (`.devloop-internal/config-map.json`):**

```json
{
  "configurations": [
    {
      "key": "database.timeout",
      "type": "discovered",
      "occurrences": [
        {
          "repo": "devloop-backend-api",
          "branch": "feature/JIRA-123",
          "file": "src/db/connection.py",
          "line": 45,
          "pattern": "self.getConfiguration"
        },
        {
          "repo": "devloop-worker-service",
          "branch": "main",
          "file": "workers/db_worker.py",
          "line": 23,
          "pattern": "self.getConfiguration"
        }
      ],
      "referenceCount": 2
    }
  ]
}
```

#### 2.4.3 Dashboard Integration

**Configuration Inspector Widget:**
- **Search Bar**: Filter configurations by key name
- **List View**: Display all discovered keys with reference counts
- **Click Action**: Navigate to first occurrence in code
- **Export**: Generate CSV report of all configurations
<!-- @endslide -->
---
<!-- @slide -->
### 2.5 Multi-Repository Management

#### 2.5.1 Cross-Repository Synchronization

**Bulk Operations Interface:**

```
┌─ Workspace Repositories ─────────────────────────┐
│ ☑ devloop-backend-api        [feature/JIRA-123] 🟢  │
│ ☑ devloop-auth-service       [feature/JIRA-123] 🟢  │
│ ☐ devloop-common-utils       [main] 🟡               │
│ ☑ devloop-frontend           [feature/JIRA-123] 🟢  │
├───────────────────────────────────────────────────┤
│ Commit Message: _________________________________ │
│ [JIRA-123] Implement user authentication flow    │
│                                                   │
│ [ Commit All Checked Repos ]  [ Push All ]       │
└───────────────────────────────────────────────────┘
```

#### 2.5.2 Filtered Commit Logic

**Smart Commit Algorithm:**

1. Iterate through manifest
2. Filter repositories where `mode === "active"`
3. Check for uncommitted changes via Git API
4. Stage all changes: `git add .`
5. Commit with unified message: `git commit -m "[JIRA-123] ..."`
6. Update `.devloop-internal/git-state.json` with commit hash

**Safety Checks:**
- ⚠ Warn if committing to non-feature branches
- ⚠ Block commits if linting errors exceed threshold
- ✓ Auto-prefix commit messages with ticket ID
<!-- @endslide -->

<!-- @slide -->
#### 2.5.3 Branch Mismatch Detection

**Desynchronization Scenarios:**

| Scenario | Detection | UI Indicator | Suggested Action |
|----------|-----------|--------------|------------------|
| Manual checkout | Git API event | 🟠 Amber warning | "Realign with manifest" button |
| Stale manifest | Branch doesn't exist | 🔴 Red error | "Recreate branch" or "Update manifest" |
| Mixed branches | Feature branches differ | 🟡 Yellow caution | "Standardize branch names" |

#### 2.5.4 Jenkins Integration

**Impact Analysis Trigger:**

1. **UI Button**: `[🔨 Run Impact Analysis]` in sidebar
2. **Repository Selection**: Use checkbox list (same as commit UI)
3. **API Call**: POST to Jenkins REST API
   ```http
   POST /job/DevLoop-ImpactAnalysis/buildWithParameters
   {
     "TICKET_ID": "JIRA-123",
     "REPOS": "devloop-backend-api,devloop-frontend",
     "BRANCH": "feature/JIRA-123"
   }
   ```
4. **Status Tracking**: Poll Jenkins job status, update dashboard widget
5. **Jira Update**: Post comment with Jenkins job link when complete

### 2.5.5 Proactive Commit Reminders

**Prevent Lost Work with Smart Notifications:**

**Configuration:**
```json
{
  "devloop.commitReminders": {
    "enabled": true,
    "checkInterval": 30, // minutes
    "thresholds": {
      "uncommittedChanges": 50, // lines
      "timeSinceLastCommit": 180, // minutes (3 hours)
      "workingHoursSinceCommit": 4 // hours of active work
    },
    "reminderStyle": "gentle" | "persistent" | "aggressive",
    "autoCommitSuggestion": true
  }
}
```
<!-- @endslide -->

<!-- @slide -->
**Reminder Triggers:**

1. **Threshold-Based Alerts:**
   - **Uncommitted Lines**: When modified lines > 50
```
     ⚠ You have 87 uncommitted lines across 3 files.
     [Commit Now] [Remind in 30 min] [Don't remind today]
```
   
   - **Time-Based**: 3+ hours without commit
```
     ⏰ Last commit was 3.5 hours ago. Consider committing your progress.
     [View Changes] [Commit] [Snooze 1 hour]
```
   
   - **End of Day**: 30 minutes before configured work end time
```
     🌅 Work day ending soon. You have uncommitted changes in 2 repos.
     [Quick Commit] [Review Changes] [Tomorrow]
```

2. **Status Bar Indicator:**
```
   📝 3 files | 87 lines | Last commit: 3h ago ⚠
```
   - Green: Committed recently (< 1 hour)
   - Yellow: Warning (1-3 hours)
   - Red: Urgent (3+ hours)

3. **Dashboard Widget:**
```
   ┌─ Commit Status ────────────────┐
   │ ⚠ Uncommitted Changes Detected │
   │                                │
   │ devloop-backend-api:              │
   │   • 3 files modified           │
   │   • 52 lines changed           │
   │   • Last commit: 2h 15m ago    │
   │                                │
   │ devloop-auth-service:             │
   │   • 1 file modified            │
   │   • 35 lines changed           │
   │   • Last commit: 4h 30m ago ⚠  │
   │                                │
   │ [ Quick Commit All ]           │
   └────────────────────────────────┘
```

4. **Fork Synchronization Reminder:**
```
   🔀 Your fork is 23 commits behind upstream/main
   
   Last sync: 5 days ago
   
   [Sync Fork Now] [View Diff] [Remind Tomorrow]
```
<!-- @endslide -->

<!-- @slide -->
**Smart Commit Suggestions:**
```typescript
interface CommitSuggestion {
  message: string; // AI-generated based on file changes
  repos: string[];
  estimatedTime: string;
  risk: 'low' | 'medium' | 'high'; // Based on changes
}

// Example suggestion
{
  message: "[JIRA-123] Add user authentication endpoints",
  repos: ["devloop-backend-api", "devloop-auth-service"],
  estimatedTime: "2 minutes",
  risk: "low" // < 100 lines, no critical files
}
```

**Notification Escalation:**

1. **Gentle** (Default):
   - Toast notification
   - Dismissible
   - Reminds every 3 hours

2. **Persistent**:
   - Status bar warning (stays visible)
   - Dashboard alert (prominent)
   - Reminds every hour

3. **Aggressive**:
   - Modal dialog (blocks workflow)
   - Sound notification
   - Reminds every 30 minutes
   - Requires acknowledgment

**Automatic Daily Commit (Optional):**
```json
{
  "devloop.autoCommit": {
    "enabled": false,
    "schedule": "17:00", // End of work day
    "message": "[AUTO] End of day checkpoint - {date}",
    "requireConfirmation": true
  }
}
```
<!-- @endslide -->
---
<!-- @slide -->
### 2.6 Session-Aware Endpoint Tester

**Purpose**: Eliminate manual navigation to test DevLoop API endpoints by capturing and replaying browser session data.

#### 2.6.1 Traffic Recording

**One-Time Setup:**

1. **Browser Extension Helper** (Companion Chrome Extension)
   - Captures cookies, headers, and session tokens from active DevLoop session
   - Exports data to `.devloop-internal/session-capture.json`

2. **Captured Data Schema:**
```json
{
  "capturedAt": "2025-01-15T14:30:00Z",
  "baseUrl": "https://devloop.company.com",
  "cookies": {
    "JSESSIONID": "ABC123...",
    "AUTH_TOKEN": "xyz789..."
  },
  "headers": {
    "User-Agent": "Mozilla/5.0...",
    "X-CSRF-Token": "token123"
  }
}
```

#### 2.6.2 Headless Replay from VS Code

**Endpoint Testing UI:**

```
┌─ DevLoop Endpoint Tester ────────────────────────┐
│ Method: [GET ▼]                                │
│ Endpoint: /api/v2/users/profile                │
│ Parameters:                                    │
│   userId: 12345                                │
│                                                │
│ [ Send Request ]  [Use Captured Session ✓]    │
├────────────────────────────────────────────────┤
│ Response (200 OK):                             │
│ {                                              │
│   "name": "John Doe",                          │
│   "email": "john@company.com"                  │
│ }                                              │
└────────────────────────────────────────────────┘
```

**Implementation:**
- Use `node-fetch` or `axios` with captured cookies/headers
- Display response in webview with JSON syntax highlighting
- Save request history to `.devloop-internal/request-history.json`

<!-- @endslide -->
<!-- @slide -->
### 2.7 Work Summary & Reporting

**Automated Report Generation:**

Generate comprehensive work summaries for any time period with detailed metrics and Jira ticket information.

**Report Types:**

1. **Daily Summary**
   - Tickets worked on today
   - Commits made (with messages)
   - Linting issues fixed
   - Time spent per ticket

2. **Weekly Summary**
   - All active tickets
   - Total commits across all repos
   - PR status summary
   - Jenkins job results

3. **Monthly/Yearly Summary**
   - Completed tickets count
   - Code quality metrics trend
   - Productivity statistics
   - Team contribution summary

**Report Configuration:**
```json
{
  "devloop.reports": {
    "autoGenerate": {
      "daily": true,
      "weekly": true,
      "monthly": true,
      "sendTime": "17:00"
    },
    "outputFormats": ["pdf", "html", "excel"],
    "includeMetrics": {
      "timeTracking": true,
      "commitHistory": true,
      "lintingStats": true,
      "jiraDetails": true
    },
    "emailSettings": {
      "enabled": true,
      "recipients": ["manager@company.com"],
      "subject": "DevLoop Work Summary - {period}"
    }
  }
}
```
<!-- @endslide -->
<!-- @slide -->
**Report Generation Flow:**

1. **Trigger Options:**
   - Command: "DevLoop: Generate Work Summary"
   - Automatic: Daily at configured time
   - On-demand: Dashboard button

2. **Data Aggregation:**
```typescript
   interface WorkSummary {
     period: {
       start: string;
       end: string;
       type: 'daily' | 'weekly' | 'monthly' | 'yearly';
     };
     tickets: Array<{
       ticketId: string;
       title: string;
       status: string;
       timeSpent: number; // minutes
       commits: number;
       pullRequests: Array<{url: string, status: string}>;
       filesChanged: number;
       linesAdded: number;
       linesRemoved: number;
     }>;
     productivity: {
       totalCommits: number;
       totalTimeSpent: number;
       averageCommitsPerDay: number;
       issuesFixed: number;
     };
     codeQuality: {
       lintingErrorsFixed: number;
       testsCoverage: number;
       codeReviewScore: number;
     };
   }
```
<!-- @endslide -->
<!-- @slide -->
3. **Output Generation:**
   - **PDF**: Use `pdfkit` or `puppeteer` for professional formatting
   - **HTML**: Styled template with charts using Chart.js
   - **Excel**: Use `exceljs` for spreadsheet format with multiple sheets

**Report Template Example (HTML):**
```html
<h1>DevLoop Work Summary - Week of Jan 15, 2025</h1>
<section>
  <h2>Overview</h2>
  <ul>
    <li>Total Tickets: 5</li>
    <li>Completed: 3</li>
    <li>Total Time: 32.5 hours</li>
    <li>Commits: 45</li>
  </ul>
</section>
<section>
  <h2>Ticket Details</h2>
  <table>
    <tr>
      <th>Ticket ID</th>
      <th>Title</th>
      <th>Status</th>
      <th>Time Spent</th>
      <th>Commits</th>
    </tr>
    <!-- Data rows -->
  </table>
</section>
```

**Command Palette Integration:**
- "DevLoop: Generate Daily Report"
- "DevLoop: Generate Weekly Report"
- "DevLoop: Generate Custom Period Report"
- "DevLoop: Email Report to Manager"

<!-- @endslide -->
---
<!-- @slide -->
## 3. User Interface Design

### 3.1 Dashboard Architecture

**VS Code Webview Sidebar Structure:**

```
┌─ DevLoop ─────────────────────┐
│ 🎯 Active Ticket: JIRA-123                    │
│    Status: Dev Assigned | Assigned to: You   │
├────────────────────────────────────────────────┤
│ 📊 Project Health                              │
│    ● Jira Connected                            │
│    ● Git Configured                            │
│    ● Jenkins Accessible                        │
├────────────────────────────────────────────────┤
│ 🐛 Linting Hub                                 │
│    [Python] 12 PEP8 | 4 Pyflakes              │
│    [JavaScript] 2 ESLint                       │
│    [ Fix All Issues ]                          │
├────────────────────────────────────────────────┤
│ ⚙️ Configuration Inspector                     │
│    🔍 Search: [____________]                   │
│    📌 database.timeout (2 refs)                │
│    📌 cache.expiry (5 refs)                    │
├────────────────────────────────────────────────┤
│ 📂 Repository Workspace                        │
│    ☑ backend-api [feature/JIRA-123] 🟢        │
│    ☑ auth-service [feature/JIRA-123] 🟢       │
│    ☐ common-utils [main] 🟡                   │
│    [ Commit All ] [ Push All ]                 │
├────────────────────────────────────────────────┤
│ 🔀 Merge Request Tracker                       │
│    ▸ MR #451: Auth refactor (Open)            │
│    ▸ MR #449: Bug fix (Merged)                │
└────────────────────────────────────────────────┘
```
<!-- @endslide -->
<!-- @slide -->
### 3.2 Dashboard Widgets

#### 3.2.1 Project Guard (Connection Status)

**Purpose**: Visual indicators for external system connectivity.

**Display:**
```
🟢 Jira: Connected (Token valid)
🟢 Git: Configured (User: john@company.com)
🟠 Jenkins: Limited (No admin token)
```

**Actions:**
- Click indicator → Open settings to configure/refresh token
- Auto-refresh every 5 minutes

#### 3.2.2 Linting Hub

**Tabbed Interface:**

```
[ Python | JavaScript | HTML/CSS ]

Python Issues (16 total):
─────────────────────────────────
⚠ connection.py:45 - Line too long (140 > 120)
   [⚡ Auto-fix]

❌ auth.py:12 - Undefined variable 'user_id'
   [🔍 Show in Editor]

⚠ config.py:78 - Use of deprecated print statement
   [⚡ Auto-fix with futurize]
```

#### 3.2.3 Configuration Catalog

**Searchable List with Metadata:**

```
Configuration Keys (24 found):

📌 database.connection.timeout
   └─ 3 references across 2 repos
   └─ Click to view usages

📌 cache.redis.host
   └─ 1 reference in devloop-backend-api
   └─ File: config/cache.py:23
```

#### 3.2.4 Bulk Action Center

**Multi-Repository Controls:**

```
Selected Repositories: 2 of 4

[Select All] [Clear All]

Commit Message:
┌────────────────────────────────────┐
│ [JIRA-123] Your commit message     │
└────────────────────────────────────┘

Actions:
[ Commit Selected ]  [ Push Selected ]  [ Run Jenkins ]

Git Status:
  ☑ backend-api: 4 changed files
  ☑ auth-service: 2 changed files
```

#### 3.2.5 Activity Stream

**Recent Actions Timeline:**

```
Today, 2:45 PM  - Comment sent to JIRA-123
Today, 2:30 PM  - Jenkins job #4521 started
Today, 1:15 PM  - Committed to 2 repositories
Today, 12:00 PM - Development started on JIRA-123
```
<!-- @endslide -->
---
<!-- @slide -->
## 4. Data Management & File Structure

### 4.1 The `.devloop-internal/` Directory

**Purpose**: Centralized storage for extension metadata, isolated from version control.

**Directory Structure:**

```
.devloop-internal/
├── global_settings.json         # Extension configuration
├── active_context.json          # Current ticket and workspace state
├── session-capture.json         # Browser session data
├── config-map.json              # Discovered configuration keys
├── lint-results.json            # Aggregated linting issues
├── git-state.json               # MR statuses and repository metadata
├── request-history.json         # API endpoint test history
└── repos/                       # Per-repository, per-branch data
    ├── devloop-backend-api/
    │   ├── feature-JIRA-123.json
    │   └── main.json
    └── devloop-auth-service/
        └── feature-JIRA-123.json
```
### 4.1.1 Backup & Synchronization

**Centralized Data Storage:**

To prevent data loss and enable team collaboration, the `.devloop-internal/` directory supports backup to remote storage:

**Configuration Options:**
```json
{
  "devloop.backup": {
    "enabled": true,
    "provider": "git" | "sharepoint" | "googledrive",
    "syncInterval": "hourly" | "daily" | "on-commit",
    "remoteUrl": "https://github.com/company/devloop-workspace-data",
    "autoSync": true,
    "conflictResolution": "remote-wins" | "local-wins" | "manual"
  }
}
```
<!-- @endslide -->
---
<!-- @slide -->
**Backup Strategies:**

**Option 1: Dedicated Git Repository**
```bash
# Initialize backup repo
cd .devloop-internal/
git init
git remote add origin https://github.com/company/devloop-workspace-data
git add .
git commit -m "Backup workspace data"
git push origin main
```

**Option 2: SharePoint Integration**
- Extension uses Microsoft Graph API
- Auto-upload JSON files to designated SharePoint folder
- Folder structure: `DevLoop-Backups/{username}/{workspace-name}/`

**Option 3: Google Drive Sync**
- OAuth2 authentication with Google Drive API
- Sync to `My Drive/DevLoop Workspace Data/`
- Supports shared team folders

**Crash Recovery:**
- Extension auto-detects corrupted JSON files
- Prompts to restore from latest backup
- Maintains 30 days of backup history

<!-- @endslide -->
---
<!-- @slide -->
### 4.2 Active Context Listener

**Git Event Monitoring:**

```typescript
vscode.workspace.onDidChangeTextDocument((event) => {
  // Detect git checkout operations
  if (isGitCheckout(event)) {
    const repo = getRepository(event);
    const newBranch = getCurrentBranch(repo);
    
    // Update active context
    updateManifest(repo, newBranch);
    
    // Swap dashboard data source
    loadBranchSpecificData(repo, newBranch);
    
    // Refresh UI
    dashboardProvider.refresh();
  }
});
```
<!-- @endslide -->
---
<!-- @slide -->
**Desynchronization Detection:**

```typescript
function detectDesync(repo: Repository): boolean {
  const manifestBranch = getManifestBranch(repo);
  const actualBranch = getCurrentBranch(repo);
  
  if (manifestBranch !== actualBranch) {
    showWarning(`${repo.name} is on ${actualBranch}, expected ${manifestBranch}`);
    return true;
  }
  return false;
}
```

<!-- @endslide -->
---
<!-- @slide -->
### 4.3 Branch-Specific Data Isolation

**Schema for `repos/{repo-name}/{branch}.json`:**

```json
{
  "repository": "devloop-backend-api",
  "branch": "feature/JIRA-123",
  "lastScanned": "2025-01-15T14:45:00Z",
  "linting": {
    "python": {
      "pep8": [...],
      "pyflakes": [...]
    }
  },
  "configurations": [
    {
      "key": "database.timeout",
      "file": "src/db/connection.py",
      "line": 45
    }
  ],
  "metrics": {
    "filesScanned": 156,
    "issuesFound": 12,
    "autoFixable": 8
  }
}
```

<!-- @endslide -->
---
<!-- @slide -->
### 4.4 Auto-Exclusion from Version Control

**Automatic `.gitignore` Management:**

1. Extension checks if `.devloop-internal/` is in `.gitignore`
2. If missing, prompt user:
   ```
   ⚠ The .devloop-internal/ folder should not be committed.
   
   [ Add to .gitignore ]  [ Ignore ]
   ```
3. If accepted, append to `.gitignore`:
   ```
   # DevLoop
   .devloop-internal/
   ```

<!-- @endslide -->
---
<!-- @slide -->
## 5. Configuration & Security

### 5.1 Credential Management

**VS Code Secret Storage Integration:**

```typescript
import { SecretStorage } from 'vscode';

class CredentialManager {
  constructor(private secrets: SecretStorage) {}
  
  async storeKarmicToken(token: string): Promise<void> {
    await this.secrets.store('devloop.karmicToken', token);
  }
  
  async getKarmicToken(): Promise<string | undefined> {
    return await this.secrets.get('devloop.karmicToken');
  }
}
```

**Security Features:**
- ✓ No credentials in settings.json or workspace files
- ✓ OS-level encryption (Windows Credential Manager / macOS Keychain)
- ✓ Automatic token refresh detection
- ✓ Secure prompt for initial credential entry

<!-- @endslide -->
---
<!-- @slide -->
### 5.2 User-Defined Patterns

**Extension Settings Schema:**

```json
{
  "devloop.configPatterns": [
    {
      "name": "DevLoop Config Getter",
      "pattern": "self\\.getConfiguration\\(['\"](.+?)['\"]\\)",
      "language": "python",
      "enabled": true
    }
  ],
  "devloop.linters": {
    "python": {
      "pep8": {
        "enabled": true,
        "args": ["--max-line-length=120"]
      },
      "pyflakes": {
        "enabled": true
      }
    },
    "javascript": {
      "eslint": {
        "enabled": true,
        "config": ".eslintrc.json"
      }
    }
  }
}
```

### 5.3 DevLoop-Ignore System

**Hierarchical Ignore Logic:**

1. **Global Ignore** (Extension Settings):
   ```json
   {
     "devloop.ignorePatterns": [
       "**/node_modules/**",
       "**/venv/**",
       "**/dist/**",
       "**/*.log"
     ]
   }
   ```

2. **Project Ignore** (`.devloopignore` in workspace root):
   ```
   # Third-party libraries
   lib/external/
   vendor/
   
   # Build artifacts
   build/
   *.pyc
   
   # Test data
   test/fixtures/large-dataset/
   ```

**Implementation with `picomatch`:**

```typescript
import picomatch from 'picomatch';

function shouldIgnore(filePath: string): boolean {
  const globalPatterns = getGlobalIgnorePatterns();
  const projectPatterns = getProjectIgnorePatterns();
  
  const isGloballyIgnored = picomatch(globalPatterns)(filePath);
  const isProjectIgnored = picomatch(projectPatterns)(filePath);
  
  return isGloballyIgnored || isProjectIgnored;
}
```

<!-- @endslide -->
---
<!-- @slide -->
## 6. Pull Request & Commit Logic

### 6.1 Intelligent PR Bundling

**Scenario**: Developer has completed work on `JIRA-123` across 3 repositories.

**PR Creation Workflow:**

1. **Trigger**: Click `[Create Pull Requests]` in dashboard
2. **Repository Filtering**: 
   - Only process repos with `"mode": "active"` in manifest
   - Ignore reference/inactive repositories
3. **PR Generation** (per active repo):
   ```bash
   cd devloop-backend-api
   git push origin feature/JIRA-123
   # Create PR via GitHub/GitLab API
   ```
4. **Jira Update**:
   ```markdown
   Pull Requests Created:
   - devloop-backend-api: https://github.com/company/devloop-backend-api/pull/451
   - devloop-auth-service: https://github.com/company/devloop-auth-service/pull/89
   ```

<!-- @endslide -->
---
<!-- @slide -->
### 6.2 Late-Inclusion Commit Logic

**Problem**: Repository added to ticket after initial commit.

**Solution - Catch-Up Mechanism:**

1. **Detection**: Extension identifies newly promoted repository
2. **Validation**: Check if feature branch exists
3. **Options Presented**:
   ```
   Repository 'devloop-frontend' was added late to JIRA-123.
   
   [ Create fresh branch from main ]
   [ Merge latest changes from main into feature branch ]
   [ Continue without syncing (not recommended) ]
   ```
4. **Execution**: Based on user choice, ensure consistency

<!-- @endslide -->
---
<!-- @slide -->
## 7. Advanced Features

### 7.1 Smart Desynchronization Handling

**Automatic Realignment Options:**

| Desync Type | Detection Method | Resolution |
|-------------|------------------|------------|
| Manual checkout | Git API event | Update manifest + restart linting |
| Deleted branch | Git branch lookup fails | Offer recreation or manifest removal |
| Force push | Remote SHA mismatch | Warn + suggest pull/rebase |

### 7.2 Cross-Repository Configuration Tracing

**Feature**: Track configuration usage across entire codebase.

**Use Case**: Developer changes `database.timeout` in backend, needs to know if frontend also uses it.

**Implementation:**

```typescript
async function traceConfigUsage(key: string): Promise<ConfigOccurrence[]> {
  const allRepos = getWorkspaceRepositories();
  const occurrences: ConfigOccurrence[] = [];
  
  for (const repo of allRepos) {
    const configMap = loadConfigMap(repo);
    const matches = configMap.configurations.filter(c => c.key === key);
    occurrences.push(...matches);
  }
  
  return occurrences;
}
```
<!-- @endslide -->
---
<!-- @slide -->

**Dashboard Display:**

```
Configuration Key: database.timeout

Usage across workspace:
├─ devloop-backend-api (feature/JIRA-123)
│  └─ src/db/connection.py:45
├─ devloop-worker-service (main)
│  └─ workers/db_worker.py:23
└─ devloop-frontend (develop)
   └─ src/services/api.ts:12

⚠ Note: 'devloop-frontend' uses this configuration but is not part of current ticket.

[View All Occurrences] [Export to CSV]
```

<!-- @endslide -->
---
<!-- @slide -->
### 7.3 Merge Request Tracker Integration

**Real-Time MR Status Dashboard:**

```
Recent Merge Requests (Last 10):

🟢 MR #451 - [JIRA-123] Auth refactor
   └─ Status: Open | Approvals: 2/3 | Pipeline: ✓ Passed
   └─ [View in GitLab] [Add Comment]

🟣 MR #449 - [JIRA-120] Bug fix in payment
   └─ Status: Merged | Merged by: alice@company.com
   └─ Merged: 2 hours ago

🔴 MR #447 - [JIRA-118] Database optimization
   └─ Status: Closed | Pipeline: ✗ Failed
   └─ [View Logs]
```
<!-- @endslide -->
---
<!-- @slide -->
**API Integration:**
- Poll GitLab/GitHub API every 5 minutes
- Cache results in `.devloop-internal/git-state.json`
- Show desktop notifications for status changes
- Filter by current user or current ticket

---

## 8. Implementation Roadmap

### 8.1 Development Phases

#### Phase 1: Foundation & Core Infrastructure (Weeks 1-3)

**Objectives:**
- Set up extension scaffolding
- Implement basic sidebar webview
- Create data management layer

**Deliverables:**
1. **Extension Skeleton**
   ```typescript
   // Extension entry point
   export function activate(context: vscode.ExtensionContext) {
     // Initialize credential manager
     // Register commands
     // Create sidebar provider
     // Set up file watchers
   }
   ```

2. **Sidebar Webview Provider**
   - Basic HTML/CSS structure using VS Code Webview UI Toolkit
   - Message passing bridge between webview and extension host
   - Reactive UI updates via event listeners

3. **Data Layer Foundation**
   - Create `.devloop-internal/` directory structure
   - Implement JSON read/write utilities
   - Set up file watcher for auto-refresh
   - Add `.gitignore` management

**Testing Criteria:**
- ✓ Extension loads without errors
- ✓ Sidebar renders correctly
- ✓ Data persists between VS Code sessions
- ✓ `.devloop-internal/` is auto-excluded from Git

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 2: Linting & Code Analysis (Weeks 4-6)

**Objectives:**
- Build the Unified Linter Orchestrator
- Implement DevLoop-specific validation rules
- Create diagnostic provider for inline errors

**Deliverables:**

1. **Linter Orchestrator Core**
   ```typescript
   interface LinterResult {
     tool: string;
     severity: 'Error' | 'Warning' | 'Info';
     file: string;
     line: number;
     message: string;
     canFix: boolean;
   }
   
   class LinterOrchestrator {
     async runLinters(files: string[]): Promise<LinterResult[]>;
     async applyAutoFix(result: LinterResult): Promise<void>;
   }
   ```

2. **Language-Specific Linters**
   - **Python**: pep8, pyflakes, futurize integration
   - **JavaScript**: eslint integration
   - **HTML/CSS**: htmlhint, stylelint integration

3. **DevLoop Custom Rules**
   ```python
   # Custom rule: Detect forbidden imports
   FORBIDDEN_MODULES = [
     'devloop.legacy.*',
     'deprecated_module'
   ]
   
   # Custom rule: Mandatory header check
   REQUIRED_HEADER_FIELDS = [
     'Module:',
     'Owner:',
     'DevLoop Version:'
   ]
   ```

4. **VS Code Diagnostic Integration**
   - Register diagnostic collection
   - Display inline squiggles for errors
   - Provide CodeLens for quick fixes

5. **Dashboard Linting Widget**
   - Tabbed interface for different languages
   - Sortable/filterable issue list
   - "Fix All" bulk actions

**Testing Criteria:**
- ✓ All configured linters execute successfully
- ✓ Results appear in both dashboard and inline
- ✓ Auto-fix actions work correctly
- ✓ DevLoop-specific rules catch violations
- ✓ Performance acceptable for large codebases (10,000+ files)

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 3: Multi-Repository & Git Management (Weeks 7-9)

**Objectives:**
- Implement workspace snapshot functionality
- Build multi-repo commit/push features
- Create branch management system

**Deliverables:**

1. **Workspace Snapshot System**
   - "Start DevLoop Task" wizard UI
   - Repository selector with tri-state checkboxes
   - Automated branch creation across selected repos
   - Manifest file generation (`ticket-XXX-manifest.json`)

2. **Dynamic Repository Promotion**
   - Context detection when opening files
   - Status bar promotion button
   - Real-time manifest updates

3. **Multi-Repo Git Operations**
   ```typescript
   class GitOperations {
     async commitToActiveRepos(message: string): Promise<void>;
     async pushToActiveRepos(): Promise<void>;
     async createPullRequests(): Promise<PRResult[]>;
     async detectDesynchronization(): Promise<DesyncReport>;
   }
   ```

4. **Repository State Dashboard**
   - Visual tree of all repositories
   - Real-time branch indicators
   - Desynchronization warnings
   - Bulk action controls

5. **Branch Mismatch Detection**
   - Git API event listeners
   - Automatic manifest validation
   - User alerts for manual changes

**Testing Criteria:**
- ✓ Branches created correctly in selected repos
- ✓ Manifest accurately reflects workspace state
- ✓ Bulk commits work across multiple repos
- ✓ Desynchronization detected and reported
- ✓ Late repository inclusion handled properly

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 4: Jira Integration (Weeks 10-11)

**Objectives:**
- Implement Jira REST API client
- Build ticket management features
- Create automated status updates

**Deliverables:**

1. **Jira API Client**
   ```typescript
   class JiraClient {
     async getTicket(ticketId: string): Promise<JiraTicket>;
     async postComment(ticketId: string, comment: string): Promise<void>;
     async updateStatus(ticketId: string, status: string): Promise<void>;
     async attachFile(ticketId: string, file: Buffer): Promise<void>;
   }
   ```

2. **Contextual Code Commenting**
   - Right-click context menu integration
   - Code selection → Jira comment flow
   - Automatic markdown formatting
   - Metadata inclusion (file path, line numbers)

3. **Ticket Validation UI**
   - Ticket information display
   - Confirmation dialog before starting work
   - Status history viewer

4. **Automated Status Updates**
   - On task start: Comment + status change to "Dev Assigned"
   - On commit: Comment with commit message
   - On PR creation: Comment with PR links
   - On Jenkins job: Comment with job URL

5. **Credential Management**
   - Secure Karmic Token storage using `vscode.secrets`
   - Token validation and refresh
   - User prompts for initial setup

**Testing Criteria:**
- ✓ Jira API connectivity established
- ✓ Comments posted successfully with proper formatting
- ✓ Ticket status updates work correctly
- ✓ Credentials stored securely (not in plain text)
- ✓ Error handling for network failures

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 5: Configuration Discovery (Weeks 12-13)

**Objectives:**
- Build regex-based configuration scanner
- Create configuration catalog UI
- Implement cross-repo tracing

**Deliverables:**

1. **Discovery Engine**
   ```typescript
   class ConfigDiscoveryEngine {
     async scanWorkspace(patterns: RegexPattern[]): Promise<ConfigMap>;
     async findUsages(key: string): Promise<ConfigOccurrence[]>;
     async exportCatalog(format: 'json' | 'csv'): Promise<string>;
   }
   ```

2. **Pattern Configuration UI**
   - Settings panel for custom patterns
   - Pattern testing interface
   - Language-specific pattern templates

3. **Configuration Catalog Widget**
   - Searchable list of all discovered keys
   - Reference count display
   - Click-to-navigate functionality
   - Export capabilities

4. **Cross-Repository Tracing**
   - Multi-repo search results
   - Visual representation of usage across repos
   - Branch-aware configuration tracking

5. **Smart Filtering**
   - Respect `.devloopignore` and `.gitignore`
   - Exclude test files and mocks
   - De-duplication logic

**Testing Criteria:**
- ✓ Regex patterns match expected configurations
- ✓ All occurrences found across workspace
- ✓ Search and filtering work correctly
- ✓ Navigation to code locations accurate
- ✓ Export formats generate valid data

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 6: Jenkins Integration & Endpoint Testing (Weeks 14-15)

**Objectives:**
- Implement Jenkins job triggering
- Build session-aware endpoint tester
- Create request history tracking

**Deliverables:**

1. **Jenkins Integration**
   ```typescript
   class JenkinsClient {
     async triggerJob(jobName: string, params: object): Promise<JobResult>;
     async getJobStatus(jobId: string): Promise<JobStatus>;
     async getJobLogs(jobId: string): Promise<string>;
   }
   ```

2. **Impact Analysis Trigger**
   - Repository selection UI
   - Parameter input form
   - Job status polling
   - Desktop notifications for completion

3. **Session Capture Tool**
   - Companion browser extension (Chrome/Firefox)
   - Cookie and header extraction
   - Export to `.devloop-internal/session-capture.json`

4. **Endpoint Tester UI**
   ```
   ┌─ Endpoint Tester ─────────────────────┐
   │ Method: [GET ▼] [POST] [PUT] [DELETE] │
   │ URL: /api/v2/users/profile            │
   │ Params: [+ Add Parameter]             │
   │ Headers: [Use Captured Session ✓]    │
   │                                        │
   │ [ Send Request ]  [ Save ]            │
   ├───────────────────────────────────────┤
   │ Response:                              │
   │ Status: 200 OK | Time: 234ms          │
   │ {...}                                  │
   └───────────────────────────────────────┘
   ```

5. **Request History**
   - Saved requests library
   - Quick replay functionality
   - Response comparison

**Testing Criteria:**
- ✓ Jenkins jobs triggered successfully
- ✓ Job status updates in real-time
- ✓ Session data captured correctly
- ✓ API requests execute with captured credentials
- ✓ Request history persists and replays

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 7: Advanced Features & Polish (Weeks 16-17)

**Objectives:**
- Implement merge request tracker
- Add activity stream
- Optimize performance
- Polish UI/UX

**Deliverables:**

1. **MR Tracker Widget**
   - GitLab/GitHub API integration
   - Real-time status polling
   - Desktop notifications
   - Quick actions (view, comment, approve)

2. **Activity Stream**
   - Timeline of all extension actions
   - Filtering by type/date
   - Export functionality

3. **Performance Optimizations**
   - Incremental linting (only changed files)
   - Background scanning with progress indicators
   - Caching strategies for API responses
   - Debounced file watchers

4. **UI/UX Enhancements**
   - Loading states and spinners
   - Error messages with actionable guidance
   - Keyboard shortcuts for common actions
   - Tooltips and help text

5. **Documentation**
   - In-extension help panels
   - Walkthrough tutorial for first-time users
   - Settings documentation
   - Troubleshooting guide

**Testing Criteria:**
- ✓ MR tracker updates without blocking UI
- ✓ Performance acceptable on large workspaces
- ✓ All UI elements accessible via keyboard
- ✓ Error states handled gracefully
- ✓ Documentation comprehensive and accurate

<!-- @endslide -->
---
<!-- @slide -->

#### Phase 8: Testing & Deployment (Weeks 18-20)

**Objectives:**
- Comprehensive testing across platforms
- Package extension for distribution
- Create deployment pipeline

**Deliverables:**

1. **Test Suite**
   - Unit tests for core logic
   - Integration tests for API clients
   - E2E tests for complete workflows
   - Performance benchmarks

2. **Cross-Platform Testing**
   - Windows 10/11
   - macOS (Intel & Apple Silicon)
   - Linux (Ubuntu, Fedora)

3. **Security Audit**
   - Credential storage verification
   - Network request validation
   - Dependency vulnerability scan

4. **Packaging**
   - VSIX bundle generation
   - Marketplace metadata preparation
   - Installation guide

5. **Deployment**
   - Internal distribution mechanism
   - Update notification system
   - Rollback procedures

**Testing Criteria:**
- ✓ All tests pass on all platforms
- ✓ No security vulnerabilities detected
- ✓ Extension size optimized
- ✓ Installation smooth on clean VS Code instances

<!-- @endslide -->
---
<!-- @slide -->

## 9. Technical Specifications for AI Development

### 9.1 Core Architecture Prompt

**For AI Agent - Extension Foundation:**

```
Act as a Senior VS Code Extension Developer. Build the foundational architecture for DevLoop.

REQUIREMENTS:

1. Extension Structure:
   - Create TypeScript-based VS Code extension using @types/vscode
   - Implement extension activation lifecycle
   - Set up command registration system
   - Create configuration schema in package.json

2. Webview Sidebar:
   - Build WebviewViewProvider for persistent sidebar
   - Implement bidirectional messaging between webview and extension host
   - Use VS Code Webview UI Toolkit for native look and feel
   - Support reactive updates via postMessage API

3. Data Layer:
   - Create .devloop-internal/ directory structure on activation
   - Implement FileSystemWatcher for JSON file changes
   - Build CRUD utilities for manifest files
   - Ensure atomic writes to prevent corruption

4. Security:
   - Use vscode.secrets API for credential storage
   - Never store tokens in settings.json or workspace files
   - Implement credential validation and refresh mechanisms

5. Error Handling:
   - Wrap all async operations in try-catch
   - Use vscode.window.showErrorMessage for user-facing errors
   - Log detailed errors to output channel for debugging
   - Implement graceful degradation when external services unavailable

DELIVERABLE: Complete extension scaffold with sidebar, data layer, and credential management.
```

<!-- @endslide -->
---
<!-- @slide -->

### 9.2 Linter Orchestrator Prompt

**For AI Agent - Unified Linting System:**

```
Act as an Expert in Process Management and Code Analysis. Build a unified linter orchestrator for the DevLoop extension.

REQUIREMENTS:

1. Linter Registry:
   - Read linter configurations from extension settings
   - Support multiple linters per language (Python: pep8, pyflakes, futurize)
   - Allow users to enable/disable linters individually

2. Execution Engine:
   - Use Node.js child_process.spawn to execute CLI tools
   - Capture STDOUT and STDERR streams
   - Handle process timeouts (30 seconds default)
   - Support parallel execution for multiple linters

3. Output Parsing:
   - Implement regex-based parsers for different output formats
   - Example: pep8 format: "file.py:10:5: E501 line too long"
   - Transform all outputs to unified DevLoop-JSON schema:
     {
       "tool": "pep8",
       "severity": "Warning",
       "file": "src/app.py",
       "line": 10,
       "column": 5,
       "message": "line too long (140 > 120 characters)",
       "canFix": true,
       "fixCommand": "autopep8 --in-place --max-line-length=120"
     }

4. VS Code Integration:
   - Create DiagnosticCollection for inline error display
   - Register CodeActionProvider for "Quick Fix" actions
   - Implement auto-fix execution via child_process

5. File Filtering:
   - Respect .gitignore and .devloopignore patterns
   - Use picomatch library for glob pattern matching
   - Skip files in node_modules, venv, dist directories

6. Results Aggregation:
   - Write all results to .devloop-internal/lint-results.json
   - Include metadata: timestamp, files scanned, total issues
   - Trigger UI refresh via file watcher event

DELIVERABLE: Complete linter orchestrator with Python, JavaScript, HTML/CSS support and unified output format.
```

<!-- @endslide -->
---
<!-- @slide -->

### 9.3 Multi-Repository Git Management Prompt

**For AI Agent - Git Operations:**

```
Act as a Git Workflow Automation Expert. Build the multi-repository management system for DevLoop.

REQUIREMENTS:

1. Workspace Detection:
   - Use vscode.workspace.workspaceFolders to enumerate all folders
   - For each folder, check for .git directory
   - Build repository map: { name: string, path: string, currentBranch: string }

2. Workspace Snapshot:
   - Create UI wizard with WebviewPanel
   - Display checkbox list of all detected repositories
   - For checked repos: prompt for base branch (default: 'main')
   - Execute git checkout -b feature/JIRA-{ticketId} in parallel
   - Handle errors: branch already exists, uncommitted changes, etc.

3. Manifest Generation:
   - Create .devloop-internal/ticket-{ticketId}-manifest.json
   - Schema:
     {
       "ticketId": string,
       "startedAt": ISO8601,
       "repos": {
         "[repo-name]": {
           "mode": "active" | "reference" | "inactive",
           "branch": string,
           "baseBranch": string
         }
       }
     }

4. Dynamic Promotion:
   - Listen to vscode.window.onDidChangeActiveTextEditor
   - Detect if current file's repo is not in active manifest
   - Show StatusBarItem: "[+ Add {repo} to JIRA-{ticketId}]"
   - On click: create branch, update manifest, trigger linting

5. Bulk Git Operations:
   - Implement commitToActiveRepos(message: string):
     - Filter repos where mode === "active"
     - For each: git add . && git commit -m "{message}"
     - Collect results and errors
   - Implement pushToActiveRepos():
     - For each active repo: git push origin {branch}
     - Show progress notification

6. Desynchronization Detection:
   - Use vscode.workspace.onDidSaveTextDocument to trigger checks
   - Compare manifest branch vs actual branch via git rev-parse
   - If mismatch: show warning with "Update Manifest" and "Switch Branch" actions

7. Pull Request Creation:
   - Integrate with GitHub/GitLab API
   - For each active repo: POST /repos/{owner}/{repo}/pulls
   - Collect PR URLs and post to Jira ticket

DELIVERABLE: Complete multi-repo Git management with snapshot, promotion, bulk operations, and PR creation.
```

<!-- @endslide -->
---
<!-- @slide -->

### 9.4 Configuration Discovery Prompt

**For AI Agent - Regex-Based Scanner:**

```
Act as a Code Analysis and Pattern Matching Expert. Build the configuration discovery engine for DevLoop.

REQUIREMENTS:

1. Pattern Registry:
   - Read patterns from extension settings:
     [
       {
         "name": "DevLoop Config Getter",
         "pattern": "self\\.getConfiguration\\(['\"](.+?)['\"]\\)",
         "language": "python"
       }
     ]
   - Support multiple patterns per language
   - Allow users to add custom patterns via settings UI

2. Workspace Scanning:
   - Enumerate all files matching language extensions (*.py, *.js, etc.)
   - Respect .devloopignore and .gitignore
   - Read file content using fs.readFile
   - Apply regex patterns and extract capture groups

3. Result Aggregation:
   - De-duplicate configuration keys
   - Count occurrences across files
   - Store results in .devloop-internal/config-map.json:
     {
       "configurations": [
         {
           "key": "database.timeout",
           "occurrences": [
             {
               "repo": "devloop-backend",
               "branch": "feature/JIRA-123",
               "file": "src/db/connection.py",
               "line": 45
             }
           ],
           "referenceCount": 3
         }
       ]
     }

4. UI Integration:
   - Create TreeView for configuration catalog
   - Implement search/filter functionality
   - On item click: open file and navigate to line
   - Provide "Export to CSV" command

5. Cross-Repo Tracing:
   - Implement findUsages(key: string) that searches all repos
   - Group results by repository and branch
   - Highlight if configuration used in non-active branches

6. Performance:
   - Use worker threads for large workspaces
   - Implement incremental scanning (only changed files)
   - Show progress notification during scan

DELIVERABLE: Complete configuration discovery engine with pattern matching, aggregation, and cross-repo tracing.
```

<!-- @endslide -->
---
<!-- @slide -->

### 9.5 Jira Integration Prompt

**For AI Agent - Jira REST API Client:**

```
Act as an API Integration Specialist. Build the Jira integration module for DevLoop.

REQUIREMENTS:

1. API Client:
   - Use axios or node-fetch for HTTP requests
   - Base URL from settings: jira.baseUrl
   - Authentication: Karmic Token from vscode.secrets
   - Headers: { Authorization: `Bearer ${token}`, Content-Type: 'application/json' }

2. Core Methods:
   - async getTicket(ticketId: string): Promise<JiraTicket>
     GET /rest/api/2/issue/{ticketId}
   
   - async postComment(ticketId: string, body: string): Promise<void>
     POST /rest/api/2/issue/{ticketId}/comment
     Body: { body: string }
   
   - async updateStatus(ticketId: string, transitionId: string): Promise<void>
     POST /rest/api/2/issue/{ticketId}/transitions
     Body: { transition: { id: transitionId } }

3. Contextual Commenting:
   - Register context menu command: "DevLoop: Send to Jira"
   - Get selected text via editor.document.getText(selection)
   - Auto-format code blocks:
     ```python
     # selected code
     ```
   - Include metadata: file path, line numbers, branch name

4. Automated Updates:
   - On task start: postComment + updateStatus("Dev Assigned")
   - On commit: extract message, post to Jira
   - On PR creation: post PR links

5. Error Handling:
   - Handle 401 Unauthorized: prompt for new token
   - Handle 404 Not Found: show error "Ticket not found"
   - Handle network errors: show retry button
   - Log all API requests to output channel

6. Rate Limiting:
   - Implement exponential backoff for 429 responses
   - Queue requests and process sequentially
   - Show progress for bulk operations

DELIVERABLE: Complete Jira API client with ticket management, commenting, and automated status updates.
```

<!-- @endslide -->
---
<!-- @slide -->

### 9.6 Dashboard UI Prompt

**For AI Agent - Webview Dashboard:**

```
Act as a UI/UX Developer specializing in VS Code extensions. Build the dashboard webview for DevLoop.

REQUIREMENTS:

1. Technology Stack:
   - Use VS Code Webview UI Toolkit components
   - Vanilla JavaScript (no framework dependencies)
   - CSS using VS Code design tokens (--vscode-*)
   - Message passing for extension host communication

2. Dashboard Widgets:
   
   A. Project Status Card:
      - Display active ticket ID and status
      - Connection indicators for Jira, Git, Jenkins
      - Color-coded: green (connected), red (disconnected), yellow (limited)
   
   B. Linting Hub:
      - Tabbed interface: [Python | JavaScript | HTML/CSS]
      - List of issues with: severity icon, file:line, message
      - Per-issue actions: [View] [Fix]
      - Bulk action: [Fix All {count} Issues]
   
   C. Configuration Inspector:
      - Search input with live filtering
      - List items: config key, reference count
      - Click to navigate to first occurrence
      - [Export to CSV] button
   
   D. Repository Workspace:
      - Tree view with checkboxes
      - Per-repo: name, branch, status icon
      - Commit message textarea
      - Buttons: [Commit All] [Push All] [Create PRs]
   
   E. Activity Stream:
      - Chronological list of actions
      - Icons for action type (commit, comment, job trigger)
      - Timestamps in relative format ("2 hours ago")

3. Messaging Protocol:
   
   Extension → Webview:
   - { command: 'updateLinting', data: LintResult[] }
   - { command: 'updateRepos', data: RepoState[] }
   - { command: 'updateActivity', data: Activity[] }
   
   Webview → Extension:
   - { command: 'fixIssue', issueId: string }
   - { command: 'commitRepos', message: string, repos: string[] }
   - { command: 'navigate', file: string, line: number }

4. Reactive Updates:
   - Listen for messages via window.addEventListener('message')
   - Update DOM without full re-render (targeted updates)
   - Show loading spinners during async operations

5. Accessibility:
   - Proper ARIA labels on all interactive elements
   - Keyboard navigation support (Tab, Enter, Escape)
   - Focus management for modals/dialogs
   - High contrast mode support

6. Styling:
   - Use CSS variables: var(--vscode-editor-background)
   - Consistent spacing: 8px grid system
   - Responsive layout (handle sidebar resize)
   - Loading states and empty states

DELIVERABLE: Complete dashboard webview with all widgets, messaging, and responsive design.
```

<!-- @endslide -->
---
<!-- @slide -->

## 10. Testing Strategy

### 10.1 Unit Testing

**Test Coverage Requirements:**
- ✓ All utility functions (JSON parsing, file operations)
- ✓ Linter output parsers
- ✓ Git command builders
- ✓ Configuration discovery regex patterns
- ✓ Manifest validation logic

**Framework:** Jest or Mocha with Chai

**Example Test:**
```typescript
describe('LinterOrchestrator', () => {
  it('should parse pep8 output correctly', () => {
    const output = 'app.py:10:5: E501 line too long';
    const result = parsePep8Output(output);
    
    expect(result).toEqual({
      tool: 'pep8',
      file: 'app.py',
      line: 10,
      column: 5,
      severity: 'Warning',
      message: 'line too long'
    });
  });
});
```

<!-- @endslide -->
---
<!-- @slide -->

### 10.2 Integration Testing

**Test Scenarios:**
1. **Jira API Integration**
   - Mock Jira REST API responses
   - Test authentication flow
   - Verify comment formatting
   - Test error handling (network failures, 404s)

2. **Git Operations**
   - Create test repositories
   - Test branch creation across multiple repos
   - Verify commit and push operations
   - Test desynchronization detection

3. **File System Operations**
   - Test `.devloop-internal/` creation
   - Verify JSON read/write atomicity
   - Test file watcher triggers
   - Verify `.gitignore` updates

<!-- @endslide -->
---
<!-- @slide -->

### 10.3 End-to-End Testing

**Complete Workflow Tests:**

1. **New Task Workflow**
   - Start task → Select repos → Create branches → Jira update
   - Verify: Branches created, manifest generated, Jira commented

2. **Development Workflow**
   - Make code changes → Lint → Fix issues → Commit → Push → Create PR
   - Verify: Linting works, fixes apply, commits succeed, PRs created

3. **Multi-Repo Workflow**
   - Start task with 3 repos → Commit to all → Push to all → Create PRs
   - Verify: All operations succeed, Jira updated with all PR links

<!-- @endslide -->
---
<!-- @slide -->

### 10.4 Performance Testing

**Benchmarks:**
- Workspace scan (10,000 files): < 30 seconds
- Linting (1,000 Python files): < 15 seconds
- Configuration discovery (500 files): < 10 seconds
- Dashboard initial render: < 500ms
- Dashboard update on data change: < 100ms

**Load Testing:**
- Test with workspace containing 20+ repositories
- Test with large files (10,000+ lines)
- Test with 1,000+ linting issues
- Monitor memory usage (should stay under 500MB)

<!-- @endslide -->
---
<!-- @slide -->

## 11. Deployment & Distribution

### 11.1 Packaging

**VSIX Bundle Creation:**
```bash
# Install vsce (VS Code Extension Manager)
npm install -g vsce

# Package extension
vsce package

# Output: devloop-workspace-manager-1.0.0.vsix
```

**package.json Configuration:**
```json
{
  "name": "devloop-workspace-manager",
  "displayName": "DevLoop",
  "description": "Enterprise workspace orchestration for DevLoop development",
  "version": "1.0.0",
  "publisher": "your-company",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": [
    "Other",
    "Programming Languages",
    "Linters"
  ],
  "keywords": [
    "jira",
    "git",
    "linting",
    "multi-repo",
    "enterprise"
  ],
  "icon": "images/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/company/devloop-workspace-manager"
  }
}
```

<!-- @endslide -->
---
<!-- @slide -->

### 11.2 Internal Distribution

**Option 1: Private Marketplace**
- Publish to company's internal VS Code Marketplace
- Configure auto-updates via marketplace API

**Option 2: Direct Distribution**
- Host VSIX file on internal web server
- Provide installation instructions:
  ```
  1. Download devloop-workspace-manager.vsix
  2. Open VS Code
  3. Extensions panel → ⋯ menu → Install from VSIX
  4. Select downloaded file
  ```

**Option 3: Enterprise Management**
- Deploy via Group Policy (Windows)
- Use MDM solutions for macOS
- Include in developer onboarding package

<!-- @endslide -->
---
<!-- @slide -->

### 11.3 Update Mechanism

**Version Check:**
```typescript
async function checkForUpdates() {
  const currentVersion = vscode.extensions.getExtension('devloop-workspace-manager').packageJSON.version;
  const latestVersion = await fetch('https://internal-server/devloop-extension/version.json');
  
  if (semver.gt(latestVersion, currentVersion)) {
    vscode.window.showInformationMessage(
      `DevLoop ${latestVersion} is available. Current: ${currentVersion}`,
      'Download',
      'Release Notes',
      'Dismiss'
    ).then(selection => {
      if (selection === 'Download') {
        vscode.env.openExternal(vscode.Uri.parse('https://internal-server/devloop-extension/latest.vsix'));
      }
    });
  }
}
```


**Auto-Update Configuration:**
```json
{
  "devloop.updates": {
    "checkOnStartup": true,
    "checkInterval": "daily",
    "autoDownload": false,
    "notifyOnNewVersion": true
  }
}
```

<!-- @endslide -->
---
<!-- @slide -->

## 12. Troubleshooting & Support

### 12.1 Common Issues & Solutions

#### Issue 1: Extension Fails to Activate

**Symptoms:**
- DevLoop sidebar doesn't appear
- Commands not registered in Command Palette

**Solutions:**
1. Check VS Code version: Requires 1.75.0 or higher
2. View Output panel → Select "DevLoop" → Check for errors
3. Reload window: Cmd/Ctrl + Shift + P → "Developer: Reload Window"
4. Reinstall extension: Remove and reinstall VSIX

#### Issue 2: Jira Connection Fails

**Symptoms:**
- "Unable to connect to Jira" error
- Comments not posting

**Solutions:**
1. Verify Karmic Token:
   - Settings → DevLoop → Credentials → Re-enter token
   - Test token validity: `curl -H "Authorization: Bearer {token}" {jira-url}/rest/api/2/myself`
2. Check network connectivity:
   - Verify VPN connection if required
   - Check corporate proxy settings
3. Verify Jira base URL in settings
4. Check Jira API permissions for the token

<!-- @endslide -->
---
<!-- @slide -->

#### Issue 3: Linting Not Working

**Symptoms:**
- No issues shown in dashboard
- Diagnostic squiggles missing

**Solutions:**
1. Verify linter tools installed:
   ```bash
   pip install pep8 pyflakes
   npm install -g eslint
   ```
2. Check linter settings:
   - Settings → DevLoop → Linters → Ensure enabled
3. Check file patterns:
   - Verify files not in `.devloopignore`
4. Manual scan trigger:
   - Command Palette → "DevLoop: Scan Workspace for Issues"
5. Check output logs for execution errors

<!-- @endslide -->
---
<!-- @slide -->

#### Issue 4: Multi-Repo Commits Fail

**Symptoms:**
- "Git command failed" errors
- Partial commits (some repos succeed, others fail)

**Solutions:**
1. Check Git configuration:
   ```bash
   git config user.name
   git config user.email
   ```
2. Verify no uncommitted changes conflict
3. Check branch exists in all selected repos
4. Verify network connectivity for push operations
5. Check Git credentials/SSH keys

<!-- @endslide -->
---
<!-- @slide -->

#### Issue 5: Configuration Discovery Returns No Results

**Symptoms:**
- Configuration catalog empty
- Search returns no matches

**Solutions:**
1. Verify regex patterns in settings
2. Check file extensions match language configuration
3. Ensure files not excluded by `.devloopignore`
4. Manually trigger scan:
   - Command Palette → "DevLoop: Discover Configurations"
5. Check pattern syntax with online regex tester

<!-- @endslide -->
---
<!-- @slide -->

### 12.2 Debug Mode

**Enable Verbose Logging:**
```json
{
  "devloop.debug": {
    "enabled": true,
    "logLevel": "verbose",
    "logToFile": true,
    "logFilePath": "${workspaceFolder}/.devloop-internal/debug.log"
  }
}
```

**Debug Output Includes:**
- All API requests/responses
- Git command execution
- File system operations
- Linter execution details
- Performance metrics

<!-- @endslide -->
---
<!-- @slide -->

### 12.3 Support Resources

**Internal Documentation:**
- Wiki: `https://internal-wiki/devloop-workspace-manager`
- Video tutorials: `https://internal-training/devloop-extension`
- FAQ: `https://internal-wiki/devloop-faq`

**Getting Help:**
1. **Slack Channel**: `#devloop-dev-tools`
2. **Email Support**: `dev-tools@company.com`
3. **Issue Tracker**: `https://internal-jira/DevLoopEXT`

**Feedback:**
- Feature requests: Use thumbs down button in extension + comment
- Bug reports: Include debug logs and reproduction steps
- Suggestions: Post in Slack channel or email support

<!-- @endslide -->
---
<!-- @slide -->

## 13. Security & Compliance

### 13.1 Data Security

**Sensitive Data Handling:**

| Data Type | Storage Location | Encryption |
|-----------|------------------|------------|
| Karmic Token | VS Code Secret Storage | OS-level encryption |
| Git Credentials | VS Code Secret Storage | OS-level encryption |
| Session Cookies | `.devloop-internal/session-capture.json` | Base64 encoded (not encrypted) |
| Jira Ticket Data | `.devloop-internal/` JSON files | Plain text (local only) |
| Linting Results | `.devloop-internal/lint-results.json` | Plain text (local only) |

**Security Best Practices:**

1. **Credential Rotation:**
   - Prompt for token refresh every 90 days
   - Automatic re-authentication on 401 errors
   - Never log tokens in debug output

2. **Network Security:**
   - All API calls over HTTPS only
   - Certificate validation enabled
   - Support for corporate proxy settings

3. **Code Injection Prevention:**
   - Sanitize all user input before shell execution
   - Use parameterized Git commands
   - Escape special characters in commit messages

4. **Webview Security:**
   - Content Security Policy enforced
   - No inline scripts in webview HTML
   - Message validation between webview and extension

<!-- @endslide -->
---
<!-- @slide -->

### 13.2 Compliance Requirements

**Data Retention:**
- `.devloop-internal/` data retained only on local machine
- No data transmitted to external servers except documented APIs
- User can delete all extension data via command: "DevLoop: Clear All Data"

**Audit Trail:**
```json
{
  "jira.audit": {
    "enabled": true,
    "logActions": [
      "ticketComments",
      "statusUpdates",
      "fileAttachments"
    ],
    "logLocation": ".devloop-internal/audit.log"
  }
}
```

**Privacy:**
- Extension never collects telemetry without explicit opt-in
- No usage data sent to external servers
- No PII stored in extension files

<!-- @endslide -->
---
<!-- @slide -->

### 13.3 Permission Model

**Required VS Code Permissions:**
- File system access (workspace folders only)
- Git API access (read/write)
- Secret storage access
- Webview creation
- Network access (for API calls)

**Optional Permissions:**
- Clipboard access (for copying results)
- Notification display

<!-- @endslide -->
---
<!-- @slide -->

## 14. Future Enhancements

### 14.1 Planned Features (Phase 2)

#### 14.1.1 AI-Powered Code Review
- Integration with LLM for pre-commit code review
- Automatic detection of common DevLoop anti-patterns
- Intelligent suggestions for code improvements

#### 14.1.2 Visual Dependency Graph
- Interactive visualization of repository dependencies
- Impact analysis: "If I change this file, what else is affected?"
- Cross-repo call graph for API endpoints

#### 14.1.3 Team Collaboration Features
- See which repos teammates are working on
- Live indicators of who's on which branch
- Shared workspace snapshots for pair programming

#### 14.1.4 Advanced Jenkins Integration
- Pipeline visualization in sidebar
- One-click rollback for failed deployments
- Build artifact browser

#### 14.1.5 Performance Profiling
- Integrated profiling for Python/JavaScript code
- Performance regression detection
- Benchmark tracking across commits

<!-- @endslide -->
---
<!-- @slide -->

### 14.2 Experimental Features

#### 14.2.1 Natural Language Commands
```
Developer: "Create a new feature branch for JIRA-456 in backend and frontend"
Extension: *Creates branches, updates manifest, opens Jira ticket*
```

#### 14.2.2 Smart Conflict Resolution
- AI-assisted merge conflict resolution
- Automatic detection of safe auto-merge scenarios
- Visual diff with conflict explanation

#### 14.2.3 Code Generation Templates
- DevLoop-specific code snippets
- Boilerplate generation for new services
- Automatic test file generation

### 14.3 Integration Roadmap

**Planned Integrations:**
- Slack: Direct messaging from extension
- Confluence: Documentation sync
- SonarQube: Code quality metrics
- Sentry: Error tracking integration
- New Relic: Performance monitoring

<!-- @endslide -->
---
<!-- @slide -->

## 15. Appendices

### 15.1 Glossary

| Term | Definition |
|------|------------|
| **Active Repository** | Repository with a feature branch for the current ticket, eligible for commits |
| **Reference Repository** | Repository pinned to a stable branch/tag for context, read-only |
| **Workspace Snapshot** | Complete state capture of all repositories at task start |
| **Manifest File** | JSON file describing repository states for a specific ticket |
| **DevLoop-JSON** | Standardized output format for linting and analysis tools |
| **Karmic Token** | Authentication token for Jira API access |
| **Desynchronization** | State where actual branch differs from manifest expectation |
| **Dynamic Promotion** | Adding a repository to active state mid-development |

<!-- @endslide -->
---
<!-- @slide -->

### 15.2 API Reference

#### Extension Commands

```typescript
// Register all commands in package.json
{
  "contributes": {
    "commands": [
      {
        "command": "devloop.startTask",
        "title": "DevLoop: Start Task",
        "icon": "$(play)"
      },
      {
        "command": "devloop.commitAll",
        "title": "DevLoop: Commit All Active Repos"
      },
      {
        "command": "devloop.scanWorkspace",
        "title": "DevLoop: Scan Workspace"
      },
      {
        "command": "devloop.sendToJira",
        "title": "DevLoop: Send Selection to Jira"
      },
      {
        "command": "devloop.triggerJenkins",
        "title": "DevLoop: Trigger Impact Analysis"
      },
      {
        "command": "devloop.discoverConfigs",
        "title": "DevLoop: Discover Configurations"
      },
      {
        "command": "devloop.clearData",
        "title": "DevLoop: Clear All Extension Data"
      }
    ]
  }
}
```

<!-- @endslide -->
---
<!-- @slide -->

#### Configuration Schema

```typescript
interface DevLoopConfiguration {
  // Jira Settings
  jira: {
    baseUrl: string;
    autoCommentOnCommit: boolean;
    autoCommentOnPR: boolean;
    defaultStatus: string;
  };
  
  // Linter Settings
  linters: {
    [language: string]: {
      [tool: string]: {
        enabled: boolean;
        args: string[];
        timeout: number;
      };
    };
  };
  
  // Configuration Discovery
  configPatterns: Array<{
    name: string;
    pattern: string;
    language: string;
    enabled: boolean;
  }>;
  
  // Git Settings
  git: {
    defaultBaseBranch: string;
    autoCreateBranches: boolean;
    branchNameTemplate: string; // "feature/{ticketId}"
  };
  
  // Jenkins Settings
  jenkins: {
    baseUrl: string;
    defaultJob: string;
  };
  
  // Ignore Patterns
  ignorePatterns: string[];
  
  // Debug Settings
  debug: {
    enabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'verbose';
    logToFile: boolean;
  };
}
```

<!-- @endslide -->
---
<!-- @slide -->

### 15.3 File Format Specifications

#### Manifest File Format (ticket-{id}-manifest.json)

```typescript
interface TicketManifest {
  ticketId: string;
  startedAt: string; // ISO 8601
  startedBy: string; // email
  jiraUrl: string;
  status: 'active' | 'completed' | 'abandoned';
  repos: {
    [repoName: string]: {
      mode: 'active' | 'reference' | 'inactive';
      branch: string;
      baseBranch: string;
      type?: 'branch' | 'tag';
      pinned?: boolean;
      createdAt: string; // ISO 8601
      lastCommit?: string; // SHA
    };
  };
  metadata: {
    totalCommits: number;
    pullRequests: Array<{
      repo: string;
      url: string;
      status: 'open' | 'merged' | 'closed';
    }>;
    jenkinsJobs: Array<{
      jobId: string;
      url: string;
      status: 'pending' | 'running' | 'success' | 'failed';
    }>;
  };
}
```

<!-- @endslide -->
---
<!-- @slide -->

#### Lint Results Format (lint-results.json)

```typescript
interface LintResults {
  scannedAt: string; // ISO 8601
  workspacePath: string;
  summary: {
    totalFiles: number;
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    fixableCount: number;
  };
  byLanguage: {
    [language: string]: {
      files: number;
      issues: number;
    };
  };
  issues: Array<{
    tool: string;
    severity: 'Error' | 'Warning' | 'Info';
    file: string;
    line: number;
    column?: number;
    message: string;
    canFix: boolean;
    fixCommand?: string;
    ruleId?: string;
  }>;
}
```

<!-- @endslide -->
---
<!-- @slide -->

#### Configuration Map Format (config-map.json)

```typescript
interface ConfigurationMap {
  discoveredAt: string; // ISO 8601
  totalKeys: number;
  patterns: string[]; // Patterns used for discovery
  configurations: Array<{
    key: string;
    type: 'discovered' | 'documented';
    occurrences: Array<{
      repo: string;
      branch: string;
      file: string;
      line: number;
      pattern: string;
      context?: string; // Surrounding code
    }>;
    referenceCount: number;
    documentation?: string;
    defaultValue?: any;
  }>;
}
```

<!-- @endslide -->
---
<!-- @slide -->

### 15.4 Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| DevLoop-001 | Jira authentication failed | Re-enter Karmic Token in settings |
| DevLoop-002 | Git command execution failed | Check Git installation and configuration |
| DevLoop-003 | Jenkins job trigger failed | Verify Jenkins URL and credentials |
| DevLoop-004 | Linter executable not found | Install required linter tool (pep8, eslint, etc.) |
| DevLoop-005 | Invalid ticket ID format | Use format: PROJECT-NUMBER (e.g., JIRA-123) |
| DevLoop-006 | Repository not found | Ensure repository is in workspace folders |
| DevLoop-007 | Branch already exists | Choose different branch name or delete existing |
| DevLoop-008 | Uncommitted changes detected | Commit or stash changes before operation |
| DevLoop-009 | Network connection failed | Check network connectivity and proxy settings |
| DevLoop-010 | Permission denied | Check file system permissions for .devloop-internal/ |
| DevLoop-011 | Invalid regex pattern | Verify pattern syntax in configuration |
| DevLoop-012 | Manifest file corrupted | Delete and recreate via "Start Task" |

<!-- @endslide -->
---
<!-- @slide -->

### 15.5 Keyboard Shortcuts

**Default Keybindings:**

| Command | Windows/Linux | macOS | Description |
|---------|---------------|-------|-------------|
| Start Task | `Ctrl+Shift+J T` | `Cmd+Shift+J T` | Open task start wizard |
| Scan Workspace | `Ctrl+Shift+J S` | `Cmd+Shift+J S` | Trigger full workspace scan |
| Commit All | `Ctrl+Shift+J C` | `Cmd+Shift+J C` | Commit all active repos |
| Send to Jira | `Ctrl+Shift+J M` | `Cmd+Shift+J M` | Send selection to Jira |
| Show Dashboard | `Ctrl+Shift+J D` | `Cmd+Shift+J D` | Focus on DevLoop sidebar |
| Quick Fix | `Ctrl+.` | `Cmd+.` | Show available quick fixes |

**Custom Keybindings:**
Users can customize in Settings → Keyboard Shortcuts → Search "DevLoop"

### 15.6 Performance Benchmarks

**Target Performance Metrics:**

| Operation | Small Workspace (<1000 files) | Large Workspace (10000+ files) |
|-----------|-------------------------------|--------------------------------|
| Initial Scan | < 5 seconds | < 30 seconds |
| Python Linting | < 3 seconds | < 15 seconds |
| Config Discovery | < 2 seconds | < 10 seconds |
| Dashboard Render | < 200ms | < 500ms |
| Git Commit (5 repos) | < 5 seconds | < 10 seconds |
| Jira API Call | < 1 second | < 1 second |

**Memory Usage:**
- Idle: ~50MB
- Active scanning: ~200MB
- Peak (large workspace): <500MB

**Optimization Techniques:**
- Incremental scanning (only changed files)
- Lazy loading of dashboard widgets
- Debounced file system watchers
- Cached API responses (5 minute TTL)
- Worker threads for CPU-intensive tasks

<!-- @endslide -->
---
<!-- @slide -->

## 16. Summary & Quick Start

### 16.1 Installation Quick Start

1. **Download Extension:**
   - Get VSIX from internal server: `https://internal-server/devloop-extension/latest.vsix`

2. **Install:**
   ```
   VS Code → Extensions → ⋯ → Install from VSIX → Select file
   ```

3. **Configure Credentials:**
   - Command Palette → "DevLoop: Configure Credentials"
   - Enter Jira Karmic Token
   - Enter Jenkins Token (optional)

4. **Set Jira Base URL:**
   - Settings → Extensions → DevLoop → Jira Base URL
   - Example: `https://jira.company.com`

5. **Install Linter Tools:**
   ```bash
   pip install pep8 pyflakes
   npm install -g eslint
   ```

6. **Open DevLoop Workspace:**
   - File → Open Workspace
   - Select workspace containing DevLoop repositories

7. **Start First Task:**
   - Click "Start Task" in DevLoop sidebar
   - Enter ticket ID (e.g., JIRA-123)
   - Select repositories to work on
   - Begin development!

<!-- @endslide -->
---
<!-- @slide -->

### 16.2 Daily Workflow

**Morning:**
1. Open VS Code workspace
2. Click "Start Task" → Enter ticket ID
3. Select repositories for today's work
4. Extension creates feature branches automatically

**During Development:**
1. Write code
2. View linting issues in dashboard
3. Apply quick fixes
4. Use "Send to Jira" for questions/updates

**End of Day:**
1. Review changes in Repository Workspace widget
2. Enter commit message
3. Click "Commit All" → "Push All"
4. Click "Create Pull Requests"
5. Extension updates Jira automatically

<!-- @endslide -->
---
<!-- @slide -->

### 16.3 Key Benefits Recap

✅ **Productivity:**
- 60% reduction in context switching
- Automated branch management across 10+ repos
- One-click commit/push/PR creation

✅ **Code Quality:**
- Real-time linting for Python, JS, HTML/CSS
- Auto-fix for Python 3 migration
- DevLoop-specific rule enforcement

✅ **Visibility:**
- Unified dashboard for all dev tools
- Configuration usage tracking
- Real-time MR status

✅ **Collaboration:**
- Automatic Jira updates
- Shared workspace snapshots
- Team activity visibility

<!-- @endslide -->
---
<!-- @slide -->

## 17. Conclusion

The **DevLoop** extension transforms the DevLoop development experience by providing a unified command center that orchestrates Jira, Git, Jenkins, and code quality tools. Through intelligent multi-repository management, automated linting, and seamless integrations, developers can focus on writing code rather than managing tooling complexity.

**Project Success Criteria:**
- ✅ Reduces average task setup time from 15 minutes to 2 minutes
- ✅ Increases code quality scores by 40% through automated linting
- ✅ Eliminates manual Jira updates, saving 30 minutes per developer per day
- ✅ Provides 100% visibility into multi-repo workspace state
- ✅ Achieves 95% developer adoption within 3 months of release

**Next Steps:**
1. Review and approve this specification
2. Assign development team and resources
3. Set up development environment
4. Begin Phase 1 implementation
5. Schedule weekly progress reviews

**Contact:**
For questions or clarifications about this specification, contact:
- **Project Lead**: [Name] - [email]
- **Technical Lead**: [Name] - [email]
- **Product Owner**: [Name] - [email]

<!-- @endslide -->
---
<!-- @slide -->

**Document Version:** 1.0  
**Last Updated:** December 20, 2025  
**Status:** Final - Ready for Implementation  
**Prepared For:** AI Development Agents & Development Team

<!-- @endslide -->
