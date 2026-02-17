# Polygon Validator Stake Tracker

> Track validator staking activity on Polygon with detailed reports on delegations, unbonds, and top stakers. Run analysis via CLI or GitHub Actions.

## 📋 Table of Contents
- [What is This?](#what-is-this)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [GitHub Actions Guide](#github-actions-guide)
- [Project Structure](#project-structure)
- [Examples](#examples)

## What is This?

A tool to monitor Polygon validator staking activity:
- **Track new delegators** - See who staked in the last X hours
- **Monitor unbonds** - Find large unstaking events
- **Analyze top stakers** - Report on biggest delegators across all validators
- **Filter intelligently** - Automatically exclude exchanges & DeFi protocols
- **Export data** - All results exportable to JSON

## 🎯 Key Features

- 🆕 **New Delegations Tracking** - Monitor new stakers (24-168 hours)
- 📊 **Unbonding Analysis** - Track large unstaking across all validators
- 👥 **Top Delegators Reports** - Find biggest stakers
- 🤖 **GitHub Actions** - Run reports manually via workflows (no cron)
- 🔍 **Smart Filtering** - Excludes exchanges & DeFi automatically
- 💾 **Data Export** - JSON export for all reports
- 📈 **Fund Flow Analysis** - MetaSleuth integration

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/YOUR_USERNAME/validator-stake-tracker.git
cd validator-stake-tracker
npm install
```

### 2. Setup API Keys

Create a `.env` file in the project root:

```bash
ETHERSCAN_API_KEY=your_etherscan_key_here
POLYGONSCAN_API_KEY=your_polygonscan_key_here
```

**Get free API keys:**
- [Etherscan API](https://etherscan.io/apis) - **Required** for delegation data (delegations happen on Ethereum)
- [PolygonScan API](https://polygonscan.com/apis) - For unbond data

### 3. Run Your First Command

```bash
# Check who delegated in the last 48 hours
npx track-validator new-delegations --hours 48
```

## 🛠️ CLI Commands

### View All Commands
```bash
npx track-validator --help
```

### 1. Check New Delegations

Track who delegated POL to validators in a specific time period.

```bash
# Last 48 hours (default)
npx track-validator new-delegations

# Custom time period
npx track-validator new-delegations --hours 24

# Show more results and export to JSON
npx track-validator new-delegations --hours 72 --top 100 --export
```

**What you get:**
- Delegator wallet addresses
- Validator name & ID
- Amount delegated (POL)
- Transaction timestamp
- Etherscan transaction links

### 2. Check Biggest Unbonds

Find the largest unstaking transactions.

```bash
# All validators, last 7 days
npx track-validator biggest-unbonds

# Specific validator
npx track-validator biggest-unbonds 142 --days 14

# Export to JSON
npx track-validator biggest-unbonds --days 30 --top 100 --export
```

**What you get:**
- Unbond amounts
- Validator details
- Delegator addresses
- Summary statistics

### 3. Top Delegators

Get a report of the biggest stakers across all validators.

```bash
# Top 100 by net stake (last 6 months)
npx track-validator biggest-delegators

# Custom parameters
npx track-validator biggest-delegators --months 3 --top 50 --export
```

**What you get:**
- Net stake per address
- Validator distribution
- Delegation & unbond totals
- Ranking

### 4. Analyze Specific Validator

Deep-dive analysis of a single validator.

```bash
# Basic analysis
npx track-validator analyze 142 --months 6

# Complete analysis with charts and fund flows
npx track-validator combined 142 --with-visualizations
```

## 🤖 GitHub Actions Guide

Run reports directly on GitHub without installing anything locally!

### How GitHub Actions Work

1. **Fork this repository** to your GitHub account
2. **Add API keys** as GitHub secrets
3. **Click "Run workflow"** from the Actions tab
4. **Download results** as JSON artifacts

### Setting Up GitHub Actions

#### Step 1: Fork the Repository
Click the "Fork" button at the top of this repository.

#### Step 2: Add API Keys as Secrets

1. Go to your forked repo
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these two secrets:

| Secret Name | Value |
|------------|-------|
| `ETHERSCAN_API_KEY` | Your Etherscan API key |
| `POLYGONSCAN_API_KEY` | Your PolygonScan API key |

![Add Secret Screenshot](https://docs.github.com/assets/cb-48657/images/help/repository/add-repository-secret.png)

#### Step 3: Run a Workflow

1. Go to the **Actions** tab in your forked repo
2. Select a workflow from the left sidebar
3. Click **Run workflow** (green button on the right)
4. Fill in parameters or use defaults
5. Click **Run workflow**

### Available Workflows

#### 🆕 Check New Delegations

**What it does:** Finds all new delegators in a specified time period

**How to run:**
1. Actions → **Check New Delegations**
2. Click **Run workflow**
3. Set parameters:
   - **Hours**: How far back to look (default: 48)
   - **Top**: Number of results (default: 50)
4. Click **Run workflow**

**Results:** Download JSON artifact with full report

**Example output:**
```
10 NEW DELEGATIONS (Last 48 hours)
1. 64,625.17 POL → Everstake 0% fee
2. 40,000 POL → Upbit Staking
3. 27,075.86 POL → Allnodes
...
```

#### 📊 Check Biggest Unbonds

**What it does:** Tracks the largest unstaking transactions

**How to run:**
1. Actions → **Check Biggest Unbonds**
2. Click **Run workflow**
3. Set parameters:
   - **Days**: Time period (default: 7)
   - **Top**: Number of results (default: 50)
4. Click **Run workflow**

**Results:** JSON artifact with unbond details

**Use case:** Monitor potential sell pressure from large unbonds

#### 👥 Top Delegators Report

**What it does:** Generates a report of the biggest stakers

**How to run:**
1. Actions → **Top Delegators Report**
2. Click **Run workflow**
3. Set parameters:
   - **Months**: Analysis period (default: 6)
   - **Top**: Number of delegators (default: 100)
4. Click **Run workflow**

**Results:** Comprehensive report of top stakers

**Note:** This can take 10-20 minutes as it queries Ethereum

#### 🔍 Analyze Specific Validator

**What it does:** Deep-dive analysis of a single validator

**How to run:**
1. Actions → **Analyze Specific Validator**
2. Click **Run workflow**
3. Enter **Validator ID** (required)
4. Set **Months** (default: 6)
5. Click **Run workflow**

**Results:** Full validator analysis with charts

### Downloading Results

After a workflow completes:

1. Click on the workflow run
2. Scroll down to **Artifacts**
3. Click to download the JSON file
4. Open in any text editor or JSON viewer

### Workflow Run Times

| Workflow | Typical Duration |
|----------|-----------------|
| New Delegations | 1-2 minutes |
| Biggest Unbonds | 3-5 minutes |
| Top Delegators | 10-20 minutes |
| Validator Analysis | 2-5 minutes |

### Important Notes

- ✅ All workflows are **manual-only** (no automatic schedules)
- ✅ Results saved as artifacts for 30-90 days
- ✅ Free to run on GitHub's infrastructure
- ✅ No server or hosting costs
- ⚠️ Must add API keys as secrets first

## 📁 Project Structure

```
validator-stake-tracker/
├── .github/workflows/       # GitHub Actions (4 manual workflows)
│   ├── new-delegations.yml
│   ├── biggest-unbonds.yml
│   ├── top-delegators.yml
│   └── validator-analysis.yml
├── src/                     # Core library modules
│   ├── ValidatorTracker.js
│   ├── EthereumDelegationTracker.js
│   ├── DelegatorFilter.js
│   ├── FundFlowTracker.js
│   ├── ChartGenerator.js
│   └── MetaSleuthVisualizer.js
├── scripts/                 # Utility scripts
├── tests/                   # Test files
├── cli.js                   # Main CLI interface
├── index.js                 # Programmatic API
├── package.json             # Dependencies
└── README.md                # This file
```

## 📊 Examples

### Example 1: Find New Delegations Today

```bash
npx track-validator new-delegations --hours 24
```

**Output:**
```
5 NEW DELEGATIONS (Last 24 hours)
ACROSS ALL VALIDATORS

1. 64,625.17 POL
   Validator: Everstake 0% fee (ID: 77)
   Delegator: 0xefc91acc...
   Date: Feb 17, 2026, 04:58 AM UTC
   Etherscan TX: https://etherscan.io/tx/0x97ae9...

SUMMARY:
Total Delegations: 5
Total Amount: 166,360.69 POL
Unique Validators: 4
Unique Delegators: 3
```

### Example 2: Monitor Large Unbonds

```bash
npx track-validator biggest-unbonds --days 7 --top 20
```

**Use case:** Track potential sell pressure from large unstaking events

### Example 3: Analyze a Validator

```bash
npx track-validator analyze 142 --months 3
```

**What you get:**
- Total delegations & unbonds
- Net stake change
- Individual delegator addresses
- Activity timeline

## 🔧 Programmatic Usage

Use as a library in your own Node.js projects:

```javascript
const { ValidatorStakeTracker } = require('./index');

async function analyzeValidator() {
  const tracker = new ValidatorStakeTracker(142, {
    months: 6,
    generateCharts: true,
    filterExchanges: true  // Exclude exchange addresses
  });

  const results = await tracker.runCompleteAnalysis();
  console.log('Net stake change:', results.validatorAnalysis.netChange);
  console.log('Individual delegators:', results.delegatorAddresses.length);
}

analyzeValidator();
```

## 🤝 Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - feel free to use this project for any purpose.

## 🆘 Support & Issues

- **Bug reports**: [Open an issue](https://github.com/YOUR_USERNAME/validator-stake-tracker/issues)
- **Feature requests**: [Open an issue](https://github.com/YOUR_USERNAME/validator-stake-tracker/issues) with `enhancement` label
- **Questions**: Check existing issues or open a new one

## 🌟 Star This Repo

If you find this tool useful, please give it a ⭐ on GitHub!

---

**Built for the Polygon ecosystem** 🟣 | **Maintained with ❤️**
