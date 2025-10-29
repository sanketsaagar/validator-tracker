# Validator Stake Tracker - Command Reference

A comprehensive tool for tracking individual delegator POL staking activity on Polygon validators, with fund flow analysis for unbond wallets.

## Quick Start

```bash
# Install dependencies
npm install

# Basic validator analysis
npx track-validator analyze 34 --months 2

# Complete analysis with fund flow tracking
npx track-validator combined 34 --months 2 --with-visualizations

# NEW: Find biggest unstaking transactions across ALL validators
npx track-validator biggest-unbonds
```

## Quick Reference - All Commands

| Command | Description | Example |
|---------|-------------|---------|
| `setup` | Show setup instructions | `npx track-validator setup` |
| `analyze` | Analyze individual delegators for a validator | `npx track-validator analyze 27 --months 3` |
| `combined` | Complete validator analysis with fund flows | `npx track-validator combined 27 --with-visualizations` |
| `delegator-tracking` | Track specific delegator addresses | `npx track-validator delegator-tracking 0x123...` |
| `flow-analysis` | Legacy fund flow analysis | `npx track-validator flow-analysis 0x123...` |
| `biggest-unbonds` | **NEW** Find biggest unstaking transactions | `npx track-validator biggest-unbonds` |

## Environment Setup

Create a `.env` file with the following API keys:

```env
ETHERSCAN_API_KEY=your_etherscan_api_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here  
ARKHAM_API_KEY=your_arkham_api_key_here
```

### API Key Sources
- **ETHERSCAN_API_KEY** (REQUIRED): Get from https://etherscan.io/apis - needed for delegation data
- **POLYGONSCAN_API_KEY**: Get from https://polygonscan.com/apis - for unbond data
- **ARKHAM_API_KEY** (RECOMMENDED): Get from https://arkhamintelligence.com/api - for fund flow analysis

## Available Commands

### 1. Setup Command
```bash
npx track-validator setup
```
Shows setup instructions and environment variable requirements.

### 2. Basic Analysis
```bash
npx track-validator analyze <validator-id> [options]
```

**Options:**
- `-m, --months <number>` - Number of months to analyze (default: 6)
- `--no-charts` - Skip chart generation
- `--no-export` - Skip data export
- `--include-exchanges` - Include exchange addresses (not recommended)
- `--include-defi` - Include DeFi protocol addresses (not recommended)
- `--output-dir <path>` - Output directory (default: ./output)

**Examples:**
```bash
# Analyze validator 34 for last 2 months
npx track-validator analyze 34 --months 2

# Analyze with charts but no export
npx track-validator analyze 34 --no-export

# Include exchange addresses (not recommended)
npx track-validator analyze 34 --include-exchanges
```

### 3. Combined Analysis (Recommended)
```bash
npx track-validator combined <validator-id> [options]
```

**Options:**
- `-m, --months <number>` - Number of months to analyze (default: 6)
- `-t, --threshold <number>` - Minimum POL amount for fund flow tracking (default: 1)
- `--output-dir <path>` - Output directory (default: ./output)
- `--max-addresses <number>` - Maximum unbond addresses to analyze (default: 20)
- `--with-visualizations` - Generate fund flow visualizations
- `--include-exchanges` - Include exchange addresses (not recommended)
- `--include-defi` - Include DeFi addresses (not recommended)

**Examples:**
```bash
# Complete analysis with visualizations
npx track-validator combined 34 --months 2 --with-visualizations

# Analyze top 10 unbond wallets only
npx track-validator combined 34 --max-addresses 10 --with-visualizations

# Set minimum threshold for fund tracking
npx track-validator combined 34 --threshold 10 --with-visualizations
```

### 4. Delegator Tracking
```bash
npx track-validator delegator-tracking <addresses...> [options]
```

**Options:**
- `-v, --visualizations` - Generate fund flow visualizations
- `-t, --threshold <number>` - Minimum POL amount to track (default: 1)
- `-o, --output-prefix <prefix>` - Output file prefix (default: delegator_tracking)

**Examples:**
```bash
# Track specific addresses
npx track-validator delegator-tracking 0x123... 0x456... --visualizations

# Track with custom threshold
npx track-validator delegator-tracking 0x123... --threshold 5
```

### 5. Fund Flow Analysis (Legacy)
```bash
npx track-validator flow-analysis <addresses...> [options]
```

**Options:**
- `-t, --threshold <number>` - Minimum POL amount to track (default: 10)
- `-o, --output <file>` - Output file for detailed report

### 6. Biggest Unbonds (NEW)
```bash
npx track-validator biggest-unbonds [validator-id] [options]
```

Find the biggest unstaking transactions across ALL validators or a specific validator.

**Options:**
- `-d, --days <number>` - Number of days to look back (default: 7 for 1 week)
- `-t, --top <number>` - Number of top transactions to show (default: 10)
- `-m, --months <number>` - Number of months to fetch data (only for specific validator, default: 1)
- `--export` - Export results to JSON file

**Examples:**
```bash
# Check biggest unstaking across ALL validators in last 7 days
npx track-validator biggest-unbonds

# Check last 14 days, show top 20 transactions
npx track-validator biggest-unbonds --days 14 --top 20

# Check last 30 days across all validators
npx track-validator biggest-unbonds --days 30 --top 50

# Check specific validator (ID 27) for last 7 days
npx track-validator biggest-unbonds 27

# Check specific validator for last 14 days with export
npx track-validator biggest-unbonds 27 --days 14 --export
```

