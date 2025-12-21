# DevLoop Workspace Manager

Unified Code Development Workflow & Workspace Orchestration for VS Code.

## Features

### Phase 1 (Current)
- ✅ **Jira Integration**: Fetch tickets, post comments, log work time
- ✅ **Jenkins Integration**: Trigger jobs, monitor builds, view logs
- ✅ **Git Provider Integration**: GitHub/GitLab/Bitbucket support for PR creation
- ✅ **Time Tracking**: Automatic timer with idle detection, pause/resume
- ✅ **Repository Workspace**: Multi-repo management, bulk commit/push
- ✅ **Dashboard UI**: Complete sidebar with all widgets
- 🔸 **Linting Hub**: Mock data (full implementation in Phase 2)
- 🔸 **Config Catalog**: Mock data (full implementation in Phase 2)

## Installation

1. Install the VSIX file: `Extensions > Install from VSIX...`
2. Reload VS Code
3. Click the DevLoop icon in the activity bar
4. Configure your integrations (see Configuration section below)

## Configuration

### Quick Setup

Use the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) to configure:

1. **Configure Jira**: `DevLoop: Configure Jira Connection`
   - Enter Jira base URL
   - Enter your email address
   - Enter API token (create at: https://id.atlassian.com/manage-profile/security/api-tokens)

2. **Configure Git Provider** (Optional): `DevLoop: Configure Git Provider`
   - Select provider (GitHub/GitLab/Bitbucket)
   - Enter base URL
   - Enter personal access token

3. **Configure Jenkins** (Optional): `DevLoop: Configure Jenkins`
   - Enter Jenkins server URL
   - Enter username
   - Enter API token
   - Optionally set default job name

### Manual Configuration

Open VS Code Settings (`Ctrl+,`) and search for "DevLoop":

#### Jira Settings
- `devloop.jira.baseUrl`: Your Jira instance URL (e.g., https://jira.company.com)
- `devloop.jira.email`: Your Jira account email
- `devloop.jira.enabled`: Enable/disable Jira integration (default: true)

#### Git Provider Settings
- `devloop.git.provider`: Git provider type (github/gitlab/bitbucket)
- `devloop.git.baseUrl`: Git provider API URL
- `devloop.git.enabled`: Enable/disable Git integration (default: true)
- `devloop.git.defaultBaseBranch`: Default base branch (default: "main")
- `devloop.git.branchPrefix`: Feature branch prefix (default: "feature/")

#### Jenkins Settings
- `devloop.jenkins.baseUrl`: Jenkins server URL
- `devloop.jenkins.username`: Jenkins username
- `devloop.jenkins.enabled`: Enable/disable Jenkins integration (default: false)
- `devloop.jenkins.defaultJob`: Default job name for impact analysis
- `devloop.jenkins.jobParameters`: Default job parameters (JSON object)

#### Time Tracker Settings
- `devloop.timeTracker.idleThreshold`: Minutes before auto-pause (default: 5)
- `devloop.timeTracker.autoStart`: Auto-start timer on task begin (default: true)

#### Development Settings
- `devloop.useMockData`: Use mock data instead of live APIs (default: false)

### Credentials Storage

All API tokens are stored securely using VS Code's Secret Storage API:
- Jira API token
- Git provider personal access token
- Jenkins API token

Credentials are encrypted at the OS level and never stored in plain text.

## Usage

### Start a Task
1. Click **"Start Task"** in the DevLoop sidebar
2. Enter a Jira ticket ID (e.g., JIRA-1234)
3. Confirm the ticket details
4. Timer starts automatically (if enabled)
5. Feature branches created in selected repositories

### End a Task
1. Click **"End Task & Log Time"**
2. Confirm to log time to Jira
3. Timer stops and worklog is posted
4. Task marked as complete

### Time Tracking
- Timer shows HH:MM:SS format
- Auto-pauses after 5 minutes of inactivity (configurable)
- Manual pause/resume controls available
- Time synced to Jira worklog on task completion

### Repository Management
- Checkboxes show active/reference repositories
- Enter commit message and click **Commit** or **Push**
- Create PRs with bulk action button
- Branch creation automated per ticket

### Jenkins Integration
- Trigger impact analysis jobs
- Monitor build status
- View build logs
- Automatic Jira comments with job links

## Commands

### Configuration
- `DevLoop: Configure Jira Connection` - Step-by-step Jira setup
- `DevLoop: Configure Git Provider` - Setup GitHub/GitLab/Bitbucket
- `DevLoop: Configure Jenkins` - Setup Jenkins integration
- `DevLoop: Open Settings Panel` - Open settings UI (coming soon)

### Task Management
- `DevLoop: Start Task` - Begin work on a Jira ticket
- `DevLoop: End Task & Log Time` - Complete task and log time
- `DevLoop: Refresh Dashboard` - Reload all dashboard data

### Time Tracking
- `DevLoop: Pause Timer` - Pause the time tracker
- `DevLoop: Resume Timer` - Resume the time tracker

### Repository Operations
- `DevLoop: Commit All Repositories` - Commit to all active repos
- `DevLoop: Push All Repositories` - Push all active repos
- `DevLoop: Create Pull Requests` - Create PRs for all active repos

### Maintenance
- `DevLoop: Clear All Data` - Remove all extension data and credentials

## Connection Status

The **Project Health** widget shows real-time connection status:
- 🟢 **Green**: Connected and working
- 🟡 **Yellow**: Configured but limited access
- 🔴 **Red**: Not configured or connection failed

Click on any service to see detailed status and configuration options.

## Data Storage

Extension data is stored in VS Code's global storage directory (outside workspace):
- Windows: `%APPDATA%/Code/User/globalStorage/devloop.devloop-workspace-manager/`
- macOS: `~/Library/Application Support/Code/User/globalStorage/devloop.devloop-workspace-manager/`
- Linux: `~/.config/Code/User/globalStorage/devloop.devloop-workspace-manager/`

Each workspace has its own subdirectory with manifests and session data.

## Troubleshooting

### Jira Connection Failed
- Verify base URL is correct (include https://)
- Check email address matches your Jira account
- Ensure API token is valid (regenerate if needed)
- Check network connectivity and firewall settings

### Jenkins Connection Failed
- Verify Jenkins URL is accessible
- Check username and API token are correct
- Ensure you have permissions for the jobs you want to trigger
- Check Jenkins CSRF protection settings

### Git Provider Issues
- Verify personal access token has required scopes:
  - GitHub: `repo`, `workflow`
  - GitLab: `api`, `write_repository`
  - Bitbucket: `repository:write`, `pullrequest:write`

### Timer Not Persisting
- Check VS Code has write permissions to global storage directory
- Verify workspace folder is trusted
- Try reloading VS Code window

## Development

### Mock Mode
Set `devloop.useMockData: true` to use mock data without live APIs:
- Mock tickets available: `JIRA-1234`, `DL-123` or any ID
- Git operations show success notifications
- Jenkins jobs simulate successful builds
- Time tracking works with local storage only

### Building from Source
```bash
npm install
npm run compile
npm run build  # Creates VSIX package
```

### Running Tests
```bash
npm test
```

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please contact your DevLoop administrator or open an issue in the repository.
