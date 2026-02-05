
import { calculateDailyStats, T2M, M2T } from './src/services/stats.js';

console.log("=== Testing Exit Time Prediction Logic ===");

// 1. Bug Case: Shift 8:00 - 11:00. Entry 7:50.
// Expected Prediction: 7:50 + 3h = 10:50 (650 mins)
// Expected Bug: 7:50 (470 mins)

const shift8to11 = [{ start: '08:00', end: '11:00' }];
const entry750 = [{ time: '07:50', type: 'entrance' }];

const result = calculateDailyStats(entry750, shift8to11, 0, true);

console.log(`Entry: 7:50, Shift: 8:00-11:00`);
console.log(`Prediction Mins: ${result.prediction}`);
console.log(`Prediction Time: ${result.prediction ? M2T(result.prediction) : 'null'}`);

if (result.prediction === T2M('07:50')) {
    console.log("FAIL: Prediction matches Entry time (Current Bug Confirmed)");
} else if (result.prediction === T2M('10:50')) {
    console.log("PASS: Prediction takes duration into account");
} else {
    console.log("UNKNOWN Result");
}