**Output Information:**
- Rank and amount of unstaking (in POL)
- Validator name and ID (when checking all validators)
- Delegator wallet address
- Date and time of unstaking
- Direct Polygonscan link to the address
- Summary statistics (total unstaked, unique validators, unique delegators)

**Use Cases:**
- Monitor large unstaking events that might indicate sell pressure
- Track which validators are experiencing major withdrawals
- Identify potential market-moving transactions
- Analyze unstaking patterns across the ecosystem

**Note:** When checking ALL validators (no validator-id specified), the command may take 2-5 minutes to complete as it queries all 105+ validators on Polygon.

## Output Files

### Data Files (Timestamped)
- `validator_{id}_data_{timestamp}.json` - Complete validator analysis
- `unbond_analysis_flows_{timestamp}.json` - Fund flow patterns
- `unbond_analysis_visualizations_{timestamp}.json` - Visualization URLs
- `unbond_analysis_complete_{timestamp}.json` - Combined analysis report
- `biggest_unbonds_all_validators_{days}d_{timestamp}.json` - Biggest unbonds across all validators
- `biggest_unbonds_v{validator-id}_{days}d_{timestamp}.json` - Biggest unbonds for specific validator

### Chart Files (Timestamped Directories)
- `charts_{timestamp}/stake_analysis.png` - Overall staking summary
- `charts_{timestamp}/delegation_vs_unbonding.png` - Comparison chart
- `charts_{timestamp}/top_addresses.png` - Top unbond addresses
- `charts_{timestamp}/activity_timeline.png` - Activity timeline

## Fund Flow Analysis

### Arkham Intelligence URLs
The tool generates direct links to Arkham Intelligence for visual fund flow analysis:
- Tracer tool for chronological fund flows
- Entity labeling and classification
- Real-time alerts and monitoring
- Cross-chain transaction tracking

### Etherscan Analysis
Basic transaction analysis URLs for:
- Transaction history verification
- Address activity patterns
- Gas usage patterns

### Dune Analytics Query
SQL query generation for advanced blockchain analytics:
- Custom transaction analysis
- Cross-reference with other data
- Advanced filtering and aggregation

## Key Features

### Individual Delegator Focus
- ✅ Excludes exchange addresses automatically  
- ✅ Excludes DeFi protocol addresses
- ✅ Focuses on individual retail delegators
- ✅ Enhanced address classification

### Ethereum Delegation Tracking
- ✅ Tracks delegation events from Ethereum mainnet
- ✅ Monitors buyVoucher transactions
- ✅ Parses ShareMinted events
- ✅ Cross-chain data correlation

### Unbond Wallet Analysis  
- ✅ Identifies wallets that have unbonded POL
- ✅ Tracks fund flows for potential sell pressure
- ✅ Visual analysis via multiple tools
- ✅ Risk assessment and insights

## Troubleshooting

### Common Issues

**"No delegation events found"**
- Ensure ETHERSCAN_API_KEY is set correctly
- Delegation data comes from Ethereum mainnet only

**"No charts generated"**  
- Check that output directory exists and is writable
- Ensure Node.js has canvas/image generation dependencies

**"Fund flow analysis failed"**
- Verify ARKHAM_API_KEY is set (optional but recommended)
- Check network connectivity for API calls

### Getting Help
```bash
# Show all available commands
npx track-validator --help

# Show setup information
npx track-validator setup

# Show command-specific help  
npx track-validator analyze --help
npx track-validator combined --help
```

## Example Workflow

### Workflow 1: Monitor Ecosystem-Wide Unstaking

1. **Check biggest unstaking events across all validators:**
   ```bash
   npx track-validator biggest-unbonds --days 7
   ```

2. **Get more details with longer time period:**
   ```bash
   npx track-validator biggest-unbonds --days 30 --top 50 --export
   ```

3. **Analyze specific validators showing high activity:**
   ```bash
   npx track-validator analyze 142 --months 2
   ```

### Workflow 2: Comprehensive Validator Analysis

1. **Setup environment:**
   ```bash
   npx track-validator setup
   # Follow instructions to set API keys
   ```

2. **Run complete analysis:**
   ```bash
   npx track-validator combined 34 --months 3 --with-visualizations
   ```

3. **Review outputs:**
   - Check `./output/` for all generated files
   - Open Arkham Intelligence URLs for fund flow analysis
   - Review charts in timestamped directories

4. **Monitor specific addresses:**
   ```bash
   # Copy addresses from analysis output
   npx track-validator delegator-tracking 0x123... 0x456... --visualizations
   ```

### Workflow 3: Daily Monitoring Setup

1. **Morning: Check new large unstaking events:**
   ```bash
   npx track-validator biggest-unbonds --days 1 --top 20
   ```

2. **Weekly: Broader ecosystem analysis:**
   ```bash
   npx track-validator biggest-unbonds --days 7 --top 50 --export
   ```

3. **Monthly: Deep dive on specific validators:**
   ```bash
   npx track-validator combined <validator-id> --months 1 --with-visualizations
   ```

## Best Practices

- **Use 2-6 months** for analysis period (balance between data and relevance)
- **Enable visualizations** for fund flow analysis (`--with-visualizations`)
- **Set reasonable thresholds** for fund tracking (1-10 POL)
- **Limit max addresses** for large datasets (`--max-addresses 20`)
- **Regular monitoring** of top unbond wallets for sell pressure signals

---

*Generated for Validator Stake Tracker v2.0 - Focus on Individual Delegators*