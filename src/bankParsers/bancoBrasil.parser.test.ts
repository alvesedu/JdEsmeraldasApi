import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { BancoBrasilParser, groupTransactionBlocks, parseAmount } from './bancoBrasil.parser.js';
import { buildTransactionFingerprint } from '../utils/hash.js';

const fixtureUrl = new URL('./__fixtures__/banco-brasil-anonymized.txt', import.meta.url);
const text = await readFile(fixtureUrl, 'utf8');
const parser = new BancoBrasilParser();
const input = { buffer: new Uint8Array(), text, originalFileName: 'banco-brasil-anonymized.pdf' };
const statement = await parser.parse(input);

describe('Banco do Brasil statement parser', () => {
  it('detects a Banco do Brasil current account statement', () => {
    assert.equal(parser.canParse(input), true);
    assert.equal(parser.canParse({ ...input, text: 'Outro banco' }), false);
  });

  it('extracts period and balances in integer cents', () => {
    assert.deepEqual(statement.period, { startDate: '2026-08-01', endDate: '2026-08-31' });
    assert.equal(statement.balances.openingBalance, 100_000);
    assert.equal(statement.balances.closingBalance, -6_000);
  });

  it('extracts credit Pix with operation date, time and counterparty', () => {
    const transaction = statement.transactions[0];
    assert.equal(transaction.direction, 'CREDIT');
    assert.equal(transaction.transactionType, 'PIX_RECEIVED');
    assert.equal(transaction.amount, 25_000);
    assert.equal(transaction.operationDate, '2026-08-01');
    assert.equal(transaction.operationTime, '08:59');
    assert.equal(transaction.counterpartyOriginalName, 'Artur Exemplo');
    assert.equal(transaction.counterpartyNormalizedName, 'ARTUR EXEMPLO');
  });

  it('extracts debit Pix and counterparty document', () => {
    const transaction = statement.transactions[1];
    assert.equal(transaction.direction, 'DEBIT');
    assert.equal(transaction.transactionType, 'PIX_SENT');
    assert.equal(transaction.amount, 181_000);
    assert.equal(transaction.counterpartyOriginalName, 'Fornecedor Exemplo');
    assert.equal(transaction.counterpartyDocument, '12345678900');
  });

  it('extracts a received transfer', () => {
    const transaction = statement.transactions[2];
    assert.equal(transaction.transactionType, 'TRANSFER_RECEIVED');
    assert.equal(transaction.amount, 50_000);
  });

  it('parses Brazilian amounts without floating point arithmetic', () => {
    assert.equal(parseAmount('250,00'), 25_000);
    assert.equal(parseAmount('1.810,00'), 181_000);
  });

  it('groups multiline entries as single transaction blocks', () => {
    const blocks = groupTransactionBlocks(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    assert.equal(blocks.length, 3);
    assert.deepEqual(blocks[0].slice(1), ['Pix - Recebido', '01/08 08:59 Artur Exemplo']);
  });

  it('generates stable and discriminating fingerprints', () => {
    const transaction = statement.transactions[0];
    const fingerprintInput = { bank: statement.bank, ...transaction };
    const first = buildTransactionFingerprint(fingerprintInput);
    const repeated = buildTransactionFingerprint(fingerprintInput);
    const different = buildTransactionFingerprint({ ...fingerprintInput, amount: transaction.amount + 1 });
    assert.equal(first, repeated);
    assert.notEqual(first, different);
  });

  it('keeps valid transactions when another dated line is invalid', async () => {
    const parsed = await parser.parse({ ...input, text: `${text}\n12/08/2026 linha sem valor` });
    assert.equal(parsed.transactions.length, 3);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].type, 'UNRECOGNIZED_TRANSACTION_LINE');
  });
});
