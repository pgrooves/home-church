/* ===========================================================================
   The Happy Lion Cafe's arithmetic, which is money, so it is pinned here.

   PRICES COME FROM THE MENU. Whatever the phone sends, the price is the one
   on the menu row, and an option the menu does not have is refused.

   THE CLOCK IS THE CHURCH'S. Pickup times are wall clock times in New
   Orleans, on both sides of a daylight saving change.

   SQUARE'S SIGNATURE. A webhook is only believed when it is signed with the
   key over the URL and the body, the way Square signs it.

   No network. supabase/functions/_shared/cafe.mjs is the same file the two
   Edge Functions import.
   =========================================================================== */
'use strict';

const crypto = require('crypto');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};
const throws = (label, fn, fragment) => {
  try { fn(); console.log('FAIL  ' + label + '  (it was allowed)'); fail++; }
  catch (e) {
    if (String(e.message).toLowerCase().includes(fragment.toLowerCase())) { console.log('PASS  ' + label); pass++; }
    else { console.log('FAIL  ' + label + '  (threw "' + e.message + '")'); fail++; }
  }
};

const LEVELS = ['none', 'light', 'regular', 'extra'];
const OPTIONS = [
  { key: 'half_and_half', label: 'Half & half', short: 'Half & half', group: 'Milk', type: 'level', levels: LEVELS },
  { key: 'two_percent', label: '2% milk', short: '2% milk', group: 'Milk', type: 'level', levels: LEVELS },
  { key: 'sugar', label: 'Sugar', short: 'sugar', group: 'Sweetener', type: 'count', max: 4, unit: 'Packets' },
  { key: 'splenda', label: 'Splenda', short: 'Splenda', group: 'Sweetener', type: 'count', max: 4, unit: 'Packets' }
];
const MENU = [
  { id: 'hot-coffee', name: 'Hot Coffee', available: true, published: true, options: OPTIONS,
    sizes: [{ key: '12oz', label: '12 oz', price_cents: 300 }, { key: '16oz', label: '16 oz', price_cents: 350 }] },
  { id: 'cold-brew', name: 'Cold Brew', available: true, published: true, options: OPTIONS,
    sizes: [{ key: '12oz', label: '12 oz', price_cents: 400 }, { key: '16oz', label: '16 oz', price_cents: 475 }] },
  { id: 'gone', name: 'Gone', available: false, published: true, options: [],
    sizes: [{ key: '12oz', label: '12 oz', price_cents: 100 }] }
];

