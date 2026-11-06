import { ensureUniqueOrders } from './combined-layout';
import { InputError, type Order, type Pair, type SourcePage } from './types';

export type DocumentPage =
  | { kind: 'combined'; order: Order; source: SourcePage }
  | { kind: 'shipping'; source: SourcePage }
  | { kind: 'packing'; order: Order; index: number; fileName?: string };

/** Pair the entire selection by exact order ID, independent of packing-file order. */
export function pairDocumentPages(pages: readonly DocumentPage[]): Pair[] {
  const orders = new Map<string, { source?: SourcePage; order?: Order; packingIndex?: number; packingFileName?: string }>();
  for (const page of pages) {
    const id = page.kind === 'shipping' ? page.source.orderId : page.order.id;
    const entry = orders.get(id) ?? {};
    orders.set(id, entry);
    if (page.kind !== 'packing') {
      if (entry.source) throw new InputError([`訂單 ${id} 有重複寄件單。請移除重複文件；本批未產生標籤。`]);
      if (page.source.orderId !== id) throw new InputError(['寄件單與商品表的訂單編號不一致，本批未產生標籤。']);
      entry.source = page.source;
    }
    if (page.kind !== 'shipping') {
      if (entry.order) throw new InputError([`訂單 ${id} 有重複裝箱單，或同單拆包裹／跨頁明細。請核對原始文件；本批未產生標籤。`]);
      entry.order = page.order;
      entry.packingIndex = page.kind === 'combined' ? page.source.index : page.index;
      entry.packingFileName = page.kind === 'combined' ? page.source.fileName : page.fileName;
    }
  }
  const missing: string[] = [];
  for (const [id, entry] of orders) {
    if (!entry.source) missing.push(`訂單 ${id} 缺少寄件單，請一併加入同批的原始寄件單 PDF。`);
    if (!entry.order) missing.push(`訂單 ${id} 缺少裝箱單，請一併加入同批的原始裝箱單 PDF。`);
  }
  if (missing.length) throw new InputError([...missing, '本批未產生標籤，請補齊後重新處理。']);
  const pairs = [...orders.values()].map(entry => {
    const source = entry.source!, order = entry.order!;
    if (order.tracking && source.tracking && order.tracking !== source.tracking) {
      throw new InputError([`訂單 ${order.id} 的物流編號不一致，本批未產生標籤。`]);
    }
    return { order: { ...order, tracking: source.tracking || order.tracking },
      source: { ...source, ...(entry.packingIndex !== source.index ? { packingFileName: entry.packingFileName ?? '同批裝箱單 PDF' } : {}) } };
  }).sort((a, b) => a.source.index - b.source.index);
  ensureUniqueOrders(pairs.map(pair => pair.order));
  return pairs;
}
