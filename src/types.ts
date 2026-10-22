export interface Product {
  index: number;
  name: string;
  variant: string;
  sku: string;
  quantity: number;
}

export interface Order {
  id: string;
  tracking: string;
  products: Product[];
  buyerNote: string;
  sellerNote: string;
}

export interface SourcePage {
  index: number;
  orderId: string;
  tracking: string;
  bounds: { left: number; bottom: number; right: number; top: number };
}

export interface Pair {
  order: Order;
  source: SourcePage;
}

export interface PageGroup {
  orderId: string;
  pages: number[];
  quantity: number;
}

export class InputError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'InputError';
  }
}
