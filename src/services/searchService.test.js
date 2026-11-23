const test = require('node:test');
const assert = require('node:assert/strict');
const { matchItems, rank, search } = require('./searchService');

test('rank orders exact, prefix then substring matches', () => {
    assert.equal(rank('api', 'api'), 0);
    assert.equal(rank('api-server', 'api'), 1);
    assert.equal(rank('my-api', 'api'), 2);
    assert.equal(rank('web', 'api'), -1);
});

test('matchItems returns kind, name and namespace only', () => {
    const items = [{ metadata: { name: 'api', namespace: 'x' }, data: { secret: 'v' } }, { metadata: { name: 'web' } }];
    assert.deepEqual(matchItems('secrets', items, 'api'), [{ kind: 'secrets', name: 'api', namespace: 'x', score: 0 }]);
});

test('search ignores queries shorter than two characters', async () => {
    assert.deepEqual(await search('a'), []);
    assert.deepEqual(await search('   '), []);
});
