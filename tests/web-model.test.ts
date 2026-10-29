import {test} from 'node:test';
import assert from 'node:assert/strict';
import {minorUnits,formatAmount,summarize,validMonth,validPayment} from '../src/web/model';
test('sums decimal amounts without accumulating floating point errors',()=>{assert.equal(minorUnits('0.29'),29);assert.deepEqual(summarize([{monthlyFee:'100.10',paid:'20.20',debt:'79.90'},{monthlyFee:'50.10',paid:'60.20',debt:'0.00'}]),{expected:15020,paid:8040,debt:7990});});
test('rejects invalid payment amounts and impossible dates before submission',()=>{assert.equal(validPayment('0','2026-10-01'),false);assert.equal(validPayment('1.001','2026-10-01'),false);assert.equal(validPayment('1','2026-02-29'),false);assert.equal(validPayment('1','2024-02-29'),true);assert.equal(validPayment('1e3','2026-10-01'),false);});
test('rejects incomplete month picker values and formats fractional money',()=>{assert.equal(validMonth('2026-10'),true);assert.equal(validMonth('2026-13'),false);assert.equal(validMonth(''),false);assert.match(formatAmount('1234.50','ru'),/1\D234,5/)});
test('Uzbek month names remain readable without full browser ICU locale data',async()=>{const {formatMonth}=await import('../src/web/model');assert.equal(formatMonth('2026-10','uz'),'Oktabr 2026');assert.equal(formatMonth('2026-10','ru'),'Октябрь 2026');});
