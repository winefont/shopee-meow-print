import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecipient } from '../src/recipient';

const run = (str: string, x = 20, y = 700) => ({ str, x, y, width: str.length * 10, height: 10 });

test('reads named recipients while excluding phone numbers and sender fields', () => {
  assert.equal(readRecipient([run('收件人：王＊明 電話:09XX-XXX-XXX'), run('寄件人:別人', 20, 680)]), '王*明');
  assert.equal(readRecipient([run('收件人:'), run('測試姓名', 70)]), '測試姓名');
  assert.equal(readRecipient([run('取件⼈ÿ測*人'), run('取件門市:其他店', 20, 680)]), '測*人');
  assert.equal(readRecipient([run('收件人:Jane Doe  電話:09XX-XXX-XXX')]), 'Jane Doe');
  assert.equal(readRecipient([
    {str:'取件⼈ÿ',x:91.4,y:655.6,width:28.8,height:7.2},
    {str:'測*人',x:120.2,y:652.6,width:32.5,height:13.2},
    {str:'物流商:其他公司',x:44,y:634,width:80,height:7.2},
  ]), '測*人');
});

test('does not guess names from bitmap/unlabelled/garbled or conflicting data', () => {
  for (const runs of [[], [run('王小明')], [run('收件人:�明')], [run('寄件人:王小明')],
    [run('收件人:王小明'), run('取件人:李小明', 20, 680)]]) assert.equal(readRecipient(runs), '');
});
