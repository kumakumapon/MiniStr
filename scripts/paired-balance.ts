import { runPairedBalance } from './pairedBalance';
runPairedBalance(process.argv.slice(2).filter((arg) => arg !== '--'));