(async () => {
  const C = await import('../supabase/functions/_shared/cafe.mjs');

  console.log('\n--- prices come from the menu ---');

  const hot = C.priceLine(MENU, {
    item_id: 'hot-coffee', size: '16oz', options: { half_and_half: 'regular', sugar: 2, two_percent: 'none' }
  });
  ok('a 16 oz hot coffee is the menu price', hot.price_cents, 350);
  ok('it reads the way the mockup does', hot.summary, 'Half & half, regular · 2 sugar');
  ok('none is the same as not choosing', hot.choices.map((c) => c.key), ['half_and_half', 'sugar']);

  const cart = C.priceCart(MENU, [
    { item_id: 'hot-coffee', size: '16oz', options: {}, price_cents: 1 },
    { item_id: 'cold-brew', size: '12oz', options: { two_percent: 'light', splenda: 1 } }
  ]);
  ok('a price sent by the phone is ignored', cart.subtotal_cents, 750);
  ok('two drinks', cart.drinks, 2);
  ok('cold brew summary', cart.lines[1].summary, '2% milk, light · 1 Splenda');

  throws('an item not on the menu', () => C.priceLine(MENU, { item_id: 'latte', size: '12oz' }), 'not on the menu');
  throws('an item taken off the menu', () => C.priceLine(MENU, { item_id: 'gone', size: '12oz' }), 'not on the menu');
  throws('a size that does not exist', () => C.priceLine(MENU, { item_id: 'cold-brew', size: '20oz' }), 'size');
  throws('an option the drink does not have',
    () => C.priceLine(MENU, { item_id: 'cold-brew', size: '12oz', options: { whip: 'extra' } }), 'option');
  throws('a level that is not on the list',
    () => C.priceLine(MENU, { item_id: 'cold-brew', size: '12oz', options: { half_and_half: 'lots' } }), 'how much');
  throws('five sugars', () => C.priceLine(MENU, { item_id: 'hot-coffee', size: '12oz', options: { sugar: 5 } }), '0 to 4');
  throws('half a sugar', () => C.priceLine(MENU, { item_id: 'hot-coffee', size: '12oz', options: { sugar: 1.5 } }), '0 to 4');
  throws('an empty order', () => C.priceCart(MENU, []), 'empty');
  throws('eleven drinks', () => C.priceCart(MENU, Array(11).fill({ item_id: 'hot-coffee', size: '12oz' })), 'up to 10');

  console.log('\n--- tax and names ---');

  ok('9.75% of $7.50 rounds to 73 cents', C.taxCents(750, '9.75'), 73);
  ok('no tax set is no tax', C.taxCents(750, '0'), 0);
  ok('nonsense is no tax', C.taxCents(750, 'lots'), 0);
  ok('a name is tidied', C.cleanName('  Trey   G '), 'Trey G');
  throws('a cup needs a name', () => C.cleanName('   '), 'name on the cup');

  console.log('\n--- the church clock ---');

  ok('Sunday 4 October 2026 is a Sunday', C.isSunday('2026-10-04'), true);
  ok('Saturday is not', C.isSunday('2026-10-03'), false);
  ok('9:20 on a CDT Sunday is 14:20 UTC',
    C.churchInstant('2026-10-04', '09:20').toISOString(), '2026-10-04T14:20:00.000Z');
  ok('9:20 on a CST Sunday is 15:20 UTC',
    C.churchInstant('2026-11-08', '09:20:00').toISOString(), '2026-11-08T15:20:00.000Z');
  ok('late Saturday night in New Orleans is still Saturday',
    C.churchDay(new Date('2026-10-04T03:30:00Z')), '2026-10-03');

  ok('open on the day it was opened', C.isOpenToday('2026-10-04', '2026-10-04'), true);
  ok('closed the next morning if nobody closed it', C.isOpenToday('2026-10-04', '2026-10-11'), false);
  ok('closed when empty', C.isOpenToday('', '2026-10-04'), false);

  const slot = { id: '0920', pickup_time: '09:20', active: true };
  const at = (iso) => new Date(iso);
  ok('open on Sunday morning',
    C.slotProblem({ slot, day: '2026-10-04', now: at('2026-10-04T13:00:00Z') }), null);
  ok('not on a Saturday',
    C.slotProblem({ slot, day: '2026-10-03', now: at('2026-10-03T13:00:00Z') }), 'Ordering opens Sunday morning.');
  ok('unless every day is on',
    C.slotProblem({ slot, day: '2026-10-03', now: at('2026-10-03T13:00:00Z'), everyDay: true }), null);
  ok('closed four minutes before',
    C.slotProblem({ slot, day: '2026-10-04', now: at('2026-10-04T14:16:00Z') }),
    'That pickup time has passed. Pick a later one.');
  ok('full when the drinks reach capacity',
    C.slotProblem({ slot, day: '2026-10-04', now: at('2026-10-04T13:00:00Z'), load: 8, capacity: 8 }),
    'That pickup time is full. Pick another.');
  ok('capacity 0 means no limit',
    C.slotProblem({ slot, day: '2026-10-04', now: at('2026-10-04T13:00:00Z'), load: 80, capacity: 0 }), null);

  console.log('\n--- what Square is asked for ---');

  const body = C.paymentLinkBody({
    orderId: 'ord-1', locationId: 'LOC', priced: cart, cupName: 'Trey',
    pickupAt: C.churchInstant('2026-10-04', '09:20'), taxPercent: '9.75', tips: false,
    redirectUrl: 'https://example.org/back', email: 'trey@example.org'
  });
  ok('the idempotency key is the order id', body.idempotency_key, 'ord-1');
  ok('the order points back at ours', body.order.reference_id, 'ord-1');
  ok('a drink is named with its size', body.order.line_items[0].name, 'Hot Coffee, 16 oz');
  ok('at the menu price', body.order.line_items[0].base_price_money, { amount: 350, currency: 'USD' });
  ok('modifiers read on the receipt', body.order.line_items[1].modifiers.map((m) => [m.name, m.quantity]),
    [['2% milk (light)', '1'], ['Splenda', '1']]);
  ok('a pickup for the name on the cup', body.order.fulfillments[0].pickup_details.recipient.display_name, 'Trey');
  ok('at the church time', body.order.fulfillments[0].pickup_details.pickup_at, '2026-10-04T14:20:00.000Z');
  ok('tax as an order tax', body.order.taxes, [{ uid: 'sales-tax', name: 'Sales tax', percentage: '9.75', scope: 'ORDER' }]);
  ok('no tip unless asked', body.checkout_options.allow_tipping, false);
  ok('back to our page', body.checkout_options.redirect_url, 'https://example.org/back');

  const linked = C.paymentLinkBody({
    orderId: 'o', locationId: 'L', taxPercent: '0',
    priced: C.priceCart([Object.assign({}, MENU[0], {
      sizes: [{ key: '12oz', label: '12 oz', price_cents: 300, square_variation_id: 'VAR123' }] })],
    [{ item_id: 'hot-coffee', size: '12oz' }]),
    cupName: 'A', pickupAt: new Date(0)
  });
  ok('a size linked to the Square library goes by its id', [linked.order.line_items[0].catalog_object_id,
    linked.order.line_items[0].base_price_money], ['VAR123', undefined]);
  ok('no tax line when tax is 0', linked.order.taxes, undefined);

  ok('totals come from Square when it sends them',
    C.totalsFromLink({ related_resources: { orders: [{ total_money: { amount: 823 }, total_tax_money: { amount: 73 } }] } },
      { total_cents: 1, tax_cents: 1 }), { total_cents: 823, tax_cents: 73 });
  ok('and from us when it does not', C.totalsFromLink({}, { total_cents: 823, tax_cents: 73 }),
    { total_cents: 823, tax_cents: 73 });

  console.log('\n--- webhooks ---');

  const paid = { type: 'payment.updated', event_id: 'e1', data: { object: { payment: {
    id: 'pay1', order_id: 'sqo1', status: 'COMPLETED', total_money: { amount: 823 }, tip_money: { amount: 100 } } } } };
  ok('a completed payment is read', C.completedPayment(paid),
    { payment_id: 'pay1', order_id: 'sqo1', total_cents: 823, tip_cents: 100 });
  ok('an approved but not completed one is not',
    C.completedPayment({ type: 'payment.updated', data: { object: { payment: { status: 'APPROVED', order_id: 'x' } } } }), null);
  ok('another event is not', C.completedPayment({ type: 'refund.created' }), null);

  const key = 'sig-key-123';
  const url = 'https://ibqkumxfltfiuqevviji.supabase.co/functions/v1/cafe-square-webhook';
  const raw = JSON.stringify(paid);
  const real = crypto.createHmac('sha256', key).update(url + raw).digest('base64');
  ok('our signature is Square’s', await C.squareSignature(key, url, raw), real);
  ok('a true signature passes', await C.verifySquareSignature(key, url, raw, real), true);
  ok('a changed body fails', await C.verifySquareSignature(key, url, raw + ' ', real), false);
  ok('a different URL fails', await C.verifySquareSignature(key, url + '/', raw, real), false);
  ok('no signature fails', await C.verifySquareSignature(key, url, raw, ''), false);
  ok('no key configured fails', await C.verifySquareSignature('', url, raw, real), false);

  console.log('\n--- the phone agrees with the server ---');

  // js/cafe.js prices the cart on the phone so the total shows before
  // checkout. It must never disagree with what Square is asked for.
  global.window = global;
  global.HC = {};
  require('../js/cafe.js');
  const phone = global.HC.cafe;
  const lines = [
    { item_id: 'hot-coffee', size: '16oz', options: { half_and_half: 'regular', sugar: 2 } },
    { item_id: 'cold-brew', size: '12oz', options: { two_percent: 'light', splenda: 1 } }
  ];
  const phoneMenu = MENU.map((m) => ({ id: m.id, name: m.name, available: m.available, sizes: m.sizes, options: m.options }));
  ok('same subtotal', phone.subtotal(phoneMenu, lines), C.priceCart(MENU, lines).subtotal_cents);
  ok('same summary', lines.map((l) => phone.describe(phoneMenu, l).summary),
    C.priceCart(MENU, lines).lines.map((l) => l.summary));
  ok('same tax', phone.tax(750, '9.75'), C.taxCents(750, '9.75'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) process.exit(1);
})();
