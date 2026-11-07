import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionOrderToVerified,
  transitionOrderToRejected,
  transitionOrderToRefundPending,
  filterOrdersByTab,
  type WriterOrderCardData,
} from '../src/lib/orders/writer-orders-state.ts';

const mockOrder1: WriterOrderCardData = {
  id: 'order-1',
  orderNumber: 'ORD-1001',
  readerId: 'reader-1',
  readerDisplayName: 'Ahmed Khan',
  novelTitleUrdu: 'پیر کامل',
  novelTitleEnglish: 'Peer-e-Kamil',
  novelSlug: 'peer-e-kamil',
  amountPkr: 500,
  paymentMethod: 'JazzCash',
  status: 'payment_submitted',
  rejectedReason: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:05:00.000Z',
  submissions: [
    {
      id: 'sub-1',
      tid: 'TID-12345',
      screenshotPath: 'proofs/sub-1.webp',
      claimedAmount: 500,
      senderAccountName: 'Ahmed',
      readerNote: 'Paid via JazzCash',
      reviewerStatus: 'pending',
      reviewerNote: null,
      isDuplicateTidFlagged: false,
      createdAt: '2026-11-01T10:05:00.000Z',
    },
  ],
};

const mockOrder2: WriterOrderCardData = {
  id: 'order-2',
  orderNumber: 'ORD-1002',
  readerId: 'reader-2',
  readerDisplayName: 'Sara Noor',
  novelTitleUrdu: 'آب حیات',
  novelTitleEnglish: 'Aab-e-Hayat',
  novelSlug: 'aab-e-hayat',
  amountPkr: 750,
  paymentMethod: 'EasyPaisa',
  status: 'payment_submitted',
  rejectedReason: null,
  createdAt: '2026-11-02T12:00:00.000Z',
  updatedAt: '2026-11-02T12:10:00.000Z',
  submissions: [
    {
      id: 'sub-2',
      tid: 'TID-99999',
      screenshotPath: 'proofs/sub-2.webp',
      claimedAmount: 750,
      senderAccountName: 'Sara',
      readerNote: null,
      reviewerStatus: 'pending',
      reviewerNote: null,
      isDuplicateTidFlagged: false,
      createdAt: '2026-11-02T12:10:00.000Z',
    },
  ],
};

test('Writer Orders State Transitions & Tab Filtering', async (t) => {
  await t.test('Initial tab counts derive accurately from status', () => {
    const orders = [mockOrder1, mockOrder2];
    assert.equal(filterOrdersByTab(orders, 'awaiting').length, 2);
    assert.equal(filterOrdersByTab(orders, 'verified').length, 0);
    assert.equal(filterOrdersByTab(orders, 'rejected').length, 0);
    assert.equal(filterOrdersByTab(orders, 'all').length, 2);
  });

  await t.test('transitionOrderToVerified moves order immediately to verified tab', () => {
    const orders = [mockOrder1, mockOrder2];
    const updated = transitionOrderToVerified(
      orders,
      'order-1',
      'sub-1',
      'Received in Meezan Bank',
      '2026-11-07T12:00:00.000Z'
    );

    // Order 1 is updated
    const order1 = updated.find((o) => o.id === 'order-1')!;
    assert.equal(order1.status, 'verified');
    assert.equal(order1.updatedAt, '2026-11-07T12:00:00.000Z');
    assert.equal(order1.submissions[0].reviewerStatus, 'verified');
    assert.equal(order1.submissions[0].reviewerNote, 'Received in Meezan Bank');

    // Order 2 is untouched
    const order2 = updated.find((o) => o.id === 'order-2')!;
    assert.equal(order2.status, 'payment_submitted');
    assert.equal(order2.submissions[0].reviewerStatus, 'pending');

    // Tabs update instantly
    assert.equal(filterOrdersByTab(updated, 'awaiting').length, 1);
    assert.equal(filterOrdersByTab(updated, 'verified').length, 1);
    assert.equal(filterOrdersByTab(updated, 'rejected').length, 0);
    assert.equal(filterOrdersByTab(updated, 'all').length, 2);
  });

  await t.test('transitionOrderToRejected moves order immediately to rejected tab', () => {
    const orders = [mockOrder1, mockOrder2];
    const updated = transitionOrderToRejected(
      orders,
      'order-2',
      'sub-2',
      'TID not found in statement',
      '2026-11-07T13:00:00.000Z'
    );

    // Order 2 is updated
    const order2 = updated.find((o) => o.id === 'order-2')!;
    assert.equal(order2.status, 'rejected');
    assert.equal(order2.rejectedReason, 'TID not found in statement');
    assert.equal(order2.updatedAt, '2026-11-07T13:00:00.000Z');
    assert.equal(order2.submissions[0].reviewerStatus, 'rejected');
    assert.equal(order2.submissions[0].reviewerNote, 'TID not found in statement');

    // Tabs update instantly
    assert.equal(filterOrdersByTab(updated, 'awaiting').length, 1);
    assert.equal(filterOrdersByTab(updated, 'verified').length, 0);
    assert.equal(filterOrdersByTab(updated, 'rejected').length, 1);
    assert.equal(filterOrdersByTab(updated, 'all').length, 2);
  });

  await t.test('transitionOrderToRefundPending updates pending refund flags', () => {
    const verifiedOrder: WriterOrderCardData = {
      ...mockOrder1,
      status: 'verified',
    };
    const orders = [verifiedOrder];
    const updated = transitionOrderToRefundPending(orders, 'order-1', 'Reader requested refund');

    const order1 = updated.find((o) => o.id === 'order-1')!;
    assert.equal(order1.hasPendingRefund, true);
    assert.equal(order1.pendingRefundReason, 'Reader requested refund');
  });

  await t.test('Transitions are idempotent and ignore non-existent IDs', () => {
    const orders = [mockOrder1];
    const updated = transitionOrderToVerified(orders, 'non-existent', 'sub-1');
    assert.deepEqual(updated, orders);
  });
});

