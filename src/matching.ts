import { InputError, type Order, type Pair, type SourcePage } from './types';

export function matchOrders(orders: Order[], pages: SourcePage[]): Pair[] {
  const byOrder = new Map<string, Order>();
  const issues: string[] = [];
  for (const order of orders) {
    if (byOrder.has(order.id)) issues.push(`Excel 訂單 ${order.id} 重複。`);
    byOrder.set(order.id, order);
  }
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const source of pages) {
    if (seen.has(source.orderId)) {
      issues.push(`寄件單訂單 ${source.orderId} 重複。請確認是否重複下載或同單拆包裹。`);
      continue;
    }
    seen.add(source.orderId);
    const order = byOrder.get(source.orderId);
    if (!order) issues.push(`寄件單第 ${source.index + 1} 頁：Excel 找不到訂單 ${source.orderId}。`);
    else if (order.tracking !== source.tracking) issues.push(`訂單 ${order.id}：PDF 與 Excel 的物流編號不同，可能選到不同批次。`);
    else pairs.push({ order, source });
  }
  for (const order of orders) {
    if (!seen.has(order.id)) issues.push(`Excel 訂單 ${order.id} 缺少對應寄件單。`);
  }
  if (!pages.length) issues.push('PDF 沒有寄件單。');
  if (issues.length) throw new InputError(issues);
  return pairs;
}
